// test-lessons-v138.js — v138 (hsv-v41) 单课填空精选上限
//   • 上限 = 组容量×2; 超限走 pickSmartGroup (错题/未练优先);
//     不超限全量; 组容量 0 不裁 —— 提取真实函数做行为仿真
// 运行: node test-lessons-v138.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const src = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');

function extract(name) {
    const i = src.indexOf('function ' + name + '(');
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}
// 提取真实的 pickSmartGroup / chunkGroups / shuffle 并仿真 startCloze 的精选段
eval(extract('shuffle') || 'function shuffle(a){return a.slice()}');
eval(extract('pickSmartGroup'));
eval(extract('chunkGroups'));

sec('1. 精选行为 (真实函数驱动)');
// 87 词的课, 组容量 30 → cap 60
const words = Array.from({ length: 87 }, (_, i) => ({ id: 'W' + i }));
const rec = {};                        // 练习档案
rec['W3']  = [2, 2, 100, 0];           // 错过且最近错
rec['W7']  = [1, 1, 200, 0];           // 错过
for (let i = 40; i < 60; i++) rec['W' + i] = [1, 0, 300 + i, 1];  // 练过且对
const cap = 30 * 1;   // v139: 一天一课节奏, 上限收紧为组容量×1
const items = pickSmartGroup(words, rec, cap, it => it.id);
ok(items.length === 30, '87 词裁到上限 30 (组容量×1, 一天一课)', items.length);
const ids = new Set(items.map(w => w.id));
ok(ids.has('W3') && ids.has('W7'), '错题必入选 (置顶优先级)');
const freshIn = words.filter(w => !rec[w.id]).filter(w => ids.has(w.id)).length;
ok(freshIn >= 20, '未练过的词占满余位 (入选 ' + freshIn + ')');
const groups = chunkGroups(items, 30);
ok(groups.length === 1 && groups[0].length === 30, '精选后正好一组 (一轮一个专注时段)');

// 不超限: 全量
const small = Array.from({ length: 45 }, (_, i) => ({ id: 'S' + i }));
// v139: 45 词 > 30 会精选; 28 词不超限全量
const tiny = Array.from({ length: 28 }, (_, i) => ({ id: 'T' + i }));
ok(chunkGroups(tiny, 30).reduce((n, g) => n + g.length, 0) === 28, '28 词不超上限 → 全量出题');

sec('2. 接线');
ok(/const cap = gsz;/.test(src), '上限 = 组容量 × 1 (一天一课, 设置联动)');
ok(/if \(cap && all\.length > cap\)/.test(src), '组容量 0 (不分组) 时 cap=0 不裁 (尊重全量意图)');
ok(/pickSmartGroup\(all, loadPracRec\(\)\.w, cap, it => it\.id\)/.test(src),
   '超限走智能精选 (与综合练习同一套)');
ok(/本轮精选|\\u672C\\u8F6E\\u7CBE\\u9009/.test(src) || /\u672C\u8F6E\u7CBE\u9009/.test(src),
   '精选发生时 toast 告知 (不是漏题)');
ok(/pool\s*:\s*\(curLesson\.words \|\| \[\]\)\.slice\(\),\s*\/\/ 干扰项抽样池 \(仍用全课词条/.test(src),
   '干扰项池不随精选缩水');
ok(/groups\s*:\s*chunkGroups\(items, gsz\)/.test(src), '精选结果按组容量切组');

sec('3. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '139', 'index.html 全部 ?v=139 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v42'/.test(sw), 'sw.js CACHE_NAME = hsv-v41');
ok(/hsv-v42 \(\?v=139\)/.test(sw), 'sw.js 有 v42 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
