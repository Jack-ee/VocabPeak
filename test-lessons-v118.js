// test-lessons-v118.js — VocabPeak v118 (hsv-v21) 课文精读改动验证
// 运行: node test-lessons-v118.js   (无需浏览器)
const fs   = require('fs');
const path = require('path');
const DIR  = path.join(__dirname, 'VocabPeak-main');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

// ─── 最小 DOM/localStorage 桩 ───────────────────────────
const store = {};
global.localStorage = {
    getItem : k => (k in store ? store[k] : null),
    setItem : (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    key     : i => Object.keys(store)[i],
    get length() { return Object.keys(store).length; }
};
global.window = { localStorage: global.localStorage };
global.document = { getElementById: () => null, addEventListener: () => {} };
global.navigator = { onLine: true };

// ─── 载入数据与 db.js ───────────────────────────────────
eval(fs.readFileSync(path.join(DIR, 'lessons-data.js'), 'utf8'));
eval(fs.readFileSync(path.join(DIR, 'db.js'), 'utf8'));
const DB = window.DB;
DB.init ? DB.init() : null;

const LESSONS = window.HSV_LESSONS;

// ─── 1. 句级中文译文 ────────────────────────────────────
section('1. 句级译文 (点「中文」显示整句)');
const allSents = [];
LESSONS.forEach(l => l.paras.forEach(p => p.sentences.forEach(s => allSents.push(s))));
ok(allSents.length === 19, '内置课共 19 句', '实得 ' + allSents.length);
ok(allSents.every(s => s.zh && s.zh.length > 3), '每句都有非空 zh',
   '缺译: ' + allSents.filter(s => !s.zh).map(s => s.id).join(','));
ok(LESSONS.every(l => l.paras.every(p => p.zh)), '段译仍在 (课文页「译」按钮不受影响)');
ok(allSents.find(s => s.id === 'L01-P1-S2').zh.includes('益处'), 'L01-P1-S2 句译内容正确');

// ─── 2. flagQuizMistake: 答错拉回到期 ───────────────────
section('2. 答错自动入强化库 (遗忘曲线)');
DB.upsertNotebookWord({ word: 'benefit', meaning: '益处' });
let e = DB.loadNotebook().find(w => w.word === 'benefit');
e.srsLevel = 4; e.nextReview = Date.now() + 30 * 86400000;
DB.saveNotebook(DB.loadNotebook().map(w => w.word === 'benefit' ? e : w));
ok(DB.getDueWords().every(w => w.word !== 'benefit'), '前置: 已排到 30 天后, 不在到期队列');

const flagged = DB.flagQuizMistake('benefit');
ok(flagged && flagged.srsLevel === 0, '答错后 srsLevel 归零');
ok(flagged.nextReview === null, 'nextReview 清空 = 立即到期');
ok(flagged.mistakeCount === 1, 'mistakeCount 累加');
ok(DB.getDueWords().some(w => w.word === 'benefit'), '该词立刻出现在到期复习队列');
const beforeDaily = JSON.stringify(DB.getDailyLog ? DB.getDailyLog() : {});
DB.flagQuizMistake('benefit');
ok(DB.loadNotebook().find(w => w.word === 'benefit').mistakeCount === 2, '重复答错继续累加');
ok(DB.flagQuizMistake('不存在的词') === null, '词不在生词本时安全返回 null');

// 之后正常复习应重新爬升间隔
const rev = DB.recordReview('benefit', 'good');
ok(rev.srsLevel === 1 && rev.nextReview > Date.now(), '复习后按遗忘曲线重新排期');

// ─── 3. 纯函数: 从 lessons.js 里抽出来单测 ──────────────
section('3. 词边界匹配 findWordStart (bug 修复)');
const src = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
function extract(name) {
    const i = src.indexOf('function ' + name);
    if (i < 0) throw new Error('未找到函数 ' + name);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; started = true; }
        else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('未闭合: ' + name);
}
eval(extract('isWordChar'));
eval(extract('findWordStart'));
eval(extract('chunkGroups'));

const S1 = 'According to a review of evidence in a medical journal, runners live three years longer than non-runners.';
ok(findWordStart(S1, 'runners') === S1.indexOf('runners'), '"runners" 命中首个独立出现');
ok(findWordStart(S1, 'run') === -1, '"run" 不再误命中 "runners" (原 bug)');
ok(findWordStart('non-runners are here', 'runners') === -1, '连字符视为词内, 不切开 non-runners');
ok(findWordStart(S1, 'According to') === 0, '多词短语按整体匹配');
ok(findWordStart("You don't have to run fast", 'run') === 18, '撇号句中定位正确 (转义无关)');
ok(findWordStart(S1, 'zzz') === -1, '找不到返回 -1');
const S2 = 'It takes some practice.';
ok(findWordStart(S2, 'practice') === 14, '句末带句点的词可命中');

section('4. 分组切分 chunkGroups');
const mk = n => Array.from({ length: n }, (_, i) => i);
ok(chunkGroups(mk(16), 30).length === 1, '16 题 / 每组 30 → 1 组');
ok(chunkGroups(mk(47), 30).map(g => g.length).join(',') === '30,17', '47 题 → [30,17] 无碎尾');
ok(chunkGroups(mk(45), 30).length === 1, '45 题 (=1.5倍) 不切, 避免 [30,15]');
ok(chunkGroups(mk(46), 30).map(g => g.length).join(',') === '30,16', '46 题才开始切');
ok(chunkGroups(mk(100), 30).map(g => g.length).join(',') === '30,30,40', '100 题 → 尾组并入');
ok(chunkGroups(mk(60), 0).length === 1, '每组题量 0 = 不分组');
ok(chunkGroups(mk(60), 30).reduce((n, g) => n + g.length, 0) === 60, '分组不丢题');
ok(JSON.stringify(chunkGroups(mk(5), 30)[0]) === JSON.stringify(mk(5)), '不分组时内容与顺序不变');

// ─── 5. 综合练习选题优先级 ──────────────────────────────
section('5. 综合练习智能选题 pickSmartGroup');
function shuffle(arr) {   // pickSmartGroup 依赖
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
}
eval(extract('pickSmartGroup'));
const pool = [
    { id: 'A' },   // 上次做错, 错 3 次
    { id: 'B' },   // 上次做错, 错 1 次
    { id: 'C' },   // 没练过
    { id: 'D' },   // 练过且对, 很久以前
    { id: 'E' }    // 练过且对, 刚刚
];
const rec = {
    A: [5, 3, 1000, 0],
    B: [2, 1, 2000, 0],
    D: [3, 0, 1000, 1],
    E: [3, 0, 9999, 1]
};
const g2 = pickSmartGroup(pool, rec, 2, it => it.id).map(x => x.id).sort();
ok(g2.join(',') === 'A,B', '错过的两条最优先 (A 错更多也在内)');
const g3 = pickSmartGroup(pool, rec, 3, it => it.id).map(x => x.id).sort();
ok(g3.join(',') === 'A,B,C', '第三位是没练过的 C');
const g4 = pickSmartGroup(pool, rec, 4, it => it.id).map(x => x.id).sort();
ok(g4.join(',') === 'A,B,C,D', '第四位是最久没练的 D (E 刚练过排最后)');
ok(pickSmartGroup(pool, rec, 99, it => it.id).length === 5, 'size 超池容量时取全部');
ok(pickSmartGroup([], rec, 5, it => it.id).length === 0, '空池安全');

// ─── 6. parseImport: 句译与段译拼接 ─────────────────────
section('6. 导入器: 句级 zh 与段译拼接');
ok(/"zh": "本句的中文翻译。"/.test(src), 'IMPORT_PROMPT 输出示例含句级 zh');
ok(/每一句都有非空的 zh 句译/.test(src), 'IMPORT_PROMPT 自检项含句译检查');
ok(/整段译文由应用自动拼接/.test(src), 'IMPORT_PROMPT 说明段译自动生成');
const mdPrompt = fs.readFileSync(path.join(DIR, 'lesson-import-prompt.md'), 'utf8');
ok(/"zh": "本句的中文翻译。"/.test(mdPrompt), 'docs 提示词已同步 (两处一致)');
ok(src.indexOf('findWordStart(s.text, surface)') > 0, '词-句自动关联改用词边界匹配');
ok(/sens\.every\(s => s\.zh\)/.test(src), '段译缺失时由句译拼接 (需每句都有译文)');

// ─── 7. 结构完整性 / 回归 ───────────────────────────────
section('7. 结构完整性与回归检查');
ok(!/st\.queue\b/.test(src), '旧字段 st.queue 已全部替换为 clozeQueue(st)');
ok(!/addWrongToNotebook/.test(src), '手动「错词加入生词本」已移除 (改自动)');
ok(!/ls-wrong-add/.test(src), '对应按钮路由也已移除, 无悬空引用');
ok(/id="ls-cloze-nextgroup"/.test(src) && /nextClozeGroup\(\)/.test(src), '组小结「继续下一组」按钮与路由成对');
ok(/id="ls-match-nextgroup"/.test(src) && /nextMatchGroup\(\)/.test(src), '短语组小结按钮与路由成对');
ok(/id="ls-mixed-cloze"/.test(src) && /openMixed\('cloze'\)/.test(src), '综合填空入口与路由成对');
ok(/id="ls-mixed-match"/.test(src) && /openMixed\('match'\)/.test(src), '综合短语入口与路由成对');
ok(/curLesson \? startCloze/.test(src), '填空启动按 curLesson 分流单课/综合');
ok(/if \(!clozeState \|\| !root\.querySelector\('\.ls-cloze'\)\) return;/.test(src),
   '快捷键门控改按 clozeState (综合练习页也生效)');
ok(/e\.stopPropagation\(\); submitSpell\(\)/.test(src), '拼写框回车已阻止冒泡, 不触发全局下一题');
ok(/const token = \+\+st\.autoT/.test(src), '自动跳题带令牌校验');
ok(/st\.gi === gi && st\.idx === idx/.test(src), '自动跳题额外校验位置 (防竞态)');

// 版本纪律
const idx  = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw   = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs   = [...idx.matchAll(/\?v=(\d+)/g)].map(m => m[1]);
ok(new Set(vs).size === 1 && vs[0] === '118', 'index.html 全部 ?v=118 (' + new Set(vs).size + ' 种)');
ok(/const CACHE_NAME = 'hsv-v21'/.test(sw), 'sw.js CACHE_NAME = hsv-v21');
ok(/hsv-v21 \(\?v=118\)/.test(sw), 'sw.js 顶部有本版变更日志');
ok(/settings-lesson-group/.test(idx), 'index.html 有每组题量设置项');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
ok(/getPref\('lesson_group_size', '30'\)/.test(app), 'app.js 加载该设置');
ok(/setPref\('lesson_group_size'/.test(app), 'app.js 保存该设置');

// 同源隔离: 新键必须走 DB.getPref/setPref (自带 hsv_{pid}_ 前缀)
ok(!/localStorage\.(get|set)Item\(['"]lesson_/.test(src), '新键未裸写 localStorage (同源隔离)');
ok(/setPref\?\.\('lesson_mixed'/.test(src), '练习档案走 DB.setPref, 随快照同步');

// SW 预缓存完整性
['lessons.js', 'lessons-data.js', 'lessons.css', 'db.js', 'app.js'].forEach(f =>
    ok(sw.includes("'./" + f + "'"), 'SW 预缓存含 ' + f));

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
