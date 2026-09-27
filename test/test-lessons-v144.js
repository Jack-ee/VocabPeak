// test-lessons-v144.js — v144 (hsv-v47) 修复"播放全文只响一句就停"
//   核心: onEnd 契约 —— 恰好调用一次, 任何情况都不丢
//   • speakNative: seq 失效 (stopSpeak/新话语接管) 时仍放行调用方
//   • TTSPack.stop(): 摘掉 onended 后由 _audioFinish 放行
//   • speakAsync: 超时兜底, 单句异常不卡死整课
//   • 回归防护: 复刻 v137 修的"快速跳过"场景, 确认未复发
// 运行: node test-lessons-v144.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const appSrc     = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const packSrc    = fs.readFileSync(path.join(DIR, 'tts-pack.js'), 'utf8');
const lessonsSrc = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');

function extract(src, name, isAsync) {
    const tag = (isAsync ? 'async function ' : 'function ') + name + '(';
    const i = src.indexOf(tag);
    if (i < 0) return null;
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}

// ─── 1. speakNative onEnd 契约 (本次 bug 的直接复刻) ────────
sec('1. speakNative onEnd 契约');
const timers = [];
const quiet  = { log() {}, warn() {} };
let synthState = { speaking: false, pending: false };
let utts = [];
const synth = {
    get speaking() { return synthState.speaking; },
    get pending()  { return synthState.pending; },
    cancel() { synthState.speaking = false; },
    speak(u) { utts.push(u); synthState.speaking = true; },
    resume() {}
};
let _nativeSeq = 0;
const refreshVoices = () => [], resolveVoice = () => null;
const _nativeKeepAlive = () => {};
global.SpeechSynthesisUtterance = function (t) { this.text = t; };
const fakeWindow = { speechSynthesis: synth, DB: { getPref: (n, fb) => fb } };
const fakeSetTimeout = (fn, ms) => { timers.push(fn); return timers.length; };
function runTimers() { while (timers.length) timers.shift()(); }

const speakNativeSrc = extract(appSrc, 'speakNative');
// 用共享对象承载 _nativeSeq, 便于测试中模拟 stopSpeak 的递增
const SEQ_REF = { v: 0 };
const speakNative = new Function(
    'window', 'setTimeout', 'console', 'refreshVoices', 'resolveVoice',
    '_nativeKeepAlive', 'SpeechSynthesisUtterance', 'SEQ_REF',
    speakNativeSrc.replace(/\+\+_nativeSeq/g, '++SEQ_REF.v')
                  .replace(/_nativeSeq/g, 'SEQ_REF.v') + '\n' +
    'return speakNative;')
    (fakeWindow, fakeSetTimeout, quiet, refreshVoices, resolveVoice,
     _nativeKeepAlive, global.SpeechSynthesisUtterance, SEQ_REF);

// 1a. 正常播放: onEnd 调用一次
let calls = 0;
synthState = { speaking: false, pending: false };
utts = [];
speakNative('hello', 1, () => calls++);
ok(utts.length === 1 && calls === 0, '正常路径: 立即入队, 未提前回调');
utts[0].onend();
ok(calls === 1, '读完触发 onEnd 一次');
utts[0].onerror();
ok(calls === 1, 'onend 与 onerror 都来时也只回调一次 (去重)');

// 1b. 本次 bug 的直接复刻: 引擎忙 → 隔拍期间 seq 被递增 (stopSpeak)
calls = 0; utts = []; timers.length = 0;
synthState = { speaking: true, pending: false };   // 引擎忙 → 走隔拍分支
speakNative('sentence two', 1, () => calls++);
ok(utts.length === 0 && timers.length === 1, '引擎忙时延后 speak (v137 隔拍保留)');
SEQ_REF.v++;                                       // 模拟 stopSpeak() 递增
runTimers();
ok(calls === 1, '★ 隔拍期间被接管: 仍放行调用方 (修复: 不再永久挂起)');
ok(utts.length === 0, '被接管时确实不再发声 (只放行, 不抢播)');

// 1c. 播放中被接管: onerror 仍放行
calls = 0; utts = []; timers.length = 0;
synthState = { speaking: false, pending: false };
speakNative('sentence three', 1, () => calls++);
SEQ_REF.v++;                                       // 播放中 stopSpeak
utts[0].onerror();                                 // cancel 引发
ok(calls === 1, '★ 播放中被打断: onEnd 仍被调用 (修复)');

// 1d. 源码层面确认抑制式守卫已移除
ok(!/if \(seq === _nativeSeq && typeof onEnd === 'function'\) onEnd\(\)/.test(appSrc),
   '旧的抑制式 fire 守卫已移除');
ok(/if \(seq !== _nativeSeq\) \{ fire\(\); return; \}/.test(appSrc),
   'doSpeak 被接管时先 fire 再返回');
ok(/let fired = false;[\s\S]{0,200}?if \(fired\) return;/.test(appSrc),
   'fire 内部去重 (恰好一次)');

// 1e. 回归防护: v137 修的"快速跳过"机制仍在
ok(/if \(window\.speechSynthesis\.speaking \|\| window\.speechSynthesis\.pending\)/.test(appSrc),
   '回归防护: 仅在引擎忙时 cancel');
ok(/setTimeout\(doSpeak, 80\)/.test(appSrc), '回归防护: cancel 后隔 80ms 再 speak');
// 调用方守卫仍在 (打断语义交还调用方后, 靠它们防快速跳过)
const mwSrc = fs.readFileSync(path.join(DIR, 'my-words.js'), 'utf8');
ok(/if \(!autoplayOn \|\| myToken !== autoplayToken\) return;/.test(mwSrc),
   '调用方守卫: playQueue 用 autoplayToken 判断是否推进');
ok(/if \(token !== playToken\) \{ finishedAll = false; break; \}/.test(lessonsSrc),
   '调用方守卫: playSentences 用 playToken 判断是否继续');

// ─── 2. TTSPack.stop() 放行 ────────────────────────────────
sec('2. 音频包 stop 契约');
let _audio = null, _audioFinish = null;
eval(extract(packSrc, 'stop'));
let packCalls = 0;
const fakeFinish = () => { packCalls++; };
_audioFinish = fakeFinish;
_audio = { pause() {}, src: '', onended: null, onerror: null };
stop();
ok(packCalls === 1, '★ stop() 放行等待中的调用方 (修复)');
ok(_audioFinish === null, 'stop 后清空回调引用');
stop();
ok(packCalls === 1, '重复 stop 不重复回调 (防重入)');
ok(/_audioFinish = finish;\s*\/\/ v144/.test(packSrc), 'playWord 注册 finish 供 stop 兜底');
ok(/if \(_audioFinish === finish\) _audioFinish = null;/.test(packSrc),
   'finish 自身清引用 (正常结束不残留)');

(async () => {
// ─── 3. speakAsync 超时兜底 ────────────────────────────────
sec('3. 超时兜底');
const speakAsyncSrc = extract(lessonsSrc, 'speakAsync');
let lastMs = 0, pendingTimer = null;
const mkSpeakAsync = (speakImpl) => new Function('speak', 'setTimeout', 'clearTimeout', 'console',
    speakAsyncSrc + '\nreturn speakAsync;')(
    speakImpl,
    (fn, ms) => { lastMs = ms; pendingTimer = fn; return 1; },
    () => { pendingTimer = null; },
    quiet);

// 3a. 引擎丢回调 → 超时后仍 resolve
let sa = mkSpeakAsync(() => { /* 永不回调, 模拟引擎丢事件 */ });
let resolved = false;
sa('a short sentence').then(() => { resolved = true; });
await new Promise(r => setImmediate(r));
ok(!resolved, '未超时前不提前推进');
pendingTimer();                                  // 触发超时
await new Promise(r => setImmediate(r));
ok(resolved, '★ 引擎丢回调时超时兜底 resolve (单句异常不卡死整课)');

// 3b. 正常回调 → 清掉定时器, 只 resolve 一次
let n = 0;
sa = mkSpeakAsync((t, cb) => cb());
await sa('hello').then(() => { n++; });
ok(n === 1 && pendingTimer === null, '正常回调后清除超时 (不重复推进)');

// 3c. 超时按文本长度伸缩且有上下限
sa = mkSpeakAsync(() => {});
sa('x');
const shortMs = lastMs;
sa('x'.repeat(2000));
const longMs = lastMs;
ok(shortMs === 8000, '短句下限 8 秒', String(shortMs));
ok(longMs === 90000, '超长句上限 90 秒', String(longMs));
sa('x'.repeat(200));
ok(lastMs > 8000 && lastMs < 90000, '中等长度按比例伸缩', String(lastMs));

// ─── 4. 版本 ───────────────────────────────────────────────
sec('4. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '144', 'index.html 全部 ?v=144 (' + vs.length + ' 处)');
ok(vs.length === 26, '?v= 引用总数 26 处');
ok(/const CACHE_NAME = 'hsv-v47'/.test(sw), 'sw.js CACHE_NAME = hsv-v47');
ok(/hsv-v47 \(\?v=144\)/.test(sw), 'sw.js 有 v47 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
})();
