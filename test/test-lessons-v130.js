// test-lessons-v130.js — v130 (hsv-v33) bug 巡检修复批
//   • 戳记回滚: raw_url/解析/课程合并失败后不再被 UNCHANGED 短路
//   • pullCourses 就绪守卫: initCourses 竞态不再整表冲掉本机课程
//   • saveUserLessons/importAll 钩子: 课程导入后会推送
//   • lessons.js 监听 hsv:datachanged: 云端新课到达即刷新列表
//   • 旧键分流: 入站 lessons_user 不落 localStorage, 喂 mergeUserLessons
//   • manifest 不可缓存: 客户端 no-store + 时间戳, Worker .json no-store
//   • 拉后记账 K_COURSES_HASH / 并集回推; factoryReset 补清
// 运行: node test-lessons-v130.js   (需 fake-indexeddb)
require('fake-indexeddb/auto');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

const sync    = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
const dbSrc   = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const lessons = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
const ttsPack = fs.readFileSync(path.join(DIR, 'tts-pack.js'), 'utf8');
const worker  = fs.readFileSync(path.join(DIR, 'vocabpeak-tts-proxy.js'), 'utf8');

// ─── 1. sync.js 结构 ────────────────────────────────────────
sec('1. sync.js 结构');
// 戳记回滚出现在三处失败路径 (raw_url catch / parse catch / pull catch)
// 加 pullCourses 的未就绪与 catch, 至少 5 处 removeItem(K_GIST_STAMP)
// (推送后清戳记的原有 1 处之外)
const stampClears = (sync.match(/localStorage\.removeItem\(K_GIST_STAMP\)/g) || []).length;
ok(stampClears >= 6, '戳记回滚点齐全 (' + stampClears + ' 处 ≥ 6)');
ok(/raw_url fetch failed[\s\S]{0,400}?removeItem\(K_GIST_STAMP\)[\s\S]{0,200}?throw new Error\('Gist read failed: payload exceeds 1MB/.test(sync),
   'raw_url 失败: 先回滚戳记再抛错');
ok(/payload parse failed[\s\S]{0,300}?removeItem\(K_GIST_STAMP\)[\s\S]{0,100}?return null/.test(sync),
   '解析失败: 回滚戳记后返回 null');
ok(/Pull error[\s\S]{0,300}?removeItem\(K_GIST_STAMP\)/.test(sync),
   'pull 失败: 回滚戳记');
ok(/if \(!window\.DB\.coursesReady \|\| !window\.DB\.coursesReady\(\)\)/.test(sync),
   'pullCourses 有课程缓存就绪守卫');
ok(/courses cache not ready[\s\S]{0,200}?removeItem\(K_GIST_STAMP\)/.test(sync),
   '未就绪时清戳记 (30 秒后重试而非永久跳过)');
ok(/obj\._hash === window\.DB\.coursesHash\(\)[\s\S]{0,200}?setItem\(K_COURSES_HASH, obj\._hash\)/.test(sync),
   '哈希一致时记账 K_COURSES_HASH (拉完不白传)');
ok(/if \(obj\._hash && h === obj\._hash\)[\s\S]{0,150}?else[\s\S]{0,80}?triggerSave\(\);/.test(sync),
   '合并后本机是并集时安排回推');
ok(/'saveUserLessons', 'importAll'/.test(sync),
   'hookSaves 补钩 saveUserLessons 与 importAll');
ok(/const legacyCoursesKey = prefix \+ 'lessons_user';/.test(sync)
   && /if \(k === legacyCoursesKey\)[\s\S]{0,400}?mergeUserLessons\?\.\(arr\)/.test(sync),
   '入站 lessons_user 整键分流喂 mergeUserLessons (不落 localStorage)');
ok(/if \(coursesChanged\)[\s\S]{0,300}?detail: \{ courses: true \}[\s\S]{0,600}?do NOT advance lastPull/.test(sync),
   'shouldApply=false 分支课程有变化也派发刷新事件');
ok(/TextEncoder/.test(sync) && /json\.length > 950000/.test(sync),
   '体积预警按 UTF-8 字节 (保留 length 快速门)');

// ─── 2. readGist 行为仿真: 失败回滚戳记 ─────────────────────
sec('2. readGist 失败回滚戳记');
function extract(name) {
    const i = sync.indexOf('async function ' + name);
    let d = 0, st = false;
    for (let j = i; j < sync.length; j++) {
        if (sync[j] === '{') { d++; st = true; }
        else if (sync[j] === '}') { d--; if (st && d === 0) return sync.slice(i, j + 1); }
    }
}
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null),
                        setItem: (k, v) => { store[k] = String(v); },
                        removeItem: k => { delete store[k]; } };
const GIST_API     = 'https://api.github.com/gists';
const K_GIST_STAMP = 'hsv_sync_gist_stamp';
const getToken  = () => 't', getGistId = () => 'g';
const gistFile  = () => 'f.json', coursesFile = () => 'c.json';
const setGistId = () => {};
const UNCHANGED = Symbol('unchanged');
let _lastCoursesFile = null;

let rawMode = 'fail';   // fail | ok | badjson(主文件直接坏 JSON)
const payloadObj = { _profile: 'kid', _syncTime: 7, data: {} };
global.fetch = async (url) => {
    if (String(url).includes('api.github.com')) {
        const mainFile = rawMode === 'badjson'
            ? { content: '{oops', truncated: false }
            : { content: '{"trunc', truncated: true, size: 999,
                raw_url: 'https://gist.githubusercontent.com/raw/x' };
        return { ok: true, json: async () => ({
            updated_at: '2026-08-11T10:00:00Z',
            files: { 'f.json': mainFile }
        }) };
    }
    if (rawMode === 'fail') return { ok: false, status: 502 };
    return { ok: true, text: async () => JSON.stringify(payloadObj) };
};
eval(extract('readGist'));

(async () => {
    // 场景 1: raw_url 拉取失败 → 抛错且戳记被回滚 → 下一轮如实重读
    let threw = false;
    try { await readGist(false); } catch (e) { threw = true; }
    ok(threw, 'raw_url 失败时抛错 (不静默)');
    ok(store[K_GIST_STAMP] === undefined, '失败后戳记已回滚');
    rawMode = 'ok';
    const a = await readGist(false);
    ok(a && a._syncTime === 7, '恢复后下一轮真的重读到了内容 (不被 UNCHANGED 短路)');
    ok(store[K_GIST_STAMP] !== undefined, '成功后戳记落盘');
    const b = await readGist(false);
    ok(b === UNCHANGED, '成功后再轮询仍走 UNCHANGED 短路 (v129 行为未破坏)');

    // 场景 2: 主文件解析失败 → 返回 null 且戳记被回滚
    rawMode = 'badjson';
    delete store[K_GIST_STAMP];        // 让新一轮真正去读
    const c = await readGist(false);
    ok(c === null, '坏 JSON 返回 null');
    ok(store[K_GIST_STAMP] === undefined, '解析失败后戳记已回滚');

    // ─── 3. pullCourses 行为仿真 ────────────────────────────
    sec('3. pullCourses 守卫与记账');
    const K_COURSES_HASH = 'hsv_courses_pushed_hash';
    let mergeCalls = 0, saveCalls = 0, dbReady = false, localHash = 'aaaa';
    const triggerSave = () => { saveCalls++; };
    global.window = { DB: {
        coursesReady    : () => dbReady,
        coursesHash     : () => localHash,
        loadUserLessons : () => [],
        mergeUserLessons: (arr) => { mergeCalls++; return true; }
    } };
    eval(extract('pullCourses').replace('async function pullCourses',
                                        'async function pullCourses2'));

    // 未就绪: 拒绝合并 + 清戳记
    store[K_GIST_STAMP] = 'S1';
    _lastCoursesFile = { content: JSON.stringify({ _hash: 'bbbb',
        lessons: [{ id: 'U01', _v: 5, title: 'x' }] }) };
    let r = await pullCourses2();
    ok(r === false && mergeCalls === 0, '缓存未就绪时拒绝合并');
    ok(store[K_GIST_STAMP] === undefined, '未就绪时清戳记 (下一轮重试)');

    // 就绪 + 远端哈希与本机一致: 不合并, 记账
    dbReady = true; localHash = 'bbbb';
    r = await pullCourses2();
    ok(r === false && mergeCalls === 0, '哈希一致不重复合并');
    ok(store[K_COURSES_HASH] === 'bbbb', '哈希一致时记账 (下次推送不白传)');

    // 就绪 + 远端新内容 + 合并后本机与远端一致: 合并且记账
    delete store[K_COURSES_HASH];
    localHash = 'aaaa';
    const hashSeq = ['aaaa', 'bbbb'];   // 合并前 aaaa, 合并后 bbbb
    let hi = 0;
    global.window.DB.coursesHash = () => hashSeq[Math.min(hi, 1)];
    global.window.DB.mergeUserLessons = () => { mergeCalls++; hi = 1; return true; };
    r = await pullCourses2();
    ok(r === true && mergeCalls === 1, '远端新内容触发合并');
    ok(store[K_COURSES_HASH] === 'bbbb', '合并后与远端一致 → 记账');
    ok(saveCalls === 0, '一致时不安排多余推送');

    // 就绪 + 合并后本机是并集 (哈希与远端不同): 安排回推
    mergeCalls = 0; hi = 0;
    const hashSeq2 = ['aaaa', 'cccc'];  // 合并后本机比远端多
    global.window.DB.coursesHash = () => hashSeq2[Math.min(hi, 1)];
    global.window.DB.mergeUserLessons = () => { mergeCalls++; hi = 1; return true; };
    delete store[K_COURSES_HASH];
    r = await pullCourses2();
    ok(r === true && saveCalls === 1, '本机是并集时安排回推 (独有课上云)');
    ok(store[K_COURSES_HASH] === undefined, '并集时不记账 (推送成功才记)');

    // ─── 4. db.js 行为: 守卫 / 残留清理 / factoryReset ──────
    sec('4. db.js 守卫与清理');
    function makeLS() {
        const m = new Map();
        return {
            get length() { return m.size; },
            key: i => [...m.keys()][i] ?? null,
            getItem: k => (m.has(k) ? m.get(k) : null),
            setItem: (k, v) => m.set(k, String(v)),
            removeItem: k => m.delete(k),
            _map: m
        };
    }
    function loadDB(prefix, keepLS) {
        if (!keepLS) global.localStorage = makeLS();
        global.window = { APP_CONFIG: { STORAGE_PREFIX: prefix, PROFILE_ID: 'kid' } };
        global.indexedDB   = require('fake-indexeddb').indexedDB;
        global.IDBKeyRange = require('fake-indexeddb').IDBKeyRange;
        (new Function('window', 'localStorage', 'indexedDB', 'IDBKeyRange', 'console', dbSrc))
            (global.window, global.localStorage, global.indexedDB, global.IDBKeyRange,
             { log() {}, warn() {}, error() {} });
        return { DB: global.window.DB, P: prefix + 'kid_', PREFIX: prefix };
    }
    const uniq = () => 'hsv' + Math.random().toString(36).slice(2, 8) + '_';

    // 4a. 就绪守卫: initCourses 前 mergeUserLessons 一律拒绝
    let env = loadDB(uniq());
    let changed = env.DB.mergeUserLessons([{ id: 'U01', _v: 5, title: 'x' }]);
    ok(changed === false, 'initCourses 前 mergeUserLessons 拒绝合并');
    await env.DB.initCourses();
    changed = env.DB.mergeUserLessons([{ id: 'U01', _v: 5, title: 'x' }]);
    ok(changed === true, 'initCourses 后合并恢复正常');

    // 4b. 残留旧键清理: IDB 已有课 + localStorage 旧键仍在
    const pfx = uniq();
    env = loadDB(pfx);
    await env.DB.initCourses();
    env.DB.saveUserLessons([
        { id: 'U01', title: '本机版', words: [] },
        { id: 'U02', title: 'B', words: [] }
    ]);
    await new Promise(r2 => setTimeout(r2, 80));   // 等异步落盘
    // 模拟旧版设备快照回灌的残留键: 同 id 课 (旧标题) + 一门本机没有的课
    global.localStorage.setItem(pfx + 'kid_lessons_user', JSON.stringify([
        { id: 'U01', title: '旧快照版', words: [] },
        { id: 'U03', title: 'C-遗失课', words: [] }
    ]));
    // 重新加载同前缀环境 (保留 localStorage, 复用同一 IDB 库)
    env = loadDB(pfx, true);
    const n2 = await env.DB.initCourses();
    ok(n2 === 3, '残留键里本机没有的课已并入 (共 ' + n2 + ' 门)');
    const u01 = env.DB.loadUserLessons().find(l => l.id === 'U01');
    ok(u01 && u01.title === '本机版', '同 id 课不被旧快照覆盖');
    ok(global.localStorage.getItem(pfx + 'kid_lessons_user') === null,
       '残留旧键已删除 (收回 ~700 KB 配额)');

    // 4c. factoryReset 补清
    const pfx3 = uniq();
    env = loadDB(pfx3);
    await env.DB.initCourses();
    const LS = global.localStorage;
    LS.setItem(pfx3 + 'kid_notebook', '[]');
    LS.setItem('_' + pfx3 + 'kid_prepull', '{"v":2,"gens":[]}');
    LS.setItem(pfx3 + 'sync_token', 'tok');
    LS.setItem(pfx3 + 'sync_gist_stamp', 'S');
    LS.setItem(pfx3 + 'sync_api_key', 'true');
    env.DB.factoryReset({});
    ok(LS.getItem('_' + pfx3 + 'kid_prepull') === null, '重置清掉拉取前快照 (隐私残留)');
    ok(LS.getItem(pfx3 + 'sync_token') === 'tok', '不带 clearCredentials 时保留 token');
    env.DB.factoryReset({ clearCredentials: true });
    ok(LS.getItem(pfx3 + 'sync_token') === null, 'clearCredentials 清 token');
    ok(LS.getItem(pfx3 + 'sync_gist_stamp') === null, 'clearCredentials 清 Gist 戳记');
    ok(LS.getItem(pfx3 + 'sync_api_key') === null, 'clearCredentials 清 API key 同步开关');

    // ─── 5. lessons.js / tts-pack.js / Worker ───────────────
    sec('5. 课文页监听与 manifest 缓存');
    ok(/window\.addEventListener\('hsv:datachanged'/.test(lessons),
       'lessons.js 监听 hsv:datachanged (云端新课到达即刷新)');
    ok(/if \(curLesson \|\| clozeState \|\| matchState \|\| mixedKind\) return;/.test(lessons),
       '守卫: 课内/填空/匹配/综合练习中不打断');
    ok(/#ls-import-overlay\.open'\)\) return;/.test(lessons),
       '守卫: 导入弹层打开时不重渲染 (不冲掉粘贴内容)');
    ok(/'&t=' \+ Date\.now\(\)/.test(ttsPack) && /cache: 'no-store'/.test(ttsPack),
       'tts-pack manifest 拉取: no-store + 时间戳');
    ok(/\/\\\.json\$\/i\.test\(asset\)/.test(worker) && /'no-store'/.test(worker),
       'Worker 对 .json 资产发 no-store (需单独 Cloudflare 部署)');

    // ─── 6. 版本 ────────────────────────────────────────────
    // 注: v130 (bug 修复批) 与 v131 (课程分发) 合并为同一次发版,
    // 版本断言按实际上线版本 hsv-v34 / ?v=131 校验。
    sec('6. 版本');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '131',
       'index.html 全部 ?v=131 (' + vs.length + ' 处)');
    ok(vs.length === 25, '?v= 引用总数 25 处 (24 + course-feed.js)');
    ok(/const CACHE_NAME = 'hsv-v34'/.test(sw), 'sw.js CACHE_NAME = hsv-v34');
    ok(/hsv-v33 \(\?v=130\)/.test(sw), 'sw.js 有 v33 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
