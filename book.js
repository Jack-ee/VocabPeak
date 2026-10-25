// ============================================================
// book.js — 默写本 (v152)
// ------------------------------------------------------------
// 《英语·单词本》逐页原样显示: 序号、顺序、重复条目都与纸质本 / PDF
// 一致, 只是把空着的英文列填上 (数据 book-3500.js, 第一次打开时才加载)。
//   • 顶栏: ◀ 第 N 页 ▶、找序号或单词、遮住英文 (对着中文自己默, 点一下
//     看答案)、默写这一页 (今日任务的整页听写)
//   • 每行右侧一个小标签: 熟词 / 薄弱 / 已学 (来自单词本)
//   • 点一行: 词卡 —— 发音、音标、中文、搭配、AI 短文里的原句 (可直接
//     去读那篇)、在单词本里的状态 (斩 / 取消斩 / 加入单词本); 卡片里也能
//     上一个 / 下一个
// 页码按 PDF 分页: 封面之后第 1 页 = #1–#32, 共 120 页。
// ============================================================
window.Book = (function () {
    'use strict';

    let root    = null;
    let loading = null;
    let page    = 1;
    let hide    = false;
    let hl      = 0;              // 高亮的序号 (查找结果)
    let sheetN  = 0;              // 词卡里正在看的序号
    let lexMap  = null;           // 小写词 → 词库条目
    let shown   = new Set();      // 遮住英文时, 单独点开看过的序号

    const DB = () => window.DB;
    function esc(s) {
        if (window.App && window.App.escHtml) return window.App.escHtml(s);
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ─── 数据 ───────────────────────────────────────────────
    function load() {
        if (window.HSV_BOOK) return Promise.resolve(window.HSV_BOOK);
        if (!loading) {
            loading = new Promise((resolve, reject) => {
                const me  = document.querySelector('script[src*="book.js"]');
                const ver = me && me.src.indexOf('?') >= 0 ? me.src.slice(me.src.indexOf('?')) : '';
                const s   = document.createElement('script');
                s.src     = 'book-3500.js' + ver;
                s.onload  = () => window.HSV_BOOK ? resolve(window.HSV_BOOK) : reject(new Error('book data missing'));
                s.onerror = () => { loading = null; reject(new Error('book data failed to load')); };
                document.head.appendChild(s);
            });
        }
        return loading;
    }
    const B = () => window.HSV_BOOK;
    function pageCount() { return (B() && B().pages.length) || 120; }
    function pageOf(n) {
        const P = (B() && B().pages) || [];
        let lo = 0, hi = P.length - 1;
        if (!P.length || n < P[0]) return 0;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (P[mid] <= n) lo = mid; else hi = mid - 1; }
        return lo + 1;
    }
    function rowsOf(pg) {
        const P = B().pages;
        const a = P[pg - 1], b = pg < P.length ? P[pg] : Infinity;
        return B().rows.filter(r => r[0] >= a && r[0] < b);
    }
    function rowByN(n) { return B().rows.find(r => r[0] === n) || null; }
    // 纸质本上的变形词 (did / ate …) 查原形
    function headOf(word) {
        const k = String(word || '').trim().toLowerCase();
        return (B().forms && B().forms[k]) || k;
    }
    function lexOf(word) {
        if (!lexMap) {
            lexMap = new Map();
            ((window.HSV_LEXICON && window.HSV_LEXICON.words) || []).forEach(w => {
                const k = String(w[0] || '').toLowerCase();
                if (!lexMap.has(k)) lexMap.set(k, w);
            });
        }
        return lexMap.get(headOf(word)) || null;
    }
    function notebookMap() {
        const m = new Map();
        (DB().loadNotebook() || []).forEach(w => {
            const k = String(w.word || '').trim().toLowerCase();
            if (k && !m.has(k)) m.set(k, w);
        });
        return m;
    }
    function statusOf(e) {
        if (!e) return { k: 'none', t: '' };
        if (DB().isCut(e)) return { k: 'cut', t: '熟词' };
        if ((e.focus || []).includes('weak')) return { k: 'weak', t: '薄弱' };
        if (e.lastReview || e.learnedAt || Number(e.srsLevel) > 0) return { k: 'learned', t: '已学' };
        return { k: 'new', t: '' };
    }

    // ─── 页面 ───────────────────────────────────────────────
    function startPage() {
        const v = Number(DB().getPref('book_page', '')) || Number(DB().getPref('plan_page', '')) || 1;
        return Math.max(1, Math.min(pageCount(), Math.round(v)));
    }
    function setPage(pg, opts) {
        page = Math.max(1, Math.min(pageCount(), Math.round(Number(pg) || 1)));
        try { DB().setPref('book_page', String(page)); } catch (e) {}
        shown = new Set();
        if (!(opts && opts.keepHl)) hl = 0;
        render();
        if (!(opts && opts.keepScroll)) { try { root.scrollIntoView({ block: 'start' }); window.scrollBy(0, -60); } catch (e) {} }
    }

    function render() {
        if (!root) return;
        if (!B()) {
            root.innerHTML = '<div class="bk-loading">正在打开默写本…</div>';
            load().then(() => { page = startPage(); render(); })
                  .catch(() => { root.innerHTML = '<div class="bk-loading">默写本没加载出来，联网后再点一次「默写本」。</div>'; });
            return;
        }
        const rows = rowsOf(page);
        const nb   = notebookMap();
        const max  = pageCount();
        const n0   = rows.length ? rows[0][0] : 0;
        const n1   = rows.length ? rows[rows.length - 1][0] : 0;
        const list = rows.map(r => {
            const e  = nb.get(headOf(r[1])) || nb.get(String(r[1]).toLowerCase());
            const st = statusOf(e);
            const covered = hide && !shown.has(r[0]);
            return `<div class="bk-row${r[0] === hl ? ' hl' : ''}" data-n="${r[0]}">
                    <span class="bk-n">${r[0]}</span>
                    <span class="bk-en${covered ? ' covered' : ''}" data-reveal="${r[0]}">${covered ? '' : esc(r[1])}</span>
                    <span class="bk-ipa">${esc(r[2])}</span>
                    <span class="bk-zh">${esc(r[3])}</span>
                    <span class="bk-st bk-st-${st.k}">${st.t}</span>
                </div>`;
        }).join('');
        root.innerHTML = `
            <div class="bk">
                <div class="bk-top">
                    <div class="bk-pager">
                        <button class="bk-nav" id="bk-prev" title="上一页 (←)"${page <= 1 ? ' disabled' : ''}>◀</button>
                        <label class="bk-pg">第 <input id="bk-page" type="number" inputmode="numeric" min="1" max="${max}" value="${page}"> 页<span class="bk-of"> / ${max}</span></label>
                        <button class="bk-nav" id="bk-next" title="下一页 (→)"${page >= max ? ' disabled' : ''}>▶</button>
                        <span class="bk-range">#${n0}–#${n1} · ${rows.length} 词</span>
                    </div>
                    <div class="bk-tools">
                        <input id="bk-find" type="text" placeholder="找序号或单词" autocomplete="off" autocapitalize="off" spellcheck="false">
                        <button class="bk-btn${hide ? ' on' : ''}" id="bk-hide" title="遮住英文, 对着中文自己默; 点一下看答案">${hide ? '显示英文' : '遮住英文'}</button>
                        <button class="bk-btn bk-main" id="bk-dic" title="听发音写英文, 整页">\u{1F4DD} 默写这一页</button>
                    </div>
                </div>
                <div class="bk-head"><span>序号</span><span>英文</span><span>音标</span><span>中文</span><span></span></div>
                <div class="bk-list">${list}</div>
                <div class="bk-foot">
                    <button class="bk-navb" id="bk-prev2"${page <= 1 ? ' disabled' : ''}>◀ 第 ${Math.max(1, page - 1)} 页</button>
                    <button class="bk-navb" id="bk-next2"${page >= max ? ' disabled' : ''}>第 ${Math.min(max, page + 1)} 页 ▶</button>
                </div>
                <div class="bk-note">与《英语·单词本》逐行对应，序号一致；页码按 PDF 分页（封面之后为第 1 页）。点任意一行看词卡。</div>
            </div>
            <div class="bk-sheet-ov" id="bk-sheet-ov"><div class="bk-sheet" id="bk-sheet"></div></div>`;
        if (hl) {
            const el = root.querySelector('.bk-row.hl');
            if (el) setTimeout(() => { try { el.scrollIntoView({ block: 'center' }); } catch (e) {} }, 0);
        }
    }

    // ─── 查找 ───────────────────────────────────────────────
    function find(q) {
        q = String(q || '').trim().toLowerCase();
        if (!q || !B()) return;
        let r = null;
        if (/^#?\d+$/.test(q)) {
            const n = Number(q.replace('#', ''));
            r = rowByN(n) || B().rows.find(x => x[0] >= n) || null;
        } else {
            r = B().rows.find(x => String(x[1]).toLowerCase() === q)
             || B().rows.find(x => headOf(x[1]) === q)
             || B().rows.find(x => String(x[1]).toLowerCase().startsWith(q))
             || null;
        }
        if (!r) { window.App?.showToast?.('默写本里没找到「' + q + '」'); return; }
        hl = r[0];
        setPage(pageOf(r[0]), { keepHl: true, keepScroll: true });
    }

    // ─── 词卡 ───────────────────────────────────────────────
    function openSheet(n) {
        const r = rowByN(n);
        if (!r) return;
        sheetN = n;
        const ov  = root.querySelector('#bk-sheet-ov');
        const sh  = root.querySelector('#bk-sheet');
        if (!ov || !sh) return;
        const lx  = lexOf(r[1]);
        const nb  = notebookMap();
        const hk  = headOf(r[1]);
        const e   = nb.get(hk);
        const st  = statusOf(e);
        const ex  = window.Stories?.exampleOf?.(hk) || null;
        const rows = rowsOf(page);
        const i    = rows.findIndex(x => x[0] === n);
        const collo = lx && lx[5] ? String(lx[5]).split(/\s*[·;]\s*/).filter(Boolean).slice(0, 3) : [];
        const exHtml = ex ? `
            <div class="bk-ex">
                <div class="bk-ex-en">${markSurface(ex.text, ex.surface)}
                    <button class="bk-say-s" data-say="${esc(ex.text)}" title="听这句">\u{1F50A}</button></div>
                ${ex.zh ? `<div class="bk-ex-zh">${esc(ex.zh)}</div>` : ''}
                <button class="bk-link" data-story="${esc(ex.sid)}">读这篇短文 ${esc(ex.sid)}${ex.title ? ' · ' + esc(ex.title) : ''} →</button>
            </div>` : '';
        const stLine = !e ? '不在单词本里'
            : st.k === 'cut' ? '熟词（已斩，不进复习）'
            : st.k === 'weak' ? '薄弱词，复习时优先'
            : st.k === 'learned' ? '已学过' + (e.nextReview ? '，下次复习 ' + fmtDay(e.nextReview) : '')
            : '还没学（今日任务会按顺序排到）';
        const act = !e
            ? (lx ? `<button class="bk-btn" id="bk-add" data-w="${esc(hk)}">➕ 加入单词本</button>` : '')
            : st.k === 'cut'
                ? `<button class="bk-btn" id="bk-uncut" data-w="${esc(e.word)}">↩ 取消斩，加入复习</button>`
                : `<button class="bk-btn" id="bk-cut" data-w="${esc(e.word)}">✂️ 斩（太简单）</button>`;
        sh.innerHTML = `
            <div class="bk-sh-head">
                <span class="bk-sh-num">默写本 #${n} · 第 ${pageOf(n)} 页</span>
                <button class="bk-sh-x" id="bk-sh-x" title="关闭">×</button>
            </div>
            <div class="bk-sh-word">${esc(r[1])} <button class="bk-say" data-say="${esc(r[1])}" title="发音">\u{1F50A}</button></div>
            ${hk !== String(r[1]).toLowerCase() ? `<div class="bk-sh-form">原形 <b>${esc(hk)}</b></div>` : ''}
            ${r[2] ? `<div class="bk-sh-ipa">${esc(r[2])}</div>` : ''}
            <div class="bk-sh-zh">${esc(r[3])}</div>
            ${ex && ex.ctx ? `<div class="bk-sh-ctx">短文里：${esc(ex.ctx)}</div>` : ''}
            ${collo.length ? `<div class="bk-sh-col"><span class="bk-col-k">搭配</span>${collo.map(c =>
                `<span class="bk-col">${esc(c)} <button class="bk-say-s" data-say="${esc(c)}">\u{1F50A}</button></span>`).join('')}</div>` : ''}
            ${exHtml}
            <div class="bk-sh-st"><span class="bk-st bk-st-${st.k}">${st.t || (e ? '未学' : '')}</span> ${esc(stLine)} ${act}</div>
            <div class="bk-sh-nav">
                <button class="bk-navb" id="bk-sh-prev"${i <= 0 ? ' disabled' : ''}>◀ 上一个</button>
                <button class="bk-navb" id="bk-sh-next"${i < 0 || i >= rows.length - 1 ? ' disabled' : ''}>下一个 ▶</button>
            </div>`;
        ov.classList.add('open');
        root.querySelectorAll('.bk-row.cur').forEach(x => x.classList.remove('cur'));
        root.querySelector(`.bk-row[data-n="${n}"]`)?.classList.add('cur');
        say(r[1]);
    }
    function closeSheet() {
        const ov = root && root.querySelector('#bk-sheet-ov');
        if (ov) ov.classList.remove('open');
        sheetN = 0;
    }
    function stepSheet(d) {
        const rows = rowsOf(page);
        const i    = rows.findIndex(x => x[0] === sheetN);
        const r    = rows[i + d];
        if (r) openSheet(r[0]);
    }
    function fmtDay(t) {
        const d = new Date(Number(t));
        if (!isFinite(d)) return '';
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days  = Math.round((new Date(d).setHours(0, 0, 0, 0) - today) / 86400000);
        if (days <= 0) return '今天';
        if (days === 1) return '明天';
        return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    }
    function markSurface(text, surface) {
        const safe = esc(text);
        const s    = esc(surface || '');
        if (!s) return safe;
        const re = new RegExp('(^|[^A-Za-z])(' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![A-Za-z])', 'i');
        return safe.replace(re, '$1<b>$2</b>');
    }
    function say(text) {
        if (!text) return;
        try { window.App?.stopSpeak?.(); window.App?.speak?.(text); } catch (e) {}
    }
    function afterChange(msg) {
        window.App?.updateNotebookBadge?.();
        if (msg) window.App?.showToast?.(msg);
        const n = sheetN;
        render();
        if (n) openSheet(n);
        try { window.dispatchEvent(new CustomEvent('hsv:datachanged', { detail: { source: 'book' } })); } catch (e) {}
    }

    // ─── 事件 ───────────────────────────────────────────────
    function onClick(e) {
        const t = e.target;
        const sayEl = t.closest('[data-say]');
        if (sayEl) { e.stopPropagation(); say(sayEl.dataset.say); return; }
        if (t.closest('#bk-prev') || t.closest('#bk-prev2')) { setPage(page - 1); return; }
        if (t.closest('#bk-next') || t.closest('#bk-next2')) { setPage(page + 1); return; }
        if (t.closest('#bk-hide')) { hide = !hide; shown = new Set(); render(); return; }
        if (t.closest('#bk-dic'))  { window.Daily?.start?.({ page: page }); return; }
        if (t.closest('#bk-sh-x') || t === root.querySelector('#bk-sheet-ov')) { closeSheet(); return; }
        if (t.closest('#bk-sh-prev')) { stepSheet(-1); return; }
        if (t.closest('#bk-sh-next')) { stepSheet(1); return; }
        const story = t.closest('[data-story]');
        if (story) {
            closeSheet();
            document.querySelector('.nav-tab[data-nav="lessons"]')?.click();
            setTimeout(() => window.Lessons?.open?.(story.dataset.story, 'read'), 0);
            return;
        }
        const cut = t.closest('#bk-cut, #bk-uncut');
        if (cut) {
            const on = cut.id === 'bk-cut';
            DB().setCut(cut.dataset.w, on);
            afterChange(on ? '已斩「' + cut.dataset.w + '」' : '已取消斩「' + cut.dataset.w + '」，回到复习');
            return;
        }
        const add = t.closest('#bk-add');
        if (add) {
            const lx = lexOf(add.dataset.w);
            if (lx) {
                DB().upsertNotebookWord({ word: lx[0], meaning: String(lx[3] || ''), phonetic: lx[2] || '',
                                          collo: lx[5] || '', source: '默写本 #' + (lx[1] || '') }, { fillOnly: true });
            }
            afterChange('已加入单词本「' + add.dataset.w + '」');
            return;
        }
        const rev = t.closest('[data-reveal]');
        if (rev && rev.classList.contains('covered')) {
            shown.add(Number(rev.dataset.reveal));
            rev.classList.remove('covered');
            const r = rowByN(Number(rev.dataset.reveal));
            rev.textContent = r ? r[1] : '';
            if (r) say(r[1]);
            return;
        }
        const row = t.closest('.bk-row');
        if (row) { openSheet(Number(row.dataset.n)); return; }
    }

    function active() {
        return !!root && document.getElementById('view-book')?.classList.contains('active');
    }
    function init() {
        root = document.getElementById('bk-root');
        if (!root) return;
        root.addEventListener('click', onClick);
        root.addEventListener('change', (e) => {
            if (e.target && e.target.id === 'bk-page') setPage(e.target.value);
        });
        root.addEventListener('keydown', (e) => {
            if (e.target && e.target.id === 'bk-page' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.target && e.target.id === 'bk-find' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); find(e.target.value); }
        });
        document.addEventListener('keydown', (e) => {
            if (!active() || window.Daily?.isActive?.() || e.isComposing) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            const open = sheetN && root.querySelector('#bk-sheet-ov.open');
            if (e.key === 'Escape' && open) { closeSheet(); return; }
            if (e.key === 'ArrowLeft')  { e.preventDefault(); open ? stepSheet(-1) : setPage(page - 1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); open ? stepSheet(1) : setPage(page + 1); }
        });
        // 切到「默写本」才加载数据 (220 KB), 平时不占启动时间
        document.querySelectorAll('.nav-tab[data-nav="book"]').forEach(t => t.addEventListener('click', () => {
            if (B()) { if (!page || page === 1) page = startPage(); render(); }
            else render();
        }));
        // 今日任务 / 斩 / 同步拉取之后, 刷新每行的状态标签
        window.addEventListener('hsv:datachanged', (ev) => {
            if (ev && ev.detail && ev.detail.source === 'book') return;
            if (active() && B()) { const n = sheetN; render(); if (n) openSheet(n); }
        });
        if (active()) render();
    }

    return {
        init  : init,
        show  : (pg) => {                      // 今日任务卡上「查看第 N 页」
            const tab = document.querySelector('.nav-tab[data-nav="book"]');
            if (tab && !active()) tab.click();
            load().then(() => setPage(pg || startPage())).catch(() => render());
        },
        load  : load,
        find  : (q) => load().then(() => find(q)),
        pageOf: pageOf
    };
})();
