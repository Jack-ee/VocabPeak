// test-lessons-v135.js — v135 (hsv-v38) 特训入口补全 (单词页药丸)
// 运行: node test-lessons-v135.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

const mwSrc = fs.readFileSync(path.join(DIR, 'my-words.js'), 'utf8');
const idx   = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw    = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');

sec('1. 单词页特训入口');
ok(/data-filter="trainer"[^>]*>&#x1F3AF;/.test(idx) && /id="mw-fc-trainer"/.test(idx),
   '药丸行有 🎯 特训 + 待训数徽标');
ok(idx.indexOf('data-filter="due"') < idx.indexOf('data-filter="trainer"')
   && idx.indexOf('data-filter="trainer"') < idx.indexOf('data-filter="core"'),
   '位置紧跟复习药丸 (语义相近)');
ok(/if \(btn\.dataset\.filter === 'trainer'\) \{ saveProgress\(\); startTrainer\(\); return; \}/.test(mwSrc),
   '点击特判: 走 startTrainer 抽词单开练, 不走普通筛选切换');
ok(/getTrainerWords\?\.\(9999\)/.test(mwSrc) && /set\('mw-fc-trainer', trainerCount\)/.test(mwSrc),
   '待训数徽标实时更新 (与课文页入口同一聚合口径)');
ok(/coreCount \+ pronCount \+ spellCount \+ weakCount \+ trainerCount > 0/.test(mwSrc),
   '待训数计入筛选行显隐条件');
// 高亮态: render 内 studyFilter 同步逻辑覆盖 trainer (无需专门代码)
ok(/b\.dataset\.filter === studyFilter/.test(mwSrc), '药丸 active 由 studyFilter 同步 (trainer 自动高亮)');

// 注: v135 已上线 hsv-v38, v136 (闯关推进) 为其修正版, 同一功能线,
// 版本断言随头部前进到 hsv-v39 / ?v=136。
sec('2. 版本');
const vs = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '136', 'index.html 全部 ?v=136 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v39'/.test(sw), 'sw.js CACHE_NAME = hsv-v38');
ok(/hsv-v38 \(\?v=135\)/.test(sw), 'sw.js 有 v38 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
