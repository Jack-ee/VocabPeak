// test-lessons-v137.js — v137 (hsv-v40) 自动播放竞态修复 + 同源隔离
//   • speakNative 行为仿真: cancel/speak 隔拍、序号守卫、假死心跳
//   • activate 只清自家前缀 (不误伤同源 EMPro)
// 运行: node test-lessons-v137.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const sw     = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');

// ─── 1. speakNative 行为仿真 ────────────────────────────────
sec('1. speakNative 竞态修复');
function extract(name) {
    const i = appSrc.indexOf('function ' + name + '(');
    let d = 0, st = false;
    for (let j = i; j < appSrc.length; j++) {
        if (appSrc[j] === '{') { d++; st = true; }
        else if (appSrc[j] === '}') { d--; if (st && d === 0) return appSrc.slice(i, j + 1); }
    }
}
// 仿真 speechSynthesis: speak 后 30ms 触发 onend; cancel 若与 speak
// 同步紧邻 (无隔拍) 则新话语立即 onerror —— 复刻 Chrome 竞态。
const timers = [];
global.setTimeout = (fn, ms) => { timers.push({ fn, at: ms }); return timers.length; };
function runTimers(budget) {   // 简易时间轮: 按注册序执行到期回调
    let guard = 0;
    while (timers.length && guard++ < budget) {
        const t = timers.shift();
        t.fn();
    }
}
let utterances = [], cancelJustCalled = false;
global.SpeechSynthesisUtterance = function (t) { this.text = t; };
const synth = {
    speaking: false, pending: false,
    cancel() { cancelJustCalled = true; this.speaking = false; },
    speak(u) {
        utterances.push(u);
        if (cancelJustCalled) {          // 竞态: cancel 后同步 speak → 立即误杀
            global.setTimeout(() => u.onerror && u.onerror({ error: 'canceled' }), 0);
            return;
        }
        this.speaking = true;
        global.setTimeout(() => { this.speaking = false; u.onend && u.onend(); }, 30);
    }
};
// 微任务后 cancelJustCalled 复位 (隔拍 setTimeout 内 speak 则不触发竞态)
const origPush = timers.push.bind(timers);
timers.push = (t) => { cancelJustCalled = false; return origPush(t); };

global.window = { speechSynthesis: synth,
                  DB: { getPref: (n, fb) => fb } };
let _nativeSeq = 0;
const refreshVoices = () => [], resolveVoice = () => null;
eval(extract('_nativeKeepAlive'));
eval(extract('speakNative'));

// 1a. 连播三条: 每条都完整播出 (onEnd 由 onend 驱动, 非 onerror 秒跳)
let played = [];
const chain = (texts, done) => {
    const next = (i) => {
        if (i >= texts.length) { done(); return; }
        speakNative(texts[i], 1, () => { played.push(texts[i]); next(i + 1); });
    };
    next(0);
};
let finished = false;
chain(['alpha', 'beta', 'gamma'], () => { finished = true; });
runTimers(200);
ok(finished && played.length === 3, '连播三条全部完整播出 (不再秒跳)', played.join(','));
ok(utterances.length === 3 && utterances.every(u => u.onend === u.onerror ? true : true),
   '三条话语都真实入队');

// 1b. 引擎空闲时不 cancel (首条直接 speak)
ok(/if \(window\.speechSynthesis\.speaking \|\| window\.speechSynthesis\.pending\)/.test(appSrc),
   '仅在引擎确有话语时 cancel');
ok(/setTimeout\(doSpeak, 80\)/.test(appSrc), 'cancel 后隔 80ms 再 speak (给引擎清队列)');

// 1c. 序号守卫: 新话语接管后旧回调失效
_nativeSeq = 0; played = [];
let stale = 0;
speakNative('old', 1, () => stale++);
speakNative('new', 1, () => played.push('new'));   // 接管 (old 的 onEnd 应失效)
runTimers(50);
ok(stale === 0 && played.includes('new'), '旧话语回调被序号守卫拦下, 新链正常');

// 1d. stopSpeak 使未决回调失效 + 假死心跳存在
ok(/_nativeSeq\+\+;\s*\/\/ v137/.test(appSrc), 'stopSpeak 递增序号 (主动停止后不推进)');
ok(/function _nativeKeepAlive/.test(appSrc) && /resume\(\)/.test(appSrc)
   && /10000/.test(extract('_nativeKeepAlive')), '长语音假死: 每 10 秒 resume 心跳');

// ─── 2. 同源隔离 ────────────────────────────────────────────
sec('2. activate 缓存清理');
ok(/n\.startsWith\('hsv-'\) && n !== CACHE_NAME/.test(sw),
   '只清自家 hsv- 前缀旧缓存 (不再误伤同源 EMPro)');
ok(/EMPro 侧的 sw\.js 也要做同样的前缀过滤|EMPro 的 sw\.js 有同样问题/.test(sw),
   '注释提醒 EMPro 仓库需同样修复');

// ─── 3. 版本 ────────────────────────────────────────────────
// 注: v137 与 v138 (填空精选上限) 同批发版, 断言按 hsv-v41/?v=138 校验。
sec('3. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '138', 'index.html 全部 ?v=138 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v41'/.test(sw), 'sw.js CACHE_NAME = hsv-v40');
ok(/hsv-v40 \(\?v=137\)/.test(sw), 'sw.js 有 v40 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
