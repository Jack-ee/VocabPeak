// ============================================================
// enrich.js — 单词卡详细信息 (v154)
// ------------------------------------------------------------
// 3500 词 + 内置高中词 (3895 个词头) 的英文释义、搭配及中文、例句及
// 翻译、用法提示, 随软件发布 (数据 enrich-3500.js, 启动后后台加载)。
//
// 只在显示时补上单词本里空着的字段, 不写回单词本:
//   • 单词本 / 同步数据大小不变 (localStorage 配额、Gist 流量都不受影响)
//   • 自己用 AI 补过、或手动改过的字段始终优先
//   • 以后修订数据只要换 enrich-3500.js, 所有设备刷新即生效
// 数据由 tools/enrich/ 生成和校验, 见那里的 README。
// ============================================================
window.HSVEnrich = (function () {
    'use strict';

    let idx     = null;     // 小写词 → 数据行
    let loading = null;

    function load() {
        if (idx) return Promise.resolve(true);
        if (!loading) {
            loading = new Promise((resolve) => {
                const done = () => {
                    const D = window.HSV_ENRICH;
                    if (!D || !D.words) { loading = null; return resolve(false); }
                    idx = new Map();
                    for (const k of Object.keys(D.words)) idx.set(k.toLowerCase(), D.words[k]);
                    resolve(true);
                    try { window.dispatchEvent(new CustomEvent('hsv:enrichready')); } catch (e) { /* 旧浏览器 */ }
                };
                if (window.HSV_ENRICH) return done();
                const me  = document.querySelector('script[src*="enrich.js"]');
                const ver = me && me.src.indexOf('?') >= 0 ? me.src.slice(me.src.indexOf('?')) : '';
                const s   = document.createElement('script');
                s.src     = 'enrich-3500.js' + ver;
                s.onload  = done;
                s.onerror = () => { loading = null; resolve(false); };
                document.head.appendChild(s);
            });
        }
        return loading;
    }

    // 词 → 数据行。内置词库里有 3 个词头带了词性尾巴 ("downtown ad"), 去掉再查。
    function row(word) {
        if (!idx || !word) return null;
        const k = String(word).trim().toLowerCase();
        return idx.get(k) || idx.get(k.replace(/\s+(ad|adv|pro|prep|conj|n|v|vt|vi|adj|a)\.?$/, '')) || null;
    }
    const split = (s) => String(s || '').split(/\s*·\s*/).map(x => x.trim()).filter(Boolean);

    // 一个词的全部数据: {enDef, register, collo:[], colloCn:[], context, contextCn, note}
    function get(word) {
        const r = row(word);
        if (!r) return null;
        return { enDef: r[0] || '', register: r[1] || 'neutral', collo: split(r[2]), colloCn: split(r[3]),
                 context: r[4] || '', contextCn: r[5] || '', note: r[6] || '' };
    }

    // 单词本条目的「显示用」版本: 只填空着的字段, 原条目不动。
    // 搭配和中文成对: 条目还没有搭配中文时, 用数据里的整组 (条目自己的搭配
    // 不在其中的, 接在后面, 不配中文, 保证一一对应不错位)。
    function view(w) {
        if (!w || !idx) return w;
        const e = get(w.word);
        if (!e) return w;
        const out = Object.assign({}, w);
        let   hit = false;
        if (!w.enDef && e.enDef) { out.enDef = e.enDef; out.register = e.register; hit = true; }
        if (!w.colloCn && e.collo.length) {
            const own  = split(w.collo);
            const have = new Set(e.collo.map(c => c.toLowerCase()));
            const rest = own.filter(c => !have.has(c.toLowerCase()));
            out.collo   = e.collo.concat(rest).join(' · ');
            out.colloCn = e.colloCn.join(' · ');
            hit = true;
        }
        if (!w.context && e.context) { out.context = e.context; out.contextCn = e.contextCn; hit = true; }
        if (!w.note && e.note) { out.note = e.note; hit = true; }
        return hit ? out : w;
    }

    // 例句里实际出现的那个形式 (abandoned / went / studies), 用来加粗
    let irrBack = null;
    function surfaceIn(text, word) {
        const w = String(word || '').trim().replace(/^the\s+/i, '');
        if (/[\s.]/.test(w)) return w;
        const lw   = w.toLowerCase();
        const toks = String(text || '').match(/[A-Za-z'-]+/g) || [];
        if (!irrBack) {
            irrBack = {};
            const irr = (window.HSV_LEXICON && window.HSV_LEXICON.irregular) || {};
            for (const f of Object.keys(irr)) (irrBack[irr[f]] = irrBack[irr[f]] || []).push(f);
        }
        const stem = lw.replace(/(e|y)$/, '');
        const hit  = toks.find(t => t.toLowerCase() === lw)
                  || toks.find(t => (irrBack[lw] || []).includes(t.toLowerCase()))
                  || toks.find(t => t.toLowerCase().startsWith(lw) && t.length - lw.length <= 4)
                  || (stem.length >= 3 && toks.find(t => t.toLowerCase().startsWith(stem) && t.length - stem.length <= 5));
        return hit || w;
    }

    // 例句 (给今日任务 / 默写本词卡在没有 AI 短文原句时用), 形状与 Stories.exampleOf 相同
    function example(word) {
        const e = get(word);
        if (!e || !e.context) return null;
        return { text: e.context, zh: e.contextCn, surface: surfaceIn(e.context, word), ctx: '',
                 phr: e.collo.length ? { en: e.collo[0], zh: e.colloCn[0] || '' } : null, sid: '' };
    }

    function init() {
        // 不和首屏抢: 空闲时再拉数据 (约 1.5 MB, 之后由 SW 缓存)
        const go = () => load();
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 2500 });
        else setTimeout(go, 800);
    }

    return { init, load, get, view, example, ready: () => !!idx, count: () => (idx ? idx.size : 0) };
})();
