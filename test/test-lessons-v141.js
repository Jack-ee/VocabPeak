// test-lessons-v141.js — v141 (hsv-v44) 测试设备开关 + 碎屑过滤 + 今日列
// 运行: node test-lessons-v141.js   (需 fake-indexeddb)
require('fake-indexeddb/auto');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
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
    global.indexedDB   = require('fake-indexeddb').indexedDB;
    global.IDBKeyRange = require('fake-indexeddb').IDBKeyRange;
    (new Function('window', 'localStorage', 'indexedDB', 'IDBKeyRange', 'console', dbSrc))
        (global.window, global.localStorage, global.indexedDB, global.IDBKeyRange,
         { log() {}, warn() {}, error() {} });
    return global.window.DB;
}

// ─── 1. 测试设备开关: 记账全面豁免 ──────────────────────────
sec('1. 测试设备豁免');
let DB = loadDB();
DB.saveNotebook([{ word: 'a', meaning: '1', focus: [] }]);
DB.setPref('device_test_mode', 'true');
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
DB.setPref('device_test_mode', 'false');
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
ok(/'device_test_mode'/.test(syncSrc.slice(syncSrc.indexOf('PREF_SYNC_BLOCKLIST'), syncSrc.indexOf('PREF_SYNC_BLOCKLIST') + 900)),
   '开关在同步黑名单 (绝不同步到孩子设备)');

// ─── 2. UI 接线 ─────────────────────────────────────────────
sec('2. UI');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
ok(/id="pref-test-device"/.test(idx) && /本机为测试设备/.test(idx), '开发者区有开关');
ok(/device_test_mode/.test(app) && /本机已标记为测试设备/.test(app), 'app.js 接线 + 状态提示');

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
const vs = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '141', 'index.html 全部 ?v=141 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v44'/.test(sw), 'sw.js CACHE_NAME = hsv-v44');
ok(/hsv-v44 \(\?v=141\)/.test(sw), 'sw.js 有 v44 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
