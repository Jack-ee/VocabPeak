// test-lessons-v141.js — v141 (hsv-v44) 测试设备开关 + 碎屑过滤 + 今日列
// 运行: node test/test-lessons-v141.js
//   v147: fake-indexeddb 改为可选 —— 装了就用 (npm install), 没装时 db.js
//   课程库自动回退 localStorage, 本测试关心的记账逻辑不受影响
let FIDB = null;
try { FIDB = require('fake-indexeddb'); } catch (e) { /* 可选依赖 */ }
const fs = require('fs'), path = require('path');
// v147: 兼容两种摆放 —— 仓库内 test/ 目录 (推荐, npm test), 或旧习惯的「与 VocabPeak-main 同级」
const DIR = (() => {
    const sib = path.join(__dirname, 'VocabPeak-main');
    return fs.existsSync(path.join(sib, 'index.html')) ? sib : path.join(__dirname, '..');
})();
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const dbSrc   = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const lessons = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
const syncSrc = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
const dash    = fs.readFileSync(path.join(DIR, 'dashboard.html'), 'utf8');

function makeLS() {
    const m = new Map();
    return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
             getItem: k => (m.has(k) ? m.get(k) : null),
             setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
function loadDB() {
    global.localStorage = makeLS();
    const prefix = 'hsv' + Math.random().toString(36).slice(2, 8) + '_';
    global.window = { APP_CONFIG: { STORAGE_PREFIX: prefix, PROFILE_ID: 'kid' } };
    global.indexedDB   = FIDB ? FIDB.indexedDB   : undefined;
    global.IDBKeyRange = FIDB ? FIDB.IDBKeyRange : undefined;
    (new Function('window', 'localStorage', 'indexedDB', 'IDBKeyRange', 'console', dbSrc))
        (global.window, global.localStorage, global.indexedDB, global.IDBKeyRange,
         { log() {}, warn() {}, error() {} });
    return global.window.DB;
}

// ─── 1. 测试设备开关: 记账全面豁免 ──────────────────────────
sec('1. 测试设备豁免');
let DB = loadDB();
DB.saveNotebook([{ word: 'a', meaning: '1', focus: [] }]);
DB.setTestDevice(true);                     // v147: 开关改存本机键
ok(DB.isTestDevice() === true, '开关读取正确');
ok(DB.recordWordResult('a', false, 'quiz') === null, '薄弱词记账豁免');
let w = DB.loadNotebook()[0];
ok(!w.wrongCount && !(w.focus || []).includes('weak'), '词条未被污染 (无错次无标签)');
DB.bumpDaily({ quizTotal: 1 });
ok(DB.loadDays ? true : true, 'bumpDaily 调用不抛错');
const dayKeys = [];
for (let i = 0; i < global.localStorage.length; i++) {
    const k = global.localStorage.key(i);
    if (k && k.includes('day_')) dayKeys.push(k);
}
ok(dayKeys.length === 0, '天记录未落账');
DB.setTestDevice(false);
DB.recordWordResult('a', false, 'quiz');
w = DB.loadNotebook()[0];
ok(w.wrongCount === 1 && (w.focus || []).includes('weak'), '关闭开关后记账恢复正常');

ok(/_tTick\(\) \{\n        if \(window\.DB\?\.isTestDevice\?\.\(\)\) return;/.test(lessons),
   '时长心跳豁免');
ok(/_tNoteAnswer\(sec\) \{\n        if \(window\.DB\?\.isTestDevice\?\.\(\)\) return;/.test(lessons),
   '答题计速豁免');
ok(/bumpPracRec\([^)]*\) \{\n        if \(window\.DB\?\.isTestDevice\?\.\(\)\) return;/.test(lessons),
   '练习档案豁免');
ok(/markActiveDay: function\(\) \{\n            if \(this\.isTestDevice\(\)\) return;/.test(dbSrc),
   'markActiveDay 豁免');
// v147: 原断言只查「黑名单里有这个字符串」—— 黑名单只拦推送触发, 不拦
// 收集与拉取, 开关照样泄漏, 这条却一直是绿的。改为检查存储位置; 真实
// 推送/拉取路由的验证在 test-sync-merge-v147.js。
ok(/const K_TEST_DEVICE = PREFIX \+ 'device_test_mode';/.test(dbSrc),
   '开关存非同步键 (不带档案段, 不进快照)');

// ─── 2. UI 接线 ─────────────────────────────────────────────
sec('2. UI');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
ok(/id="pref-test-device"/.test(idx) && /本机为测试设备/.test(idx), '开发者区有开关');
ok(/setTestDevice/.test(app) && /本机已标记为测试设备/.test(app), 'app.js 接线 + 状态提示');

// ─── 3. dashboard 碎屑过滤与今日列 ──────────────────────────
sec('3. 后台');
ok(/const MIN_DAY_SEC = 60;/.test(dash), '碎屑阈值 60 秒');
ok(/if\(\(\(x\.r\|\|0\)\+\(x\.e\|\|0\)\) < MIN_DAY_SEC\) return;/.test(dash),
   '单课单日不足阈值不入课表、不刷新最近学习');
ok(/if\(day === todayKey\)\{ p\.tr\+=x\.r\|\|0; p\.te\+=x\.e\|\|0; \}/.test(dash),
   '今日读/练分桶');
ok(/<th>今日 读\/练<\/th>/.test(dash), '课表有今日列');
ok(/getMonth\(\)\+1\)\.padStart/.test(dash), '今日键用本地时区 (与采集端一致)');
ok(/碎屑/.test(dash) && /本机为测试设备/.test(dash), '说明文字更新');

// ─── 4. 版本 ────────────────────────────────────────────────
sec('4. 版本');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    // v147: 版本号一致性统一由 test-release.js 按当前版本检查 (历史版本号钉死已移除)
const vs = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
