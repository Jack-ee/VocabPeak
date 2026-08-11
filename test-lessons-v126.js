// test-lessons-v126.js — v126 (hsv-v29) 内容键不删除 + 多代快照 + 回滚修复
const fs   = require('fs');
const path = require('path');
const DIR  = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
function ok(c, n, x) { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } }
function section(t) { console.log('\n── ' + t + ' ──'); }

const src = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
function extract(name) {
    const i = src.indexOf('function ' + name);
    if (i < 0) throw new Error('未找到 ' + name);
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}

// ─── 1. restorePrePull 的 ReferenceError 已修 ───────────
section('1. 回滚函数作用域');
const body = extract('restorePrePull');
ok(/const prefix = keyPrefix\(\);/.test(body), '函数体内取得 prefix (v125 报错点)');
const usesBeforeDef = body.indexOf('prefix') < body.indexOf('const prefix');
ok(!usesBeforeDef, 'prefix 先定义后使用');
ok(/readPrePullGens\(prefix\)/.test(body), '按前缀读取快照');
// 实测: 桩环境跑一遍, 不应抛 ReferenceError
const store = {};
const g = {
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    },
    console: { log() {}, table() {}, warn() {} },
    window: {}
};
function keyPrefix() { return 'hsv_kid_'; }
const PREPULL_KEYS = ['lesson_progress', 'lesson_mixed', 'lesson_sess',
                      'lesson_phrase_sel', 'notebook', 'lessons_user'];
const PREPULL_GENS = 3;
const localStorage = g.localStorage;
const console_ = console;
eval(extract('prePullKey'));
eval(extract('readPrePullGens'));
eval(extract('writePrePullGens'));
eval(extract('restorePrePull').replace(/window\.App\?\.showToast\?\.\([^)]*\);/g, ''));
let threw = null, res = null;
try { res = restorePrePull(); } catch (e) { threw = e; }
ok(!threw, '无快照时调用不抛异常', threw && threw.message);
ok(res === null, '无快照返回 null');
// 存一代再查
store['_hsv_kid_prepull'] = JSON.stringify({ v: 2, gens: [
    { ts: 1000, data: { 'hsv_kid_lessons_user': JSON.stringify([{ title: 'Sleepy Kids' }]),
                        'hsv_kid_notebook': JSON.stringify([1, 2, 3]) } }
] });
try { res = restorePrePull(); } catch (e) { threw = e; }
ok(!threw, '有快照时查看不抛异常', threw && threw.message);
ok(res && res.generations && res.generations[0].lessons[0] === 'Sleepy Kids', '概览列出课程名');
ok(res.generations[0].notebookCount === 3, '概览列出生词本条数');
ok(res.restored === false, '不传参数只查看不回滚');
res = restorePrePull(true);
ok(res.restored === true && res.restoredKeys.length === 2, '传 true 执行回滚');
ok(store['hsv_kid_notebook'] === JSON.stringify([1, 2, 3]), '回滚确实写回了数据');

// ─── 2. 多代快照 ────────────────────────────────────────
section('2. 多代快照');
ok(/const PREPULL_GENS = 3;/.test(src), '保留 3 代');
ok(/const same = gens\[0\] && JSON\.stringify\(gens\[0\]\.data\) === JSON\.stringify\(cur\)/.test(src),
   '同数据不重复入栈 (轮询不挤掉好快照)');
ok(/for \(let keep = Math\.min\(PREPULL_GENS, gens\.length\); keep >= 1; keep--\)/.test(src),
   '配额不足时逐代降级');
ok(/if \(obj && obj\.data\) return \[\{ ts: obj\.ts \|\| 0, data: obj\.data \}\]/.test(src),
   '兼容 v123 单代格式');
// 多代写入行为
delete store['_hsv_kid_prepull'];
let gens = [];
for (let i = 1; i <= 5; i++) {
    gens.unshift({ ts: i, data: { x: String(i) } });
    writePrePullGens('hsv_kid_', gens);
    gens = readPrePullGens('hsv_kid_');
}
ok(gens.length === 3, '超出 3 代自动淘汰最旧 (现 ' + gens.length + ' 代)');
ok(gens[0].data.x === '5', '最新一代在最前');

// ─── 3. 内容键不删除 (根因修复) ─────────────────────────
section('3. 内容型键豁免删除');
const def = src.indexOf('const contentKeys = new Set');
const use = src.indexOf('contentKeys.has(k)');
ok(def > 0, 'contentKeys 已定义 (半成品里缺这一行)');
ok(def < use, '定义先于使用');
const block = src.slice(def, def + 300);
['lessons_user', 'lesson_phrase_sel', 'notebook'].forEach(k =>
    ok(block.includes(k), '内容键含 ' + k));
ok(/if \(contentKeys\.has\(k\)\) \{ mergedUnion\+\+; return; \}/.test(src),
   '缺键时保留并计入回推');
ok(use > src.indexOf('if (mergeFns[k]) { mergedUnion++; return; }'),
   '记录键豁免仍在 (v120 保护未被破坏)');
// 删除仍然可行的路径: 键存在时正常覆盖
ok(/localStorage\.removeItem\(k\)/.test(src), '非内容键仍按远端删除');

// ─── 4. 版本纪律 ────────────────────────────────────────
section('4. 版本纪律');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '126', 'index.html 全部 ?v=126');
ok(/const CACHE_NAME = 'hsv-v29'/.test(sw), 'sw.js CACHE_NAME = hsv-v29');
ok(/hsv-v29 \(\?v=126\)/.test(sw), 'sw.js 有 v29 变更日志');
ok(/prefix is not defined|ReferenceError/.test(sw), '变更日志记录了报错修复');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
