// test-lessons-v146.js — v146 (hsv-v49) 朗读音色按「段」锁定
//   期望: 同一段内固定同一个朗读者; 跨到下一段换人; 相邻段不重复
//   (v143 只做到"整场一个音色", 播放全文时整篇同一个人, 不会换)
// 运行: node test-lessons-v146.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const lesSrc  = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
const packSrc = fs.readFileSync(path.join(DIR, 'tts-pack.js'), 'utf8');

function ext(src, name, isAsync) {
    const tag = (isAsync ? 'async function ' : 'function ') + name + '(';
    const i = src.indexOf(tag);
    if (i < 0) throw new Error('missing ' + name);
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}
const quiet = { log(){}, warn(){}, error(){} };
// 真实的音色会话实现 (_prevSessionVoice 在模块作用域, 这里补上)
let _sessionVoice = null, _prevSessionVoice = null;
eval(ext(packSrc, 'beginVoiceSession').replace(/console\./g, 'quiet.'));
eval(ext(packSrc, 'endVoiceSession'));

const LESSON = { id:'U01', paras:[
    { id:'p1', sentences:[{id:'a1',text:'P1 s1'},{id:'a2',text:'P1 s2'},{id:'a3',text:'P1 s3'}] },
    { id:'p2', sentences:[{id:'b1',text:'P2 s1'},{id:'b2',text:'P2 s2'}] },
    { id:'p3', sentences:[{id:'c1',text:'P3 s1'},{id:'c2',text:'P3 s2'}] }]};
const allOf = l => { const o=[]; (l.paras||[]).forEach(p=>(p.sentences||[]).forEach(s=>o.push(s))); return o; };

// 跑一遍真实 playSentences, 返回 [段号, 当时锁定的音色] 序列
async function play(items, voices, lesson) {
    lesson = lesson || LESSON;
    let playToken = 0;
    const heard = [];
    const curLesson = lesson;
    const sentenceById = (l,sid) => (l.paras||[]).flatMap(p=>p.sentences||[]).find(s=>s.id===sid)||null;
    const fakeEl = () => ({ classList:{add(){},remove(){}}, scrollIntoView(){}, dataset:{} });
    const root = { querySelector:()=>fakeEl(), querySelectorAll:()=>[] };
    const tMarkActivity=()=>{}, bumpProgress=()=>{}, renderHeaderProgress=()=>{}, toast=()=>{};
    function stopPlay(){ playToken++; }
    global.window = {
        App    : { beginSession(){}, endSession(){}, stopSpeak(){}, getPackVoices: () => voices },
        TTSPack: { beginVoiceSession, endVoiceSession },
        DB     : { getPref:(n,f)=>f, markActiveDay(){} } };
    function speakLocal(text, onEnd) {
        const pi = lesson.paras.findIndex(p => (p.sentences||[]).some(s => s.text === text));
        heard.push([pi + 1, _sessionVoice]);
        setTimeout(() => onEnd && onEnd(), 2);
    }
    eval(ext(lesSrc,'speakAsync').replace(/\bspeak\(/g,'speakLocal(').replace(/console\./g,'quiet.'));
    eval(ext(lesSrc,'playSentences',true).replace(/console\./g,'quiet.'));
    await playSentences(items);
    return heard;
}
const voicesByPara = (heard) => {
    const m = {};
    heard.forEach(([p, v]) => { (m[p] = m[p] || new Set()).add(v); });
    return m;
};

(async () => {
    const POOL = ['fable','nova','ash','shimmer'];

    // ─── 1. 播放全文: 段内固定 + 跨段换人 ───────────────────
    sec('1. 播放全文的换人节奏');
    const h = await play(allOf(LESSON), POOL);
    const m = voicesByPara(h);
    ok(Object.values(m).every(s => s.size === 1),
       '★ 同一段内始终同一个朗读者',
       Object.keys(m).map(p => 'P' + p + ':' + [...m[p]].join('/')).join(' '));
    const seq = Object.keys(m).sort().map(p => [...m[p]][0]);
    ok(new Set(seq).size > 1, '★ 不同段换了人 (v143 时整篇只有一个人)', seq.join(' → '));
    let adjOk = true;
    for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i-1]) adjOk = false;
    ok(adjOk, '★ 相邻段不重复 (否则听上去像没换)', seq.join(' → '));
    ok(h.length === 7, '七句全部读到 (换人不影响朗读完整性)');

    // ─── 2. 段落 ▶: 整段一个人 ──────────────────────────────
    sec('2. 段落播放');
    const h2 = await play(LESSON.paras[1].sentences, POOL);
    ok(new Set(h2.map(x => x[1])).size === 1, '段落 ▶: 整段同一个朗读者');
    ok(h2.every(x => x[0] === 2), '段落 ▶: 只读本段, 不串到下一段');

    // ─── 3. 边界 ────────────────────────────────────────────
    sec('3. 边界情况');
    const h3 = await play(allOf(LESSON), ['fable']);
    const m3 = voicesByPara(h3);
    ok(Object.values(m3).every(s => s.size === 1 && [...s][0] === 'fable'),
       '音色池只有一个时: 全程该音色, 不报错');
    const h4 = await play(allOf(LESSON), []);
    ok(h4.length === 7 && h4.every(x => x[1] === null),
       '音色池为空 (未装音频包): 不锁定, 朗读照常 (走设备语音)');
    // 句子无 id 也要能按段分组 (导入课常见)
    const noId = { id:'U02', paras:[
        { id:'q1', sentences:[{text:'N1 a'},{text:'N1 b'}] },
        { id:'q2', sentences:[{text:'N2 a'},{text:'N2 b'}] }]};
    const h5 = await play(allOf(noId), POOL, noId);
    const m5 = voicesByPara(h5);
    ok(Object.values(m5).every(s => s.size === 1) &&
       new Set(Object.keys(m5).map(p => [...m5[p]][0])).size === 2,
       '句子没有 id 时仍能按段换人 (对象引用分组)');

    // ─── 4. 重听换人 ────────────────────────────────────────
    sec('4. 重听');
    const firsts = [];
    for (let i = 0; i < 6; i++) { const r = await play(allOf(LESSON), POOL); firsts.push(r[0][1]); }
    ok(new Set(firsts).size > 1, '重复播放时首段会换人', firsts.join(' → '));

    // ─── 5. 结构 ────────────────────────────────────────────
    sec('5. 结构');
    ok(/let _prevSessionVoice = null;/.test(packSrc), 'tts-pack 记住上一段音色');
    ok(/const alt = pool\.filter\(v => v !== _prevSessionVoice\);/.test(packSrc),
       '池 >1 时避开上一段用过的音色');
    ok(/function endVoiceSession\(\) \{ _sessionVoice = null; \}/.test(packSrc),
       'endVoiceSession 只清当前锁定 (保留 prev 以便继续换人)');
    ok(/const paraOfObj = new Map\(\), paraOfId = new Map\(\);/.test(lesSrc),
       'playSentences 建句子→段落索引');
    ok(/if \(pIdx !== -1 && pIdx !== curPara\)/.test(lesSrc), '按段边界重新锁定音色');
    ok(/段 → 朗读者/.test(lesSrc), '日志给出每段的朗读者');

    // ─── 6. 版本 ────────────────────────────────────────────
    sec('6. 版本');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '146', 'index.html 全部 ?v=146 (' + vs.length + ' 处)');
    ok(vs.length === 26, '?v= 引用总数 26 处');
    ok(/const CACHE_NAME = 'hsv-v49'/.test(sw), 'sw.js CACHE_NAME = hsv-v49');
    ok(/hsv-v49 \(\?v=146\)/.test(sw), 'sw.js 有 v49 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
