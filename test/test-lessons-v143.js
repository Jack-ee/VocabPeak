// test-lessons-v143.js — v143 (hsv-v46) 课文朗读音色会话锁定
//   • 锁定后连播多句用同一音色; 缺片段的句子只该句回退且锁不变;
//     解锁后恢复随机; 单词卡逐词随机不受影响
// 运行: node test-lessons-v143.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const packSrc    = fs.readFileSync(path.join(DIR, 'tts-pack.js'), 'utf8');
const lessonsSrc = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
const appSrc     = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

// ─── 1. 选音色逻辑行为仿真 ──────────────────────────────────
sec('1. 会话锁定行为');
function extract(src, name, isAsync) {
    const tag = (isAsync ? 'async function ' : 'function ') + name + '(';
    const i = src.indexOf(tag);
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}
// 用局部 console 桩喂给被测函数, 不污染全局 (否则测试自己的输出也没了)
let _sessionVoice = null;
const quiet = { log() {}, warn() {}, error() {} };
eval(extract(packSrc, 'beginVoiceSession').replace('console.log', 'quiet.log'));
eval(extract(packSrc, 'endVoiceSession'));

// 复刻 playWord 的选音色核心 (避开 IndexedDB 依赖)
function pickVoice(cached, preferredVoices) {
    let pool = cached;
    if (Array.isArray(preferredVoices) && preferredVoices.length) {
        const want     = new Set(preferredVoices.map(v => String(v).toLowerCase()));
        const narrowed = cached.filter(v => want.has(v));
        if (narrowed.length) pool = narrowed;
    }
    return (_sessionVoice && pool.indexOf(_sessionVoice) >= 0)
        ? _sessionVoice
        : pool[Math.floor(Math.random() * pool.length)];
}
const PREF = ['fable', 'nova'];

// 1a. 锁定后 20 句全部同一音色
const locked = beginVoiceSession(PREF);
ok(PREF.includes(locked), '锁定的音色来自用户选择', locked);
const picks = [];
for (let i = 0; i < 20; i++) picks.push(pickVoice(['fable', 'nova'], PREF));
ok(new Set(picks).size === 1 && picks[0] === locked,
   '连播 20 句全部同一朗读者 (不再逐句换人)', [...new Set(picks)].join(','));

// 1b. 某句缺锁定音色 → 只该句回退, 锁不变
const other = locked === 'fable' ? 'nova' : 'fable';
const fallback = pickVoice([other], PREF);     // 该句只有另一个音色
ok(fallback === other, '缺锁定音色的句子回退到可用音色 (离线音频不浪费)');
ok(_sessionVoice === locked, '回退不改变会话锁');
ok(pickVoice(['fable', 'nova'], PREF) === locked, '下一句有锁定音色则继续用它');

// 1c. 解锁后恢复随机 (统计 200 次应出现两种)
endVoiceSession();
ok(_sessionVoice === null, 'endVoiceSession 清锁');
const rand = new Set();
for (let i = 0; i < 200; i++) rand.add(pickVoice(['fable', 'nova'], PREF));
ok(rand.size === 2, '解锁后恢复随机 (单词卡逐词换声音不受影响)');

// 1d. 无偏好列表时不锁 (回退到旧行为)
ok(beginVoiceSession([]) === null && _sessionVoice === null, '无可选音色时不锁定');

// 1e. 多次开会话应能选到不同音色 (重听换声音的好处保留)
const sessionVoices = new Set();
for (let i = 0; i < 100; i++) sessionVoices.add(beginVoiceSession(PREF));
ok(sessionVoices.size === 2, '不同次播放会随机到不同音色');
endVoiceSession();

// ─── 2. 接线 ────────────────────────────────────────────────
sec('2. 接线');
ok(/beginVoiceSession: beginVoiceSession/.test(packSrc)
   && /endVoiceSession  : endVoiceSession/.test(packSrc), 'TTSPack 导出两个新 API');
ok(/beginVoiceSession\?\.\(window\.App\?\.getPackVoices\?\.\(\)\)/.test(lessonsSrc),
   'playSentences 开始时锁定 (单句/段落/整课三入口共用)');
const endCount = (lessonsSrc.match(/endVoiceSession\?\.\(\)/g) || []).length;
ok(endCount === 2, '正常结束与中途停止都解锁 (' + endCount + ' 处)');
ok(/function stopPlay\(\) \{[\s\S]{0,200}?endVoiceSession/.test(lessonsSrc),
   'stopPlay 解锁 (切页/打断不残留锁)');
ok(/getPackVoices,\s*\/\/ v143/.test(appSrc), 'app.js 公开 getPackVoices');
ok(/_sessionVoice && pool\.indexOf\(_sessionVoice\) >= 0/.test(packSrc),
   'playWord 优先用锁定音色');

// ─── 3. 版本 ────────────────────────────────────────────────
sec('3. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '144', 'index.html 全部 ?v=144 (' + vs.length + ' 处)');
ok(vs.length === 26, '?v= 引用总数 26 处');
ok(/const CACHE_NAME = 'hsv-v47'/.test(sw), 'sw.js CACHE_NAME = hsv-v46');
ok(/hsv-v47 \(\?v=144\)/.test(sw), 'sw.js 有 v47 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
