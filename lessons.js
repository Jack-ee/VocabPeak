// ============================================================
// lessons.js — 课文精读模块 (Lessons)
// ============================================================
// 一课四步: 听读(逐句高亮) → 点词(弹卡+入生词本) → 填空(选择/拼写)
// → 短语(浏览+中英匹配)。语料来自 lessons-data.js (window.HSV_LESSONS)。
//
// 音频路径: 句子/单词/短语一律走 window.App.speak() —— 它自动按
// 离线音频包 → 神经语音 → 系统 TTS 三级回退。句子 clip 以规范化
// 全文为键存在音频包里 (见 tools/wordlist.txt 的 Lesson corpus 段)，
// 因此安卓平板即使没有英文系统语音也能整篇朗读。
//
// 进度: DB pref 'lesson_progress' (JSON, 按课 ID 分桶)。
// 日志: 填空每答一题 bumpDaily({quizTotal, quizCorrect})，听完整篇
// markActiveDay() —— 家长面板由此可见当天学习。
// 命名: DOM/样式前缀 ls-，存储走 DB.getPref/setPref (自带 hsv_ 前缀)。

window.Lessons = (function () {
    'use strict';

    // ─── State ──────────────────────────────────────────────
    let root        = null;   // #ls-root
    let curLesson   = null;   // 当前课对象 (null = 课程列表页)
    let curTab      = 'read'; // read | cloze | phrases
    let playToken   = 0;      // 递增令牌: 任何一次新播放/停止都使旧链失效
    let clozeState  = null;   // 进行中的填空测验
    let matchState  = null;   // 进行中的短语匹配

    // ─── Helpers ────────────────────────────────────────────
    function esc(s) {
        if (window.App && window.App.escHtml) return window.App.escHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function toast(msg) { window.App?.showToast?.(msg); }
    function speak(text, onEnd) { window.App?.speak?.(text, null, onEnd); }
    function lessons() { return Array.isArray(window.HSV_LESSONS) ? window.HSV_LESSONS : []; }
    function lessonById(id) { return lessons().find(l => l.id === id) || null; }

    // Fisher-Yates —— 全模块唯一的洗牌实现，禁止 sort(random) 偏差写法。
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    function allSentences(lesson) {
        const out = [];
        (lesson.paras || []).forEach(p => (p.sentences || []).forEach(s => out.push(s)));
        return out;
    }
    function sentenceById(lesson, sid) {
        return allSentences(lesson).find(s => s.id === sid) || null;
    }
    function wordById(lesson, wid) {
        return (lesson.words || []).find(w => w.id === wid) || null;
    }

    // ─── Progress (DB pref 'lesson_progress') ───────────────
    function loadProgress() {
        try { return JSON.parse(window.DB?.getPref?.('lesson_progress', '{}') || '{}') || {}; }
        catch (e) { return {}; }
    }
    function saveProgress(p) {
        try { window.DB?.setPref?.('lesson_progress', JSON.stringify(p)); } catch (e) {}
    }
    function bumpProgress(lessonId, patch) {
        const p   = loadProgress();
        const rec = p[lessonId] || {};
        Object.keys(patch).forEach(k => { rec[k] = patch[k]; });
        p[lessonId] = rec;
        saveProgress(p);
        return rec;
    }

    // ─── 音频包词表条目 (供 app.js 导出 wordlist / 覆盖率统计) ──
    // 返回本模块所有需要发音的英文字符串: 词条原型、课文中的形式、
    // 短语、以及每个句子的全文。app.js 会做规范化与去重。
    function speechEntries() {
        const out = [];
        lessons().forEach(l => {
            (l.words || []).forEach(w => {
                out.push(w.lemma);
                out.push(w.surface);
                (w.phrases || []).forEach(ph => out.push(ph.en));
            });
            allSentences(l).forEach(s => out.push(s.text));
        });
        return out;
    }

    // ─── Playback ───────────────────────────────────────────
    function stopPlay() {
        playToken++;
        try { window.App?.stopSpeak?.(); } catch (e) {}
        if (root) {
            root.querySelectorAll('.ls-sent.playing').forEach(el => el.classList.remove('playing'));
            const btn = root.querySelector('#ls-play-all');
            if (btn) { btn.textContent = '\u25B6 \u64AD\u653E\u5168\u6587'; btn.dataset.playing = ''; }
        }
    }

    function speakAsync(text) {
        return new Promise(resolve => { speak(text, resolve); });
    }

    async function playSentences(sids) {
        if (!curLesson) return;
        stopPlay();
        const token = ++playToken;
        window.App?.beginSession?.();
        const btn = root.querySelector('#ls-play-all');
        if (btn && sids.length > 1) { btn.textContent = '\u23F9 \u505C\u6B62'; btn.dataset.playing = '1'; }
        let finishedAll = true;
        for (const sid of sids) {
            if (token !== playToken) { finishedAll = false; break; }
            const s  = sentenceById(curLesson, sid);
            const el = root.querySelector(`.ls-sent[data-sid="${sid}"]`);
            root.querySelectorAll('.ls-sent.playing').forEach(x => x.classList.remove('playing'));
            if (el) {
                el.classList.add('playing');
                try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
            }
            if (s) await speakAsync(s.text);
            if (token !== playToken) { finishedAll = false; break; }
        }
        window.App?.endSession?.();
        if (token !== playToken) return;
        root.querySelectorAll('.ls-sent.playing').forEach(x => x.classList.remove('playing'));
        if (btn) { btn.textContent = '\u25B6 \u64AD\u653E\u5168\u6587'; btn.dataset.playing = ''; }
        if (finishedAll && sids.length > 1) {
            bumpProgress(curLesson.id, { listened: true });
            try { window.DB?.markActiveDay?.(); } catch (e) {}
            toast('\u{1F389} \u542C\u8BFB\u5B8C\u6210\uFF01');
            renderHeaderProgress();
        }
    }

    // ─── Render: 课程列表 ───────────────────────────────────
    function renderHome() {
        stopPlay();
        curLesson = null;
        try { window.DB?.setPref?.('lesson_last', ''); } catch (e) {}
        const prog  = loadProgress();
        const cards = lessons().map(l => {
            const p     = prog[l.id] || {};
            const wordN = (l.words || []).length;
            const badges = [];
            if (p.listened)              badges.push('<span class="ls-badge ls-badge-done">\u542C\u8BFB \u2713</span>');
            if (p.clozeBest != null)     badges.push('<span class="ls-badge">\u586B\u7A7A\u6700\u4F73 ' + p.clozeBest + '%</span>');
            if (p.matchDone)             badges.push('<span class="ls-badge ls-badge-done">\u77ED\u8BED \u2713</span>');
            return `
            <button class="ls-card" data-lesson="${esc(l.id)}">
                <div class="ls-card-title">${esc(l.title)}</div>
                <div class="ls-card-sub">${esc(l.titleZh || '')} \u00b7 ${wordN} \u8BCD</div>
                <div class="ls-card-badges">${badges.join('') || '<span class="ls-badge ls-badge-empty">\u672A\u5F00\u59CB</span>'}</div>
            </button>`;
        }).join('');
        root.innerHTML = `
            <div class="ls-home">
                <div class="ls-home-title">\u8BFE\u6587\u7CBE\u8BFB</div>
                <div class="ls-home-sub">\u542C\u8BFB \u2192 \u70B9\u8BCD \u2192 \u586B\u7A7A \u2192 \u77ED\u8BED\uFF0C\u4E00\u8BFE\u56DB\u6B65\u5403\u900F\u8BFE\u6587\u8BCD\u6C47\u3002</div>
                <div class="ls-card-list">${cards || '<div class="ls-empty">\u6682\u65E0\u8BFE\u6587\u3002</div>'}</div>
            </div>`;
    }

    // ─── Render: 单课页框架 ─────────────────────────────────
    function openLesson(id, tab) {
        const l = lessonById(id);
        if (!l) { renderHome(); return; }
        stopPlay();
        curLesson  = l;
        curTab     = tab || 'read';
        clozeState = null;
        matchState = null;
        try { window.DB?.setPref?.('lesson_last', id); } catch (e) {}
        root.innerHTML = `
            <div class="ls-lesson">
                <div class="ls-head">
                    <button class="ls-back" id="ls-back">\u2190</button>
                    <div class="ls-head-text">
                        <div class="ls-head-title">${esc(l.title)}</div>
                        <div class="ls-head-sub">${esc(l.titleZh || '')}</div>
                    </div>
                    <div class="ls-head-prog" id="ls-head-prog"></div>
                </div>
                <div class="ls-tabs">
                    <button class="ls-tab" data-lstab="read">\u{1F4D6} \u8BFE\u6587</button>
                    <button class="ls-tab" data-lstab="cloze">\u270F\uFE0F \u586B\u7A7A</button>
                    <button class="ls-tab" data-lstab="phrases">\u{1F517} \u77ED\u8BED</button>
                </div>
                <div class="ls-panel" id="ls-panel"></div>
            </div>`;
        renderHeaderProgress();
        switchTab(curTab);
    }

    function renderHeaderProgress() {
        const el = root.querySelector('#ls-head-prog');
        if (!el || !curLesson) return;
        const p = loadProgress()[curLesson.id] || {};
        const bits = [];
        if (p.listened)          bits.push('\u542C\u2713');
        if (p.clozeBest != null) bits.push('\u586B ' + p.clozeBest + '%');
        if (p.matchDone)         bits.push('\u77ED\u2713');
        el.textContent = bits.join(' \u00b7 ');
    }

    function switchTab(tab) {
        stopPlay();
        curTab = tab;
        root.querySelectorAll('.ls-tab').forEach(t =>
            t.classList.toggle('active', t.dataset.lstab === tab));
        const panel = root.querySelector('#ls-panel');
        if (!panel || !curLesson) return;
        if (tab === 'read')         renderRead(panel);
        else if (tab === 'cloze')   renderClozeSetup(panel);
        else if (tab === 'phrases') renderPhrases(panel);
    }

    // ─── 课文 (听读 + 点词) ─────────────────────────────────
    // 句子内的蓝色词: 按该句关联的词条把 surface 首次出现包成
    // <span class="ls-word">。先整体转义再做纯文本替换 —— surface
    // 不含 HTML 特殊字符 (语料约定)，替换是安全的。
    function sentenceHtml(lesson, s) {
        let html  = esc(s.text);
        const ws  = (lesson.words || []).filter(w => w.sent === s.id);
        ws.forEach(w => {
            const surf = esc(w.surface);
            const idx  = html.indexOf(surf);
            if (idx < 0) return;
            html = html.slice(0, idx)
                 + `<span class="ls-word" data-wid="${esc(w.id)}">${surf}</span>`
                 + html.slice(idx + surf.length);
        });
        const hard = s.hard ? ' ls-hard' : '';
        const mark = s.hard ? '<span class="ls-hard-mark" title="\u96BE\u53E5">\u96BE</span>' : '';
        return `<span class="ls-sent${hard}" data-sid="${esc(s.id)}">${html}${mark}</span>`;
    }

    function renderRead(panel) {
        const l     = curLesson;
        const paras = (l.paras || []).map(p => {
            const inner = (p.sentences || []).map(s => sentenceHtml(l, s)).join(' ');
            return `<p class="ls-para">${inner}</p>`;
        }).join('');
        panel.innerHTML = `
            <div class="ls-read">
                <div class="ls-read-bar">
                    <button class="wl-btn-primary" id="ls-play-all">\u25B6 \u64AD\u653E\u5168\u6587</button>
                    <span class="ls-read-hint">\u70B9\u53E5\u5B50\u542C\u5355\u53E5 \u00b7 \u70B9\u84DD\u8272\u8BCD\u770B\u8BE6\u89E3</span>
                </div>
                <div class="ls-text">${paras}</div>
            </div>
            <div class="ls-sheet-overlay" id="ls-sheet-overlay">
                <div class="ls-sheet" id="ls-sheet"></div>
            </div>`;
    }

    function openWordSheet(w) {
        const overlay = root.querySelector('#ls-sheet-overlay');
        const sheet   = root.querySelector('#ls-sheet');
        if (!overlay || !sheet || !curLesson) return;
        const s       = sentenceById(curLesson, w.sent);
        const lemmaLn = (w.lemma.toLowerCase() !== w.surface.toLowerCase())
            ? `<div class="ls-sheet-lemma">\u539F\u578B: <b>${esc(w.lemma)}</b>\uFF08\u8BFE\u6587\u4E2D: ${esc(w.surface)}\uFF09</div>`
            : '';
        const phrases = (w.phrases || []).map((ph, i) => `
            <div class="ls-phrase-row">
                <button class="ls-mini-speak" data-say="${esc(ph.en)}">\u{1F50A}</button>
                <span class="ls-phrase-en">${esc(ph.en)}</span>
                <span class="ls-phrase-zh">${esc(ph.zh)}</span>
            </div>`).join('');
        sheet.innerHTML = `
            <div class="ls-sheet-head">
                <div class="ls-sheet-word">${esc(w.lemma)}
                    <button class="ls-mini-speak" data-say="${esc(w.surface)}">\u{1F50A}</button>
                </div>
                <button class="ls-sheet-close" id="ls-sheet-close">\u00d7</button>
            </div>
            ${lemmaLn}
            <div class="ls-sheet-pos">${esc(w.pos)}</div>
            <div class="ls-sheet-zh">${esc(w.zh)}</div>
            ${s ? `<div class="ls-sheet-sent">
                <button class="ls-mini-speak" data-say="${esc(s.text)}">\u{1F50A}</button>
                <span>${esc(s.text)}</span>
            </div>` : ''}
            ${phrases ? `<div class="ls-sheet-phrases-title">\u5E38\u7528\u642D\u914D</div>${phrases}` : ''}
            <button class="wl-btn-primary ls-sheet-add" data-addword="${esc(w.id)}">\u2795 \u52A0\u5165\u751F\u8BCD\u672C</button>`;
        overlay.classList.add('open');
    }

    function closeWordSheet() {
        root.querySelector('#ls-sheet-overlay')?.classList.remove('open');
    }

    function addWordToNotebook(w) {
        if (!window.DB?.upsertNotebookWord) { toast('\u751F\u8BCD\u672C\u4E0D\u53EF\u7528'); return; }
        const s  = sentenceById(curLesson, w.sent);
        const en = (w.phrases || []).map(p => p.en).join(' \u00b7 ');
        const cn = (w.phrases || []).map(p => p.zh).join(' \u00b7 ');
        window.DB.upsertNotebookWord({
            word    : w.lemma,
            meaning : w.zh,
            collo   : en,
            colloCn : cn,
            context : s ? s.text : '',
            source  : '\u8BFE\u6587 ' + curLesson.id + ' ' + curLesson.title,
            tags    : ['\u8BFE\u6587', curLesson.id]
        });
        window.App?.updateNotebookBadge?.();
        toast('\u{1F4D6} \u5DF2\u52A0\u5165\u751F\u8BCD\u672C: ' + w.lemma);
    }

    // ─── 填空 (选择 / 拼写) ─────────────────────────────────
    function renderClozeSetup(panel) {
        clozeState = null;
        const p    = loadProgress()[curLesson.id] || {};
        const best = (p.clozeBest != null) ? `\u5386\u53F2\u6700\u4F73: ${p.clozeBest}%` : '\u5C1A\u672A\u7EC3\u4E60';
        panel.innerHTML = `
            <div class="ls-cloze-setup">
                <div class="ls-setup-title">\u7528\u539F\u6587\u53E5\u5B50\u6316\u7A7A\u84DD\u8272\u8BCD\uFF0C\u5171 ${(curLesson.words || []).length} \u9898</div>
                <div class="ls-setup-sub">${best}</div>
                <div class="ls-setup-btns">
                    <button class="wl-btn-primary"   id="ls-cloze-choice">\u{1F520} \u9009\u62E9\u586B\u7A7A\uFF084 \u9009 1\uFF09</button>
                    <button class="wl-btn-secondary" id="ls-cloze-spell">\u2328\uFE0F \u62FC\u5199\u586B\u7A7A\uFF08\u952E\u5165\uFF09</button>
                </div>
                <label class="ls-setup-hintopt"><input type="checkbox" id="ls-cloze-hint" checked> \u62FC\u5199\u6A21\u5F0F\u663E\u793A\u9996\u5B57\u6BCD\u63D0\u793A</label>
            </div>`;
    }

    function startCloze(mode) {
        const hint = !!root.querySelector('#ls-cloze-hint')?.checked;
        clozeState = {
            mode    : mode,                                // choice | spell
            hint    : hint,
            queue   : shuffle((curLesson.words || []).slice()),
            idx     : 0,
            correct : 0,
            wrong   : []                                   // 答错的词对象
        };
        renderClozeQuestion();
    }

    // 词性重合优先的干扰项抽样。pos 形如 'n. / v.'，按词性标记求交集。
    function posTokens(pos) {
        return String(pos || '').split(/[\/\s]+/).filter(t => /\w/.test(t));
    }
    function pickDistractors(target, n) {
        const others = (curLesson.words || []).filter(w => w.id !== target.id);
        const tset   = new Set(posTokens(target.pos));
        const same   = others.filter(w => posTokens(w.pos).some(t => tset.has(t)));
        const rest   = others.filter(w => !same.includes(w));
        const pool   = shuffle(same).concat(shuffle(rest));
        return pool.slice(0, n);
    }

    function clozeSentenceHtml(w) {
        const s = sentenceById(curLesson, w.sent);
        if (!s) return '';
        let html = esc(s.text);
        const surf = esc(w.surface);
        const idx  = html.indexOf(surf);
        if (idx >= 0) {
            html = html.slice(0, idx)
                 + '<span class="ls-blank" id="ls-blank">______</span>'
                 + html.slice(idx + surf.length);
        }
        return html;
    }

    function renderClozeQuestion() {
        const st    = clozeState;
        const panel = root.querySelector('#ls-panel');
        if (!st || !panel) return;
        if (st.idx >= st.queue.length) { renderClozeResult(panel); return; }
        const w    = st.queue[st.idx];
        const prog = `${st.idx + 1} / ${st.queue.length}`;
        let body;
        if (st.mode === 'choice') {
            // 选项统一小写: 句首词形 (Race / As a result) 保留原大小写
            // 会因首字母大写直接暴露答案。
            const opts = shuffle([w].concat(pickDistractors(w, 3)))
                .map(o => `<button class="ls-opt" data-opt="${esc(o.id)}">${esc(o.surface.toLowerCase())}</button>`)
                .join('');
            body = `<div class="ls-opts">${opts}</div>`;
        } else {
            const hint = st.hint
                ? `<span class="ls-spell-hint">\u9996\u5B57\u6BCD: <b>${esc(w.surface.charAt(0))}</b></span>`
                : '';
            body = `
                <div class="ls-spell-row">
                    <input type="text" class="ls-spell-input" id="ls-spell-input"
                           placeholder="\u8F93\u5165\u7B54\u6848\u540E\u56DE\u8F66" autocomplete="off"
                           autocapitalize="off" spellcheck="false">
                    <button class="wl-btn-primary" id="ls-spell-submit">\u786E\u5B9A</button>
                </div>
                <div class="ls-spell-meta">${hint}<span class="ls-spell-zh">${esc(w.zh)}</span></div>`;
        }
        panel.innerHTML = `
            <div class="ls-cloze">
                <div class="ls-cloze-top">
                    <span class="ls-cloze-prog">${prog}</span>
                    <button class="ls-cloze-quit" id="ls-cloze-quit">\u9000\u51FA</button>
                </div>
                <div class="ls-cloze-sent">${clozeSentenceHtml(w)}</div>
                ${body}
                <div class="ls-cloze-feedback" id="ls-cloze-feedback"></div>
            </div>`;
        const inp = panel.querySelector('#ls-spell-input');
        if (inp) {
            inp.focus();
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); submitSpell(); }
            });
        }
    }

    function gradeCloze(isCorrect, w) {
        const st = clozeState;
        if (isCorrect) st.correct++;
        else           st.wrong.push(w);
        try { window.DB?.bumpDaily?.({ quizTotal: 1, quizCorrect: isCorrect ? 1 : 0 }); }
        catch (e) {}
        const fb = root.querySelector('#ls-cloze-feedback');
        if (fb) {
            fb.innerHTML = (isCorrect
                ? `<span class="ls-fb-ok">\u2713 \u6B63\u786E</span>`
                : `<span class="ls-fb-bad">\u2717 \u6B63\u786E\u7B54\u6848: <b>${esc(w.surface)}</b></span>`)
                + ` <span class="ls-fb-zh">${esc(w.zh)}</span>`
                + ` <button class="wl-btn-primary ls-fb-next" id="ls-cloze-next">\u4E0B\u4E00\u9898 \u2192</button>`;
        }
        const blank = root.querySelector('#ls-blank');
        if (blank) {
            blank.textContent = w.surface;
            blank.classList.add(isCorrect ? 'ok' : 'bad');
        }
        speak(w.surface);
    }

    function submitChoice(optId) {
        const st = clozeState;
        const w  = st.queue[st.idx];
        const ok = optId === w.id;
        root.querySelectorAll('.ls-opt').forEach(b => {
            b.disabled = true;
            if (b.dataset.opt === w.id) b.classList.add('ok');
            else if (b.dataset.opt === optId) b.classList.add('bad');
        });
        gradeCloze(ok, w);
    }

    function submitSpell() {
        const st  = clozeState;
        const w   = st.queue[st.idx];
        const inp = root.querySelector('#ls-spell-input');
        if (!inp || inp.disabled) return;
        const val = String(inp.value || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const ans = w.surface.trim().toLowerCase().replace(/\s+/g, ' ');
        inp.disabled = true;
        const btn = root.querySelector('#ls-spell-submit');
        if (btn) btn.disabled = true;
        gradeCloze(val === ans, w);
    }

    function renderClozeResult(panel) {
        const st    = clozeState;
        const total = st.queue.length;
        const pct   = total ? Math.round(st.correct * 100 / total) : 0;
        const prev  = loadProgress()[curLesson.id] || {};
        const best  = Math.max(pct, prev.clozeBest || 0);
        bumpProgress(curLesson.id, { clozeBest: best, clozeRuns: (prev.clozeRuns || 0) + 1 });
        renderHeaderProgress();
        const wrongRows = st.wrong.map(w => `
            <div class="ls-wrong-row">
                <button class="ls-mini-speak" data-say="${esc(w.surface)}">\u{1F50A}</button>
                <span class="ls-wrong-en">${esc(w.surface)}</span>
                <span class="ls-wrong-zh">${esc(w.zh)}</span>
            </div>`).join('');
        panel.innerHTML = `
            <div class="ls-result">
                <div class="ls-result-score">${pct}%</div>
                <div class="ls-result-sub">${st.correct} / ${total} \u9898\u6B63\u786E${pct >= best && pct > 0 ? ' \u00b7 \u65B0\u7EAA\u5F55\uFF01' : ''}</div>
                ${st.wrong.length ? `
                    <div class="ls-result-wrong-title">\u9519\u8BCD ${st.wrong.length} \u4E2A</div>
                    <div class="ls-wrong-list">${wrongRows}</div>
                    <button class="wl-btn-primary" id="ls-wrong-add">\u{1F4D6} \u9519\u8BCD\u52A0\u5165\u751F\u8BCD\u672C</button>`
                  : '<div class="ls-result-perfect">\u{1F3C6} \u5168\u5BF9\uFF0C\u6EE1\u5206\u901A\u5173\uFF01</div>'}
                <div class="ls-result-btns">
                    <button class="wl-btn-secondary" id="ls-cloze-again">\u{1F504} \u518D\u7EC3\u4E00\u8F6E</button>
                    <button class="wl-btn-secondary" id="ls-cloze-back">\u8FD4\u56DE</button>
                </div>
            </div>`;
    }

    function addWrongToNotebook() {
        const st = clozeState;
        if (!st || !st.wrong.length) return;
        st.wrong.forEach(w => addWordToNotebook(w));
        toast('\u{1F4D6} ' + st.wrong.length + ' \u4E2A\u9519\u8BCD\u5DF2\u52A0\u5165\u751F\u8BCD\u672C');
        const btn = root.querySelector('#ls-wrong-add');
        if (btn) { btn.disabled = true; btn.textContent = '\u2713 \u5DF2\u52A0\u5165'; }
    }

    // ─── 短语 (浏览 + 中英匹配) ─────────────────────────────
    function lessonPhrases() {
        const out = [];
        (curLesson.words || []).forEach(w =>
            (w.phrases || []).forEach(ph => out.push({ en: ph.en, zh: ph.zh })));
        return out;
    }

    function renderPhrases(panel) {
        matchState = null;
        const rows = (curLesson.words || []).map(w => {
            const phs = (w.phrases || []).map(ph => `
                <div class="ls-phrase-row">
                    <button class="ls-mini-speak" data-say="${esc(ph.en)}">\u{1F50A}</button>
                    <span class="ls-phrase-en">${esc(ph.en)}</span>
                    <span class="ls-phrase-zh">${esc(ph.zh)}</span>
                </div>`).join('');
            if (!phs) return '';
            return `<div class="ls-phrase-group">
                <div class="ls-phrase-word">${esc(w.lemma)} <span class="ls-phrase-wzh">${esc(w.zh)}</span></div>
                ${phs}
            </div>`;
        }).join('');
        panel.innerHTML = `
            <div class="ls-phrases">
                <div class="ls-read-bar">
                    <button class="wl-btn-primary" id="ls-match-start">\u{1F3AE} \u4E2D\u82F1\u5339\u914D\u7EC3\u4E60</button>
                    <span class="ls-read-hint">\u5148\u6D4F\u89C8\u719F\u6089\uFF0C\u518D\u5339\u914D\u68C0\u9A8C</span>
                </div>
                <div class="ls-phrase-list">${rows}</div>
            </div>`;
    }

    const MATCH_ROUND_SIZE = 5;

    function startMatch() {
        const pairs = shuffle(lessonPhrases());
        if (pairs.length < 2) { toast('\u77ED\u8BED\u592A\u5C11\uFF0C\u65E0\u6CD5\u5339\u914D'); return; }
        matchState = {
            remaining : pairs,
            round     : [],
            selEn     : null,
            selZh     : null,
            matched   : 0,
            total     : pairs.length
        };
        nextMatchRound();
    }

    function nextMatchRound() {
        const st = matchState;
        if (!st) return;
        if (!st.remaining.length) { renderMatchDone(); return; }
        st.round = st.remaining.splice(0, MATCH_ROUND_SIZE);
        st.selEn = null;
        st.selZh = null;
        renderMatchRound();
    }

    function renderMatchRound() {
        const st    = matchState;
        const panel = root.querySelector('#ls-panel');
        if (!st || !panel) return;
        const ens = st.round.map((p, i) =>
            `<button class="ls-match-item" data-men="${i}">${esc(p.en)}</button>`).join('');
        const zhs = shuffle(st.round.map((p, i) => ({ i: i, zh: p.zh }))).map(o =>
            `<button class="ls-match-item" data-mzh="${o.i}">${esc(o.zh)}</button>`).join('');
        panel.innerHTML = `
            <div class="ls-match">
                <div class="ls-cloze-top">
                    <span class="ls-cloze-prog">\u5DF2\u5339\u914D ${st.matched} / ${st.total}</span>
                    <button class="ls-cloze-quit" id="ls-match-quit">\u9000\u51FA</button>
                </div>
                <div class="ls-match-cols">
                    <div class="ls-match-col">${ens}</div>
                    <div class="ls-match-col">${zhs}</div>
                </div>
            </div>`;
    }

    function pickMatch(kind, idx, btn) {
        const st = matchState;
        if (!st || btn.classList.contains('done')) return;
        const col = kind === 'en' ? 'selEn' : 'selZh';
        // 再点同一个 = 取消选择
        if (st[col] === idx) {
            st[col] = null;
            btn.classList.remove('sel');
            return;
        }
        st[col] = idx;
        root.querySelectorAll(`.ls-match-item[data-m${kind}]`)
            .forEach(b => b.classList.remove('sel'));
        btn.classList.add('sel');
        if (st.selEn == null || st.selZh == null) return;

        const enBtn = root.querySelector(`.ls-match-item[data-men="${st.selEn}"]`);
        const zhBtn = root.querySelector(`.ls-match-item[data-mzh="${st.selZh}"]`);
        if (st.selEn === st.selZh) {
            st.matched++;
            [enBtn, zhBtn].forEach(b => { b.classList.remove('sel'); b.classList.add('done'); b.disabled = true; });
            speak(st.round[st.selEn].en);
            st.selEn = null;
            st.selZh = null;
            const prog = root.querySelector('.ls-cloze-prog');
            if (prog) prog.textContent = `\u5DF2\u5339\u914D ${st.matched} / ${st.total}`;
            const left = root.querySelectorAll('.ls-match-item[data-men]:not(.done)').length;
            if (!left) setTimeout(nextMatchRound, 500);
        } else {
            [enBtn, zhBtn].forEach(b => b.classList.add('miss'));
            setTimeout(() => {
                [enBtn, zhBtn].forEach(b => b && b.classList.remove('miss', 'sel'));
            }, 450);
            st.selEn = null;
            st.selZh = null;
        }
    }

    function renderMatchDone() {
        const panel = root.querySelector('#ls-panel');
        if (!panel) return;
        bumpProgress(curLesson.id, { matchDone: true });
        renderHeaderProgress();
        try { window.DB?.markActiveDay?.(); } catch (e) {}
        panel.innerHTML = `
            <div class="ls-result">
                <div class="ls-result-score">\u{1F389}</div>
                <div class="ls-result-sub">${matchState.total} \u5BF9\u77ED\u8BED\u5168\u90E8\u5339\u914D\u5B8C\u6210\uFF01</div>
                <div class="ls-result-btns">
                    <button class="wl-btn-secondary" id="ls-match-again">\u{1F504} \u518D\u6765\u4E00\u8F6E</button>
                    <button class="wl-btn-secondary" id="ls-match-back">\u8FD4\u56DE\u77ED\u8BED\u5217\u8868</button>
                </div>
            </div>`;
        matchState = null;
    }

    // ─── Events (单一委托监听，root 内所有交互都走这里) ─────
    function onClick(e) {
        const t = e.target;

        // 通用: 任何带 data-say 的小喇叭
        const sayBtn = t.closest('[data-say]');
        if (sayBtn) { e.stopPropagation(); speak(sayBtn.dataset.say); return; }

        // 课程列表
        const card = t.closest('.ls-card');
        if (card) { openLesson(card.dataset.lesson); return; }

        // 课内导航
        if (t.closest('#ls-back'))  { renderHome(); return; }
        const tab = t.closest('.ls-tab');
        if (tab) { switchTab(tab.dataset.lstab); return; }

        // 课文: 点词 / 点句 / 播放全文 / 弹层
        const wordEl = t.closest('.ls-word');
        if (wordEl) {
            e.stopPropagation();
            stopPlay();   // 中断整篇播放链，防止与词卡发音重叠
            const w = wordById(curLesson, wordEl.dataset.wid);
            if (w) { speak(w.surface); openWordSheet(w); }
            return;
        }
        const sentEl = t.closest('.ls-sent');
        if (sentEl) { playSentences([sentEl.dataset.sid]); return; }
        const playAll = t.closest('#ls-play-all');
        if (playAll) {
            if (playAll.dataset.playing) stopPlay();
            else playSentences(allSentences(curLesson).map(s => s.id));
            return;
        }
        if (t.closest('#ls-sheet-close')) { closeWordSheet(); return; }
        const addBtn = t.closest('[data-addword]');
        if (addBtn) {
            const w = wordById(curLesson, addBtn.dataset.addword);
            if (w) addWordToNotebook(w);
            closeWordSheet();
            return;
        }
        const overlay = t.closest('#ls-sheet-overlay');
        if (overlay && t === overlay) { closeWordSheet(); return; }

        // 填空
        if (t.closest('#ls-cloze-choice')) { startCloze('choice'); return; }
        if (t.closest('#ls-cloze-spell'))  { startCloze('spell');  return; }
        if (t.closest('#ls-cloze-quit'))   { switchTab('cloze');   return; }
        const opt = t.closest('.ls-opt');
        if (opt && !opt.disabled) { submitChoice(opt.dataset.opt); return; }
        if (t.closest('#ls-spell-submit')) { submitSpell(); return; }
        if (t.closest('#ls-cloze-next'))   { clozeState.idx++; renderClozeQuestion(); return; }
        if (t.closest('#ls-wrong-add'))    { addWrongToNotebook(); return; }
        if (t.closest('#ls-cloze-again'))  { startCloze(clozeState.mode); return; }
        if (t.closest('#ls-cloze-back'))   { switchTab('cloze'); return; }

        // 短语匹配
        if (t.closest('#ls-match-start')) { startMatch(); return; }
        if (t.closest('#ls-match-quit') || t.closest('#ls-match-back')) { switchTab('phrases'); return; }
        if (t.closest('#ls-match-again')) { startMatch(); return; }
        const mEn = t.closest('.ls-match-item[data-men]');
        if (mEn) { pickMatch('en', Number(mEn.dataset.men), mEn); return; }
        const mZh = t.closest('.ls-match-item[data-mzh]');
        if (mZh) { pickMatch('zh', Number(mZh.dataset.mzh), mZh); return; }
    }

    // ─── Init ───────────────────────────────────────────────
    function init() {
        root = document.getElementById('ls-root');
        if (!root) return;
        root.addEventListener('click', onClick);
        // 记住上次打开的课 —— 同步重载/刷新后回到原处
        const last = window.DB?.getPref?.('lesson_last', '');
        if (last && lessonById(last)) openLesson(last);
        else renderHome();
    }

    return {
        init          : init,
        stopPlay      : stopPlay,
        speechEntries : speechEntries
    };
})();
