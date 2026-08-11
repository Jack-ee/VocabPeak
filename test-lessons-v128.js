// test-lessons-v128.js — v128 (hsv-v31) 课程搬入 IndexedDB + 独立文件同步
require('fake-indexeddb/auto');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

// ─── 桩环境: localStorage + APP_CONFIG, 真 IndexedDB(替身) ──
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
async function loadDB(seedLegacy) {
    // 每个用例一套干净环境 (含独立 IDB 库名以免互相污染)
    delete require.cache[require.resolve('fake-indexeddb/auto')];
    global.localStorage = makeLS();
    global.window = { APP_CONFIG: { STORAGE_PREFIX: 'hsv_', PROFILE_ID: 'kid' } };
    global.indexedDB = require('fake-indexeddb').indexedDB;
    global.IDBKeyRange = require('fake-indexeddb').IDBKeyRange;
    // 用唯一库名: 改 PREFIX 即可 (CDB_NAME = PREFIX + 'content')
    const uniq = 'hsv' + Math.random().toString(36).slice(2, 8) + '_';
    global.window.APP_CONFIG.STORAGE_PREFIX = uniq;
    if (seedLegacy) {
        localStorage.setItem(uniq + 'kid_lessons_user', JSON.stringify(seedLegacy));
    }
    const src = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
    (new Function('window', 'localStorage', 'indexedDB', 'IDBKeyRange', 'console', src))
        (global.window, global.localStorage, global.indexedDB, global.IDBKeyRange,
         { log() {}, warn() {}, error() {} });
    return { DB: global.window.DB, P: uniq + 'kid_', PREFIX: uniq };
}

(async () => {
    // ─── 1. 迁移 ────────────────────────────────────────────
    sec('1. localStorage → IndexedDB 迁移');
    let { DB, P } = await loadDB([
        { id: 'U01', title: 'A', words: [] },
        { id: 'U02', title: 'B', words: [] }
    ]);
    const n = await DB.initCourses();
    ok(n === 2, '迁移后课程数正确 (' + n + ')');
    ok(localStorage.getItem(P + 'lessons_user') === null, '旧 localStorage 键已释放');
    ok(DB.loadUserLessons().length === 2, '同步接口读得到课程');
    ok(DB.loadUserLessons().every(l => l._v > 0), '每课带版本时间戳');
    ok(DB.coursesReady() === true, 'ready 标志置位');
    // 重开一次: 应从 IDB 读回, 不依赖 localStorage
    const again = await DB.initCourses();
    ok(again === 2, '重复调用幂等');

    // ─── 2. 保存与版本号语义 ────────────────────────────────
    sec('2. 保存与版本号');
    const before = DB.loadUserLessons();
    const h0 = DB.coursesHash();
    DB.saveUserLessons(before);                       // 内容未变
    ok(DB.coursesHash() === h0, '内容未变时哈希不变 (不会误传几百KB)');
    const edited = before.map(l => l.id === 'U01' ? Object.assign({}, l, { title: 'A2' }) : l);
    DB.saveUserLessons(edited);
    ok(DB.coursesHash() !== h0, '内容变化后哈希变化');
    ok(DB.loadUserLessons().find(l => l.id === 'U01')._v >
       before.find(l => l.id === 'U01')._v, '改动的课版本号推进');
    ok(DB.loadUserLessons().find(l => l.id === 'U02')._v ===
       before.find(l => l.id === 'U02')._v, '未改动的课版本号保持');

    // ─── 3. 合并 (同步拉取语义) ─────────────────────────────
    sec('3. mergeUserLessons');
    const t = Date.now() + 10000;
    let changed = DB.mergeUserLessons([{ id: 'U03', title: 'C', _v: t }]);
    ok(changed && DB.loadUserLessons().length === 3, '远端新课并入');
    changed = DB.mergeUserLessons([{ id: 'U03', title: 'C-old', _v: 1 }]);
    ok(!changed, '远端版本更旧时不动 (取新的一侧)');
    ok(DB.loadUserLessons().find(l => l.id === 'U03').title === 'C', '内容保持较新版本');
    changed = DB.mergeUserLessons([{ id: 'U03', title: 'C-new', _v: t + 1 }]);
    ok(changed && DB.loadUserLessons().find(l => l.id === 'U03').title === 'C-new', '远端更新时采用');
    const cnt = DB.loadUserLessons().length;
    DB.mergeUserLessons([]);
    ok(DB.loadUserLessons().length === cnt, '空数组不清空 (永不删除)');
    DB.mergeUserLessons([{ id: 'U01', title: 'A2', _v: 1 }]);
    ok(DB.loadUserLessons().length === cnt, '远端缺课不会删本地课');

    // ─── 4. 导出/导入格式兼容 ───────────────────────────────
    sec('4. 备份格式兼容 (工具链不失效)');
    const dump = JSON.parse(DB.exportAll());
    const lk = Object.keys(dump).find(k => k.endsWith('_lessons_user'));
    ok(!!lk, '备份仍含 lessons_user 键 (make-course-pack.js 等照旧可用)');
    ok(JSON.parse(dump[lk]).length === 3, '备份里课程齐全 (不会静默丢课)');
    // 导入到干净环境
    const env2 = await loadDB(null);
    await env2.DB.initCourses();
    ok(env2.DB.loadUserLessons().length === 0, '新环境初始为空');
    // 把上一份备份的键改成新前缀后导入
    const remapped = {};
    Object.keys(dump).forEach(k => { remapped[k.replace(/^hsv\w*?_kid_/, env2.P)] = dump[k]; });
    env2.DB.importAll(JSON.stringify(remapped), { replace: true });
    await new Promise(r => setTimeout(r, 50));
    ok(env2.DB.loadUserLessons().length === 3, '导入后课程进入 IndexedDB');
    ok(localStorage.getItem(env2.P + 'lessons_user') === null, '导入不把课程落回 localStorage');
    // 非 replace 导入 = 课程包并入
    env2.DB.importAll(JSON.stringify({ [env2.P + 'lessons_user']:
        JSON.stringify([{ id: 'U09', title: 'Pack', _v: Date.now() + 99999 }]) }), {});
    await new Promise(r => setTimeout(r, 50));
    ok(env2.DB.loadUserLessons().length === 4, '非 replace 导入按版本合并 (课程包并入)');

    // ─── 5. 全部重置 ────────────────────────────────────────
    sec('5. factoryReset 清课程库');
    env2.DB.factoryReset();
    await new Promise(r => setTimeout(r, 50));
    ok(env2.DB.loadUserLessons().length === 0, '重置后课程清空 (不残留给下一个人)');

    // ─── 6. sync.js 接线 ────────────────────────────────────
    sec('6. 同步侧接线');
    const sync = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
    ok(/function coursesFile\(\)/.test(sync), '课程独立 Gist 文件名');
    ok(/if \(k === prefix \+ 'lessons_user'\) continue;/.test(sync), '主载荷排除课程键');
    ok(/h !== localStorage\.getItem\(K_COURSES_HASH\)/.test(sync), '推送按哈希增量');
    ok(/body\.files\[coursesFile\(\)\] = \{/.test(sync), '变化时才附课程文件');
    ok(/async function pullCourses\(\)/.test(sync), '拉取侧有课程合并');
    ok(/obj\._hash === window\.DB\.coursesHash\(\)/.test(sync), '哈希相同则跳过下载');
    ok(/if \(f\.truncated && f\.raw_url\)/.test(sync), '课程文件超 1MB 也走 raw_url');
    ok(/const coursesChanged = await pullCourses\(\);/.test(sync), '课程拉取与用户数据解耦');
    ok(/detail: \{ courses: true \}/.test(sync), '仅课程变化时也通知界面');
    ok(!/'lesson_phrase_sel', 'notebook', 'lessons_user'\]/.test(sync), '快照守护键已去掉课程');
    const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
    ok(/async function boot\(\)/.test(app) && /await window\.DB\?\.initCourses\?\.\(\)/.test(app),
       'boot 等待课程加载完成');

    sec('7. 版本纪律');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '128', 'index.html 全部 ?v=128');
    ok(/const CACHE_NAME = 'hsv-v31'/.test(sw), 'sw.js CACHE_NAME = hsv-v31');
    ok(/hsv-v31 \(\?v=128\)/.test(sw), 'sw.js 有 v31 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
