// test-lessons-v131.js — v131 (hsv-v34) 课程分发第二阶段 (A 通道)
//   • make-course-release.js: 备份 → manifest + 分课文件, sha256, 清理
//   • course-feed.js: 按 id+_v 增量拉取、sha256 校验、只增不删、
//     就绪守卫、A/B 双通道 URL、合并后派发事件与 triggerSave
// 运行: node test-lessons-v131.js
const fs = require('fs'), path = require('path'), os = require('os');
const crypto = require('crypto');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

// ─── 1. 发布工具端到端 ──────────────────────────────────────
sec('1. make-course-release.js');
const tool = require(path.join(DIR, 'tools', 'make-course-release.js'));

// 三种输入格式
const lessonsFixture = [
    { id: 'U01', _v: 100, title: '课一', words: [{ id: 'U01-W1' }] },
    { id: 'U02', _v: 200, title: '课二', words: [] },
    { id: 'U03',          title: '旧课无_v', words: [] }
];
ok(tool.extractLessons(JSON.stringify(lessonsFixture)).length === 3, '裸数组输入');
ok(tool.extractLessons(JSON.stringify({ lessons: lessonsFixture })).length === 3, '课程包输入');
ok(tool.extractLessons(JSON.stringify({
    'hsv_kid_lessons_user': JSON.stringify(lessonsFixture),
    'hsv_kid_notebook'    : '[]'
})).length === 3, '备份输入 (含 *_lessons_user 键)');
let threw = false;
try { tool.extractLessons('{"a":1}'); } catch (e) { threw = true; }
ok(threw, '无课程输入报错而非静默空产物');

// build 端到端
const tmp    = fs.mkdtempSync(path.join(os.tmpdir(), 'vp131-'));
const inFile = path.join(tmp, 'backup.json');
const outDir = path.join(tmp, 'courses');
fs.writeFileSync(inFile, JSON.stringify({
    'hsv_kid_lessons_user': JSON.stringify(lessonsFixture)
}));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'U99.json'), '{"id":"U99"}');   // 陈旧文件
const { manifest, removed } = tool.build(inFile, outDir);
ok(manifest.format === 1 && manifest.count === 3, 'manifest 基本字段');
ok(manifest.courses.every(c => c.id && c.file && c.sha256 && c._v != null),
   '清单条目齐全 (id/_v/file/sha256)');
ok(manifest.courses.find(c => c.id === 'U03')._v === 1, '缺 _v 的旧课置 1 (不会覆盖任何有 _v 的本机课)');
ok(manifest.courses.find(c => c.id === 'U01')._v === 100, '_v 原样保留不刷新 (增量分发的版本锚)');
const f1 = fs.readFileSync(path.join(outDir, 'U01.json'), 'utf8');
ok(crypto.createHash('sha256').update(f1, 'utf8').digest('hex')
   === manifest.courses.find(c => c.id === 'U01').sha256, 'sha256 与文件字节一致');
ok(JSON.parse(f1).title === '课一', '分课文件内容完整');
ok(removed.includes('U99.json') && !fs.existsSync(path.join(outDir, 'U99.json')),
   '陈旧课程文件已清理');
ok(fs.existsSync(path.join(outDir, 'courses-manifest.json')), 'manifest 已写出');

// ─── 2. course-feed.js 行为仿真 ─────────────────────────────
sec('2. 订阅端增量与校验');
const feedSrc = fs.readFileSync(path.join(DIR, 'course-feed.js'), 'utf8');

function makeEnv(localLessons, ready) {
    const env = {
        merged: null, saves: 0, events: [], fetches: [],
        ready : ready !== false
    };
    env.window = {
        DB: {
            coursesReady    : () => env.ready,
            getPref         : (n, fb) => fb,
            loadUserLessons : () => localLessons.slice(),
            mergeUserLessons: (arr) => { env.merged = arr; return true; }
        },
        SyncManager   : { triggerSave: () => { env.saves++; } },
        dispatchEvent : (e) => { env.events.push(e); },
        App           : { showToast: () => {} }
    };
    return env;
}
function runFeed(env, files) {
    // files: { 名字 → 文本 } (按 assetUrl 的路径尾匹配)
    global.window        = env.window;
    global.document      = { getElementById: () => null };
    global.CustomEvent   = function (type, opts) { this.type = type; this.detail = opts && opts.detail; };
    global.fetch = async (url) => {
        const u    = String(url);
        const name = Object.keys(files).find(n => u.includes(n));
        env.fetches.push(name || u);
        if (!name || files[name] == null) return { ok: false, status: 404 };
        return { ok: true, status: 200,
                 json: async () => JSON.parse(files[name]),
                 text: async () => files[name] };
    };
    (new Function('window', 'document', 'fetch', 'CustomEvent', 'console', feedSrc))
        (global.window, global.document, global.fetch, global.CustomEvent,
         { log() {}, warn() {}, error() {} });
    return env.window.CourseFeed;
}
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

(async () => {
    // 用工具真实产物喂订阅端 (端到端闭环)
    const mText   = fs.readFileSync(path.join(outDir, 'courses-manifest.json'), 'utf8');
    const u01Text = fs.readFileSync(path.join(outDir, 'U01.json'), 'utf8');
    const u02Text = fs.readFileSync(path.join(outDir, 'U02.json'), 'utf8');
    const u03Text = fs.readFileSync(path.join(outDir, 'U03.json'), 'utf8');
    const allFiles = { 'courses-manifest.json': mText,
                       'U01.json': u01Text, 'U02.json': u02Text, 'U03.json': u03Text };

    // 2a. 新装设备 (本机为空): 全量接收
    let env  = makeEnv([]);
    let feed = runFeed(env, allFiles);
    let r    = await feed.check(false);
    ok(r && r.added === 3 && r.failed === 0, '空设备全量接收 3 门课');
    ok(env.merged && env.merged.length === 3, '合并走 mergeUserLessons');
    ok(env.events.some(e => e.detail && e.detail.courses), '合并后派发 hsv:datachanged{courses}');
    ok(env.saves === 1, '合并后 triggerSave (新课随快照上 Gist)');

    // 2b. 已最新 (_v 相同): 一门课都不下载
    env  = makeEnv([{ id: 'U01', _v: 100 }, { id: 'U02', _v: 200 }, { id: 'U03', _v: 1 }]);
    feed = runFeed(env, allFiles);
    r    = await feed.check(false);
    ok(r && r.added === 0 && r.updated === 0, '已最新时无增量');
    ok(env.fetches.filter(f => f !== 'courses-manifest.json').length === 0,
       '除 manifest 外零下载');
    ok(env.merged === null, '无增量不触碰合并');

    // 2c. 单课更新 (_v 更旧的本机): 只下载那一门
    env  = makeEnv([{ id: 'U01', _v: 50 }, { id: 'U02', _v: 200 }, { id: 'U03', _v: 1 }]);
    feed = runFeed(env, allFiles);
    r    = await feed.check(false);
    ok(r && r.updated === 1 && r.added === 0, '只更新 _v 变新的一门');
    ok(env.fetches.filter(f => f === 'U01.json').length === 1
       && env.fetches.filter(f => f === 'U02.json').length === 0, '未变的课零流量');
    ok(env.merged && env.merged.length === 1 && env.merged[0].id === 'U01',
       '只合并变化的课 (本机其余课不动)');

    // 2d. sha256 不符: 弃用不合并
    const badFiles = Object.assign({}, allFiles, { 'U01.json': u01Text + ' ' });
    env  = makeEnv([]);
    feed = runFeed(env, badFiles);
    r    = await feed.check(false);
    ok(r && r.failed === 1 && r.added === 2, 'sha256 不符的课被弃用, 其余照收');
    ok(env.merged.every(l => l.id !== 'U01'), '损坏文件不进合并');

    // 2e. 就绪守卫: initCourses 未完成时拒绝
    env  = makeEnv([], false);
    feed = runFeed(env, allFiles);
    r    = await feed.check(false);
    ok(r === null && env.fetches.length === 0 && env.merged === null,
       '缓存未就绪时不拉取不合并 (与 v130 sync 守卫同一原则)');

    // 2f. manifest 404 (还没发布过): 静默失败不炸
    env  = makeEnv([]);
    feed = runFeed(env, {});
    r    = await feed.check(false);
    ok(r && r.error && env.merged === null, 'manifest 404 静默跳过');

    // 2g. A/B 双通道 URL 构造
    env  = makeEnv([]);
    feed = runFeed(env, allFiles);
    ok(feed._assetUrl('x.json') === 'courses/x.json', 'A 通道: 同源目录相对路径');
    env.window.DB.getPref = (n, fb) =>
        n === 'course_feed_url' ? 'https://vocabpeak-tts.foo.workers.dev'
      : n === 'course_feed_key' ? 'family-2026' : fb;
    ok(feed._assetUrl('x.json') ===
       'https://vocabpeak-tts.foo.workers.dev?asset=x.json&key=family-2026',
       'B 通道: Worker 源自动改用 ?asset=&key= 形态 (切换零客户端改动)');

    // ─── 3. 结构与接线 ──────────────────────────────────────
    sec('3. 结构与接线');
    ok(/cache: 'no-store'/.test(feedSrc) && /'\?'\) \+ 't=' \+ Date\.now\(\)/.test(feedSrc.replace(/\n/g, ' ')) || /t=' \+ Date\.now\(\)/.test(feedSrc),
       'manifest/课程文件 no-store + 时间戳 (既定原则)');
    ok(/mergeUserLessons\(batch\)/.test(feedSrc), '合并只走 mergeUserLessons (只增不删)');
    const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
    ok(/safeCall\('CourseFeed', \(\) => window\.CourseFeed\?\.init\?\.\(\)\)/.test(appSrc),
       'boot 初始化 CourseFeed (在 initCourses 之后)');
    ok(/btn-feed-check/.test(appSrc) && /course_feed_url/.test(appSrc)
       && /course_feed_auto/.test(appSrc), '设置接线 (源/开关/立即检查)');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    ok(/course-feed\.js\?v=/.test(idx), 'index.html 引入 course-feed.js');
    ok(/id="feed-url-input"/.test(idx) && /id="pref-feed-auto"/.test(idx)
       && /id="btn-feed-check"/.test(idx) && /id="feed-status"/.test(idx),
       '设置页课程订阅区块齐全');
    const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    ok(/'\.\/course-feed\.js',/.test(sw), 'sw.js ASSETS 含 course-feed.js (离线可用)');

    // ─── 4. 版本 ────────────────────────────────────────────
    sec('4. 版本');
    const vs = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '131',
       'index.html 全部 ?v=131 (' + vs.length + ' 处)');
    ok(vs.length === 25, '?v= 引用 25 处 (24 + course-feed.js)');
    ok(/const CACHE_NAME = 'hsv-v34'/.test(sw), 'sw.js CACHE_NAME = hsv-v34');
    ok(/hsv-v34 \(\?v=131\)/.test(sw), 'sw.js 有 v34 变更日志');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
