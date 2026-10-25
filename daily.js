// ============================================================
// daily.js — 今日任务 (v150)
// ------------------------------------------------------------
// 晚自习回来 5–10 分钟, 一个按钮做完三件事 (借鉴百词斩的顺序):
//   1. 复习: 今天到期的词, 看词选义; 答错的放到本轮最后再考一次
//   2. 新词: 按默写本顺序取今天的新词, 先一张张看卡片 (释义、AI 短文
//      里的原句、搭配), 太简单的当场斩掉; 看完一起自测一遍
//   3. 默写: 听发音、看中文, 写出今天学的新词; 写错照着写一遍
// 任务全部从单词本现状推导 (lastReview / nextReview / learnedAt /
// spellAt), 不另存清单: 中途关掉、换一台设备, 打开都从剩下的接着做。
// 到期按「今天结束前」算 —— 昨晚 22 点学的词今晚 21 点也算到期。
// 记账走 DB.planReview / planLearn / planSpell (一题一次写盘), 时长
// 记到 lesson_time 的 daily 桶, 当天完成情况写进 day_ 日志给家长后台。
// ============================================================
window.Daily = (function () {
    'use strict';

    const PRESETS = {
        light : { neu: 5,  rev: 15, label: '轻量' },
        std   : { neu: 10, rev: 20, label: '标准' },
        more  : { neu: 15, rev: 30, label: '加量' }
    };
    const SEC    = { rev: 6, learn: 12, check: 5, dic: 10 };   // 估时: 秒/项
    const STAGES = { rev: '复习', learn: '新词', check: '自测', dic: '默写', done: '完成' };
    const ORDER  = ['rev', 'learn', 'check', 'dic', 'done'];

    let S       = null;          // 进行中的会话
    let exIndex = null;          // 词 → AI 短文原句 (懒建)
    let exCount = -1;
    let lexN    = null;          // 词 → 默写本序号

    const DB = () => window.DB;
    function esc(s) {
        if (window.App && window.App.escHtml) return window.App.escHtml(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─── 日期 ───────────────────────────────────────────────
    function ymd(t) {
        const d = t == null ? new Date() : new Date(t);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }
    function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
    function isToday(t)   { return !!t && ymd(t) === ymd(); }
    function key(w)       { return String((w && w.word) || '').trim().toLowerCase(); }
    function focusOf(w)   { return Array.isArray(w && w.focus) ? w.focus : []; }

    // ─── 分类 ───────────────────────────────────────────────
    // 新词: 从没学过、没复习过、没错过、不是熟词
    function isNewWord(w) {
        return !!key(w) && !DB().isCut(w) && !w.lastReview && !w.learnedAt && !(Number(w.srsLevel) > 0)
            && !(Number(w.mistakeCount) || Number(w.wrongCount)) && !focusOf(w).includes('weak');
    }
    // 到期: 学过的词, 今天结束前到期 (课文答错拉回的 nextReview=null 也算)
    function isDueWord(w, eod) {
        if (!key(w) || DB().isCut(w) || isNewWord(w)) return false;
        return w.nextReview == null || Number(w.nextReview) <= eod;
    }
    // 薄弱词优先, 其次拖得最久的; 同分保持单词本 (默写本) 顺序
    function byPriority(a, b) {
        const wa = focusOf(a).includes('weak') ? 0 : 1;
        const wb = focusOf(b).includes('weak') ? 0 : 1;
        if (wa !== wb) return wa - wb;
        return (Number(a.nextReview) || 0) - (Number(b.nextReview) || 0);
    }

    function sizeKey() {
        const k = DB().getPref('plan_size', 'std');
        return PRESETS[k] ? k : 'std';
    }
    function pageOf(n) { return (window.HSVLex && window.HSVLex.pageOf) ? window.HSVLex.pageOf(n) : 0; }
    function pageMax()  { return (window.HSVLex && window.HSVLex.pageCount && window.HSVLex.pageCount()) || 120; }
    function startPage() {
        const v = Number(DB().getPref('plan_page', '')) || 0;
        return v >= 1 ? Math.min(pageMax(), Math.round(v)) : 0;
    }
    function extraToday() {
        try {
            const x = JSON.parse(DB().getPref('plan_extra', '{}') || '{}') || {};
            return x.d === ymd() ? (Number(x.n) || 0) : 0;
        } catch (e) { return 0; }
    }

    // 今天的任务 (每次现算)
    function compute() {
        const nb       = DB().loadNotebook() || [];
        const p        = PRESETS[sizeKey()];
        const eod      = endOfToday();
        const learned  = nb.filter(w => isToday(w.learnedAt));
        const reviewed = nb.filter(w => isToday(w.lastReview) && !isToday(w.learnedAt));
        const due      = nb.filter(w => isDueWord(w, eod)).sort(byPriority);
        const rev      = due.slice(0, Math.max(0, p.rev - reviewed.length));
        const neuN     = Math.max(0, p.neu + extraToday() - learned.length);
        // 新词按默写本顺序, 从老师布置到的那一页开始 (设了起始页时);
        // 这一页之后的学完了再回头补前面漏下的, 最后是默写本以外的词
        const start    = startPage();
        const cands    = nb.filter(isNewWord);
        const pg       = (w) => pageOf(numOf(w));
        const ordered  = start
            ? cands.filter(w => pg(w) >= start).concat(cands.filter(w => pg(w) && pg(w) < start), cands.filter(w => !pg(w)))
            : cands;
        const neu      = ordered.slice(0, neuN);
        const dic      = learned.filter(w => !isToday(w.spellAt) && !DB().isCut(w));
        const leftSec  = rev.length * SEC.rev + neu.length * (SEC.learn + SEC.check + SEC.dic) + dic.length * SEC.dic;
        return {
            size    : sizeKey(),
            p       : p,
            rev     : rev,
            neu     : neu,
            dic     : dic,
            due     : due.length,
            doneRev : reviewed.length,
            doneNeu : learned.length,
            doneDic : learned.filter(w => isToday(w.spellAt)).length,
            leftMin : Math.max(1, Math.round(leftSec / 60)),
            empty   : !rev.length && !neu.length && !dic.length,
            touched : learned.length + reviewed.length > 0,
            start   : start,
            page    : start || (neu.length ? pg(neu[0]) : 0) || 1
        };
    }

    // ─── 默写本序号 / AI 短文原句 ───────────────────────────
    function numOf(w) {
        if (!lexN) {
            lexN = new Map();
            ((window.HSV_LEXICON && window.HSV_LEXICON.words) || []).forEach(x => {
                const k = String(x[0] || '').toLowerCase();
                if (x[1] > 0 && !lexN.has(k)) lexN.set(k, x[1]);
            });
        }
        return lexN.get(key(w)) || 0;
    }
    function exampleOf(w) {
        const list = (window.Stories && window.Stories.list && window.Stories.list()) || [];
        if (!exIndex || exCount !== list.length) {
            exIndex = new Map();
            exCount = list.length;
            list.forEach(s => {
                const sents = {};
                (s.paras || []).forEach(p => (p.sentences || []).forEach(x => { sents[x.id] = x; }));
                (s.words || []).forEach(t => {
                    const k = String(t.lemma || '').toLowerCase();
                    const x = sents[t.sent];
                    if (!k || !x || exIndex.has(k)) return;
                    exIndex.set(k, { text: x.text, zh: x.zh || '', surface: t.surface || t.lemma,
                                     ctx: t.zh || '', phr: (t.phrases || [])[0] || null, sid: s.id });
                });
            });
        }
        return exIndex.get(key(w)) || null;
    }
    function markSurface(text, surface) {
        const safe = esc(text);
        const s    = esc(surface || '');
        if (!s) return safe;
        const re = new RegExp('(^|[^A-Za-z])(' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'i');
        return safe.replace(re, '$1<b>$2</b>');
    }

    // ─── 发音 ───────────────────────────────────────────────
    function muted() { return DB().getPref('plan_mute', '') === '1'; }
    function say(text, force) {
        if (!text || (muted() && !force)) return;
        try { window.App?.stopSpeak?.(); window.App?.speak?.(text); } catch (e) {}
    }

    // ─── 单词页上的任务卡 ───────────────────────────────────
    function renderCard() {
        const box = document.getElementById('daily-card');
        if (!box || !window.DB) return;
        let c;
        try { c = compute(); } catch (e) { console.warn('[Daily] compute failed', e); box.innerHTML = ''; return; }
        const sizeSel = `<select class="dl-size" id="dl-size" title="每天的题量">${Object.keys(PRESETS).map(k =>
            `<option value="${k}"${k === c.size ? ' selected' : ''}>${PRESETS[k].label} · 新词 ${PRESETS[k].neu}</option>`).join('')}</select>`;
        const pgN  = c.page;
        const pgW  = pageWords(pgN).length;
        const row2 = `
                <div class="dl-row2">
                    <label class="dl-page" title="老师布置到哪一页，新词就从哪一页开始">\u{1F4D6} 新词从默写本第
                        <input id="dl-page" type="number" inputmode="numeric" min="1" max="${pageMax()}" value="${pgN}"> 页起</label>
                    ${pgW ? `<button class="dl-link" id="dl-pagedic" data-page="${pgN}">\u{1F4DD} 默写第 ${pgN} 页（${pgW} 词）</button>` : ''}
                </div>`;
        if (c.empty) {
            const msg = c.touched
                ? `✅ 今日任务完成 <span class="dl-dim">复习 ${c.doneRev} · 新词 ${c.doneNeu} · 默写 ${c.doneDic}</span>`
                : '✅ 今天没有到期的词';
            box.innerHTML = `
                <div class="dl-card dl-card-done">
                    <div class="dl-main"><div class="dl-title">${msg}</div></div>
                    <div class="dl-side">
                        ${sizeSel}
                        <button class="dl-more" id="dl-more">再学 5 个新词</button>
                    </div>
                    ${row2}
                </div>`;
            return;
        }
        const n0  = c.neu.length ? numOf(c.neu[0]) : 0;
        const dim = (t) => t ? `<span class="dl-dim">${t}</span>` : '';
        const items = [
            c.rev.length ? `复习 <b>${c.rev.length}</b>${dim(c.doneRev ? '已 ' + c.doneRev : '')}` : '',
            c.neu.length ? `新词 <b>${c.neu.length}</b>${dim(n0 ? '默写本 #' + n0 + ' 起' : '')}` : '',
            (c.dic.length + c.neu.length) ? `默写 <b>${c.dic.length + c.neu.length}</b>` : ''
        ].filter(Boolean).join('<span class="dl-sep">·</span>');
        box.innerHTML = `
            <div class="dl-card">
                <div class="dl-main">
                    <div class="dl-title">\u{1F4C5} 今日任务 <span class="dl-min">${c.touched ? '还剩' : '约'} ${c.leftMin} 分钟</span></div>
                    <div class="dl-items">${items}</div>
                </div>
                <div class="dl-side">
                    ${sizeSel}
                    <button class="dl-go" id="dl-start">${c.touched ? '继续' : '开始'}</button>
                </div>
                ${row2}
            </div>`;
    }

    // 默写本某一页上的全部词 (含熟词): 单词本里有的用单词本词条, 没有的用词库
    function pageWords(pg) {
        const span = (window.HSVLex && window.HSVLex.pageSpan) ? window.HSVLex.pageSpan(pg) : null;
        if (!span) return [];
        const byKey = new Map((DB().loadNotebook() || []).map(w => [key(w), w]));
        const seen  = new Set();
        const out   = [];
        ((window.HSV_LEXICON && window.HSV_LEXICON.words) || [])
            .filter(x => x[1] >= span[0] && x[1] <= span[1])
            .sort((a, b) => a[1] - b[1])
            .forEach(x => {
                const k = String(x[0] || '').toLowerCase();
                if (!k || seen.has(k)) return;
                seen.add(k);
                out.push(byKey.get(k) || { word: x[0], meaning: x[3] || '', phonetic: x[2] || '', _lex: true });
            });
        return out;
    }

    // ─── 会话 ───────────────────────────────────────────────
    function start(mode) {
        const c        = compute();
        const pageMode = mode && mode.page;
        if (c.empty && !pageMode) { renderCard(); return; }
        try { window.MyWords?.stopAutoplay?.(); window.Lessons?.stopPlay?.(); } catch (e) {}
        S = {
            stage   : 'rev',
            i       : 0,
            revQ    : c.rev.map(w => ({ w: w })),
            learnQ  : c.neu.map(w => ({ w: w })),
            checkQ  : [],
            dicQ    : [],
            inSess  : new Set(c.rev.concat(c.neu).map(key)),
            cut     : new Set(),
            learned : [],              // 本轮自测过的新词 (测试设备也能接着默写)
            spelled : new Set(),
            stat    : { rev: 0, revOk: 0, neu: 0, neuOk: 0, dic: 0, dicOk: 0, cut: 0 },
            lastT   : Date.now(),
            shownAt : Date.now(),
            sec     : 0,
            q       : 0,
            qs      : 0,
            busy    : false,
            page    : 0
        };
        if (pageMode) {
            // 默写一页: 只有默写这一步, 这一页的全部词 (含熟词) 按顺序来
            S.page   = mode.page;
            S.stage  = 'dic';
            S.revQ   = [];
            S.learnQ = [];
            S.dicQ   = pageWords(mode.page).map(w => ({ w: w }));
            S.inSess = new Set();
        }
        openOverlay();
        if (!queue().length) nextStage(); else render();
    }

    function queue() {
        if (!S) return [];
        return S.stage === 'rev' ? S.revQ : S.stage === 'learn' ? S.learnQ
             : S.stage === 'check' ? S.checkQ : S.stage === 'dic' ? S.dicQ : [];
    }
    function nextStage() {
        flushTime();
        let idx = ORDER.indexOf(S.stage);
        while (idx < ORDER.length - 1) {
            idx++;
            S.stage = ORDER[idx];
            S.i     = 0;
            if (S.stage === 'check') {
                S.checkQ = shuffle(S.learnQ.filter(x => !S.cut.has(key(x.w))).map(x => ({ w: x.w })));
            }
            if (S.stage === 'dic' && !S.page) {
                const nb   = DB().loadNotebook() || [];
                const seen = new Set();
                const list = [];
                nb.filter(w => isToday(w.learnedAt) && !isToday(w.spellAt) && !DB().isCut(w))
                  .concat(S.learned)
                  .forEach(w => {
                      const k = key(w);
                      if (!k || seen.has(k) || S.spelled.has(k) || S.cut.has(k)) return;
                      seen.add(k);
                      list.push({ w: w });
                  });
                S.dicQ = list;
            }
            if (S.stage === 'done' || queue().length) break;
        }
        notePlanDay();
        render();
    }
    function advance() {
        if (!S) return;
        S.busy = false;
        S.i++;
        if (S.i >= queue().length) nextStage();
        else render();
    }

    // ─── 时长与当天记录 ─────────────────────────────────────
    function tick(answer) {
        if (!S) return;
        const now = Date.now();
        S.sec  += Math.min(45, Math.max(0, (now - S.lastT) / 1000));
        S.lastT = now;
        if (answer) { S.q += 1; S.qs += Math.max(1, Math.min(60, Math.round((now - S.shownAt) / 1000))); }
    }
    function flushTime() {
        if (!S || DB().isTestDevice?.()) return;
        const sec = Math.round(S.sec);
        if (sec <= 0 && !S.q) return;
        try {
            let store;
            try { store = JSON.parse(DB().getPref('lesson_time', '{}') || '{}') || {}; } catch (e) { store = {}; }
            const d = store[ymd()] || (store[ymd()] = {});
            const b = d.daily || (d.daily = { r: 0, e: 0, q: 0, qs: 0 });
            b.e += sec; b.q += S.q; b.qs += S.qs;
            DB().setPrefQuiet('lesson_time', JSON.stringify(store));
        } catch (e) {}
        S.sec = 0; S.q = 0; S.qs = 0;
    }
    function notePlanDay() {
        if (!S || DB().isTestDevice?.()) return;
        try {
            const c = compute();
            DB().bumpDaily({ plan: { rev: c.doneRev, neu: c.doneNeu, dic: c.doneDic, done: c.empty ? 1 : 0 } });
        } catch (e) {}
    }

    // ─── 弹层 ───────────────────────────────────────────────
    function openOverlay() {
        let ov = document.getElementById('dl-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id        = 'dl-overlay';
            ov.className = 'dl-overlay';
            document.body.appendChild(ov);
        }
        ov.innerHTML = `
            <div class="dl-sheet" role="dialog" aria-label="今日任务">
                <div class="dl-top">
                    <span class="dl-stage" id="dl-stage"></span>
                    <span class="dl-count" id="dl-count"></span>
                    <span class="dl-bar"><i id="dl-bar"></i></span>
                    <button class="dl-mute" id="dl-mute" title="自动发音开关">${muted() ? '\u{1F507}' : '\u{1F50A}'}</button>
                    <button class="dl-close" id="dl-close" title="先到这里 (进度已保存)">×</button>
                </div>
                <div class="dl-body" id="dl-body"></div>
            </div>`;
        ov.classList.add('open');
        document.body.classList.add('dl-open');
    }
    function close() {
        if (S) { tick(false); flushTime(); notePlanDay(); }
        S = null;
        try { window.App?.stopSpeak?.(); } catch (e) {}
        const ov = document.getElementById('dl-overlay');
        if (ov) { ov.classList.remove('open'); ov.innerHTML = ''; }
        document.body.classList.remove('dl-open');
        renderCard();
        // 单词页的筛选计数 (复习 / 拼写 / 熟词) 跟着刷新
        try { window.dispatchEvent(new CustomEvent('hsv:datachanged', { detail: { source: 'daily' } })); } catch (e) {}
    }

    function setHead() {
        const q     = queue();
        const st    = document.getElementById('dl-stage');
        const ct    = document.getElementById('dl-count');
        const bar   = document.getElementById('dl-bar');
        if (st) st.textContent = S.page && S.stage === 'dic' ? '默写第 ' + S.page + ' 页' : STAGES[S.stage];
        if (ct) ct.textContent = S.stage === 'done' ? '' : (Math.min(S.i + 1, q.length) + '/' + q.length);
        if (bar) {
            const k   = ORDER.indexOf(S.stage);
            const pct = S.stage === 'done' ? 100
                      : S.page ? Math.round((q.length ? S.i / q.length : 1) * 100)
                      : Math.round(((k + (q.length ? S.i / q.length : 1)) / 4) * 100);
            bar.style.width = Math.max(3, Math.min(100, pct)) + '%';
        }
    }

    function render() {
        if (!S) return;
        const body = document.getElementById('dl-body');
        if (!body) return;
        setHead();
        S.shownAt = Date.now();
        S.busy    = false;
        if (S.stage === 'done') return renderDone(body);
        const item = queue()[S.i];
        if (!item) return nextStage();
        if (S.stage === 'learn') return renderLearn(body, item);
        if (S.stage === 'dic')   return renderDic(body, item);
        return renderMCQ(body, item);
    }

    // 看词选义 (复习 / 自测)
    function shortZh(m) {
        m = String(m || '').replace(/\s+/g, ' ').trim();
        return m.length > 32 ? m.slice(0, 31) + '…' : m;
    }
    function posOf(m) { const x = /^([a-z]+)\./i.exec(String(m || '')); return x ? x[1].toLowerCase() : ''; }
    function shuffle(a) {
        a = a.slice();
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        return a;
    }
    function optionsFor(w) {
        const right = shortZh(w.meaning || (exampleOf(w) || {}).ctx || '');
        if (!S.pool) {
            S.pool = (DB().loadNotebook() || []).map(x => shortZh(x.meaning)).filter(Boolean);
        }
        const pos  = posOf(right);
        const seen = new Set([right]);
        const same = [], other = [];
        shuffle(S.pool).some(m => {
            if (seen.has(m)) return false;
            seen.add(m);
            (pos && posOf(m) === pos ? same : other).push(m);
            return same.length >= 3;
        });
        const wrong = same.concat(other).slice(0, 3);
        return shuffle([{ t: right, ok: true }].concat(wrong.map(t => ({ t: t, ok: false }))));
    }
    function exampleHtml(w) {
        const ex = exampleOf(w);
        if (!ex) return '';
        return `<div class="dl-ex"><div class="dl-ex-en">${markSurface(ex.text, ex.surface)}
                    <button class="dl-say-s" data-say="${esc(ex.text)}" title="听这句">\u{1F50A}</button></div>
                ${ex.zh ? `<div class="dl-ex-zh">${esc(ex.zh)}</div>` : ''}</div>`;
    }
    function renderMCQ(body, item) {
        const w    = item.w;
        const opts = optionsFor(w);
        const tag  = S.stage === 'check' ? '刚学的词' : (focusOf(w).includes('weak') ? '薄弱词' : '');
        body.innerHTML = `
            <div class="dl-q">
                ${tag || item.again ? `<div class="dl-tag">${item.again ? '再考一次' : tag}</div>` : ''}
                <div class="dl-word">${esc(w.word)} <button class="dl-say" data-say="${esc(w.word)}" title="发音">\u{1F50A}</button></div>
                ${w.phonetic ? `<div class="dl-ipa">${esc(w.phonetic)}</div>` : ''}
                <div class="dl-opts">${opts.map((o, i) => `
                    <button class="dl-opt" data-ok="${o.ok ? 1 : 0}"><span class="dl-k">${i + 1}</span><span>${esc(o.t)}</span></button>`).join('')}
                </div>
                <div class="dl-fb" id="dl-fb"></div>
            </div>`;
        say(w.word);
    }
    function answerMCQ(btn) {
        if (!S || S.busy) return;
        S.busy = true;
        tick(true);
        const item = queue()[S.i];
        const w    = item.w;
        const ok   = btn.dataset.ok === '1';
        document.querySelectorAll('#dl-body .dl-opt').forEach(b => {
            b.disabled = true;
            if (b.dataset.ok === '1') b.classList.add('ok');
        });
        if (!ok) btn.classList.add('bad');
        if (!item.again) {
            if (S.stage === 'rev') {
                DB().planReview(w.word, ok);
                S.stat.rev++; if (ok) S.stat.revOk++;
            } else {
                DB().planLearn(w.word, ok);
                S.stat.neu++; if (ok) S.stat.neuOk++;
                S.learned.push(w);
            }
            if (!ok) queue().push({ w: w, again: true });     // 本轮最后再考一次
        }
        if (ok) { setTimeout(advance, 650); return; }
        const fb = document.getElementById('dl-fb');
        if (fb) fb.innerHTML = `${exampleHtml(w)}<button class="dl-primary dl-next" id="dl-next">下一个 →</button>`;
    }

    // 新词卡片
    function renderLearn(body, item) {
        const w   = item.w;
        const ex  = exampleOf(w);
        const n   = numOf(w);
        const col = (ex && ex.phr) ? ex.phr : (w.collo ? { en: String(w.collo).split(/\s*[·;]\s*/)[0], zh: '' } : null);
        body.innerHTML = `
            <div class="dl-learn">
                <div class="dl-tag">新词${n ? ' · 默写本 #' + n : ''}</div>
                <div class="dl-word">${esc(w.word)} <button class="dl-say" data-say="${esc(w.word)}" title="发音">\u{1F50A}</button></div>
                ${w.phonetic ? `<div class="dl-ipa">${esc(w.phonetic)}</div>` : ''}
                <div class="dl-zh">${esc(w.meaning || (ex && ex.ctx) || '')}</div>
                ${ex && ex.ctx && ex.ctx !== w.meaning ? `<div class="dl-ctx">短文里：${esc(ex.ctx)}</div>` : ''}
                ${col ? `<div class="dl-col"><span class="dl-col-k">搭配</span> ${esc(col.en)}${col.zh ? ` <span class="dl-dim">${esc(col.zh)}</span>` : ''}
                    <button class="dl-say-s" data-say="${esc(col.en)}" title="听搭配">\u{1F50A}</button></div>` : ''}
                ${exampleHtml(w)}
                <div class="dl-btns">
                    <button class="dl-ghost" id="dl-cut" title="太简单: 不学了, 放进熟词">✂️ 太简单，斩</button>
                    <button class="dl-primary" id="dl-got">记住了 →</button>
                </div>
            </div>`;
        say(w.word);
    }
    function cutCurrent() {
        if (!S || S.busy) return;
        S.busy = true;
        tick(false);
        const w = queue()[S.i].w;
        DB().setCut(w.word, true);
        S.cut.add(key(w));
        S.stat.cut++;
        // 斩掉的词不占名额: 补下一个新词
        const nb = DB().loadNotebook() || [];
        const nx = nb.find(x => isNewWord(x) && !S.inSess.has(key(x)));
        if (nx) { S.inSess.add(key(nx)); S.learnQ.push({ w: nx }); }
        advance();
    }

    // 听音默写
    const VARIANTS = [
        [/(col|fav|hon|neighb|behavi|lab|flav|hum|harb|rum|vap|sav|arm|endeav)our/g, '$1or'],
        [/(cent|met|theat|lit|fib)re\b/g, '$1er'],
        [/(kilomet|centimet|millimet)re\b/g, '$1er'],
        [/programme/g, 'program'], [/catalogue/g, 'catalog'], [/dialogue/g, 'dialog'],
        [/(travel|cancel|label|model|signal|quarrel|level|marvel|jewel)l(ed|ing|er|ery)/g, '$1$2'],
        [/grey/g, 'gray']
    ];
    function norm(s) { return String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim(); }
    function us(s)   { return VARIANTS.reduce((t, r) => t.replace(r[0], r[1]), s); }
    function renderDic(body, item) {
        const w     = item.w;
        const parts = String(w.word).trim().split(/\s+/).map(x => x.replace(/[^A-Za-z]/g, '').length);
        const hint  = (parts.length > 1 ? parts.join(' + ') : parts[0]) + ' 个字母';
        const copy  = !!item.copy;
        body.innerHTML = `
            <div class="dl-dic">
                <div class="dl-tag">${copy ? '照着写一遍' : '默写'}</div>
                <div class="dl-zh dl-dic-zh">${esc(w.meaning || '')}</div>
                <button class="dl-say-big" data-say="${esc(w.word)}">\u{1F50A} 听发音</button>
                ${copy ? `<div class="dl-answer">${esc(w.word)}</div>` : ''}
                <input class="dl-input" id="dl-input" type="text" autocomplete="off" autocorrect="off"
                       autocapitalize="off" spellcheck="false" placeholder="${copy ? '照上面写一遍' : '写出英文'}">
                <div class="dl-hint">${esc(hint)}</div>
                <div class="dl-fb" id="dl-fb"></div>
                <div class="dl-btns">
                    ${copy ? '' : '<button class="dl-ghost" id="dl-giveup">不会</button>'}
                    <button class="dl-primary" id="dl-submit">确定</button>
                </div>
            </div>`;
        const inp = document.getElementById('dl-input');
        setTimeout(() => { try { inp && inp.focus(); } catch (e) {} }, 60);
        if (!copy) say(w.word, true);   // 默写离不开声音: 静音开关也照读
    }
    function submitDic(giveUp) {
        if (!S || S.busy) return;
        const item = queue()[S.i];
        if (!item) return;
        const w   = item.w;
        const inp = document.getElementById('dl-input');
        const val = norm(inp ? inp.value : '');
        const tgt = norm(w.word);
        if (!giveUp && !val) { inp && inp.focus(); return; }
        const exact   = val === tgt;
        const variant = !exact && val && us(val) === us(tgt);
        const fb      = document.getElementById('dl-fb');
        if (item.copy) {
            if (exact || variant) { S.busy = true; tick(false); setTimeout(advance, 300); return; }
            if (fb) fb.innerHTML = '<div class="dl-bad">还不对，照上面再写一遍</div>';
            if (inp) { inp.classList.add('bad'); inp.select(); }
            return;
        }
        S.busy = true;
        tick(true);
        const ok = !giveUp && (exact || variant);
        if (!w._lex) {
            DB().planSpell(w.word, ok);
            // 熟词写错了: 取消斩, 回到复习
            if (!ok && DB().isCut(w)) { try { DB().setCut(w.word, false); } catch (e) {} }
        }
        S.spelled.add(key(w));
        S.stat.dic++; if (ok) S.stat.dicOk++;
        if (ok) {
            if (fb) fb.innerHTML = variant
                ? `<div class="dl-good">✔ 也对；默写本写作 <b>${esc(w.word)}</b></div>`
                : '<div class="dl-good">✔ 对了</div>';
            if (inp) inp.classList.add('ok');
            setTimeout(advance, variant ? 1400 : 600);
            return;
        }
        // 写错 / 不会: 看答案, 照着写一遍才往下走
        item.copy = true;
        S.busy    = false;
        say(w.word, true);
        renderDic(document.getElementById('dl-body'), item);
        const fb2 = document.getElementById('dl-fb');
        if (fb2 && val) fb2.innerHTML = `<div class="dl-bad">你写的是 ${esc(val)}</div>`;
    }

    // 完成
    function renderDone(body) {
        const st = S.stat;
        const c  = compute();
        const pc = (a, b) => b ? Math.round(a / b * 100) + '%' : '';
        body.innerHTML = `
            <div class="dl-done">
                <div class="dl-done-big">${S.page ? '✔ 第 ' + S.page + ' 页默写完了' : c.empty ? '\u{1F389} 今日任务完成' : '✔ 这一轮做完了'}</div>
                <div class="dl-sum">
                    ${st.rev ? `<div>复习 <b>${st.rev}</b> 个，一次答对 ${pc(st.revOk, st.rev)}</div>` : ''}
                    ${st.neu ? `<div>新词 <b>${st.neu}</b> 个，自测一次答对 ${pc(st.neuOk, st.neu)}</div>` : ''}
                    ${st.dic ? `<div>默写 <b>${st.dic}</b> 个，写对 ${st.dicOk} 个</div>` : ''}
                    ${st.cut ? `<div class="dl-dim">斩掉 ${st.cut} 个太简单的词（在「✂️ 熟词」里可以取消）</div>` : ''}
                    ${st.dic > st.dicOk ? '<div class="dl-dim">写错的词打上了「✏️ 拼写」标记，单词页可以单独练' + (S.page ? '；写错的熟词已取消斩，回到复习' : '') + '</div>' : ''}
                </div>
                <button class="dl-primary" id="dl-finish">${!S.page && c.empty ? '明天见' : '好的'}</button>
            </div>`;
    }

    // ─── 事件 ───────────────────────────────────────────────
    function onClick(e) {
        const t = e.target;
        if (t.closest('#dl-start'))  { start(); return; }
        const pd = t.closest('#dl-pagedic');
        if (pd) { start({ page: Number(pd.dataset.page) || 1 }); return; }
        if (t.closest('#dl-more')) {
            const n = extraToday() + 5;
            DB().setPref('plan_extra', JSON.stringify({ d: ymd(), n: n }));
            renderCard();
            start();
            return;
        }
        if (!S && !t.closest('#dl-overlay')) return;
        if (t.closest('#dl-close') || t.closest('#dl-finish')) { close(); return; }
        if (t.closest('#dl-mute')) {
            DB().setPref('plan_mute', muted() ? '' : '1');
            const b = t.closest('#dl-mute');
            b.textContent = muted() ? '\u{1F507}' : '\u{1F50A}';
            return;
        }
        const sayEl = t.closest('[data-say]');
        if (sayEl) { say(sayEl.dataset.say, true); if (S && S.stage === 'dic') document.getElementById('dl-input')?.focus(); return; }
        const opt = t.closest('.dl-opt');
        if (opt) { answerMCQ(opt); return; }
        if (t.closest('#dl-next'))   { advance(); return; }
        if (t.closest('#dl-got'))    { tick(false); advance(); return; }
        if (t.closest('#dl-cut'))    { cutCurrent(); return; }
        if (t.closest('#dl-submit')) { submitDic(false); return; }
        if (t.closest('#dl-giveup')) { submitDic(true); return; }
    }
    function onKey(e) {
        if (!S || e.isComposing) return;          // 输入法组字时的回车不算提交
        if (e.key === 'Escape') { close(); return; }
        if (S.stage === 'dic') {
            if (e.key === 'Enter') { e.preventDefault(); submitDic(false); }
            return;
        }
        if (e.key === 'Enter') {
            const nx = document.getElementById('dl-next') || document.getElementById('dl-got') || document.getElementById('dl-finish');
            if (nx) { e.preventDefault(); nx.click(); }
            return;
        }
        if (/^[1-4]$/.test(e.key)) {
            const b = document.querySelectorAll('#dl-body .dl-opt')[Number(e.key) - 1];
            if (b && !b.disabled) b.click();
        }
    }

    function init() {
        if (!document.getElementById('daily-card')) return;
        document.addEventListener('click', onClick);
        document.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'dl-size') {
                DB().setPref('plan_size', e.target.value);
                renderCard();
            }
            if (e.target && e.target.id === 'dl-page') {
                const v = Math.round(Number(e.target.value) || 0);
                DB().setPref('plan_page', v >= 1 ? String(Math.min(pageMax(), v)) : '');
                renderCard();
            }
        });
        document.addEventListener('keydown', onKey);
        document.addEventListener('keydown', (e) => {
            if (e.target && e.target.id === 'dl-page' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
        });
        document.addEventListener('visibilitychange', () => {
            if (S) { if (document.hidden) { tick(false); flushTime(); } else S.lastT = Date.now(); }
            else if (!document.hidden) renderCard();       // 跨过午夜回来: 换成新一天的任务
        });
        window.addEventListener('hsv:datachanged', () => { if (!S) renderCard(); });
        document.querySelectorAll('.nav-tab[data-nav="my-words"]').forEach(t =>
            t.addEventListener('click', () => { if (!S) renderCard(); }));
        renderCard();
    }

    return {
        init       : init,
        start      : start,
        pageWords  : pageWords,
        close      : close,
        compute    : compute,
        renderCard : renderCard,
        isActive   : () => !!S,
        _isNewWord : (w) => isNewWord(w),
        _spellOk   : (val, tgt) => { const a = norm(val), b = norm(tgt); return a === b ? 'exact' : (a && us(a) === us(b) ? 'variant' : ''); },
        _isDueWord : (w) => isDueWord(w, endOfToday())
    };
})();
