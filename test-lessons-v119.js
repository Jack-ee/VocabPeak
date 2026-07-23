// test-lessons-v119.js — v119 (hsv-v22) 会话续做/跳组/补句译 验证
// 运行: node test-lessons-v119.js
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

// ─── 1. 会话存档: 序列化/恢复 逻辑桩测 ──────────────────
section('1. 填空会话存档往返');
// 桩: DB pref + 会话辅助函数在闭包外重建
const prefs = {};
const window_ = { DB: { getPref: (k, d) => (k in prefs ? prefs[k] : d), setPref: (k, v) => { prefs[k] = String(v); } } };
let curLesson = { id: 'U01' };
eval(`
var window = window_;
${extract('sessKey')}
${extract('loadSessStore')}
${extract('saveSessStore')}
${extract('getSess')}
${extract('putSess')}
${extract('clearSess')}
`);
putSess('c', { mode: 'choice', g: [['U01-W01', 'U01-W02']], gi: 0, idx: 1, a: { 'U01-W01': [1, 'U01-W03'] }, o: {}, ts: 1 });
ok(getSess('c') && getSess('c').mode === 'choice', '存 → 取 一致');
ok(getSess('m') === null, '槽位隔离: 匹配槽为空');
putSess('m', { g: [['U01-W01|a b']], done: [], ts: 2 });
ok(getSess('c') && getSess('m'), '双槽共存');
clearSess('c');
ok(getSess('c') === null && getSess('m'), '清填空槽不影响匹配槽');
clearSess('m');
ok(!('lesson_sess' in prefs) || JSON.parse(prefs['lesson_sess']) && !JSON.parse(prefs['lesson_sess'])['U01'], '双槽清空后课条目移除');
curLesson = null;
putSess('c', { g: [['x']], ts: 3 });
ok(JSON.parse(prefs['lesson_sess'])['__mixed'], '综合练习会话存 __mixed 键');
curLesson = { id: 'U01' };
ok(getSess('c') === null, '课会话与综合会话互不串档');

// ─── 2. 补句译: applySentenceZh ─────────────────────────
section('2. 补句译合并');
let savedLessons = null;
eval(`
${extract('allSentences')}
function isUserLesson(id) { return /^U\\d+$/.test(String(id || '')); }
function userLessons() { return [lessonU]; }
var lessonU;
window.DB.saveUserLessons = arr => { savedLessons = arr; };
${extract('applySentenceZh')}
`);
lessonU = {
    id: 'U01',
    paras: [
        { id: 'U01-P1', sentences: [ { id: 'U01-P1-S1', text: 'One.' }, { id: 'U01-P1-S2', text: 'Two.' } ] },
        { id: 'U01-P2', zh: '已有段译。', sentences: [ { id: 'U01-P2-S1', text: 'Three.' } ] }
    ]
};
let r = applySentenceZh(lessonU, ['第一句。', '第二句。']);
ok(!r.ok && /句数不符/.test(r.err), '句数不符时报错并给出双方数量');
r = applySentenceZh(lessonU, ['第一句。', '第二句。', '第三句。']);
ok(r.ok, '数量匹配时合并成功');
ok(lessonU.paras[0].sentences[1].zh === '第二句。', '句译按顺序写入');
ok(lessonU.paras[0].zh === '第一句。第二句。', '缺段译时由句译拼接');
ok(lessonU.paras[1].zh === '已有段译。', '已有段译不被覆盖');
ok(savedLessons && savedLessons[0].id === 'U01', '用户课已保存');
r = applySentenceZh(lessonU, 'not-array');
ok(!r.ok, '非数组输入安全拒绝');

// ─── 3. 结构完整性 ──────────────────────────────────────
section('3. 结构与路由成对');
const pairs = [
    ['id="ls-cloze-resume-sess"', "resumeClozeSess(null)"],
    ['data-resumegrp',            'dataset.resumegrp'],
    ['data-jumpgrp',              'dataset.jumpgrp'],
    ['id="ls-match-resume-sess"', "resumeMatchSess(null)"],
    ['data-resumemgrp',           'dataset.resumemgrp'],
    ['data-jumpmgrp',             'dataset.jumpmgrp'],
    ['id="ls-zh-fix"',            'openZhFixSheet()'],
    ['id="ls-zhfix-ai"',          'runZhFixAI()'],
    ['id="ls-zhfix-copy"',        'copyZhFixPrompt()'],
    ['id="ls-zhfix-apply"',       'applyZhFixPaste()']
];
pairs.forEach(([a, b]) => ok(src.includes(a) && src.includes(b), `UI 与路由成对: ${a}`));
ok(/persistClozeSess\(\)/.test(extract('gradeCloze')), 'gradeCloze 内落盘');
ok(/persistMatchSess\(\)/.test(extract('pickMatch')), 'pickMatch 内落盘');
ok(/clearSess\('c'\)/.test(extract('renderClozeResult')), '整卷答完清填空档');
ok(/clearSess\('m'\)/.test(extract('renderMatchDone')), '全部配平清匹配档');
ok(/st\.gi > 0/.test(extract('clozeGoPrev')), '组首 ← 可回上一组');
ok(/st\.doneSet\.has\(p\.key\)/.test(extract('startMatchGroup')), '匹配断点续做按 doneSet 过滤');
ok(/groups\.every\(g => g\.every/.test(extract('renderMatchGroupDone')), '总完成判定覆盖全部组');
ok(src.includes('ICON_PREV') && src.includes('ICON_NEXT') && src.includes('ICON_BACK'), 'SVG 图标常量存在');
ok((src.match(/\$\{ICON_BACK\}/g) || []).length === 2, '两处返回按钮均用 SVG');
ok(/stroke-width="2.6"/.test(src), '箭头 2.6px 粗描边');
ok(/isUserLesson\(curLesson\.id\)\s*\n?\s*&& allSentences\(curLesson\)\.some\(x => !x\.zh\)/.test(src), '补译按钮仅缺译导入课显示');
ok(/callClaudeJSON/.test(src) && /hasAPIKey/.test(src), 'AI 自动翻译走 AIEngine 多供应商');
ok(!/localStorage\.(get|set)Item\(['"]lesson_sess/.test(src), '会话存档未裸写 localStorage');

// ─── 4. 样式与版本纪律 ──────────────────────────────────
section('4. 样式与版本');
const css = fs.readFileSync(path.join(DIR, 'lessons.css'), 'utf8');
['ls-grp-chip', 'ls-resume-box', 'ls-zhfix-ta', 'ls-ico', 'ls-grp-row'].forEach(c =>
    ok(css.includes('.' + c), 'CSS 有 .' + c));
ok(/\.ls-opts \{ max-width: none; \}/.test(css), '选项与页面同宽 (520px 上限已去)');
ok(/\.ls-opt \{\n    font-weight   : 600;/.test(css), '选项文字加粗');
ok(/\.ls-back \{[^}]*border          : 1\.5px solid var\(--accent\)/.test(css), '返回按钮主色描边');

const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
ok(new Set(vs).size === 1 && vs[0] === '119', 'index.html 全部 ?v=119');
ok(/const CACHE_NAME = 'hsv-v22'/.test(sw), 'sw.js CACHE_NAME = hsv-v22');
ok(/hsv-v22 \(\?v=119\)/.test(sw), 'sw.js 有 v22 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
