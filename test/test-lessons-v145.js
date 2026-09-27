// test-lessons-v145.js — v145 (hsv-v48) 朗读不再"只播一句就停"
//   两个入口的契约:
//     播放全文 = 全部段落的全部句子; 段落 ▶ = 本段全部句子
//   三类根因加固 (每类都能单独造成"只播一句"):
//     ① 单句异常中断整篇 → 逐句容错, 跳过继续
//     ② 句子 id 缺失/重复 → 直接传句子对象, 绕开 id 反查
//     ③ 段落 id 未命中 → 按 DOM 顺序回退, 不再静默不播
// 运行: node test-lessons-v145.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const src = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');

function ext(name, isAsync) {
    const tag = (isAsync ? 'async function ' : 'function ') + name + '(';
    const i = src.indexOf(tag);
    if (i < 0) throw new Error('missing ' + name);
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}

// 用真实 playSentences + speakAsync 跑一遍, 返回实际读出的句子
async function run(lesson, items, breakAtCall) {
    let playToken = 0;
    const spoken = [];
    const curLesson = lesson;
    const sentenceById = (l, sid) =>
        (l.paras || []).flatMap(p => p.sentences || []).find(s => s.id === sid) || null;
    const fakeEl = () => ({ classList: { add(){}, remove(){} }, scrollIntoView(){}, dataset:{} });
    const root = { querySelector: () => fakeEl(), querySelectorAll: () => [] };
    const tMarkActivity = ()=>{}, bumpProgress = ()=>{}, renderHeaderProgress = ()=>{};
    const toast = ()=>{};
    function stopPlay() { playToken++; }
    global.window = {
        App : { beginSession(){}, endSession(){}, stopSpeak(){}, getPackVoices: () => ['fable'] },
        TTSPack: { beginVoiceSession(){}, endVoiceSession(){} },
        DB  : { getPref: (n, f) => f, markActiveDay(){} }
    };
    let callN = 0;
    function speakLocal(text, onEnd) {
        callN++;
        if (breakAtCall && callN === breakAtCall) throw new Error('engine blew up');
        spoken.push(text);
        setTimeout(() => onEnd && onEnd(), 5);
    }
    const quiet = { log(){}, warn(){}, error(){} };
    eval(ext('speakAsync').replace(/\bspeak\(/g, 'speakLocal(').replace(/console\./g, 'quiet.'));
    eval(ext('playSentences', true).replace(/console\./g, 'quiet.'));
    await playSentences(items);
    return spoken;
}

const allOf = l => { const o = []; (l.paras||[]).forEach(p => (p.sentences||[]).forEach(s => o.push(s))); return o; };

const good = { id:'U01', paras:[
    { id:'p1', sentences:[{id:'s1',text:'A one.'},{id:'s2',text:'A two.'}] },
    { id:'p2', sentences:[{id:'s3',text:'B one.'},{id:'s4',text:'B two.'}] }]};

(async () => {
    // ─── 1. 两个入口的契约 ──────────────────────────────────
    sec('1. 播放全文 / 段落播放');
    let got = await run(good, allOf(good));
    ok(got.length === 4 && got[0] === 'A one.' && got[3] === 'B two.',
       '播放全文: 跨段读完全部 4 句', got.join('|'));
    got = await run(good, good.paras[0].sentences);
    ok(got.length === 2 && got.join('|') === 'A one.|A two.',
       '段落 ▶: 读完本段 2 句 (不多读下一段)', got.join('|'));
    got = await run(good, ['s3']);
    ok(got.length === 1 && got[0] === 'B one.', '单句: 按 id 只读该句 (兼容老路径)');

    // ─── 2. 单句异常不中断整篇 (本次根因 ①) ────────────────
    sec('2. 逐句容错');
    got = await run(good, allOf(good), 2);
    ok(got.length === 3 && got.join('|') === 'A one.|B one.|B two.',
       '★ 第 2 句引擎抛错: 跳过它, 后两句照常读完 (不再只播一句就停)', got.join('|'));
    got = await run(good, allOf(good), 1);
    ok(got.length === 3, '★ 第 1 句就抛错也不影响其余三句', got.join('|'));
    ok(/for \(let i = 0; i < sids\.length; i\+\+\)[\s\S]{0,600}?try \{[\s\S]{0,1200}?\} catch \(e\) \{[\s\S]{0,200}?skipped\+\+/.test(src),
       '循环体逐句 try/catch');

    // ─── 3. 句子 id 缺失 / 重复 (根因 ②) ────────────────────
    sec('3. 绕开脆弱的 id');
    const noIds = { id:'U02', paras:[
        { id:'p1', sentences:[{text:'X one.'},{text:'X two.'}] },
        { id:'p2', sentences:[{text:'Y one.'}] }]};
    got = await run(noIds, allOf(noIds));
    ok(got.length === 3, '★ 句子完全没有 id: 仍读完 3 句', got.join('|'));
    const dup = { id:'U03', paras:[
        { id:'p1', sentences:[{id:'s1',text:'D one.'},{id:'s1',text:'D two.'},{id:'s1',text:'D three.'}] }]};
    got = await run(dup, dup.paras[0].sentences);
    ok(got.join('|') === 'D one.|D two.|D three.',
       '★ 句子 id 全部重复: 仍按顺序读出各自内容 (不再重复读第一句)', got.join('|'));
    ok(/const s   = \(item && typeof item === 'object'\) \? item/.test(src),
       'playSentences 接受句子对象');
    ok(/playSentences\(all\);/.test(src) && /playSentences\(list\);/.test(src),
       '两个入口都改传对象');

    // ─── 4. 段落 id 未命中的回退 (根因 ③) ───────────────────
    sec('4. 段落定位回退');
    ok(/const btns = Array\.from\(root\.querySelectorAll\('\.ls-para-play'\)\);[\s\S]{0,200}?btns\.indexOf\(paraBtn\)/.test(src),
       '段落 id 对不上时按 DOM 顺序回退');
    ok(/if \(!list\.length\) \{ toast\(/.test(src), '本段无句子时明确提示, 不静默');
    ok(/if \(!all\.length\) \{ toast\(/.test(src), '全文无句子时明确提示, 不静默');

    // ─── 5. 诊断日志 (实机排障用) ───────────────────────────
    sec('5. 诊断日志');
    ok(/开始朗读: ' \+ sids\.length \+ ' 句/.test(src), '开播记总句数');
    ok(/句读完 \(' \+/.test(src), '每句读完记耗时');
    ok(/朗读结束: 读了 ' \+ played/.test(src), '结束记读了几句/跳过几句');
    ok(/在课文数据里找不到, 跳过/.test(src), '找不到句子时明确告警');
    ok(/播放全文: ' \+ \(curLesson\.paras \|\| \[\]\)\.length/.test(src), '播放全文记段数与句数');

    // ─── 6. 版本 ────────────────────────────────────────────
    sec('6. 版本');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '145', 'index.html 全部 ?v=145 (' + vs.length + ' 处)');
    ok(vs.length === 26, '?v= 引用总数 26 处');
    ok(/const CACHE_NAME = 'hsv-v48'/.test(sw), 'sw.js CACHE_NAME = hsv-v48');
    ok(/hsv-v48 \(\?v=145\)/.test(sw), 'sw.js 有 v48 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
