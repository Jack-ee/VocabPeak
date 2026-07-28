// test-lessons-v121.js — v121 (hsv-v24) 短语精选 验证
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

// ─── 桩环境 + 抽取纯函数 ────────────────────────────────
const prefs = {};
const window_ = { DB: { getPref: (k, d) => (k in prefs ? prefs[k] : d), setPref: (k, v) => { prefs[k] = String(v); } } };
eval(`
var window = window_;
${extract('isWordChar')}
${extract('findWordStart')}
${extract('allSentences')}
${extract('loadPhraseSel')}
${extract('savePhraseSel')}
${extract('lessonPhraseSel')}
${extract('setLessonPhraseSel')}
${extract('lessonPhrasesAll')}
${extract('lessonPhrasesCore')}
${extract('phraseInText')}
${extract('smartPhraseSel')}
var PHRASE_CAP = 40;
`);

// ─── 1. 精选存储 ────────────────────────────────────────
section('1. 精选存储 (标记而非删除)');
setLessonPhraseSel('U03', ['U03-W01|a b', 'U03-W02|c d']);
ok(lessonPhraseSel('U03').length === 2, '存 → 取一致');
ok(lessonPhraseSel('U04') === null, '未设置的课返回 null (= 全部视为精选)');
setLessonPhraseSel('U03', null);
ok(lessonPhraseSel('U03') === null, '清除后恢复默认全选');

// ─── 2. 题池过滤 ────────────────────────────────────────
section('2. 精选/全量题池');
const L = {
    id: 'U05',
    paras: [{ id: 'P1', sentences: [
        { id: 'S1', text: 'He wants to give up smoking and take part in the race.' }
    ] }],
    words: [
        { id: 'U05-W01', lemma: 'give',  zh: '给', phrases: [
            { en: 'give up sth',   zh: '放弃' },
            { en: 'give away',     zh: '赠送' },
            { en: 'give in to sb', zh: '屈服' } ] },
        { id: 'U05-W02', lemma: 'take',  zh: '拿', phrases: [
            { en: 'take part in',  zh: '参加' },
            { en: 'take off',      zh: '起飞' } ] },
        { id: 'U05-W03', lemma: 'race',  zh: '比赛', phrases: [
            { en: 'a horse race',  zh: '赛马' } ] },
        { id: 'U05-W04', lemma: 'easy',  zh: '容易的', phrases: [] }
    ]
};
ok(lessonPhrasesAll(L).length === 6, '全量池 6 条');
ok(lessonPhrasesCore(L).length === 6, '无精选条目时核心池 = 全量');
setLessonPhraseSel('U05', ['U05-W01|give up sth', 'U05-W02|take part in']);
ok(lessonPhrasesCore(L).length === 2, '有精选条目时核心池按 key 过滤');
ok(lessonPhrasesAll(L).length === 6, '全量池不受精选影响 (恢复旧会话用)');
setLessonPhraseSel('U05', null);

// ─── 3. 原文命中判定 ────────────────────────────────────
section('3. phraseInText (词边界 + 忽略大小写 + 去占位词)');
ok(phraseInText(L, 'take part in') === true, '原文短语命中');
ok(phraseInText(L, 'give up sth') === true, '尾部 sth 占位词剥离后命中');
ok(phraseInText(L, 'give up smoking today') === false, '不做词形还原/模糊匹配, 整体不在即不命中');
ok(phraseInText(L, 'take off') === false, '不在原文的搭配不命中');
ok(phraseInText(L, 'He wants') === true, '忽略大小写');

// ─── 4. 智能精选算法 ────────────────────────────────────
section('4. smartPhraseSel (覆盖面优先 + 原文加分 + 上限)');
let keep = smartPhraseSel(L, 40);
ok(keep.length === 6, '总数低于上限时全保留');
keep = smartPhraseSel(L, 3);
ok(keep.length === 3, '上限 3 → 恰取 3 条');
ok(keep.includes('U05-W02|take part in'), '原文出现的 take part in 必入选');
ok(keep.includes('U05-W01|give up sth'), '原文出现的 give up sth 必入选');
ok(keep.includes('U05-W03|a horse race'), '覆盖轮为 race 词补最优 (race 短语虽不在原文)');
ok(!keep.includes('U05-W01|give in to sb'), '每词第 3 条低分被裁');
const w1 = keep.filter(k => k.indexOf('U05-W01|') === 0).length;
ok(w1 <= 1, '上限紧张时同词不占多席 (W01 占 ' + w1 + ' 席)');
keep = smartPhraseSel(L, 5);
const w1b = keep.filter(k => k.indexOf('U05-W01|') === 0).length;
ok(keep.length === 5 && w1b === 2, '有余额时第三层补同词次优 (W01 得 2 席)');
ok(smartPhraseSel({ id: 'X', paras: [], words: [] }, 40).length === 0, '空课安全');

// ─── 5. 大规模仿真: 69 短语课压到 40 ────────────────────
section('5. 内置 L02 (69 对) 实测');
global.window = window_;
eval(fs.readFileSync(path.join(DIR, 'lessons-data.js'), 'utf8').replace(/^window\./m, 'global.window.'));
const L02 = global.window.HSV_LESSONS.find(l => l.id === 'L02');
keep = smartPhraseSel(L02, 40);
ok(keep.length === 40, `69 对精选到 40 (实得 ${keep.length})`);
const inTextKept = keep.filter(k => {
    const [wid, en] = k.split('|');
    return phraseInText(L02, en);
}).length;
const inTextAll = lessonPhrasesAll(L02).filter(p => phraseInText(L02, p.en)).length;
ok(inTextKept === inTextAll, `原文出现的 ${inTextAll} 条全部入选 (入选 ${inTextKept})`);
const coveredWords = new Set(keep.map(k => k.split('|')[0])).size;
ok(coveredWords >= 38, `覆盖 ${coveredWords} 个词条 (覆盖面优先)`);

// ─── 6. 结构接线与版本 ──────────────────────────────────
section('6. 接线与版本');
[['id="ls-phrase-sel-open"', 'openPhraseSelSheet()'],
 ['id="ls-psel-smart"',      'runPhraseSelSmart()'],
 ['id="ls-psel-ai"',         'runPhraseSelAI()'],
 ['id="ls-psel-clear"',      "setLessonPhraseSel(curLesson.id, null)"],
 ['data-star',               'togglePhraseStar'],
 ['id="ls-match-start-all"', 'startMatch(true)']
].forEach(([a, b]) => ok(src.includes(a) && src.includes(b), `UI 与路由成对: ${a}`));
ok(/const pool  = curLesson \? lessonPhrasesAll\(curLesson\) : mixedPhrasePoolAll\(\);/.test(src),
   '恢复会话用全量池 (旧存档不失效)');
ok(/function mixedPhrasePool\(\) \{[\s\S]{0,200}lessonPhrasesCore/.test(src), '综合短语池按精选过滤');
ok(/const phrN   = lessonPhrasesCore\(l\)\.length;/.test(src), '主页卡短语分母按精选口径');
ok(src.includes("setLessonPhraseSel(id, null);"), '删课清理精选条目');
ok(/宁缺毋滥/.test(src) && /全课短语总数控制在 40 条以内/.test(src), 'IMPORT_PROMPT 源头限流');
ok(/全课短语总数不超过 40 条/.test(src), '自检清单含总数上限');
const md = fs.readFileSync(path.join(DIR, 'lesson-import-prompt.md'), 'utf8');
ok(/宁缺毋滥/.test(md) && /全课短语总数不超过 40 条/.test(md), 'md 提示词已同步');
const css = fs.readFileSync(path.join(DIR, 'lessons.css'), 'utf8');
ok(/\.ls-phrase-star/.test(css) && /\.ls-phrase-ext/.test(css), '星标与淡显样式');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '121', 'index.html 全部 ?v=121');
ok(/const CACHE_NAME = 'hsv-v24'/.test(sw), 'sw.js CACHE_NAME = hsv-v24');
ok(/hsv-v24 \(\?v=121\)/.test(sw), 'sw.js 有 v24 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
