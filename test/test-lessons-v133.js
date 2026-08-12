// test-lessons-v133.js — v133 (hsv-v36) 孩子端学习时长激励卡
//   • _tWeekStats: 已落盘 + 未落盘都算 (实时)、7 天窗口、跨活动汇总
//   • renderHome 激励卡: 正向文案、向上取整、无数据不显示
// 运行: node test-lessons-v133.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

const lessons = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');

// ─── 1. _tWeekStats 行为仿真 ────────────────────────────────
sec('1. _tWeekStats');
function extract(name) {
    const i = lessons.indexOf('function ' + name + '(');
    let d = 0, st = false;
    for (let j = i; j < lessons.length; j++) {
        if (lessons[j] === '{') { d++; st = true; }
        else if (lessons[j] === '}') { d--; if (st && d === 0) return lessons.slice(i, j + 1); }
    }
}
const ymdOf = d => d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
const today = ymdOf(new Date());
const d3    = new Date(); d3.setDate(d3.getDate() - 3);
const d10   = new Date(); d10.setDate(d10.getDate() - 10);

let _tPend = {};
let prefData = '{}';
global.window = { DB: { getPref: (n, fb) => n === 'lesson_time' ? prefData : fb } };
eval(extract('_tYmdOf'));
eval(extract('_tYmd'));
eval(extract('_tWeekStats'));

// 1a. 已落盘 + 未落盘都算, 跨活动汇总
prefData = JSON.stringify({
    [today]      : { U01: { r: 120, e: 60, q: 5, qs: 30 } },
    [ymdOf(d3)]  : { U02: { r: 300, e: 0, q: 0, qs: 0 },
                     mixed: { r: 0, e: 180, q: 12, qs: 60 } },
    [ymdOf(d10)] : { U01: { r: 600, e: 0, q: 0, qs: 0 } }   // 窗口外
});
_tPend = { [today]: { U01: { r: 30, e: 0, q: 0, qs: 0 } } };
let s = _tWeekStats();
ok(s.todaySec === 210, '今日 = 落盘 180 + 未落盘 30 (实时不滞后)', s.todaySec);
ok(s.weekSec === 210 + 480, '本周 = 今日 210 + 三天前 480 (r+e 跨活动汇总)', s.weekSec);
ok(s.weekSec === 690, '10 天前的记录不在 7 天窗口内');

// 1b. 空数据
prefData = '{}'; _tPend = {};
s = _tWeekStats();
ok(s.todaySec === 0 && s.weekSec === 0, '空数据返回零 (卡片将不渲染)');

// 1c. 坏 JSON 容错
prefData = '{bad'; _tPend = { [today]: { U01: { r: 60, e: 0, q: 0, qs: 0 } } };
s = _tWeekStats();
ok(s.todaySec === 60, '落盘数据坏 JSON 时仍统计未落盘部分');

// ─── 2. 激励卡渲染 ──────────────────────────────────────────
sec('2. 激励卡');
ok(/const ts = _tWeekStats\(\);/.test(lessons), 'renderHome 取实时统计');
ok(/ts\.todaySec > 0 \|\| ts\.weekSec > 0/.test(lessons), '无数据不显示空卡片');
ok(/Math\.ceil\(ts\.todaySec \/ 60\)/.test(lessons) && /Math\.ceil\(ts\.weekSec \/ 60\)/.test(lessons),
   '分钟向上取整 (起步 30 秒也显示 1 分钟, 正反馈)');
ok(/\$\{timeCard\}\s*\n\s*\$\{mixed\}/.test(lessons), '卡片插在页头与综合练习入口之间');
ok(/ls-time-card/.test(lessons), '卡片类名就位');
ok(!/⚠/.test(extract('_tWeekStats') + (lessons.match(/const timeCard[\s\S]{0,400}/) || [''])[0]),
   '孩子端无监督性信号 (红旗只在家长后台)');
const css = fs.readFileSync(path.join(DIR, 'lessons.css'), 'utf8');
ok(/\.ls-time-card \{/.test(css) && /\.ls-time-card b \{/.test(css), 'lessons.css 有卡片样式');

// ─── 3. 版本 ────────────────────────────────────────────────
// 注: v133 (激励卡) 与 v134 (薄弱词闭环) 合并为同一次发版,
// 版本断言按实际上线版本 hsv-v37 / ?v=134 校验。
sec('3. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '134',
   'index.html 全部 ?v=134 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v37'/.test(sw), 'sw.js CACHE_NAME = hsv-v36');
ok(/hsv-v36 \(\?v=133\)/.test(sw), 'sw.js 有 v36 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
