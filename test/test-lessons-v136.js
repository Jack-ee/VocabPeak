// test-lessons-v136.js — v136 (hsv-v39) 特训闯关推进
//   • 答对划掉 / 答错挪队尾 / 清空完成 / 索引边界 —— 提取 trainerAdvance
//     行为仿真, 不只正则
// 运行: node test-lessons-v136.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const mwSrc = fs.readFileSync(path.join(DIR, 'my-words.js'), 'utf8');

// ─── 1. trainerAdvance 行为仿真 ─────────────────────────────
sec('1. 闯关推进行为');
function extract(name) {
    const i = mwSrc.indexOf('function ' + name + '(');
    let d = 0, st = false;
    for (let j = i; j < mwSrc.length; j++) {
        if (mwSrc[j] === '{') { d++; st = true; }
        else if (mwSrc[j] === '}') { d--; if (st && d === 0) return mwSrc.slice(i, j + 1); }
    }
}
// 闭包依赖桩
let studyFilter, trainerList, currentIdx, currentGroup, quizScore = 0, quizTotal = 0,
    quizAnswered = true, showChinese = false, renders = 0, toasts = [];
const saveProgress = () => {}, render = () => { renders++; }, speakCurrent = () => {};
global.window = { DB: { getPref: (n, fb) => fb },
                  App: { showToast: m => toasts.push(m) } };
eval(extract('trainerAdvance'));
const W = w => ({ word: w });

// 1a. 答对划掉, 下一题指向后继词
studyFilter = 'trainer'; trainerList = [W('a'), W('b'), W('c')]; currentIdx = 0;
trainerAdvance(W('a'), true);
ok(trainerList.length === 2 && trainerList[0].word === 'b' && currentIdx === 0,
   '答对划掉, currentIdx 自然指向下一词');
ok(quizAnswered === false, '推进后复位作答状态');

// 1b. 答错挪队尾, 稍后重考
trainerList = [W('a'), W('b'), W('c')]; currentIdx = 0;
trainerAdvance(W('a'), false);
ok(trainerList.length === 3 && trainerList[2].word === 'a' && trainerList[0].word === 'b',
   '答错挪队尾 (稍后重考), 下一题是后继词');

// 1c. 最后一位答错: 归零起步, 不连考同一词
trainerList = [W('a'), W('b'), W('c')]; currentIdx = 2;
trainerAdvance(W('c'), false);
ok(currentIdx === 0 && trainerList[2].word === 'c', '末位答错归零起步 (避免连考)');

// 1d. 最后一位答对: 索引回卷
trainerList = [W('a'), W('b')]; currentIdx = 1;
trainerAdvance(W('b'), true);
ok(trainerList.length === 1 && currentIdx === 0, '末位答对后索引回卷');

// 1e. 全部消灭: 完成提示 + 回到全部筛选
trainerList = [W('a')]; currentIdx = 0; quizScore = 10; quizTotal = 12; toasts = [];
trainerAdvance(W('a'), true);
ok(trainerList.length === 0 && studyFilter === 'all',
   '清空后回到全部筛选 (再来一组点药丸重抽)');
ok(toasts.length === 1 && /特训完成/.test(toasts[0]) && /10\/12/.test(toasts[0]),
   '🎉 完成提示带成绩');

// 1f. 只剩一词反复答错: 继续考它, 不死循环崩溃
studyFilter = 'trainer'; trainerList = [W('z')]; currentIdx = 0;
trainerAdvance(W('z'), false);
ok(trainerList.length === 1 && currentIdx === 0, '仅剩一词答错继续考 (无处可挪)');

// 1g. 反馈期间切走筛选: 不动
studyFilter = 'weak'; trainerList = [W('a')]; currentIdx = 0;
trainerAdvance(W('a'), true);
ok(trainerList.length === 1, '已切走筛选时推进不生效');

// ─── 2. 接线 ────────────────────────────────────────────────
sec('2. 接线');
ok(/studyFilter === 'trainer'[\s\S]{0,80}?trainerAdvance\(w, isCorrect\)/.test(mwSrc),
   '答题后特训走专用推进 (普通筛选保持组内循环)');
ok(/isCorrect \? 1200 : 2500/.test(extract('handleQuizAnswer') || mwSrc),
   '反馈停留时间不变 (对 1.2s / 错 2.5s)');
ok(/studyFilter === 'trainer'\s*\n?\s*\? trainerList\.length/.test(mwSrc),
   '徽标: 特训中显示本轮剩余 (答对立减)');

// ─── 3. 版本 ────────────────────────────────────────────────
sec('3. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '136', 'index.html 全部 ?v=136 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v39'/.test(sw), 'sw.js CACHE_NAME = hsv-v39');
ok(/hsv-v39 \(\?v=136\)/.test(sw), 'sw.js 有 v39 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
