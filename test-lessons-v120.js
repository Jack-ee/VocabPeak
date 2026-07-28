// test-lessons-v120.js — v120 (hsv-v23) 部分进度显示 + 同步字段级合并 验证
const fs   = require('fs');
const path = require('path');
const DIR  = path.join(__dirname, 'VocabPeak-main');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) pass++;
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

const sync = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
const les  = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
function extract(src, name) {
    const i = src.indexOf('function ' + name);
    if (i < 0) throw new Error('未找到 ' + name);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; started = true; }
        else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('未闭合 ' + name);
}
eval(extract(sync, '_safeParse'));
eval(extract(sync, 'mergeLessonProgress'));
eval(extract(sync, 'mergeLessonMixed'));
eval(extract(sync, 'mergeLessonSess'));

// ─── 1. lesson_progress 合并: 取或/取大 ─────────────────
section('1. 进度合并 (听/短取或, 填空取大)');
// 场景: 平板离线整卷练到 85% + 听完; 远端旧快照只有 70%
let m = JSON.parse(mergeLessonProgress(
    JSON.stringify({ U06: { listened: true, clozeBest: 85, clozeRuns: 3 } }),
    JSON.stringify({ U06: { clozeBest: 70, clozeRuns: 1, matchDone: true } })));
ok(m.U06.listened === true,  '本地听读✓ 不被远端缺失覆盖');
ok(m.U06.clozeBest === 85,   '填空最佳取大 (85 vs 70)');
ok(m.U06.clozeRuns === 3,    '轮数取大');
ok(m.U06.matchDone === true, '远端短语✓ 也并入');
m = JSON.parse(mergeLessonProgress(
    JSON.stringify({ U07: { clozeBest: 0 } }),
    JSON.stringify({})));
ok(m.U07.clozeBest === 0, '0% 最佳成绩不丢 (与「无记录」区分)');
m = JSON.parse(mergeLessonProgress('垃圾', JSON.stringify({ U08: { listened: true } })));
ok(m.U08 && m.U08.listened, '本地损坏时用远端, 不炸');
m = JSON.parse(mergeLessonProgress(
    JSON.stringify({ U09: { listened: true } }), null));
ok(m.U09 && m.U09.listened, '远端缺键时保本地');

// ─── 2. lesson_mixed 合并: 逐条取时间新 ─────────────────
section('2. 练习档案合并 (逐词条取新)');
m = JSON.parse(mergeLessonMixed(
    JSON.stringify({ w: { 'U06-W01': [3, 1, 2000, 1], 'U06-W02': [1, 0, 1000, 1] }, p: {} }),
    JSON.stringify({ w: { 'U06-W01': [2, 2, 1500, 0], 'U06-W03': [1, 1, 3000, 0] }, p: { 'U06-W01|a': [1, 0, 500, 1] } })));
ok(m.w['U06-W01'][2] === 2000, '同词条取时间新的一侧 (本地 2000 > 远端 1500)');
ok(m.w['U06-W02'] && m.w['U06-W03'], '两侧独有词条都保留 (并集)');
ok(m.p['U06-W01|a'][2] === 500, '短语档案同规则');
ok(Object.keys(m.w).length === 3, '词条数 = 并集 3');

// ─── 3. lesson_sess 合并: 逐课逐槽取 ts 新 ──────────────
section('3. 会话存档合并 (逐槽取新)');
m = JSON.parse(mergeLessonSess(
    JSON.stringify({ U06: { c: { ts: 9000, gi: 1 } },            U07: { m: { ts: 100 } } }),
    JSON.stringify({ U06: { c: { ts: 5000, gi: 0 }, m: { ts: 7000 } } })));
ok(m.U06.c.ts === 9000 && m.U06.c.gi === 1, '填空槽取本地 (较新)');
ok(m.U06.m.ts === 7000, '匹配槽取远端 (本地无)');
ok(m.U07.m.ts === 100,  '本地独有课保留');
m = JSON.parse(mergeLessonSess(JSON.stringify({ U08: {} }), JSON.stringify({})));
ok(!m.U08, '空槽课条目被清理');

// ─── 4. 端到端: 「离线练习 + 旧快照拉取」不再丢记录 ─────
section('4. 端到端: 旧快照拉取后离线记录存活');
// 完整跑 mergeSyncData 太重 (依赖闭包), 用同逻辑复演关键路径:
// 本地有离线练习产生的三键, 远端旧快照缺 lesson_mixed 且进度更旧
const prefix = 'hsv_kid_';
const localStore = {};
localStore[prefix + 'lesson_progress'] = JSON.stringify({ U06: { clozeBest: 85 } });
localStore[prefix + 'lesson_mixed']    = JSON.stringify({ w: { 'U06-W01': [1, 0, 999, 1] }, p: {} });
const remotePayload = {};
remotePayload[prefix + 'lesson_progress'] = JSON.stringify({ U06: { clozeBest: 40 }, U07: { listened: true } });
// (远端没有 lesson_mixed — 模拟另一设备还是 v117 旧版)
const mergeFns = {};
mergeFns[prefix + 'lesson_progress'] = mergeLessonProgress;
mergeFns[prefix + 'lesson_mixed']    = mergeLessonMixed;
let mergedUnion = 0;
const written = {};
Object.keys(remotePayload).forEach(k => {
    let v = remotePayload[k];
    if (mergeFns[k] && localStore[k] != null) {
        v = mergeFns[k](localStore[k], remotePayload[k]);
        if (v !== remotePayload[k]) mergedUnion++;
    }
    written[k] = v;
});
// 删除阶段: 本地独有的 lesson_mixed 被豁免
const localOnly = Object.keys(localStore).filter(k => !(k in remotePayload));
const removed   = [];
localOnly.forEach(k => { if (mergeFns[k]) { mergedUnion++; return; } removed.push(k); });
const finalProg = JSON.parse(written[prefix + 'lesson_progress']);
ok(finalProg.U06.clozeBest === 85, '本地 85% 战胜远端旧值 40%');
ok(finalProg.U07.listened === true, '远端新增课进度也并入');
ok(removed.length === 0, '本地独有 lesson_mixed 未被删除');
ok(mergedUnion === 2, '并集超出远端 → 计数触发回推 (' + mergedUnion + ')');

// ─── 5. 结构接线与显示修正 ──────────────────────────────
section('5. 接线完整性');
ok(/mergeFns\[prefix \+ 'lesson_progress'\] = mergeLessonProgress/.test(sync), '写入循环接入进度合并');
ok(/mergeFns\[prefix \+ 'lesson_mixed'\]\s+= mergeLessonMixed/.test(sync), '写入循环接入档案合并');
ok(/mergeFns\[prefix \+ 'lesson_sess'\]\s+= mergeLessonSess/.test(sync), '写入循环接入会话合并');
ok(/if \(mergeFns\[k\]\) \{ mergedUnion\+\+; return; \}/.test(sync), '删除阶段豁免课文记录键');
ok(/preservedDayKeys, mergedUnion \}/.test(sync), '返回值带 mergedUnion'); 
ok(/result\.preservedDayKeys > 0 \|\| result\.mergedUnion > 0/.test(sync), '并集超出远端触发回推');
ok(/ls-badge-part/.test(les), '主页有部分进度徽标');
ok(les.includes("\\u586B\\u7A7A\\u7EC3\\u8FC7 ' + Math.min(arch.w, wordN)"), '填空部分进度显示 练过 n/N');
ok(les.includes("\\u77ED\\u8BED\\u7EED\\u505A ' + (sess.m.done || []).length"), '短语续做进度显示');
ok(les.includes("\\u7EC3\\u8FC7 ' + Math.min(wp,"), '课内头部也显示部分进度');
const css = fs.readFileSync(path.join(DIR, 'lessons.css'), 'utf8');
ok(/\.ls-badge-part \{\n    border     : 1px dashed var\(--accent\);/.test(css), '部分进度徽标虚线样式');

const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '120', 'index.html 全部 ?v=120');
ok(/const CACHE_NAME = 'hsv-v23'/.test(sync.length ? fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8') : ''), 'sw.js CACHE_NAME = hsv-v23');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
