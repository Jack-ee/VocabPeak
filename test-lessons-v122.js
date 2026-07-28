// test-lessons-v122.js — v122 (hsv-v25) 单课填空智能选题 验证
const fs   = require('fs');
const path = require('path');
const DIR  = path.join(__dirname, 'VocabPeak-main');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) pass++;
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

const src = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
function extract(name) {
    const i = src.indexOf('function ' + name);
    if (i < 0) throw new Error('未找到 ' + name);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; started = true; }
        else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('未闭合 ' + name);
}

// ─── 1. lessonArchStats: 本课档案统计 ───────────────────
section('1. 本课档案统计');
const prefs = {};
const window_ = { DB: { getPref: (k, d) => (k in prefs ? prefs[k] : d), setPref: (k, v) => { prefs[k] = String(v); } } };
eval(`
var window = window_;
${extract('loadPracRec')}
${extract('lessonArchStats')}
`);
prefs['lesson_mixed'] = JSON.stringify({
    w: {
        'U06-W01': [3, 1, 100, 0],    // 练过, 最近错
        'U06-W02': [2, 0, 200, 1],    // 练过, 最近对
        'U07-W01': [1, 0, 300, 1]     // 别的课
    },
    p: {}
});
let a = lessonArchStats({ id: 'U06', words: [{}, {}, {}, {}] });
ok(a.seen === 2,  '只统计本课词条 (U07 不混入)');
ok(a.wrong === 1, '待强化 = 最近一次错的');
ok(a.total === 4, '总数按当前词表');
a = lessonArchStats({ id: 'U99', words: [{}] });
ok(a.seen === 0 && a.wrong === 0, '没练过的课全零');

// ─── 2. 智能选题优先级 (复用 pickSmartGroup, 单课池) ────
section('2. 单课智能一组选题');
function shuffle(arr) { return arr.slice(); }   // 测试用: 保持顺序便于断言
eval(extract('pickSmartGroup'));
const words = [
    { id: 'U06-W01' },   // 上次错
    { id: 'U06-W02' },   // 练过且对
    { id: 'U06-W03' },   // 未练
    { id: 'U06-W04' }    // 未练
];
const rec = JSON.parse(prefs['lesson_mixed']).w;
let grp = pickSmartGroup(words, rec, 3, it => it.id).map(x => x.id);
ok(grp.includes('U06-W01'), '错题必入组');
ok(grp.includes('U06-W03') && grp.includes('U06-W04'), '未练的其次');
ok(!grp.includes('U06-W02'), '刚练对的排最后, 名额不足不入');

// ─── 3. 结构接线 ────────────────────────────────────────
section('3. 接线完整性');
ok(/id="ls-cloze-smart-opt"/.test(src), '设置页有智能选题开关');
ok(/const smart = arch\.seen > 0;/.test(src), '默认规则: 练过本课默认勾选');
ok(src.includes("curLesson ? startLessonCloze('choice') : startMixedCloze('choice')"), '启动路由走分流');
ok(/sm && sm\.checked\) startSmartCloze\(mode\);/.test(src) || /if \(sm && sm\.checked\) startSmartCloze/.test(src), '分流按勾选状态');
ok(/smart   : true,/.test(extract('startSmartCloze')), '智能会话带 smart 标记');
ok(/persistClozeSess\(\);/.test(extract('startSmartCloze')), '智能会话也持久化');
ok(/sm   : st\.smart \? 1 : 0,/.test(src), '存档序列化 smart 标记');
ok(/smart   : !!sess\.sm,/.test(src), '恢复会话还原 smart 标记');
ok(/st\.kind === 'lesson' && !st\.smart && curLesson/.test(src), '历史最佳守卫: 智能一组不计');
ok(src.includes("clozeState.smart) startSmartCloze(m, h)"), '「再练一轮」按原模式重抽');
ok(src.includes('\\u667A\\u80FD\\u9009\\u9898\\uFF1A\\u505A\\u9519\\u7684\\u548C\\u6CA1\\u7EC3\\u8FC7\\u7684\\u4F18\\u5148'), '题目页有智能模式标识');
ok(src.includes('\\u667A\\u80FD\\u4E00\\u7EC4\\u4E0D\\u8BA1\\u5165\\u5386\\u53F2\\u6700\\u4F73'), '结果页说明不计最佳');
ok(/lessonArchStats\(curLesson\)/.test(src), '设置页与结果页用本课档案统计');

// ─── 4. 样式与版本 ──────────────────────────────────────
section('4. 样式与版本');
const css = fs.readFileSync(path.join(DIR, 'lessons.css'), 'utf8');
ok(/\.ls-setup-smartopt \{/.test(css), '智能开关样式存在');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '122', 'index.html 全部 ?v=122');
ok(/const CACHE_NAME = 'hsv-v25'/.test(sw), 'sw.js CACHE_NAME = hsv-v25');
ok(/hsv-v25 \(\?v=122\)/.test(sw), 'sw.js 有 v25 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
