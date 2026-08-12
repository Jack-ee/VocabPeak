// test-lessons-v134.js — v134 (hsv-v37) 薄弱词闭环
//   • recordWordResult 统一记账: 毕业需连对>=4 且跨>=3 个学习日;
//     同日刷连对不毕业; 答错清零; 长期不练进度保留 (不随时间衰减)
//   • getTrainerWords 三路聚合与优先级; migrateWeakTags 幂等迁移
//   • 课文/单词双端接线; 后台口径只认标签; 版本
// 运行: node test-lessons-v134.js   (需 fake-indexeddb)
require('fake-indexeddb/auto');
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

const dbSrc   = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const mwSrc   = fs.readFileSync(path.join(DIR, 'my-words.js'), 'utf8');
const lessons = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
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

(async () => {
    // ─── 1. 毕业规则 (家长定的, 测试锁死) ────────────────────
    sec('1. recordWordResult 毕业规则');
    let DB = loadDB();
    DB.saveNotebook([{ word: 'abandon', meaning: '\u653e\u5f03',
                       focus: ['weak'], wrongCount: 2 }]);

    // 1a. 同日刷连对 4 次: 不毕业 (跨日不足)
    for (let i = 0; i < 4; i++) DB.recordWordResult('abandon', true, 'quiz', '2026-08-11');
    let w = DB.loadNotebook()[0];
    ok(w.correctStreak === 4 && (w.focus || []).includes('weak'),
       '同日连对 4 次不毕业 (一天刷出来的不算掌握)');

    // 1b. 跨到第 3 个学习日: 毕业
    DB.recordWordResult('abandon', true, 'quiz', '2026-08-15');
    w = DB.loadNotebook()[0];
    ok((w.focus || []).includes('weak'), '第 2 个学习日仍不毕业 (跨日 >= 3)');
    DB.recordWordResult('abandon', true, 'quiz', '2026-09-20');
    w = DB.loadNotebook()[0];
    ok(!(w.focus || []).includes('weak'), '第 3 个学习日 + 连对>=4 → 毕业摘牌');
    ok(Array.isArray(w.streakDays) && w.streakDays.length === 0, '毕业后 streakDays 清空, 下周期干净起步');

    // 1c. 长期不练: 进度原样保留 (无时间衰减逻辑)
    DB = loadDB();
    DB.saveNotebook([{ word: 'persist', meaning: '\u575a\u6301', focus: ['weak'] }]);
    DB.recordWordResult('persist', true, 'quiz', '2026-01-01');
    DB.recordWordResult('persist', true, 'quiz', '2026-01-02');
    // …… 半年不练 ……
    DB.recordWordResult('persist', true, 'quiz', '2026-07-01');
    DB.recordWordResult('persist', true, 'quiz', '2026-07-02');
    w = DB.loadNotebook()[0];
    ok(!(w.focus || []).includes('weak'),
       '半年空窗后回来接着攒 → 达标即毕业 (进度不随时间衰减)');

    // 1d. 答错清零重攒 + 双端计数字段分流
    DB = loadDB();
    DB.saveNotebook([{ word: 'quit', meaning: '\u9000\u51fa', focus: [] }]);
    DB.recordWordResult('quit', true,  'quiz',   '2026-08-01');
    DB.recordWordResult('quit', true,  'quiz',   '2026-08-02');
    DB.recordWordResult('quit', false, 'lesson', '2026-08-03');   // 课文答错
    w = DB.loadNotebook()[0];
    ok(w.correctStreak === 0 && w.streakDays.length === 0, '答错清零连对与跨日进度');
    ok((w.focus || []).includes('weak'), '课文答错也打 weak 标签 (v134 合流)');
    ok(w.mistakeCount === 1 && !w.wrongCount, "source='lesson' 计 mistakeCount");
    ok(w.srsLevel === 0 && w.nextReview == null, '课文答错拉回 SRS 立即到期 (职责并入, 不双计)');
    DB.recordWordResult('quit', false, 'quiz', '2026-08-04');
    w = DB.loadNotebook()[0];
    ok(w.wrongCount === 1 && w.mistakeCount === 1, "source='quiz' 计 wrongCount (字段语义保持)");
    ok(w.lastResultAt > 0, 'lastResultAt 落账 (后台"多久没练"用)');
    ok(DB.recordWordResult('nonexist', true, 'lesson') === null,
       '不在生词本 → no-op (课文答对的常见情形)');

    // ─── 2. getTrainerWords 三路聚合 ────────────────────────
    sec('2. 今日特训选词');
    DB = loadDB();
    await DB.initCourses();
    DB.saveUserLessons([{ id: 'U01', title: 'T', words: [
        { id: 'U01-W1', lemma: 'ancient' }, { id: 'U01-W2', lemma: 'modern' }] }]);
    await new Promise(r => setTimeout(r, 60));
    // 课文档案: ancient 最近答错, modern 最近答对
    DB.setPref('lesson_mixed', JSON.stringify({
        w: { 'U01-W1': [3, 2, 100, 0], 'U01-W2': [3, 0, 100, 1] }, p: {} }));
    const now = Date.now();
    DB.saveNotebook([
        { word: 'ancient', meaning: 'a', focus: ['weak'] },              // weak+课文错 = 7
        { word: 'banana',  meaning: 'b', focus: ['weak'], wrongCount: 5 }, // weak = 4.3
        { word: 'cherry',  meaning: 'c', focus: [], nextReview: now - 1000 }, // 到期 = 2
        { word: 'modern',  meaning: 'm', focus: [] },                    // 课文答对 = 0
        { word: 'dull',    meaning: 'd', focus: [] }                     // 无信号 = 0
    ]);
    const tr = DB.getTrainerWords(12).map(w => w.word);
    ok(tr[0] === 'ancient', 'weak+课文错的排最前 (优先级叠加)', tr.join(','));
    ok(tr.includes('banana') && tr.includes('cherry'), 'weak 与到期词都入选');
    ok(!tr.includes('dull') && !tr.includes('modern'),
       '无信号的词不入选 (课文最近答对不算错); 从没复习过 != 到期');
    ok(DB.getTrainerWords(1).length === 1, 'n 上限生效');

    // ─── 3. 迁移幂等 ────────────────────────────────────────
    sec('3. weak 标签迁移');
    DB = loadDB();
    DB.saveNotebook([
        { word: 'a', meaning: '1', mistakeCount: 2, focus: [] },      // 合流前课文错词
        { word: 'b', meaning: '2', wrongCount: 1 },                   // focus 缺失
        { word: 'c', meaning: '3', focus: ['weak'], mistakeCount: 1 },// 已有标签
        { word: 'd', meaning: '4', focus: [] }                        // 没错过
    ]);
    ok(DB.migrateWeakTags() === 2, '补打 2 个 (已有标签与没错过的不动)');
    const nb3 = DB.loadNotebook();
    ok((nb3[0].focus || []).includes('weak') && (nb3[1].focus || []).includes('weak'),
       '错过的词进入统一毕业流程');
    ok(!(nb3[3].focus || []).includes('weak'), '没错过的词不受影响');
    ok(DB.migrateWeakTags() === 0, '幂等: 第二次跑不重复打标');

    // ─── 4. 双端接线与后台口径 ──────────────────────────────
    sec('4. 接线');
    ok(/recordWordResult\?\.\(w\.word, isCorrect, 'quiz'\)/.test(mwSrc),
       '单词测验走统一记账 (trackQuizResult 薄壳化)');
    ok(!/entry\.correctStreak >= 3/.test(mwSrc), '旧的"连对3次毕业"逻辑已移除');
    ok(/recordWordResult\?\.\(w\.lemma, false, 'lesson'\)/.test(lessons),
       '课文答错走统一记账');
    ok(!/flagQuizMistake\?\.\(w\.lemma\)/.test(lessons), 'reinforceWord 不再单独调 flagQuizMistake (防双计)');
    ok(/recordWordResult\?\.\(w\.lemma, true, 'lesson'\)/.test(lessons),
       '课文答对也推动毕业进度');
    ok(/studyFilter === 'trainer'/.test(mwSrc) && /startTrainer/.test(mwSrc),
       'my-words 特训模式与公开入口');
    ok(/if \(studyFilter === 'trainer'\) studyFilter = 'all';/.test(mwSrc),
       '重载恢复 trainer 兜底回全部');
    ok(/ls-trainer-go/.test(lessons) && /getTrainerWords\?\.\(999\)/.test(lessons),
       '课文页特训入口卡 (待训数实时)');
    ok(/data-nav="my-words"/.test(lessons) && /MyWords\?\.startTrainer\?\.\(\)/.test(lessons),
       '入口卡点击: 切页 + 开练');
    ok(/migrateWeakTags\?\.\(\)/.test(fs.readFileSync(path.join(DIR, 'app.js'), 'utf8')),
       'boot 执行迁移');
    ok(/\.filter\(w=> w\.flagged\);/.test(dash), '后台口径只认 weak 标签 (毕业即退出)');
    ok(/天未练/.test(dash), '后台显示"N 天未练"');
    ok(/\.ls-trainer-btn/.test(fs.readFileSync(path.join(DIR, 'lessons.css'), 'utf8')),
       '特训按钮样式就位');

    // ─── 5. 版本 ────────────────────────────────────────────
    sec('5. 版本');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '134',
       'index.html 全部 ?v=134 (' + vs.length + ' 处)');
    ok(vs.length === 25, '?v= 引用总数 25 处');
    ok(/const CACHE_NAME = 'hsv-v37'/.test(sw), 'sw.js CACHE_NAME = hsv-v37');
    ok(/hsv-v37 \(\?v=134\)/.test(sw), 'sw.js 有 v37 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
