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
    let curLesson   = null;   // 当前课对象 (null = 课程列表页或综合练习)
    let curTab      = 'read'; // read | cloze | phrases | mixed
    let playToken   = 0;      // 递增令牌: 任何一次新播放/停止都使旧链失效
    let clozeState  = null;   // 进行中的填空测验 (kind: lesson | mixed)
    let matchState  = null;   // 进行中的短语匹配 (kind: lesson | mixed)
    let mixedKind   = null;   // 综合练习页当前类型: cloze | match

    // ─── Helpers ────────────────────────────────────────────
    function esc(s) {
        if (window.App && window.App.escHtml) return window.App.escHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function toast(msg) { window.App?.showToast?.(msg); }
    function speak(text, onEnd) { window.App?.speak?.(text, null, onEnd); }

    // 语料合并层: 内置课 (lessons-data.js, ID 前缀 L, 只读) +
    // 用户导入课 (DB 'lessons_user' 键, ID 前缀 U, 可删除)。
    // 不做缓存 —— 同步拉取会整体替换 localStorage, 每次现读保证一致,
    // 几十 KB 的 JSON.parse 在交互路径上开销可忽略。
    function builtinLessons() { return Array.isArray(window.HSV_LESSONS) ? window.HSV_LESSONS : []; }
    function userLessons()    { return window.DB?.loadUserLessons?.() || []; }
    function lessons()        { return builtinLessons().concat(userLessons()); }
    function isUserLesson(id) { return /^U\d+$/.test(String(id || '')); }
    function lessonById(id)   { return lessons().find(l => l.id === id) || null; }

    // Fisher-Yates —— 全模块唯一的洗牌实现，禁止 sort(random) 偏差写法。
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // Sattolo 单圈置换: j 严格小于 i, 产生零不动点的错位排列。
    // 匹配练习的中文列必须用它 —— 普通洗牌平均留 1 个不动点,
    // 首行对首行 20% 概率直接命中, 用户会感觉「根本没打乱」。
    function sattolo(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * i);
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // 词边界查找: 返回 needle 作为完整词/短语在 hay 中出现的下标,
    // 找不到返回 -1。裸 indexOf 会命中子串 ("run" 匹配进 "runners",
    // "runners" 匹配进 "non-runners"), 挖空和高亮位置就会错到别的
    // 词中间。相邻字符是字母/数字/连字符即视为词内, 继续向后找。
    function isWordChar(ch) { return /[A-Za-z0-9-]/.test(ch || ''); }
    function findWordStart(hay, needle) {
        if (!needle) return -1;
        let from = 0;
        for (;;) {
            const i = hay.indexOf(needle, from);
            if (i < 0) return -1;
            const before = i > 0 ? hay[i - 1] : '';
            const after  = hay[i + needle.length] || '';
            if (!isWordChar(before) && !isWordChar(after)) return i;
            from = i + 1;
        }
    }

    // 每组题量 (设置 → 学习 → 课文练习每组题量): 0 = 不分组。
    // 长课词条五六十个, 一口气做不完就前功尽弃 —— 按组切分,
    // 每组结束是一个自然的休息点。
    function getLessonGroupSize() {
        const n = parseInt(window.DB?.getPref?.('lesson_group_size', '30'), 10);
        return (isNaN(n) || n < 0) ? 30 : n;
    }

    // 把题目切成若干组: 剩余不足 1.5 组时并作一组收尾, 避免出现
    // 只有三五题的碎尾组 (47 题按 30 切成 [30, 17], 31 题不切)。
    function chunkGroups(items, size) {
        if (!size || items.length <= size * 1.5) return [items.slice()];
        const groups = [];
        let rest = items.slice();
        while (rest.length > size * 1.5) {
            groups.push(rest.slice(0, size));
            rest = rest.slice(size);
        }
        if (rest.length) groups.push(rest);
        return groups;
    }

    // ─── 练习档案 (DB pref 'lesson_mixed') ──────────────────
    // 覆盖全部课程的词条/短语练习记录, 单课练习与综合练习共写:
    //   w: { 词条ID: [练过次数, 错误次数, 最近时间, 最近一次是否对] }
    //   p: { 词条ID|短语en: 同上 }
    // 综合练习按它选题: 上次做错的 → 没练过的 → 最久没练的。
    function loadPracRec() {
        try {
            const r = JSON.parse(window.DB?.getPref?.('lesson_mixed', '{}') || '{}') || {};
            if (!r.w || typeof r.w !== 'object') r.w = {};
            if (!r.p || typeof r.p !== 'object') r.p = {};
            return r;
        } catch (e) { return { w: {}, p: {} }; }
    }
    function savePracRec(r) {
        try { window.DB?.setPref?.('lesson_mixed', JSON.stringify(r)); } catch (e) {}
    }
    function bumpPracRec(kind, key, ok) {
        const r   = loadPracRec();
        const map = kind === 'p' ? r.p : r.w;
        const e   = map[key] || [0, 0, 0, 1];
        e[0] += 1;
        if (!ok) e[1] += 1;
        e[2] = Date.now();
        e[3] = ok ? 1 : 0;
        map[key] = e;
        savePracRec(r);
    }

    // ─── 综合练习: 全课程题池与智能选题 ─────────────────────
    function mixedWordPool() {
        const out = [];
        lessons().forEach(l => (l.words || []).forEach(w =>
            out.push(Object.assign({}, w, { _lesson: l }))));
        return out;
    }
    function mixedPhrasePool() {
        const out = [];
        lessons().forEach(l => (l.words || []).forEach(w =>
            (w.phrases || []).forEach(ph => out.push({
                en: ph.en, zh: ph.zh, key: w.id + '|' + ph.en, word: w, _lesson: l
            }))));
        return out;
    }
    // 智能选一组: 上次做错的最优先 (错得多的在前), 其次没练过的,
    // 最后按最久没练排; 截取一组后打乱出题顺序。
    function pickSmartGroup(pool, recMap, size, keyOf) {
        const wrong = [], fresh = [], seen = [];
        pool.forEach(it => {
            const e = recMap[keyOf(it)];
            if (!e || !e[0]) fresh.push(it);
            else if (!e[3])  wrong.push({ it: it, e: e });
            else             seen.push({ it: it, e: e });
        });
        wrong.sort((a, b) => (b.e[1] - a.e[1]) || (a.e[2] - b.e[2]));
        seen.sort((a, b) => a.e[2] - b.e[2]);
        const ordered = wrong.map(x => x.it)
            .concat(shuffle(fresh))
            .concat(seen.map(x => x.it));
        return shuffle(ordered.slice(0, size || ordered.length));
    }
    function mixedStats() {
        const rec = loadPracRec();
        const cnt = (pool, map, keyOf) => {
            let seen = 0, wrong = 0;
            pool.forEach(it => {
                const e = map[keyOf(it)];
                if (e && e[0]) { seen++; if (!e[3]) wrong++; }
            });
            return { total: pool.length, seen: seen, wrong: wrong };
        };
        return {
            w: cnt(mixedWordPool(),   rec.w, it => it.id),
            p: cnt(mixedPhrasePool(), rec.p, it => it.key)
        };
    }

    // ─── SVG 图标 (粗描边, 替代细箭头字符) ──────────────────
    // 字符箭头 (← →) 线条过细且各系统字体渲染不一; 内联 SVG 用
    // 2.6px 描边 + 圆头, 视觉重量与按钮匹配。
    const ICON_PREV = '<svg class="ls-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
    const ICON_NEXT = '<svg class="ls-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>';
    const ICON_BACK = '<svg class="ls-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';

    // ─── 练习会话持久化 (DB pref 'lesson_sess') ─────────────
    // 进行中的填空/匹配会话按课持久化, 关掉应用再回来能接着做,
    // 也能直接跳进任意一组 —— 解决「中途停就前功尽弃」和
    // 「第一二组无法切换」。结构 (压缩存储):
    //   { 课ID或__mixed: { c: 填空会话, m: 匹配会话 } }
    //   填空: { mode, hint, g:[[词条ID..]..], gi, idx, o:选项序, a:{id:[对,细节]}, ts }
    //   匹配: { g:[[短语key..]..], gi, done:[key..], miss:{key:n}, missKeys:[..], ts }
    // 整卷/全部完成时清除; 词条按 ID 还原, 课被删则条目自动失效。
    function sessKey() { return curLesson ? curLesson.id : '__mixed'; }
    function loadSessStore() {
        try { return JSON.parse(window.DB?.getPref?.('lesson_sess', '{}') || '{}') || {}; }
        catch (e) { return {}; }
    }
    function saveSessStore(s) {
        try { window.DB?.setPref?.('lesson_sess', JSON.stringify(s)); } catch (e) {}
    }
    function getSess(slot) {
        const e = loadSessStore()[sessKey()];
        return (e && e[slot]) || null;
    }
    function putSess(slot, data) {
        const s = loadSessStore();
        const k = sessKey();
        (s[k] = s[k] || {})[slot] = data;
        saveSessStore(s);
    }
    function clearSess(slot) {
        const s = loadSessStore();
        const k = sessKey();
        if (!s[k]) return;
        delete s[k][slot];
        if (!Object.keys(s[k]).length) delete s[k];
        saveSessStore(s);
    }

    function persistClozeSess() {
        const st = clozeState;
        if (!st) return;
        const a = {};
        Object.keys(st.answers).forEach(id => {
            const x = st.answers[id];
            a[id] = [x.ok ? 1 : 0,
                     x.pickedId != null ? x.pickedId : (x.typed != null ? x.typed : null)];
        });
        putSess('c', {
            mode : st.mode,
            hint : st.hint ? 1 : 0,
            g    : st.groups.map(g => g.map(w => w.id)),
            gi   : st.gi,
            idx  : st.idx,
            o    : st.opts,
            a    : a,
            ts   : Date.now()
        });
    }

    function persistMatchSess() {
        const st = matchState;
        if (!st) return;
        putSess('m', {
            g        : st.groups.map(g => g.map(p => p.key)),
            gi       : st.gi,
            done     : Array.from(st.doneSet || []),
            miss     : st.misses || {},
            missKeys : Object.keys(st.missLog || {}),
            ts       : Date.now()
        });
    }

    function allSentences(lesson) {
        const out = [];
        (lesson.paras || []).forEach(p => (p.sentences || []).forEach(s => out.push(s)));
        return out;
    }
    function sentenceById(lesson, sid) {
        return allSentences(lesson).find(s => s.id === sid) || null;
    }
    function paraById(lesson, pid) {
        return (lesson.paras || []).find(p => p.id === pid) || null;
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
        curLesson  = null;
        curTab     = 'read';
        clozeState = null;      // 卫生清理: 离开练习页时挂起的状态一律作废
        matchState = null;
        mixedKind  = null;
        try { window.DB?.setPref?.('lesson_last', ''); } catch (e) {}
        const prog  = loadProgress();
        const cards = lessons().map(l => {
            const p     = prog[l.id] || {};
            const wordN = (l.words || []).length;
            const badges = [];
            if (p.listened)              badges.push('<span class="ls-badge ls-badge-done">\u542C\u8BFB \u2713</span>');
            if (p.clozeBest != null)     badges.push('<span class="ls-badge">\u586B\u7A7A\u6700\u4F73 ' + p.clozeBest + '%</span>');
            if (p.matchDone)             badges.push('<span class="ls-badge ls-badge-done">\u77ED\u8BED \u2713</span>');
            const del = isUserLesson(l.id)
                ? `<button class="ls-card-del" data-del="${esc(l.id)}" title="\u5220\u9664\u8FD9\u8BFE">\u00d7</button>`
                : '';
            return `
            <div class="ls-card" data-lesson="${esc(l.id)}">
                ${del}
                <div class="ls-card-title">${esc(l.title)}</div>
                <div class="ls-card-meta">
                    <span class="ls-card-sub">${esc(l.titleZh || '')} \u00b7 ${wordN} \u8BCD</span>
                    ${badges.join('') || '<span class="ls-badge ls-badge-empty">\u672A\u5F00\u59CB</span>'}
                </div>
            </div>`;
        }).join('');
        // 综合练习入口: 跨全部课程抽题, 优先重现做错的与没练过的。
        const ms    = mixedStats();
        const mixed = (ms.w.total || ms.p.total) ? `
            <div class="ls-mixed-card">
                <div class="ls-mixed-title">\u{1F4CA} \u7EFC\u5408\u7EC3\u4E60<span class="ls-mixed-tag">\u5168\u90E8\u8BFE\u7A0B</span></div>
                <div class="ls-mixed-stat">\u8BCD\u6C47 \u5DF2\u7EC3 ${ms.w.seen}/${ms.w.total}\uFF0C\u5F85\u5F3A\u5316 ${ms.w.wrong}
                    \u00b7 \u77ED\u8BED \u5DF2\u7EC3 ${ms.p.seen}/${ms.p.total}\uFF0C\u5F85\u5F3A\u5316 ${ms.p.wrong}</div>
                <div class="ls-mixed-btns">
                    <button class="wl-btn-primary"   id="ls-mixed-cloze">\u270F\uFE0F \u7EFC\u5408\u586B\u7A7A</button>
                    <button class="wl-btn-secondary" id="ls-mixed-match">\u{1F517} \u7EFC\u5408\u77ED\u8BED</button>
                </div>
            </div>` : '';
        root.innerHTML = `
            <div class="ls-home">
                <div class="ls-home-head">
                    <div>
                        <div class="ls-home-title">\u8BFE\u6587\u7CBE\u8BFB</div>
                        <div class="ls-home-sub">\u542C\u8BFB \u2192 \u70B9\u8BCD \u2192 \u586B\u7A7A \u2192 \u77ED\u8BED\uFF0C\u4E00\u8BFE\u56DB\u6B65\u5403\u900F\u8BFE\u6587\u8BCD\u6C47\u3002</div>
                    </div>
                    <button class="wl-btn-secondary ls-import-btn" id="ls-import-open">\uFF0B \u5BFC\u5165\u8BFE\u6587</button>
                </div>
                ${mixed}
                <div class="ls-card-list">${cards || '<div class="ls-empty">\u6682\u65E0\u8BFE\u6587\u3002</div>'}</div>
            </div>
            <div class="ls-sheet-overlay" id="ls-import-overlay">
                <div class="ls-sheet ls-import-sheet" id="ls-import-sheet"></div>
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
        mixedKind  = null;
        try { window.DB?.setPref?.('lesson_last', id); } catch (e) {}
        root.innerHTML = `
            <div class="ls-lesson">
                <div class="ls-head">
                    <button class="ls-back" id="ls-back" title="\u5168\u90E8\u8BFE\u6587">${ICON_BACK}</button>
                    <div class="ls-head-text">
                        <button class="ls-head-switch" id="ls-lesson-switch" title="\u5207\u6362\u8BFE\u6587">
                            <span class="ls-head-title">${esc(l.title)}</span>
                            <span class="ls-switch-caret">\u25BE</span>
                        </button>
                        <div class="ls-head-sub">${esc(l.titleZh || '')}</div>
                    </div>
                    <div class="ls-head-prog" id="ls-head-prog"></div>
                </div>
                <div class="ls-switch-menu" id="ls-switch-menu">${switchMenuHtml(l.id)}</div>
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

    // ─── Render: 综合练习页 (跨全部课程) ───────────────────
    // 与单课页共用 #ls-panel 与全部练习渲染函数; curLesson 置空,
    // 题目自带 _lesson 引用, 渲染时按题取所属课文。
    function openMixed(kind) {
        stopPlay();
        curLesson  = null;
        curTab     = 'mixed';
        mixedKind  = kind;                 // cloze | match
        clozeState = null;
        matchState = null;
        const title = kind === 'match' ? '\u7EFC\u5408\u77ED\u8BED\u5339\u914D' : '\u7EFC\u5408\u586B\u7A7A';
        root.innerHTML = `
            <div class="ls-lesson">
                <div class="ls-head">
                    <button class="ls-back" id="ls-back" title="\u5168\u90E8\u8BFE\u6587">${ICON_BACK}</button>
                    <div class="ls-head-text">
                        <div class="ls-head-title">\u{1F4CA} ${title}</div>
                        <div class="ls-head-sub">\u4ECE\u5168\u90E8\u8BFE\u7A0B\u62BD\u9898 \u00b7 \u9519\u8FC7\u7684\u4F18\u5148\u91CD\u73B0</div>
                    </div>
                    <div class="ls-head-prog"></div>
                </div>
                <div class="ls-panel" id="ls-panel"></div>
            </div>`;
        renderMixedSetupPanel();
    }

    function renderMixedSetupPanel() {
        const panel = root.querySelector('#ls-panel');
        if (!panel) return;
        clozeState = null;
        matchState = null;
        const ms   = mixedStats();
        const size = getLessonGroupSize() || 30;
        if (mixedKind === 'match') {
            const s = ms.p;
            panel.innerHTML = `
                <div class="ls-cloze-setup">
                    ${matchResumeHtml()}
                    <div class="ls-setup-title">\u4ECE\u5168\u90E8\u8BFE\u7A0B\u7684 ${s.total} \u5BF9\u77ED\u8BED\u91CC\u62BD ${Math.min(size, s.total)} \u5BF9\u7EC3\u4E00\u7EC4</div>
                    <div class="ls-setup-sub">\u5DF2\u7EC3 ${s.seen} \u5BF9 \u00b7 \u5F85\u5F3A\u5316 ${s.wrong} \u5BF9 \u00b7 \u672A\u7EC3 ${s.total - s.seen} \u5BF9</div>
                    <div class="ls-setup-btns">
                        <button class="wl-btn-primary" id="ls-match-start">\u{1F3AE} \u5F00\u59CB\u5339\u914D</button>
                    </div>
                    <div class="ls-setup-note">\u9009\u9898\u987A\u5E8F: \u4E0A\u6B21\u9519\u8FC7\u7684 \u2192 \u8FD8\u6CA1\u7EC3\u8FC7\u7684 \u2192 \u6700\u4E45\u6CA1\u7EC3\u7684\u3002\u6BCF\u7EC4\u9898\u91CF\u5728\u8BBE\u7F6E \u2192 \u5B66\u4E60\u91CC\u6539\u3002</div>
                </div>`;
        } else {
            const s = ms.w;
            panel.innerHTML = `
                <div class="ls-cloze-setup">
                    ${clozeResumeHtml()}
                    <div class="ls-setup-title">\u4ECE\u5168\u90E8\u8BFE\u7A0B\u7684 ${s.total} \u4E2A\u8BCD\u91CC\u62BD ${Math.min(size, s.total)} \u9898\u7EC3\u4E00\u7EC4</div>
                    <div class="ls-setup-sub">\u5DF2\u7EC3 ${s.seen} \u8BCD \u00b7 \u5F85\u5F3A\u5316 ${s.wrong} \u8BCD \u00b7 \u672A\u7EC3 ${s.total - s.seen} \u8BCD</div>
                    <div class="ls-setup-btns">
                        <button class="wl-btn-primary"   id="ls-cloze-choice">\u{1F520} \u9009\u62E9\u586B\u7A7A\uFF084 \u9009 1\uFF09</button>
                        <button class="wl-btn-secondary" id="ls-cloze-spell">\u2328\uFE0F \u62FC\u5199\u586B\u7A7A\uFF08\u952E\u5165\uFF09</button>
                    </div>
                    <label class="ls-setup-hintopt"><input type="checkbox" id="ls-cloze-hint" checked> \u62FC\u5199\u6A21\u5F0F\u663E\u793A\u9996\u5B57\u6BCD\u63D0\u793A</label>
                    <div class="ls-setup-note">\u9009\u9898\u987A\u5E8F: \u4E0A\u6B21\u505A\u9519\u7684 \u2192 \u8FD8\u6CA1\u7EC3\u8FC7\u7684 \u2192 \u6700\u4E45\u6CA1\u7EC3\u7684\u3002\u6BCF\u7EC4\u9898\u91CF\u5728\u8BBE\u7F6E \u2192 \u5B66\u4E60\u91CC\u6539\u3002</div>
                </div>`;
        }
    }

    // 课程切换下拉: 课内页点标题展开, 点选切课并保持当前学习步骤。
    function switchMenuHtml(currentId) {
        return lessons().map(l => {
            const cur = l.id === currentId;
            return `<button class="ls-switch-item${cur ? ' cur' : ''}" data-switch="${esc(l.id)}">
                <span class="ls-switch-en">${esc(l.title)}</span>
                <span class="ls-switch-meta">${esc(l.titleZh || '')} \u00b7 ${(l.words || []).length} \u8BCD${cur ? ' \u00b7 \u5F53\u524D' : ''}</span>
            </button>`;
        }).join('');
    }

    function toggleSwitchMenu(force) {
        const m = root.querySelector('#ls-switch-menu');
        if (!m) return;
        const open = (force != null) ? force : !m.classList.contains('open');
        m.classList.toggle('open', open);
        root.querySelector('#ls-lesson-switch')?.classList.toggle('open', open);
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
    // 句子内的蓝色词: 按该句关联的词条把 surface 的首个词边界命中
    // 包成 <span class="ls-word">。先在原文上定位、再分段转义拼接:
    // 定位与转义解耦, 撇号等被 esc 改写的字符不影响边界判断,
    // "run" 也不会命中进 "runners"。
    function sentenceHtml(lesson, s) {
        const hits = (lesson.words || [])
            .filter(w => w.sent === s.id)
            .map(w => ({ w: w, at: findWordStart(s.text, w.surface) }))
            .filter(x => x.at >= 0)
            .sort((a, b) => a.at - b.at);
        let html = '';
        let pos  = 0;
        hits.forEach(x => {
            if (x.at < pos) return;                 // 与前一命中重叠, 保留靠前者
            html += esc(s.text.slice(pos, x.at))
                 + `<span class="ls-word" data-wid="${esc(x.w.id)}">${esc(x.w.surface)}</span>`;
            pos = x.at + x.w.surface.length;
        });
        html += esc(s.text.slice(pos));
        const hard = s.hard ? ' ls-hard' : '';
        const mark = s.hard ? '<span class="ls-hard-mark" title="\u96BE\u53E5">\u96BE</span>' : '';
        return `<span class="ls-sent${hard}" data-sid="${esc(s.id)}">${html}${mark}</span>`;
    }

    function renderRead(panel) {
        const l     = curLesson;
        const hasZh = (l.paras || []).some(p => p.zh);
        const paras = (l.paras || []).map(p => {
            const inner = (p.sentences || []).map(s => sentenceHtml(l, s)).join(' ');
            const trBtn = p.zh
                ? `<button class="ls-para-tr" data-tr="${esc(p.id)}" title="\u663E\u793A/\u9690\u85CF\u672C\u6BB5\u8BD1\u6587">\u8BD1</button>`
                : '';
            const zhDiv = p.zh
                ? `<div class="ls-para-zh" data-zh="${esc(p.id)}">${esc(p.zh)}</div>`
                : '';
            return `<p class="ls-para">`
                 + `<button class="ls-para-play" data-para="${esc(p.id)}" title="\u64AD\u653E\u672C\u6BB5">\u25B6</button>`
                 + `${trBtn}${inner}</p>${zhDiv}`;
        }).join('');
        // 导入课缺句译时给修补入口 (内置课语料自带, 不会出现)
        const needZhFix = isUserLesson(curLesson.id)
            && allSentences(curLesson).some(x => !x.zh);
        panel.innerHTML = `
            <div class="ls-read">
                <div class="ls-read-bar">
                    <button class="wl-btn-primary" id="ls-play-all">\u25B6 \u64AD\u653E\u5168\u6587</button>
                    ${hasZh ? '<button class="ls-tool-btn" id="ls-read-zh-all" title="\u663E\u793A/\u9690\u85CF\u5168\u90E8\u8BD1\u6587">\u8BD1\u6587</button>' : ''}
                    ${needZhFix ? '<button class="ls-tool-btn ls-zhfix-open" id="ls-zh-fix" title="\u7ED9\u672C\u8BFE\u8865\u5168\u53E5\u7EA7\u4E2D\u6587\u8BD1\u6587">\u{1F310} \u8865\u53E5\u8BD1</button>' : ''}
                    <span class="ls-read-hint">\u70B9\u53E5\u5B50\u542C\u5355\u53E5 \u00b7 \u70B9\u84DD\u8272\u8BCD\u770B\u8BE6\u89E3${hasZh ? ' \u00b7 \u70B9 \u8BD1 \u770B\u6BB5\u8BD1' : ''}</span>
                </div>
                <div class="ls-text">${paras}</div>
            </div>
            <div class="ls-sheet-overlay" id="ls-sheet-overlay">
                <div class="ls-sheet" id="ls-sheet"></div>
            </div>`;
    }

    // 段译显隐: 单段切换 + 全局开关 (按当前是否全显决定方向)。
    function toggleParaZh(pid) {
        const div = root.querySelector(`.ls-para-zh[data-zh="${pid}"]`);
        const btn = root.querySelector(`.ls-para-tr[data-tr="${pid}"]`);
        if (!div) return;
        const show = !div.classList.contains('show');
        div.classList.toggle('show', show);
        btn?.classList.toggle('on', show);
        syncZhAllBtn();
    }
    function toggleAllParaZh() {
        const divs = Array.from(root.querySelectorAll('.ls-para-zh'));
        if (!divs.length) return;
        const showAll = divs.some(d => !d.classList.contains('show'));
        divs.forEach(d => d.classList.toggle('show', showAll));
        root.querySelectorAll('.ls-para-tr').forEach(b => b.classList.toggle('on', showAll));
        syncZhAllBtn();
    }
    function syncZhAllBtn() {
        const btn  = root.querySelector('#ls-read-zh-all');
        if (!btn) return;
        const divs = Array.from(root.querySelectorAll('.ls-para-zh'));
        btn.classList.toggle('on', divs.length > 0 && divs.every(d => d.classList.contains('show')));
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

    function addWordToNotebook(w, silent) {
        if (!window.DB?.upsertNotebookWord) { if (!silent) toast('\u751F\u8BCD\u672C\u4E0D\u53EF\u7528'); return; }
        const lesson = w._lesson || curLesson;
        const s  = lesson ? sentenceById(lesson, w.sent) : null;
        const en = (w.phrases || []).map(p => p.en).join(' \u00b7 ');
        const cn = (w.phrases || []).map(p => p.zh).join(' \u00b7 ');
        window.DB.upsertNotebookWord({
            word    : w.lemma,
            meaning : w.zh,
            collo   : en,
            colloCn : cn,
            context : s ? s.text : '',
            source  : lesson ? ('\u8BFE\u6587 ' + lesson.id + ' ' + lesson.title) : '\u8BFE\u6587',
            tags    : ['\u8BFE\u6587'].concat(lesson ? [lesson.id] : [])
        });
        window.App?.updateNotebookBadge?.();
        if (!silent) toast('\u{1F4D6} \u5DF2\u52A0\u5165\u751F\u8BCD\u672C: ' + w.lemma);
    }

    // 答错自动强化: 静默加入生词本 (已有则合并不重复), 再把该词
    // 的复习状态拉回「到期」—— 单词模块的到期复习队列 (遗忘曲线
    // 1/3/7/14/30/60 天) 即刻可见, 后续按间隔复习强化。
    function reinforceWord(w) {
        if (!window.DB?.upsertNotebookWord) return;
        try {
            addWordToNotebook(w, true);
            window.DB.flagQuizMistake?.(w.lemma);
        } catch (e) {}
    }

    // ─── 填空 (选择 / 拼写) ─────────────────────────────────
    // 设置页的「继续上次」区块: 有未完成会话时列出各组进度芯片,
    // 可整体继续也可点组直跳; 重新开始会覆盖旧存档。
    function clozeResumeHtml() {
        const sess = getSess('c');
        if (!sess || !Array.isArray(sess.g)) return '';
        const total = sess.g.reduce((n, g) => n + g.length, 0);
        const done  = Object.keys(sess.a || {}).length;
        if (!done || done >= total) return '';
        const chips = sess.g.map((g, i) => {
            const gd  = g.filter(id => sess.a && sess.a[id]).length;
            const cls = 'ls-grp-chip' + (gd === g.length ? ' full' : '');
            return `<button class="${cls}" data-resumegrp="${i}">${i + 1}<span class="ls-grp-n">${gd}/${g.length}</span></button>`;
        }).join('');
        const modeZh = sess.mode === 'choice' ? '\u9009\u62E9\u586B\u7A7A' : '\u62FC\u5199\u586B\u7A7A';
        return `
            <div class="ls-resume-box">
                <div class="ls-resume-title">\u23F3 \u4E0A\u6B21\u8FDB\u5EA6: ${modeZh} \u00b7 \u5DF2\u7B54 ${done} / ${total}</div>
                <div class="ls-grp-row">\u7EC4:${chips}</div>
                <button class="wl-btn-primary" id="ls-cloze-resume-sess">\u25B6 \u7EE7\u7EED\u4E0A\u6B21</button>
                <div class="ls-setup-note">\u70B9\u7EC4\u53F7\u76F4\u63A5\u8DF3\u8FDB\u90A3\u4E00\u7EC4\uFF1B\u4E0B\u65B9\u91CD\u65B0\u5F00\u59CB\u4F1A\u6E05\u6389\u4E0A\u6B21\u8FDB\u5EA6\u3002</div>
            </div>`;
    }

    // 从存档恢复填空会话。词条按 ID 从当前语料还原, 课被删/改过
    // 导致缺失的条目自动剔除; targetGi 指定则落到该组首道未答题。
    function resumeClozeSess(targetGi) {
        const sess = getSess('c');
        if (!sess || !Array.isArray(sess.g)) return false;
        const pool = curLesson ? (curLesson.words || []).slice() : mixedWordPool();
        const byId = {};
        pool.forEach(w => { byId[w.id] = w; });
        const groups = sess.g.map(g => g.map(id => byId[id]).filter(Boolean))
                             .filter(g => g.length);
        if (!groups.length) { clearSess('c'); toast('\u4E0A\u6B21\u8FDB\u5EA6\u5DF2\u5931\u6548'); return false; }
        const answers = {};
        Object.keys(sess.a || {}).forEach(id => {
            if (!byId[id]) return;
            const pair = sess.a[id];
            const ans  = { ok: !!pair[0] };
            if (pair[1] != null) {
                if (sess.mode === 'choice') ans.pickedId = pair[1];
                else                        ans.typed    = pair[1];
            }
            answers[id] = ans;
        });
        const opts = {};
        Object.keys(sess.o || {}).forEach(id => {
            if (byId[id] && Array.isArray(sess.o[id])) opts[id] = sess.o[id];
        });
        clozeState = {
            kind    : curLesson ? 'lesson' : 'mixed',
            mode    : sess.mode === 'spell' ? 'spell' : 'choice',
            hint    : !!sess.hint,
            showZh  : (window.DB?.getPref?.('lesson_cloze_zh', '1') !== '0'),
            pool    : pool,
            groups  : groups,
            gi      : 0,
            idx     : 0,
            opts    : opts,
            answers : answers,
            autoT   : 0
        };
        const st = clozeState;
        if (targetGi != null) {
            st.gi = Math.max(0, Math.min(targetGi, groups.length - 1));
            const un = groups[st.gi].findIndex(w => !answers[w.id]);
            st.idx = un >= 0 ? un : 0;
        } else {
            st.gi  = Math.max(0, Math.min(sess.gi || 0, groups.length - 1));
            st.idx = Math.max(0, Math.min(sess.idx || 0, groups[st.gi].length - 1));
        }
        persistClozeSess();
        renderClozeQuestion();
        return true;
    }

    function renderClozeSetup(panel) {
        clozeState = null;
        const p     = loadProgress()[curLesson.id] || {};
        const best  = (p.clozeBest != null) ? `\u5386\u53F2\u6700\u4F73: ${p.clozeBest}%` : '\u5C1A\u672A\u7EC3\u4E60';
        const total = (curLesson.words || []).length;
        const size  = getLessonGroupSize();
        const grpN  = chunkGroups((curLesson.words || []), size).length;
        const grp   = grpN > 1 ? `\uFF0C\u5206 ${grpN} \u7EC4\u7EC3 (\u6BCF\u7EC4\u7EA6 ${size} \u9898\uFF0C\u53EF\u5728\u8BBE\u7F6E\u91CC\u6539)` : '';
        panel.innerHTML = `
            <div class="ls-cloze-setup">
                ${clozeResumeHtml()}
                <div class="ls-setup-title">\u7528\u539F\u6587\u53E5\u5B50\u6316\u7A7A\u84DD\u8272\u8BCD\uFF0C\u5171 ${total} \u9898${grp}</div>
                <div class="ls-setup-sub">${best}</div>
                <div class="ls-setup-btns">
                    <button class="wl-btn-primary"   id="ls-cloze-choice">\u{1F520} \u9009\u62E9\u586B\u7A7A\uFF084 \u9009 1\uFF09</button>
                    <button class="wl-btn-secondary" id="ls-cloze-spell">\u2328\uFE0F \u62FC\u5199\u586B\u7A7A\uFF08\u952E\u5165\uFF09</button>
                </div>
                <label class="ls-setup-hintopt"><input type="checkbox" id="ls-cloze-hint" checked> \u62FC\u5199\u6A21\u5F0F\u663E\u793A\u9996\u5B57\u6BCD\u63D0\u793A</label>
            </div>`;
    }

    // 当前组的题目数组。答案/选项序始终按词条 ID 全局记录,
    // 组只是把长队列切成带休息点的段落。
    function clozeQueue(st) { return st.groups[st.gi]; }
    function clozeTotalAll(st) {
        return st.groups.reduce((n, g) => n + g.length, 0);
    }

    function startCloze(mode, hintOpt) {
        // 从结果页「再练一轮」进来时 setup 复选框已不在 DOM，用上一轮的值。
        const hint = (hintOpt != null)
            ? !!hintOpt
            : !!root.querySelector('#ls-cloze-hint')?.checked;
        clozeState = {
            kind    : 'lesson',
            mode    : mode,                                // choice | spell
            hint    : hint,
            showZh  : (window.DB?.getPref?.('lesson_cloze_zh', '1') !== '0'),
            pool    : (curLesson.words || []).slice(),     // 干扰项抽样池
            groups  : chunkGroups(shuffle((curLesson.words || []).slice()), getLessonGroupSize()),
            gi      : 0,
            idx     : 0,
            opts    : {},                                  // wid -> 选项 ID 序 (稳定, 回看不重排)
            answers : {},                                  // wid -> { ok, pickedId?, typed? }
            autoT   : 0                                    // 答对自动跳题令牌
        };
        persistClozeSess();
        renderClozeQuestion();
    }

    // 综合填空: 从全部课程的词条里智能抽一组。每组即一次会话,
    // 结束后「再来一组」按最新档案重新抽。
    function startMixedCloze(mode, hintOpt) {
        const hint = (hintOpt != null)
            ? !!hintOpt
            : !!root.querySelector('#ls-cloze-hint')?.checked;
        const pool = mixedWordPool();
        if (!pool.length) { toast('\u8FD8\u6CA1\u6709\u8BFE\u6587\u8BCD\u6761'); return; }
        const size = getLessonGroupSize() || 30;   // \u300C\u4E0D\u5206\u7EC4\u300D\u65F6\u7EFC\u5408\u7EC3\u4E60\u4ECD\u6309 30 \u62BD
        const grp  = pickSmartGroup(pool, loadPracRec().w, size, it => it.id);
        clozeState = {
            kind    : 'mixed',
            mode    : mode,
            hint    : hint,
            showZh  : (window.DB?.getPref?.('lesson_cloze_zh', '1') !== '0'),
            pool    : pool,
            groups  : [grp],
            gi      : 0,
            idx     : 0,
            opts    : {},
            answers : {},
            autoT   : 0
        };
        persistClozeSess();
        renderClozeQuestion();
    }

    // 词性重合优先的干扰项抽样。pos 形如 'n. / v.'，按词性标记求交集。
    // pool 传入抽样范围: 单课用本课词条, 综合练习用全课程词条。
    function posTokens(pos) {
        return String(pos || '').split(/[\/\s]+/).filter(t => /\w/.test(t));
    }
    function pickDistractors(target, n, pool) {
        const others = pool.filter(w => w.id !== target.id);
        const tset   = new Set(posTokens(target.pos));
        const same   = others.filter(w => posTokens(w.pos).some(t => tset.has(t)));
        const rest   = others.filter(w => !same.includes(w));
        const mixed  = shuffle(same).concat(shuffle(rest));
        return mixed.slice(0, n);
    }

    function clozeSentenceHtml(lesson, w, ans) {
        const s = sentenceById(lesson, w.sent);
        if (!s) return '';
        // 先按词边界在原文定位, 再分段转义 —— 见 sentenceHtml 的说明。
        const at = findWordStart(s.text, w.surface);
        let html;
        if (at >= 0) {
            const blank = ans
                ? `<span class="ls-blank ${ans.ok ? 'ok' : 'bad'}" id="ls-blank">${esc(w.surface)}</span>`
                : '<span class="ls-blank" id="ls-blank">______</span>';
            html = esc(s.text.slice(0, at)) + blank + esc(s.text.slice(at + w.surface.length));
        } else {
            html = esc(s.text);
        }
        // 整句朗读: 有意提供 —— 未答时听原句即是「听力填空」练法。
        return `<div class="ls-cloze-sentrow">`
             + `<button class="ls-mini-speak" data-say="${esc(s.text)}" title="\u64AD\u653E\u672C\u53E5">\u{1F50A}</button>`
             + `<div class="ls-cloze-senttext">${html}</div></div>`;
    }

    function renderClozeQuestion() {
        const st    = clozeState;
        const panel = root.querySelector('#ls-panel');
        if (!st || !panel) return;
        const queue    = clozeQueue(st);
        const w        = queue[st.idx];
        const lesson   = w._lesson || curLesson;
        const ans      = st.answers[w.id] || null;
        const grouped  = st.groups.length > 1;
        const answered = queue.filter(x => st.answers[x.id]).length;
        const isLast   = st.idx === queue.length - 1;
        const lastGrp  = st.gi === st.groups.length - 1;
        const endLabel = lastGrp ? '\u4EA4\u5377' : '\u672C\u7EC4\u5B8C\u6210';

        let body;
        if (st.mode === 'choice') {
            // 选项顺序按题缓存: 回看已答题时不重排。统一小写显示,
            // 句首词形 (Race / As a result) 的大写会直接暴露答案。
            if (!st.opts[w.id]) {
                st.opts[w.id] = shuffle([w].concat(pickDistractors(w, 3, st.pool))).map(o => o.id);
            }
            const optWord = oid => st.pool.find(o => o.id === oid) || wordById(lesson, oid);
            const btns = st.opts[w.id].map((oid, oi) => {
                const o   = optWord(oid);
                let   cls = 'ls-opt';
                if (ans) {
                    if (oid === w.id)              cls += ' ok';
                    else if (oid === ans.pickedId) cls += ' bad';
                }
                return `<button class="${cls}" data-opt="${esc(oid)}"${ans ? ' disabled' : ''}>`
                     + `<span class="ls-opt-num">${oi + 1}</span>${esc(o ? o.surface.toLowerCase() : '')}</button>`;
            }).join('');
            body = `<div class="ls-opts">${btns}</div>`;
        } else {
            const hint = st.hint
                ? `<span class="ls-spell-hint">\u9996\u5B57\u6BCD: <b>${esc(w.surface.charAt(0))}</b></span>`
                : '';
            body = `
                <div class="ls-spell-row">
                    <input type="text" class="ls-spell-input" id="ls-spell-input"
                           placeholder="\u8F93\u5165\u7B54\u6848\u540E\u56DE\u8F66" autocomplete="off"
                           autocapitalize="off" spellcheck="false"
                           value="${ans ? esc(ans.typed || '') : ''}"${ans ? ' disabled' : ''}>
                    <button class="wl-btn-primary" id="ls-spell-submit"${ans ? ' disabled' : ''}>\u786E\u5B9A</button>
                </div>
                <div class="ls-spell-meta">${hint}</div>`;
        }

        // 已答题回看: 反馈区固定显示。答对会在 1 秒后自动进下一题,
        // 手动点「下一题」仍然可用 (立即跳)。
        const feedback = ans
            ? (ans.ok
                ? `<span class="ls-fb-ok">\u2713 \u6B63\u786E</span>`
                : `<span class="ls-fb-bad">\u2717 \u6B63\u786E\u7B54\u6848: <b>${esc(w.surface)}</b></span>`)
              + ` <span class="ls-fb-zh">${esc(w.zh)}</span>`
              + (ans.ok ? '' : ` <span class="ls-fb-srs">\u{1F4CC} \u5DF2\u8BB0\u5165\u5F3A\u5316\u590D\u4E60</span>`)
              + ` <button class="wl-btn-primary ls-fb-next" id="ls-cloze-next">${isLast ? endLabel + ' \u2192' : '\u4E0B\u4E00\u9898 \u2192'}</button>`
            : '';

        // 中文开关: 显示整句译文 (词义在作答后的反馈里已给出);
        // 旧导入课没有句译时回退为词义提示。
        const s      = sentenceById(lesson, w.sent);
        const zhLine = st.showZh
            ? (s && s.zh
                ? `<div class="ls-zh-hint"><span class="ls-zh-label">\u8BD1\u6587</span>${esc(s.zh)}</div>`
                : `<div class="ls-zh-hint"><span class="ls-zh-label">\u91CA\u4E49</span>${esc(w.zh)}</div>`)
            : '';
        const srcLine = (st.kind === 'mixed' && lesson)
            ? `<div class="ls-cloze-src">\u51FA\u81EA\u300A${esc(lesson.title)}\u300B</div>`
            : '';
        const prog = (st.kind === 'mixed')
            ? `\u672C\u7EC4 ${st.idx + 1} / ${queue.length} \u00b7 \u5DF2\u7B54 ${answered}`
            : (grouped
                ? `\u7B2C ${st.gi + 1}/${st.groups.length} \u7EC4 \u00b7 ${st.idx + 1} / ${queue.length} \u00b7 \u5DF2\u7B54 ${answered}`
                : `${st.idx + 1} / ${queue.length} \u00b7 \u5DF2\u7B54 ${answered}`);

        // 分组会话: 组号芯片一键跳组 (含各组已答数), 不必按顺序做完
        const grpRow = (st.groups.length > 1)
            ? `<div class="ls-grp-row">\u7EC4:${st.groups.map((g, i) => {
                    const gd  = g.filter(x => st.answers[x.id]).length;
                    const cls = 'ls-grp-chip' + (i === st.gi ? ' cur' : '') + (gd === g.length ? ' full' : '');
                    return `<button class="${cls}" data-jumpgrp="${i}">${i + 1}<span class="ls-grp-n">${gd}/${g.length}</span></button>`;
                }).join('')}</div>`
            : '';

        panel.innerHTML = `
            <div class="ls-cloze">
                <div class="ls-cloze-top">
                    <div class="ls-cloze-navs">
                        <button class="ls-nav-btn" id="ls-cloze-prev"${(st.idx === 0 && st.gi === 0) ? ' disabled' : ''} title="\u4E0A\u4E00\u9898">${ICON_PREV}</button>
                        <span class="ls-cloze-prog">${prog}</span>
                        <button class="ls-nav-btn ls-nav-next" id="ls-cloze-nextq" title="\u4E0B\u4E00\u9898">${isLast ? endLabel : ICON_NEXT}</button>
                    </div>
                    <div class="ls-cloze-tools">
                        <button class="ls-tool-btn${st.showZh ? ' on' : ''}" id="ls-zh-toggle" title="\u663E\u793A/\u9690\u85CF\u6574\u53E5\u8BD1\u6587">\u4E2D\u6587</button>
                        <button class="ls-cloze-quit" id="ls-cloze-quit">\u9000\u51FA</button>
                    </div>
                </div>
                ${grpRow}
                ${srcLine}
                <div class="ls-cloze-sent">${clozeSentenceHtml(lesson, w, ans)}</div>
                ${zhLine}
                ${body}
                <div class="ls-cloze-feedback" id="ls-cloze-feedback">${feedback}</div>
                <div class="ls-kbd-hint">\u5FEB\u6377\u952E: \u2190 \u2192 \u5207\u6362\u9898\u76EE${st.mode === 'choice' ? ' \u00b7 1-4 \u9009\u62E9\u9009\u9879' : ''} \u00b7 \u56DE\u8F66\u4E0B\u4E00\u9898 \u00b7 \u7B54\u5BF9\u81EA\u52A8\u8FDB\u4E0B\u4E00\u9898</div>
            </div>`;
        const inp = panel.querySelector('#ls-spell-input');
        if (inp && !ans) {
            inp.focus();
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitSpell(); }
            });
        }
    }

    function clozeGoPrev() {
        const st = clozeState;
        if (!st) return;
        st.autoT++;                            // 手动导航使挂起的自动跳题失效
        if (st.idx === 0) {
            // 组首继续往前 = 回上一组最后一题, 组间可自由往返
            if (st.gi > 0) {
                st.gi--;
                st.idx = clozeQueue(st).length - 1;
                persistClozeSess();
                renderClozeQuestion();
            }
            return;
        }
        st.idx--;
        persistClozeSess();
        renderClozeQuestion();
    }
    function clozeGoNext() {
        const st = clozeState;
        if (!st) return;
        st.autoT++;
        const queue = clozeQueue(st);
        if (st.idx >= queue.length - 1) {
            if (st.gi >= st.groups.length - 1) renderClozeResult();
            else                               renderClozeGroupResult();
            return;
        }
        st.idx++;
        persistClozeSess();
        renderClozeQuestion();
    }
    function nextClozeGroup() {
        const st = clozeState;
        if (!st || st.gi >= st.groups.length - 1) return;
        st.autoT++;
        st.gi++;
        st.idx = 0;
        persistClozeSess();
        renderClozeQuestion();
    }
    // 跳到第 gi 组: 落到该组第一道未答题 (全答过则落到第一题回看)
    function jumpToClozeGroup(gi) {
        const st = clozeState;
        if (!st || gi < 0 || gi >= st.groups.length) return;
        st.autoT++;
        st.gi = gi;
        const un = st.groups[gi].findIndex(w => !st.answers[w.id]);
        st.idx = un >= 0 ? un : 0;
        persistClozeSess();
        renderClozeQuestion();
    }
    function toggleClozeZh() {
        const st = clozeState;
        if (!st) return;
        st.showZh = !st.showZh;
        try { window.DB?.setPref?.('lesson_cloze_zh', st.showZh ? '1' : '0'); } catch (e) {}
        renderClozeQuestion();
    }

    function gradeCloze(isCorrect, w, detail) {
        const st = clozeState;
        if (st.answers[w.id]) return;               // 已答过, 不重复计分
        st.answers[w.id] = Object.assign({ ok: isCorrect }, detail || {});
        try { window.DB?.bumpDaily?.({ quizTotal: 1, quizCorrect: isCorrect ? 1 : 0 }); }
        catch (e) {}
        bumpPracRec('w', w.id, isCorrect);          // 练习档案: 综合练习按它选题
        if (!isCorrect) reinforceWord(w);           // 答错 → 生词本 + 拉回到期复习
        persistClozeSess();                         // 会话进度落盘, 关掉再回来能接着做
        speak(w.surface);
        renderClozeQuestion();                      // 状态驱动重渲染: 选项着色/回填/反馈
        if (isCorrect) {
            // 答对 1 秒后自动进下一题。令牌 + 位置双重校验:
            // 用户在这 1 秒内手动切题/退出/重开, 定时器就作废。
            const token = ++st.autoT;
            const gi = st.gi, idx = st.idx;
            setTimeout(() => {
                if (clozeState === st && st.autoT === token
                    && st.gi === gi && st.idx === idx) clozeGoNext();
            }, 1000);
        }
    }

    function submitChoice(optId) {
        const st = clozeState;
        const w  = clozeQueue(st)[st.idx];
        if (st.answers[w.id]) return;
        gradeCloze(optId === w.id, w, { pickedId: optId });
    }

    function submitSpell() {
        const st  = clozeState;
        const w   = clozeQueue(st)[st.idx];
        const inp = root.querySelector('#ls-spell-input');
        if (!inp || inp.disabled || st.answers[w.id]) return;
        const val = String(inp.value || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const ans = w.surface.trim().toLowerCase().replace(/\s+/g, ' ');
        gradeCloze(val === ans, w, { typed: inp.value });
    }

    // 组间小结: 每组结束的自然休息点。中途退出的部分不算白做 ——
    // 每题作答即刻计入日志/练习档案/错词强化, 只有「历史最佳」
    // 需要整卷答完才刷新。
    function renderClozeGroupResult() {
        const st    = clozeState;
        const panel = root.querySelector('#ls-panel');
        if (!st || !panel) return;
        const queue   = clozeQueue(st);
        const done    = queue.filter(x => st.answers[x.id]);
        const ok      = done.filter(x => st.answers[x.id].ok).length;
        const skipped = queue.length - done.length;
        const allN    = clozeTotalAll(st);
        const allDone = Object.keys(st.answers).length;
        const nextN   = st.groups[st.gi + 1].length;
        panel.innerHTML = `
            <div class="ls-result">
                <div class="ls-result-score">\u7B2C ${st.gi + 1} \u7EC4 \u2713</div>
                <div class="ls-result-sub">\u672C\u7EC4 ${ok} / ${done.length} \u9898\u6B63\u786E${
                    skipped ? ` \u00b7 \u8DF3\u8FC7 ${skipped} \u9898` : ''} \u00b7 \u603B\u8FDB\u5EA6 ${allDone} / ${allN}</div>
                ${skipped ? `<button class="wl-btn-secondary" id="ls-cloze-resume">\u21A9 \u56DE\u672C\u7EC4\u672A\u7B54\u9898</button>` : ''}
                <div class="ls-result-btns">
                    <button class="wl-btn-primary" id="ls-cloze-nextgroup">\u2192 \u7EE7\u7EED\u7B2C ${st.gi + 2} \u7EC4\uFF08${nextN} \u9898\uFF09</button>
                    <button class="wl-btn-secondary" id="ls-cloze-quit">\u4F11\u606F\u4E00\u4E0B</button>
                </div>
                <div class="ls-result-note">\u5DF2\u505A\u7684\u9898\u90FD\u5DF2\u8BB0\u5F55, \u9519\u8BCD\u5DF2\u8FDB\u5F3A\u5316\u590D\u4E60 \u2014\u2014 \u4E2D\u9014\u4F11\u606F\u4E0D\u767D\u505A\u3002</div>
            </div>`;
    }

    function renderClozeResult() {
        const st    = clozeState;
        const panel = root.querySelector('#ls-panel');
        if (!st || !panel) return;
        const allWords   = st.groups.reduce((a, g) => a.concat(g), []);
        const total      = allWords.length;
        const doneWords  = allWords.filter(w => st.answers[w.id]);
        const correct    = doneWords.filter(w => st.answers[w.id].ok).length;
        const wrong      = doneWords.filter(w => !st.answers[w.id].ok);
        const unanswered = total - doneWords.length;
        const pct        = doneWords.length
            ? Math.round(correct * 100 / doneWords.length) : 0;

        if (!unanswered) clearSess('c');   // 整卷答完, 进度存档使命完成

        // 单课: 最佳成绩只在完整作答时刷新, 保证历史成绩可比。
        let recordLine = '';
        if (st.kind === 'lesson' && curLesson) {
            const prev = loadProgress()[curLesson.id] || {};
            if (!unanswered) {
                bumpProgress(curLesson.id, {
                    clozeBest : Math.max(pct, prev.clozeBest || 0),
                    clozeRuns : (prev.clozeRuns || 0) + 1
                });
                renderHeaderProgress();
                if (pct > 0 && pct >= (prev.clozeBest || 0)) recordLine = ' \u00b7 \u65B0\u7EAA\u5F55\uFF01';
            }
        }

        const wrongRows = wrong.map(w => `
            <div class="ls-wrong-row">
                <button class="ls-mini-speak" data-say="${esc(w.surface)}">\u{1F50A}</button>
                <span class="ls-wrong-en">${esc(w.surface)}</span>
                <span class="ls-wrong-zh">${esc(w.zh)}</span>
            </div>`).join('');
        const mixedFoot = (st.kind === 'mixed')
            ? (() => { const ms = mixedStats();
                return `<div class="ls-result-note">\u603B\u8FDB\u5EA6: \u5DF2\u7EC3 ${ms.w.seen} / ${ms.w.total} \u8BCD \u00b7 \u5F85\u5F3A\u5316 ${ms.w.wrong} \u8BCD</div>`; })()
            : '';
        panel.innerHTML = `
            <div class="ls-result">
                <div class="ls-result-score">${pct}%</div>
                <div class="ls-result-sub">${correct} / ${doneWords.length} \u9898\u6B63\u786E${
                    unanswered ? ` \u00b7 \u8FD8\u6709 ${unanswered} \u9898\u672A\u4F5C\u7B54` : recordLine}</div>
                ${unanswered ? `<button class="wl-btn-primary" id="ls-cloze-resume">\u21A9 \u7EE7\u7EED\u4F5C\u7B54</button>` : ''}
                ${wrong.length ? `
                    <div class="ls-result-wrong-title">\u9519\u8BCD ${wrong.length} \u4E2A</div>
                    <div class="ls-wrong-list">${wrongRows}</div>
                    <div class="ls-result-note">\u2713 \u9519\u8BCD\u5DF2\u81EA\u52A8\u52A0\u5165\u751F\u8BCD\u672C\uFF0C\u4F1A\u6309\u9057\u5FD8\u66F2\u7EBF\u5B89\u6392\u5F3A\u5316\u590D\u4E60\uFF08\u5355\u8BCD \u2192 \u590D\u4E60\uFF09\u3002</div>`
                  : (!unanswered ? '<div class="ls-result-perfect">\u{1F3C6} \u5168\u5BF9\uFF0C\u6EE1\u5206\u901A\u5173\uFF01</div>' : '')}
                <div class="ls-result-btns">
                    <button class="wl-btn-secondary" id="ls-cloze-again">\u{1F504} \u518D\u7EC3\u4E00\u8F6E</button>
                    <button class="wl-btn-secondary" id="ls-cloze-back">\u8FD4\u56DE</button>
                </div>
                ${mixedFoot}
            </div>`;
    }

    // 从小结/结果页回到第一道未作答的题继续 (跨组查找)。
    function clozeResume() {
        const st = clozeState;
        if (!st) return;
        for (let g = 0; g < st.groups.length; g++) {
            const i = st.groups[g].findIndex(w => !st.answers[w.id]);
            if (i >= 0) { st.gi = g; st.idx = i; persistClozeSess(); renderClozeQuestion(); return; }
        }
        renderClozeQuestion();
    }
    // ─── 短语 (浏览 + 中英匹配) ─────────────────────────────
    // 短语对携带稳定 key (词条ID|en) 与所属词条/课程引用:
    // 练习档案按 key 记录, 综合练习据此优先重现错过的短语。
    function lessonPhrases() {
        const out = [];
        (curLesson.words || []).forEach(w =>
            (w.phrases || []).forEach(ph => out.push({
                en: ph.en, zh: ph.zh, key: w.id + '|' + ph.en, word: w, _lesson: curLesson
            })));
        return out;
    }

    // 短语页/综合短语设置页的「继续上次」区块 (与填空同款交互)
    function matchResumeHtml() {
        const sess = getSess('m');
        if (!sess || !Array.isArray(sess.g)) return '';
        const total = sess.g.reduce((n, g) => n + g.length, 0);
        const done  = (sess.done || []).length;
        if (!done || done >= total) return '';
        const doneSet = new Set(sess.done || []);
        const chips = sess.g.map((g, i) => {
            const gd  = g.filter(k => doneSet.has(k)).length;
            const cls = 'ls-grp-chip' + (gd === g.length ? ' full' : '');
            return `<button class="${cls}" data-resumemgrp="${i}">${i + 1}<span class="ls-grp-n">${gd}/${g.length}</span></button>`;
        }).join('');
        return `
            <div class="ls-resume-box">
                <div class="ls-resume-title">\u23F3 \u4E0A\u6B21\u8FDB\u5EA6: \u5DF2\u5339\u914D ${done} / ${total} \u5BF9</div>
                <div class="ls-grp-row">\u7EC4:${chips}</div>
                <button class="wl-btn-primary" id="ls-match-resume-sess">\u25B6 \u7EE7\u7EED\u4E0A\u6B21</button>
                <div class="ls-setup-note">\u5DF2\u914D\u5E73\u7684\u4E0D\u91CD\u505A\uFF1B\u91CD\u65B0\u5F00\u59CB\u4F1A\u6E05\u6389\u4E0A\u6B21\u8FDB\u5EA6\u3002</div>
            </div>`;
    }

    // 从存档恢复匹配会话。短语按 key 从当前语料还原, 缺失剔除。
    function resumeMatchSess(targetGi) {
        const sess = getSess('m');
        if (!sess || !Array.isArray(sess.g)) return false;
        const pool  = curLesson ? lessonPhrases() : mixedPhrasePool();
        const byKey = {};
        pool.forEach(p => { byKey[p.key] = p; });
        const groups = sess.g.map(g => g.map(k => byKey[k]).filter(Boolean))
                             .filter(g => g.length);
        if (!groups.length) { clearSess('m'); toast('\u4E0A\u6B21\u8FDB\u5EA6\u5DF2\u5931\u6548'); return false; }
        initMatchState(curLesson ? 'lesson' : 'mixed', groups);
        const st = matchState;
        (sess.done || []).forEach(k => { if (byKey[k]) st.doneSet.add(k); });
        st.matched = st.doneSet.size;
        st.misses  = sess.miss || {};
        (sess.missKeys || []).forEach(k => { if (byKey[k]) st.missLog[k] = byKey[k]; });
        // 落点: 指定组, 或存档组, 组已配平则找第一个没配平的组
        let gi = (targetGi != null) ? targetGi : (sess.gi || 0);
        gi = Math.max(0, Math.min(gi, groups.length - 1));
        if (targetGi == null && groups[gi].every(p => st.doneSet.has(p.key))) {
            const un = groups.findIndex(g => g.some(p => !st.doneSet.has(p.key)));
            if (un >= 0) gi = un;
        }
        st.gi = gi;
        persistMatchSess();
        startMatchGroup();
        return true;
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
        const pairN = lessonPhrases().length;
        const size  = getLessonGroupSize();
        const grpN  = chunkGroups(new Array(pairN), size).length;
        const hint  = grpN > 1
            ? `\u5171 ${pairN} \u5BF9\uFF0C\u5206 ${grpN} \u7EC4 \u00b7 \u5148\u6D4F\u89C8\u719F\u6089\uFF0C\u518D\u5339\u914D\u68C0\u9A8C`
            : '\u5148\u6D4F\u89C8\u719F\u6089\uFF0C\u518D\u5339\u914D\u68C0\u9A8C';
        panel.innerHTML = `
            <div class="ls-phrases">
                ${matchResumeHtml()}
                <div class="ls-read-bar">
                    <button class="wl-btn-primary" id="ls-match-start">\u{1F3AE} \u4E2D\u82F1\u5339\u914D\u7EC3\u4E60</button>
                    <span class="ls-read-hint">${hint}</span>
                </div>
                <div class="ls-phrase-list">${rows}</div>
            </div>`;
    }

    // ─── 补句译 (导入课数据修补) ────────────────────────────
    // 旧导入课没有句级译文, 填空页「中文」只能回退显示词义。
    // 两条补全路: ① 已配 AI Key (设置 → AI) 时一键在线翻译
    // (DeepSeek/豆包国内直连, Claude/OpenAI 需网络可达);
    // ② 复制提示词发给任意 AI, 把返回 JSON 粘回来。
    // 译文合并后随用户课存 localStorage, 并同步到云端。
    function zhFixPrompt(lesson) {
        const sents = allSentences(lesson);
        const lines = sents.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
        return '\u4F60\u662F\u82F1\u8BED\u6559\u6750\u7FFB\u8BD1\u52A9\u624B\u3002\u628A\u4E0B\u5217\u82F1\u6587\u8BFE\u6587\u53E5\u5B50\u9010\u53E5\u7FFB\u8BD1\u6210\u8D34\u5408\u4E2D\u56FD\u9AD8\u4E2D\u6559\u6750\u8BED\u4F53\u7684\u4E2D\u6587\u3002\n'
             + '\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u548C Markdown \u6807\u8BB0:\n'
             + '{ "zh": ["\u7B2C1\u53E5\u8BD1\u6587", "\u7B2C2\u53E5\u8BD1\u6587", ...] }\n'
             + `\u6570\u7EC4\u957F\u5EA6\u5FC5\u987B\u662F ${sents.length}\uFF0C\u987A\u5E8F\u4E0E\u7F16\u53F7\u4E00\u4E00\u5BF9\u5E94\u3002\n\n${lines}`;
    }

    // 把译文数组合并进课文并保存; 段译缺失时由句译拼接。
    function applySentenceZh(lesson, zhArr) {
        if (!Array.isArray(zhArr)) return { ok: false, err: '\u8FD4\u56DE\u7684\u4E0D\u662F zh \u6570\u7EC4' };
        const flat = allSentences(lesson);
        if (zhArr.length !== flat.length) {
            return { ok: false, err: `\u53E5\u6570\u4E0D\u7B26: \u8BFE\u6587 ${flat.length} \u53E5\uFF0C\u8BD1\u6587 ${zhArr.length} \u6761` };
        }
        flat.forEach((sen, i) => {
            const z = String(zhArr[i] || '').trim().replace(/\s+/g, ' ');
            if (z) sen.zh = z;
        });
        (lesson.paras || []).forEach(pa => {
            if (!pa.zh && (pa.sentences || []).every(x => x.zh)) {
                pa.zh = pa.sentences.map(x => x.zh).join('');
            }
        });
        if (isUserLesson(lesson.id) && window.DB?.saveUserLessons) {
            window.DB.saveUserLessons(userLessons().map(l => l.id === lesson.id ? lesson : l));
        }
        return { ok: true };
    }

    function openZhFixSheet() {
        const sheet   = root.querySelector('#ls-sheet');
        const overlay = root.querySelector('#ls-sheet-overlay');
        if (!sheet || !overlay || !curLesson) return;
        const n     = allSentences(curLesson).filter(x => !x.zh).length;
        const hasAI = !!window.AIEngine?.hasAPIKey?.();
        sheet.innerHTML = `
            <div class="ls-sheet-head">
                <div class="ls-sheet-word">\u{1F310} \u8865\u5168\u53E5\u8BD1</div>
                <button class="ls-sheet-close" id="ls-sheet-close">\u00d7</button>
            </div>
            <div class="ls-zhfix">
                <div class="ls-zhfix-info">\u672C\u8BFE\u8FD8\u6709 ${n} \u53E5\u6CA1\u6709\u4E2D\u6587\u8BD1\u6587\u3002\u8865\u5168\u540E\uFF0C\u586B\u7A7A\u9875\u7684\u300C\u4E2D\u6587\u300D\u5F00\u5173\u4F1A\u663E\u793A\u6574\u53E5\u8BD1\u6587\uFF0C\u8BFE\u6587\u9875\u4E5F\u80FD\u770B\u6BB5\u8BD1\u3002</div>
                ${hasAI
                    ? `<button class="wl-btn-primary ls-zhfix-btn" id="ls-zhfix-ai">\u{1F916} \u7528 AI \u81EA\u52A8\u7FFB\u8BD1\uFF08\u8054\u7F51\uFF09</button>
                       <div class="ls-zhfix-or">\u2014 \u6216\u624B\u52A8\u8D34\u8BD1\u6587 \u2014</div>`
                    : `<div class="ls-zhfix-noai">\u8FD8\u6CA1\u914D AI Key\uFF08\u8BBE\u7F6E \u2192 AI \u53EF\u914D DeepSeek / \u8C46\u5305\uFF0C\u56FD\u5185\u76F4\u8FDE\uFF09\u3002\u4E5F\u53EF\u4EE5\u624B\u52A8\u8D34\u8BD1\u6587:</div>`}
                <button class="wl-btn-secondary ls-zhfix-btn" id="ls-zhfix-copy">\u{1F4CB} \u590D\u5236\u7FFB\u8BD1\u63D0\u793A\u8BCD</button>
                <textarea class="ls-import-textarea ls-zhfix-ta" id="ls-zhfix-ta" placeholder='\u628A AI \u8FD4\u56DE\u7684 JSON \u7C98\u5230\u8FD9\u91CC\uFF0C\u5F62\u5982 { "zh": ["...", "..."] }'></textarea>
                <button class="wl-btn-primary ls-zhfix-btn" id="ls-zhfix-apply">\u2713 \u5BFC\u5165\u8BD1\u6587</button>
                <div class="ls-zhfix-msg" id="ls-zhfix-msg"></div>
            </div>`;
        overlay.classList.add('open');
    }

    async function runZhFixAI() {
        const btn = root.querySelector('#ls-zhfix-ai');
        const msg = root.querySelector('#ls-zhfix-msg');
        if (!btn || !curLesson || !window.AIEngine?.callClaudeJSON) return;
        btn.disabled    = true;
        btn.textContent = '\u23F3 \u7FFB\u8BD1\u4E2D\u2026 (\u5341\u51E0\u79D2)';
        if (msg) msg.textContent = '';
        try {
            const sents  = allSentences(curLesson);
            const system = '\u4F60\u662F\u82F1\u8BED\u6559\u6750\u7FFB\u8BD1\u52A9\u624B\u3002\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u3002';
            const user   = zhFixPrompt(curLesson);
            const out    = await window.AIEngine.callClaudeJSON(system, user,
                               { maxTokens: Math.min(200 + sents.length * 120, 8000) });
            const res    = applySentenceZh(curLesson, out && out.zh);
            if (!res.ok) throw new Error(res.err);
            toast('\u2713 \u53E5\u8BD1\u5DF2\u8865\u5168\u5E76\u4FDD\u5B58');
            closeWordSheet();
            switchTab(curTab);                 // 重渲染: 课文页出「译文」按钮
        } catch (e) {
            btn.disabled    = false;
            btn.textContent = '\u{1F916} \u7528 AI \u81EA\u52A8\u7FFB\u8BD1\uFF08\u8054\u7F51\uFF09';
            if (msg) msg.textContent = '\u7FFB\u8BD1\u5931\u8D25: '
                + (window.AIEngine?.friendlyError?.(e) || e.message || e);
        }
    }

    function applyZhFixPaste() {
        const ta  = root.querySelector('#ls-zhfix-ta');
        const msg = root.querySelector('#ls-zhfix-msg');
        if (!ta || !curLesson) return;
        if (!ta.value.trim()) { if (msg) msg.textContent = '\u5148\u7C98\u8D34 JSON'; return; }
        try {
            const out = JSON.parse(stripFences(ta.value));
            const res = applySentenceZh(curLesson, out && out.zh);
            if (!res.ok) throw new Error(res.err);
            toast('\u2713 \u53E5\u8BD1\u5DF2\u8865\u5168\u5E76\u4FDD\u5B58');
            closeWordSheet();
            switchTab(curTab);
        } catch (e) {
            if (msg) msg.textContent = '\u5BFC\u5165\u5931\u8D25: ' + (e.message || e);
        }
    }

    function copyZhFixPrompt() {
        const text = zhFixPrompt(curLesson);
        let ok = false;
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity  = '0';
            document.body.appendChild(ta);
            ta.select();
            ok = document.execCommand('copy');
            ta.remove();
        } catch (e) {}
        if (ok) { toast('\u{1F4CB} \u63D0\u793A\u8BCD\u5DF2\u590D\u5236\uFF0C\u53BB\u7C98\u7ED9 AI \u5427'); return; }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => toast('\u{1F4CB} \u63D0\u793A\u8BCD\u5DF2\u590D\u5236\uFF0C\u53BB\u7C98\u7ED9 AI \u5427'))
                .catch(() => { const ta = root.querySelector('#ls-zhfix-ta'); if (ta) { ta.value = text; ta.select(); toast('\u81EA\u52A8\u590D\u5236\u4E0D\u53EF\u7528\uFF0C\u5DF2\u586B\u5165\u4E0B\u65B9\u6587\u672C\u6846\uFF0C\u8BF7 Ctrl+C'); } });
        } else {
            const ta = root.querySelector('#ls-zhfix-ta');
            if (ta) { ta.value = text; ta.select(); toast('\u81EA\u52A8\u590D\u5236\u4E0D\u53EF\u7528\uFF0C\u5DF2\u586B\u5165\u4E0B\u65B9\u6587\u672C\u6846\uFF0C\u8BF7 Ctrl+C'); }
        }
    }

    const MATCH_ROUND_SIZE = 5;

    function initMatchState(kind, groups) {
        matchState = {
            kind    : kind,
            groups  : groups,
            gi      : 0,
            total   : groups.reduce((n, g) => n + g.length, 0),
            matched : 0,          // = doneSet.size, 冗余存一份省得反复取
            doneSet : new Set(),  // 已配平短语 key (跨组, 会话持久化的主体)
            misses  : {},         // key -> 错配次数 (跨组累计)
            missLog : {}          // key -> pair (错过的短语, 结果页列出)
        };
    }

    function startMatch() {
        const pairs = shuffle(lessonPhrases());
        if (pairs.length < 2) { toast('\u77ED\u8BED\u592A\u5C11\uFF0C\u65E0\u6CD5\u5339\u914D'); return; }
        initMatchState('lesson', chunkGroups(pairs, getLessonGroupSize()));
        persistMatchSess();
        startMatchGroup();
    }

    // 综合短语匹配: 从全部课程的短语里智能抽一组。
    function startMixedMatch() {
        const pool = mixedPhrasePool();
        if (pool.length < 2) { toast('\u8FD8\u6CA1\u6709\u53EF\u7EC3\u7684\u77ED\u8BED'); return; }
        const size  = getLessonGroupSize() || 30;
        const pairs = pickSmartGroup(pool, loadPracRec().p, size, it => it.key);
        initMatchState('mixed', [pairs]);
        persistMatchSess();
        startMatchGroup();
    }

    function startMatchGroup() {
        const st = matchState;
        if (!st) return;
        // 已配平的不再出现 —— 恢复会话/跳组时直接从断点续
        st.remaining = st.groups[st.gi].filter(p => !st.doneSet.has(p.key));
        st.round     = [];
        st.selEn     = null;
        st.selZh     = null;
        nextMatchRound();
    }

    // 跳到第 gi 组 (进度保留, 已配平的对不重做)
    function jumpToMatchGroup(gi) {
        const st = matchState;
        if (!st || gi < 0 || gi >= st.groups.length) return;
        st.gi = gi;
        persistMatchSess();
        startMatchGroup();
    }

    function nextMatchRound() {
        const st = matchState;
        if (!st) return;
        if (!st.remaining.length) { renderMatchGroupDone(); return; }
        // 收尾轮若只剩 1 对, 必然左右对齐无练习价值 —— 并入本轮。
        let take = MATCH_ROUND_SIZE;
        if (st.remaining.length - take === 1) take += 1;
        st.round = st.remaining.splice(0, take);
        st.selEn = null;
        st.selZh = null;
        renderMatchRound();
    }

    function renderMatchRound() {
        const st    = matchState;
        const panel = root.querySelector('#ls-panel');
        if (!st || !panel) return;
        const grouped = st.groups.length > 1;
        const prog    = grouped
            ? `\u7B2C ${st.gi + 1}/${st.groups.length} \u7EC4 \u00b7 \u5DF2\u5339\u914D ${st.matched} / ${st.total}`
            : `\u5DF2\u5339\u914D ${st.matched} / ${st.total}`;
        const ens = st.round.map((p, i) =>
            `<button class="ls-match-item" data-men="${i}">${esc(p.en)}</button>`).join('');
        // 错位排列 (sattolo): 保证任何一行中文都不与左列英文对齐。
        const zhs = sattolo(st.round.map((p, i) => ({ i: i, zh: p.zh }))).map(o =>
            `<button class="ls-match-item" data-mzh="${o.i}">${esc(o.zh)}</button>`).join('');
        // 组芯片: 各组进度一目了然, 点击直跳 (已配平的对不重做)
        const grpRow = grouped
            ? `<div class="ls-grp-row">\u7EC4:${st.groups.map((g, i) => {
                    const gd  = g.filter(x => st.doneSet.has(x.key)).length;
                    const cls = 'ls-grp-chip' + (i === st.gi ? ' cur' : '') + (gd === g.length ? ' full' : '');
                    return `<button class="${cls}" data-jumpmgrp="${i}">${i + 1}<span class="ls-grp-n">${gd}/${g.length}</span></button>`;
                }).join('')}</div>`
            : '';
        panel.innerHTML = `
            <div class="ls-match">
                <div class="ls-cloze-top">
                    <span class="ls-cloze-prog">${prog}</span>
                    <button class="ls-cloze-quit" id="ls-match-quit">\u9000\u51FA</button>
                </div>
                ${grpRow}
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
            const pair = st.round[st.selEn];
            st.doneSet.add(pair.key);
            st.matched = st.doneSet.size;
            // 本对配平即记档案: 没错配过才算「对」。
            bumpPracRec('p', pair.key, !st.misses[pair.key]);
            persistMatchSess();               // 每配平一对就落盘
            [enBtn, zhBtn].forEach(b => { b.classList.remove('sel'); b.classList.add('done'); b.disabled = true; });
            speak(pair.en);
            st.selEn = null;
            st.selZh = null;
            const prog = root.querySelector('.ls-cloze-prog');
            if (prog) {
                const grouped = st.groups.length > 1;
                prog.textContent = grouped
                    ? `\u7B2C ${st.gi + 1}/${st.groups.length} \u7EC4 \u00b7 \u5DF2\u5339\u914D ${st.matched} / ${st.total}`
                    : `\u5DF2\u5339\u914D ${st.matched} / ${st.total}`;
            }
            const left = root.querySelectorAll('.ls-match-item[data-men]:not(.done)').length;
            if (!left) setTimeout(nextMatchRound, 500);
        } else {
            // 错配: 两个被点的短语都计一次错 —— 无法判断记错的是哪一
            // 侧, 双计让两条都在综合练习里优先重现, 宁多勿漏。
            [st.round[st.selEn], st.round[st.selZh]].forEach(p => {
                st.misses[p.key]  = (st.misses[p.key] || 0) + 1;
                st.missLog[p.key] = p;
            });
            persistMatchSess();               // 错配记录也落盘, 恢复后小结不失真
            [enBtn, zhBtn].forEach(b => b.classList.add('miss'));
            setTimeout(() => {
                [enBtn, zhBtn].forEach(b => b && b.classList.remove('miss', 'sel'));
            }, 450);
            st.selEn = null;
            st.selZh = null;
        }
    }

    // 一组配完: 还有下一组给小结, 最后一组给总结果。
    function renderMatchGroupDone() {
        const st = matchState;
        if (!st) return;
        // 全部组都配平才进总结果 (跳组做完最后一组时, 前面可能还有欠账)
        const allDone = st.groups.every(g => g.every(p => st.doneSet.has(p.key)));
        if (allDone) { renderMatchDone(); return; }
        if (st.gi >= st.groups.length - 1) {
            // 最后一组配平但前面有未完成组 → 引导回去补
            const backGi = st.groups.findIndex(g => g.some(p => !st.doneSet.has(p.key)));
            jumpToMatchGroup(backGi >= 0 ? backGi : 0);
            toast('\u8FD8\u6709\u672A\u5B8C\u6210\u7684\u7EC4\uFF0C\u5DF2\u5E26\u4F60\u56DE\u53BB');
            return;
        }
        const panel = root.querySelector('#ls-panel');
        if (!panel) return;
        const gkeys = new Set(st.groups[st.gi].map(p => p.key));
        const missN = Object.keys(st.misses).filter(k => gkeys.has(k)).length;
        const nextN = st.groups[st.gi + 1].filter(p => !st.doneSet.has(p.key)).length;
        panel.innerHTML = `
            <div class="ls-result">
                <div class="ls-result-score">\u7B2C ${st.gi + 1} \u7EC4 \u2713</div>
                <div class="ls-result-sub">${st.groups[st.gi].length} \u5BF9\u5B8C\u6210${
                    missN ? ` \u00b7 \u9519\u8FC7 ${missN} \u5BF9` : ' \u00b7 \u96F6\u5931\u8BEF'} \u00b7 \u603B\u8FDB\u5EA6 ${st.matched} / ${st.total}</div>
                <div class="ls-result-btns">
                    <button class="wl-btn-primary" id="ls-match-nextgroup">\u2192 \u7EE7\u7EED\u7B2C ${st.gi + 2} \u7EC4\uFF08${nextN} \u5BF9\uFF09</button>
                    <button class="wl-btn-secondary" id="ls-match-quit">\u4F11\u606F\u4E00\u4E0B</button>
                </div>
            </div>`;
    }

    function nextMatchGroup() {
        const st = matchState;
        if (!st || st.gi >= st.groups.length - 1) return;
        st.gi++;
        persistMatchSess();
        startMatchGroup();
    }

    function renderMatchDone() {
        const panel = root.querySelector('#ls-panel');
        if (!panel || !matchState) return;
        const st     = matchState;
        const missed = Object.keys(st.missLog).map(k => st.missLog[k]);
        clearSess('m');                       // 全部配平, 进度存档使命完成
        if (st.kind === 'lesson' && curLesson) {
            bumpProgress(curLesson.id, { matchDone: true });
            renderHeaderProgress();
        }
        try { window.DB?.markActiveDay?.(); } catch (e) {}
        const missRows = missed.map(p => `
            <div class="ls-wrong-row">
                <button class="ls-mini-speak" data-say="${esc(p.en)}">\u{1F50A}</button>
                <span class="ls-wrong-en">${esc(p.en)}</span>
                <span class="ls-wrong-zh">${esc(p.zh)}</span>
            </div>`).join('');
        panel.innerHTML = `
            <div class="ls-result">
                <div class="ls-result-score">\u{1F389}</div>
                <div class="ls-result-sub">${st.total} \u5BF9\u77ED\u8BED\u5168\u90E8\u5339\u914D\u5B8C\u6210\uFF01</div>
                ${missed.length ? `
                    <div class="ls-result-wrong-title">\u9519\u8FC7\u7684\u77ED\u8BED ${missed.length} \u5BF9</div>
                    <div class="ls-wrong-list">${missRows}</div>
                    <div class="ls-result-note">\u5DF2\u8BB0\u5165\u7EC3\u4E60\u6863\u6848\uFF0C\u7EFC\u5408\u7EC3\u4E60\u4F1A\u4F18\u5148\u91CD\u73B0\u8FD9\u4E9B\u77ED\u8BED\u3002</div>`
                  : '<div class="ls-result-perfect">\u96F6\u5931\u8BEF\uFF0C\u6F02\u4EAE\uFF01</div>'}
                <div class="ls-result-btns">
                    <button class="wl-btn-secondary" id="ls-match-again">\u{1F504} \u518D\u6765\u4E00\u8F6E</button>
                    <button class="wl-btn-secondary" id="ls-match-back">\u8FD4\u56DE</button>
                </div>
            </div>`;
        matchState = null;
    }


    // ════════════════════════════════════════════════════════
    // 导入课文 (Windows 端粘贴 AI 识别的 JSON)
    // 设计原则: AI 只产出内容, 不产出任何 ID 和交叉引用 ——
    // 词-句关联由这里按「surface 首次精确出现的句子」自动建立,
    // 消灭视觉识别最易出错的编号/引用错误类。
    // ════════════════════════════════════════════════════════

    let importText = '';   // 校验失败返回修改时保留粘贴内容

    // 识别提示词全文内嵌 —— 复制按钮的关键路径不依赖网络/缓存文件。
    // 与 docs/lesson-import-prompt.md 保持同步; 改动提示词时两处同改。
    const IMPORT_PROMPT = `你是英语教材语料录入助手。我会上传若干张教材课文照片（可能分段拍摄，段落有 Para. N 标号）。
请识别并只输出一个 JSON 对象——不要任何解释文字，不要 Markdown 代码块标记。

转写规则:

1. 逐字转写英文原文，忠实于照片，保持原有段落划分。每段拆分为句子数组，一句一条;
   并为每一句写一句通顺、贴合教材语体的中文翻译，放在该句对象的 "zh" 字段
   （逐句翻译即可，整段译文由应用自动拼接，不需要另写段落 zh）。
2. 标点规范化: 英文文本中的全角标点（，。；：？！""''）一律转为对应的半角英文标点;
   撇号和引号统一用直引号 ' 和 "。数字、缩写（如 Dr. / Mass.）保持原样。
3. 教材中蓝色（或高亮）标注的词汇逐个列出，按课文出现顺序排列:
   - surface: 课文中的原样形式，大小写和屈折形式与正文完全一致（如 injuries、published、Race）
   - lemma: 词典原型（injuries → injury, published → publish, lengthening → lengthen）;
     短语动词和固定短语整体作为一个词条（contributing to 的 lemma 为 contribute to,
     at all times 原样即 lemma）
4. 正文中带波浪下划线或标有「难句」记号的句子，hard 设为 true; 其余为 false。
5. pos 词性缩写: n. / v. / adj. / adv. / prep. / conj. / pron. / phr. / phr. v.，
   多词性用 " / " 连接（如 "n. / v."）。
6. zh 为符合中国高中教材口径的中文释义，多义项用 "; " 分隔;
   多词性时按词性分组（如 "n. 益处; 好处  v. 使受益"）。
7. phrases 为该词 1-3 个高考高频搭配，优先收录课文原文中实际出现的搭配，
   每条含 en 和 zh。确无合适搭配时用空数组 []。
8. 照片中未拍到或无法辨认的内容不要臆造; 无法确认的词条省略并在
   JSON 的 "notes" 字段中用中文说明。

输出格式（严格遵守，只输出这个 JSON）:

{
  "title": "课文英文标题（照片中没有标题时根据内容拟一个简短的）",
  "titleZh": "中文标题",
  "paras": [
    { "sentences": [
        { "text": "First sentence of the paragraph.", "hard": false, "zh": "本句的中文翻译。" },
        { "text": "A sentence marked as difficult.",  "hard": true,  "zh": "本句的中文翻译。" }
    ] }
  ],
  "words": [
    { "surface": "injuries", "lemma": "injury", "pos": "n.",
      "zh": "受伤; 伤害",
      "phrases": [ { "en": "suffer an injury", "zh": "受伤" } ] }
  ],
  "notes": ""
}

输出前自检:
- 每个 surface 必须能在某个句子的 text 中原样找到（区分大小写、含空格的短语完整匹配）
- 每一句都有非空的 zh 句译
- 英文句子中不残留任何全角标点或弯引号
- 词条无重复，短语的 en 和 zh 成对出现`;

    // 英文文本规范化: 拍照识别的三类脏数据 —— 全角标点、弯引号、
    // 空白。中文字段 (zh/titleZh) 不经过此函数。
    function normEn(s) {
        let t = String(s == null ? '' : s);
        const map = {
            '\uFF0C': ',', '\u3002': '.', '\uFF1B': ';', '\uFF1A': ':',
            '\uFF1F': '?', '\uFF01': '!', '\u3001': ',',
            '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"',
            '\uFF08': '(', '\uFF09': ')'
        };
        t = t.replace(/[\uFF0C\u3002\uFF1B\uFF1A\uFF1F\uFF01\u3001\u2018\u2019\u201C\u201D\uFF08\uFF09]/g, ch => map[ch]);
        // 标点后紧跟字母时补空格 (数字如 1,000 不受影响)
        t = t.replace(/([,;:?!])(?=[A-Za-z])/g, '$1 ');
        t = t.replace(/\s+/g, ' ').trim();
        return t;
    }

    // 剥离 AI 常见的输出包装: ```json 围栏、JSON 前后的说明文字。
    function stripFences(s) {
        let t = String(s || '').trim();
        t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
        const a = t.indexOf('{');
        const b = t.lastIndexOf('}');
        if (a >= 0 && b > a && (a > 0 || b < t.length - 1)) t = t.slice(a, b + 1);
        return t;
    }

    function nextUserLessonId() {
        let max = 0;
        userLessons().forEach(l => {
            const m = /^U(\d+)$/.exec(l.id || '');
            if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return 'U' + String(max + 1).padStart(2, '0');
    }

    // 解析 + 规范化 + 校验 + 自动关联。纯函数 (不落盘), 供预览和测试。
    // 返回 { ok, lesson, errors, warnings, stats }。
    function parseImport(jsonText) {
        const errors   = [];
        const warnings = [];
        let raw;
        try { raw = JSON.parse(stripFences(jsonText)); }
        catch (e) {
            return { ok: false, lesson: null, warnings: [], stats: null,
                     errors: ['JSON \u89E3\u6790\u5931\u8D25: ' + e.message] };
        }
        if (!raw || typeof raw !== 'object') {
            return { ok: false, lesson: null, warnings: [], stats: null,
                     errors: ['\u9876\u5C42\u4E0D\u662F JSON \u5BF9\u8C61'] };
        }

        const id      = nextUserLessonId();
        const title   = normEn(raw.title);
        const titleZh = String(raw.titleZh || '').trim();
        if (!title) errors.push('\u7F3A\u5C11 title (\u82F1\u6587\u6807\u9898)');
        if (lessons().some(l => (l.title || '').toLowerCase() === title.toLowerCase())) {
            warnings.push('\u5DF2\u5B58\u5728\u540C\u540D\u8BFE\u6587\u300C' + title + '\u300D\uFF0C\u786E\u8BA4\u4E0D\u662F\u91CD\u590D\u5BFC\u5165');
        }

        // 段落与句子
        const paras = [];
        const rawParas = Array.isArray(raw.paras) ? raw.paras : [];
        if (!rawParas.length) errors.push('paras \u4E3A\u7A7A: \u6CA1\u6709\u8BC6\u522B\u5230\u6BB5\u843D');
        rawParas.forEach((p, pi) => {
            const pid  = `${id}-P${pi + 1}`;
            const sens = [];
            (Array.isArray(p && p.sentences) ? p.sentences : []).forEach((s, si) => {
                const text = normEn(s && s.text);
                if (!text) { errors.push(`\u7B2C ${pi + 1} \u6BB5\u7B2C ${si + 1} \u53E5\u4E3A\u7A7A`); return; }
                const sen = { id: `${pid}-S${si + 1}`, hard: !!(s && s.hard), text: text };
                // 可选句译: 填空页「中文」开关显示整句译文。中文字段
                // 不经过英文规范化, 只做去空白折叠。
                const szh = String(s && s.zh || '').trim().replace(/\s+/g, ' ');
                if (szh) sen.zh = szh;
                sens.push(sen);
            });
            if (!sens.length) errors.push(`\u7B2C ${pi + 1} \u6BB5\u6CA1\u6709\u53E5\u5B50`);
            const para = { id: pid, sentences: sens };
            // 段译 (schema v1 兼容扩展): AI 没给整段译文时由句译拼接,
            // 课文页的「译」按钮因此对只产出句译的导入课也可用。
            const pzh = String(p && p.zh || '').trim().replace(/\s+/g, ' ');
            if (pzh) para.zh = pzh;
            else {
                const joined = sens.map(s => s.zh || '').filter(Boolean).join('');
                if (joined && sens.every(s => s.zh)) para.zh = joined;
            }
            paras.push(para);
        });
        const flatSents = paras.reduce((a, p) => a.concat(p.sentences), []);

        // 词条: 规范化 + 查重 + 自动关联句子
        const words    = [];
        const seenSurf = new Set();
        const rawWords = Array.isArray(raw.words) ? raw.words : [];
        if (!rawWords.length) errors.push('words \u4E3A\u7A7A: \u6CA1\u6709\u8BC6\u522B\u5230\u8BCD\u6C47');
        rawWords.forEach((w, wi) => {
            const label   = `\u8BCD ${wi + 1}`;
            const surface = normEn(w && w.surface);
            const lemma   = normEn(w && w.lemma) || surface;
            const pos     = String(w && w.pos || '').trim();
            const zh      = String(w && w.zh || '').trim().replace(/\s+/g, ' ');
            if (!surface) { errors.push(`${label}: \u7F3A surface`); return; }
            // 只拦结构性字符 & < > " —— 撇号 ' 是合法英文
            // (teenagers' / runner's / don't), 全链路 esc() 转义后
            // 进入页面, 无注入风险, 不得误杀。
            if (/[&<>"]/.test(surface) || /[&<>"]/.test(lemma)) {
                errors.push(`${label} (${surface}): surface/lemma \u542B\u7279\u6B8A\u5B57\u7B26 (& < > \")`); return;
            }
            if (!zh) errors.push(`${label} (${surface}): \u7F3A\u4E2D\u6587\u91CA\u4E49 zh`);
            if (!pos) warnings.push(`${label} (${surface}): \u7F3A\u8BCD\u6027 pos`);
            const dupKey = surface.toLowerCase() + '|' + lemma.toLowerCase();
            if (seenSurf.has(dupKey)) {
                errors.push(`${label} (${surface}): \u8BCD\u6761\u91CD\u590D`); return;
            }
            seenSurf.add(dupKey);

            // 自动关联: surface 作为完整词首次出现的句子。用词边界
            // 匹配 —— 裸 indexOf 会把 "run" 关到含 "runners" 的句子上,
            // 挖空位置随之错位。
            const hit = flatSents.find(s => findWordStart(s.text, surface) >= 0);
            if (!hit) {
                const ci = flatSents.find(s => s.text.toLowerCase().indexOf(surface.toLowerCase()) >= 0);
                errors.push(ci
                    ? `${label} (${surface}): \u6B63\u6587\u4E2D\u4EC5\u6709\u5927\u5C0F\u5199\u4E0D\u4E00\u81F4\u7684\u5F62\u5F0F\uFF0C\u8BF7\u6838\u5BF9 surface`
                    : `${label} (${surface}): \u5728\u6B63\u6587\u4EFB\u4F55\u53E5\u5B50\u4E2D\u627E\u4E0D\u5230\uFF0C\u8BF7\u6838\u5BF9\u62FC\u5199/\u6807\u70B9`);
            }

            const phrases = [];
            (Array.isArray(w && w.phrases) ? w.phrases : []).forEach((ph, pj) => {
                const en = normEn(ph && ph.en);
                const cn = String(ph && ph.zh || '').trim();
                if (!en && !cn) return;                       // 整条为空直接丢弃
                if (!en || !cn) { errors.push(`${label} (${surface}): \u7B2C ${pj + 1} \u4E2A\u77ED\u8BED\u4E2D\u82F1\u4E0D\u6210\u5BF9`); return; }
                phrases.push({ en: en, zh: cn });
            });

            words.push({
                id      : `${id}-W${String(wi + 1).padStart(2, '0')}`,
                lemma   : lemma,
                surface : surface,
                pos     : pos,
                zh      : zh,
                sent    : hit ? hit.id : '',
                phrases : phrases
            });
        });

        if (jsonText.length > 300000) errors.push('\u5185\u5BB9\u8FC7\u5927 (>300KB)\uFF0C\u8BF7\u6309\u8BFE\u62C6\u5206\u5BFC\u5165');
        if (words.length > 200)       warnings.push('\u8BCD\u6761\u8D85\u8FC7 200 \u4E2A\uFF0C\u786E\u8BA4\u662F\u5426\u4E00\u8BFE\u7684\u91CF');

        const stats = {
            paraN   : paras.length,
            sentN   : flatSents.length,
            hardN   : flatSents.filter(s => s.hard).length,
            wordN   : words.length,
            phraseN : words.reduce((n, w) => n + w.phrases.length, 0)
        };
        const lesson = {
            id: id, title: title || '\u672A\u547D\u540D\u8BFE\u6587', titleZh: titleZh,
            paras: paras, words: words
        };
        return { ok: errors.length === 0, lesson: lesson, errors: errors, warnings: warnings, stats: stats };
    }

    // ─── 导入 UI ────────────────────────────────────────────
    function openImport() {
        importText = '';
        renderImportPaste();
        root.querySelector('#ls-import-overlay')?.classList.add('open');
    }
    function closeImport() {
        root.querySelector('#ls-import-overlay')?.classList.remove('open');
    }

    function renderImportPaste() {
        const sheet = root.querySelector('#ls-import-sheet');
        if (!sheet) return;
        sheet.innerHTML = `
            <div class="ls-sheet-head">
                <div class="ls-sheet-word">\u5BFC\u5165\u8BFE\u6587</div>
                <button class="ls-sheet-close" id="ls-import-close">\u00d7</button>
            </div>
            <div class="ls-import-steps">\u2460 \u62CD\u8BFE\u6587\u7167\u7247 \u2192 \u2461 \u628A\u63D0\u793A\u8BCD\u548C\u7167\u7247\u53D1\u7ED9 AI \u2192 \u2462 \u628A AI \u8F93\u51FA\u7684 JSON \u7C98\u5230\u4E0B\u9762</div>
            <button class="wl-btn-secondary" id="ls-import-copy-prompt">\u{1F4CB} \u590D\u5236\u8BC6\u522B\u63D0\u793A\u8BCD</button>
            <textarea class="ls-import-textarea" id="ls-import-json"
                placeholder='\u7C98\u8D34 AI \u8F93\u51FA\u7684 JSON\uFF08\u5E26 \u0060\u0060\u0060 \u56F4\u680F\u6216\u5939\u6742\u8BF4\u660E\u6587\u5B57\u4E5F\u80FD\u81EA\u52A8\u5904\u7406\uFF09'>${esc(importText)}</textarea>
            <div class="ls-import-btn-row">
                <button class="wl-btn-primary" id="ls-import-validate">\u6821\u9A8C\u5E76\u9884\u89C8</button>
            </div>`;
    }

    function renderImportPreview(res) {
        const sheet = root.querySelector('#ls-import-sheet');
        if (!sheet) return;
        const st   = res.stats;
        const errs = res.errors.map(e => `<div class="ls-issue ls-issue-err">\u2717 ${esc(e)}</div>`).join('');
        const wrns = res.warnings.map(w => `<div class="ls-issue ls-issue-warn">\u26A0 ${esc(w)}</div>`).join('');
        sheet.innerHTML = `
            <div class="ls-sheet-head">
                <div class="ls-sheet-word">\u5BFC\u5165\u9884\u89C8</div>
                <button class="ls-sheet-close" id="ls-import-close">\u00d7</button>
            </div>
            <div class="ls-import-preview-title">${esc(res.lesson?.title || '')}
                <span class="ls-import-preview-zh">${esc(res.lesson?.titleZh || '')}</span>
                <span class="ls-import-preview-id">${esc(res.lesson?.id || '')}</span>
            </div>
            ${st ? `<div class="ls-import-stats">${st.paraN} \u6BB5 \u00b7 ${st.sentN} \u53E5\uFF08\u96BE\u53E5 ${st.hardN}\uFF09\u00b7 ${st.wordN} \u8BCD \u00b7 ${st.phraseN} \u77ED\u8BED</div>` : ''}
            ${errs}${wrns}
            ${res.ok ? '<div class="ls-issue ls-issue-ok">\u2713 \u6821\u9A8C\u901A\u8FC7\u3002\u5BFC\u5165\u540E\u8BB0\u5F97: \u8BBE\u7F6E \u2192 \u5BFC\u51FA\u8BCD\u8868 \u2192 \u66F4\u65B0\u97F3\u9891\u5305\uFF0C\u65B0\u8BFE\u53E5\u5B50\u624D\u80FD\u79BB\u7EBF\u6717\u8BFB\u3002</div>' : ''}
            <div class="ls-import-btn-row">
                <button class="wl-btn-secondary" id="ls-import-back">\u2190 \u8FD4\u56DE\u4FEE\u6539</button>
                <button class="wl-btn-primary" id="ls-import-confirm"${res.ok ? '' : ' disabled'}>\u2714 \u786E\u8BA4\u5BFC\u5165</button>
            </div>`;
        sheet._pendingLesson = res.ok ? res.lesson : null;
    }

    function validateImport() {
        const ta = root.querySelector('#ls-import-json');
        importText = ta ? ta.value : '';
        if (!importText.trim()) { toast('\u5148\u7C98\u8D34 JSON'); return; }
        renderImportPreview(parseImport(importText));
    }

    function confirmImport() {
        const sheet  = root.querySelector('#ls-import-sheet');
        const lesson = sheet && sheet._pendingLesson;
        if (!lesson || !window.DB?.saveUserLessons) return;
        const arr = userLessons();
        arr.push(lesson);
        window.DB.saveUserLessons(arr);
        closeImport();
        renderHome();
        toast('\u2713 \u5DF2\u5BFC\u5165\u300C' + lesson.title + '\u300D');
    }

    function copyImportPrompt() {
        // 同步 execCommand 优先: 在用户手势内执行, 兼容性最好;
        // 失败再试异步 clipboard API; 双路都不行则展示手动复制视图。
        let ok = false;
        try {
            const ta = document.createElement('textarea');
            ta.value = IMPORT_PROMPT;
            ta.style.position = 'fixed';
            ta.style.opacity  = '0';
            document.body.appendChild(ta);
            ta.select();
            ok = document.execCommand('copy');
            ta.remove();
        } catch (e) {}
        if (ok) { toast('\u{1F4CB} \u63D0\u793A\u8BCD\u5DF2\u590D\u5236\uFF0C\u53BB\u7C98\u7ED9 AI \u5427'); return; }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(IMPORT_PROMPT)
                .then(() => toast('\u{1F4CB} \u63D0\u793A\u8BCD\u5DF2\u590D\u5236\uFF0C\u53BB\u7C98\u7ED9 AI \u5427'))
                .catch(() => renderImportPromptView());
        } else {
            renderImportPromptView();
        }
    }

    // 兜底: 弹层内直接显示提示词全文并自动全选, 手动 Ctrl+C。
    function renderImportPromptView() {
        const sheet = root.querySelector('#ls-import-sheet');
        if (!sheet) return;
        sheet.innerHTML = `
            <div class="ls-sheet-head">
                <div class="ls-sheet-word">\u8BC6\u522B\u63D0\u793A\u8BCD</div>
                <button class="ls-sheet-close" id="ls-import-close">\u00d7</button>
            </div>
            <div class="ls-import-steps">\u81EA\u52A8\u590D\u5236\u4E0D\u53EF\u7528\uFF0C\u5DF2\u5168\u9009\u4E0B\u6587 \u2014\u2014 \u6309 Ctrl+C \u590D\u5236\u540E\u53D1\u7ED9 AI\u3002</div>
            <textarea class="ls-import-textarea ls-prompt-view" id="ls-prompt-text" readonly></textarea>
            <div class="ls-import-btn-row">
                <button class="wl-btn-secondary" id="ls-import-back">\u2190 \u8FD4\u56DE</button>
            </div>`;
        const ta = sheet.querySelector('#ls-prompt-text');
        if (ta) { ta.value = IMPORT_PROMPT; ta.focus(); ta.select(); }
    }

    function deleteUserLesson(id) {
        const l = lessonById(id);
        if (!l || !isUserLesson(id)) return;
        if (!confirm('\u5220\u9664\u8BFE\u6587\u300C' + l.title + '\u300D\uFF1F\u5B66\u4E60\u8FDB\u5EA6\u8BB0\u5F55\u4E00\u5E76\u6E05\u9664\u3002')) return;
        window.DB?.saveUserLessons?.(userLessons().filter(x => x.id !== id));
        const p = loadProgress();
        if (p[id]) { delete p[id]; saveProgress(p); }
        // 练习档案里该课的键 (词条 ID / 短语 key 都以「课ID-」开头) 一并清除,
        // 否则删课后综合练习的「已练/待强化」统计会一直挂着幽灵条目。
        try {
            const rec  = loadPracRec();
            const pfx  = id + '-';
            let   hit  = false;
            ['w', 'p'].forEach(k => Object.keys(rec[k]).forEach(key => {
                if (key.indexOf(pfx) === 0) { delete rec[k][key]; hit = true; }
            }));
            if (hit) savePracRec(rec);
        } catch (e) {}
        try {
            if (window.DB?.getPref?.('lesson_last', '') === id) window.DB?.setPref?.('lesson_last', '');
        } catch (e) {}
        renderHome();
        toast('\u5DF2\u5220\u9664\u300C' + l.title + '\u300D');
    }

    // ─── Events (单一委托监听，root 内所有交互都走这里) ─────
    function onClick(e) {
        const t = e.target;

        // 通用: 任何带 data-say 的小喇叭
        const sayBtn = t.closest('[data-say]');
        if (sayBtn) { e.stopPropagation(); speak(sayBtn.dataset.say); return; }

        // 课程切换下拉
        if (t.closest('#ls-lesson-switch')) { toggleSwitchMenu(); return; }
        const swItem = t.closest('.ls-switch-item');
        if (swItem) { openLesson(swItem.dataset.switch, curTab); return; }
        // 点菜单外任意处收起 (不 return, 继续处理本次点击)
        if (root.querySelector('#ls-switch-menu.open') && !t.closest('#ls-switch-menu')) {
            toggleSwitchMenu(false);
        }

        // 导入课文 / 删除导入课 (删除按钮在卡片内, 必须先判)
        const delBtn = t.closest('.ls-card-del');
        if (delBtn) { deleteUserLesson(delBtn.dataset.del); return; }
        if (t.closest('#ls-import-open'))         { openImport(); return; }
        if (t.closest('#ls-import-close'))        { closeImport(); return; }
        if (t.closest('#ls-import-copy-prompt'))  { copyImportPrompt(); return; }
        if (t.closest('#ls-import-validate'))     { validateImport(); return; }
        if (t.closest('#ls-import-back'))         { renderImportPaste(); return; }
        if (t.closest('#ls-import-confirm') && !t.closest('#ls-import-confirm').disabled) { confirmImport(); return; }
        const impOverlay = t.closest('#ls-import-overlay');
        if (impOverlay && t === impOverlay) { closeImport(); return; }

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

        // 课文: 整段播放 / 段译显隐
        const paraBtn = t.closest('.ls-para-play');
        if (paraBtn) {
            const p = paraById(curLesson, paraBtn.dataset.para);
            if (p) playSentences((p.sentences || []).map(s => s.id));
            return;
        }
        const trBtn = t.closest('.ls-para-tr');
        if (trBtn) { toggleParaZh(trBtn.dataset.tr); return; }
        if (t.closest('#ls-read-zh-all')) { toggleAllParaZh(); return; }

        // 综合练习入口 (主页卡片)
        if (t.closest('#ls-mixed-cloze')) { openMixed('cloze'); return; }
        if (t.closest('#ls-mixed-match')) { openMixed('match'); return; }

        // 会话恢复与组间跳转
        if (t.closest('#ls-cloze-resume-sess')) { resumeClozeSess(null); return; }
        const rg = t.closest('[data-resumegrp]');
        if (rg) { resumeClozeSess(Number(rg.dataset.resumegrp)); return; }
        const jg = t.closest('[data-jumpgrp]');
        if (jg) { jumpToClozeGroup(Number(jg.dataset.jumpgrp)); return; }
        if (t.closest('#ls-match-resume-sess')) { resumeMatchSess(null); return; }
        const rmg = t.closest('[data-resumemgrp]');
        if (rmg) { resumeMatchSess(Number(rmg.dataset.resumemgrp)); return; }
        const jmg = t.closest('[data-jumpmgrp]');
        if (jmg) { jumpToMatchGroup(Number(jmg.dataset.jumpmgrp)); return; }

        // 补句译 (导入课数据修补)
        if (t.closest('#ls-zh-fix'))       { openZhFixSheet(); return; }
        if (t.closest('#ls-zhfix-ai'))     { runZhFixAI(); return; }
        if (t.closest('#ls-zhfix-copy'))   { copyZhFixPrompt(); return; }
        if (t.closest('#ls-zhfix-apply'))  { applyZhFixPaste(); return; }

        // 填空 —— 单课与综合共用同一套渲染, 按 curLesson 分流启动函数,
        // 退出/返回按 curLesson 决定回单课 tab 还是回综合设置页。
        if (t.closest('#ls-cloze-choice')) { curLesson ? startCloze('choice') : startMixedCloze('choice'); return; }
        if (t.closest('#ls-cloze-spell'))  { curLesson ? startCloze('spell')  : startMixedCloze('spell');  return; }
        if (t.closest('#ls-cloze-quit'))   { curLesson ? switchTab('cloze') : renderMixedSetupPanel(); return; }
        if (t.closest('#ls-cloze-prev'))   { clozeGoPrev(); return; }
        if (t.closest('#ls-cloze-nextq'))  { clozeGoNext(); return; }
        if (t.closest('#ls-zh-toggle'))    { toggleClozeZh(); return; }
        const opt = t.closest('.ls-opt');
        if (opt && !opt.disabled) { submitChoice(opt.dataset.opt); return; }
        if (t.closest('#ls-spell-submit')) { submitSpell(); return; }
        if (t.closest('#ls-cloze-next'))   { clozeGoNext(); return; }
        if (t.closest('#ls-cloze-resume')) { clozeResume(); return; }
        if (t.closest('#ls-cloze-nextgroup')) { nextClozeGroup(); return; }
        if (t.closest('#ls-cloze-again')) {
            if (!clozeState) return;
            const m = clozeState.mode, h = clozeState.hint;
            curLesson ? startCloze(m, h) : startMixedCloze(m, h);
            return;
        }
        if (t.closest('#ls-cloze-back'))   { curLesson ? switchTab('cloze') : renderMixedSetupPanel(); return; }

        // 短语匹配
        if (t.closest('#ls-match-start'))     { curLesson ? startMatch() : startMixedMatch(); return; }
        if (t.closest('#ls-match-nextgroup')) { nextMatchGroup(); return; }
        if (t.closest('#ls-match-again'))     { curLesson ? startMatch() : startMixedMatch(); return; }
        if (t.closest('#ls-match-quit') || t.closest('#ls-match-back')) {
            curLesson ? switchTab('phrases') : renderMixedSetupPanel();
            return;
        }
        const mEn = t.closest('.ls-match-item[data-men]');
        if (mEn) { pickMatch('en', Number(mEn.dataset.men), mEn); return; }
        const mZh = t.closest('.ls-match-item[data-mzh]');
        if (mZh) { pickMatch('zh', Number(mZh.dataset.mzh), mZh); return; }
    }

    // ─── 键盘快捷键 (桌面端) ────────────────────────────────
    // 仅在课文视图可见时生效。填空题目页: ←/→ 切题、1-4 选项、
    // 回车下一题; 拼写输入框聚焦且可编辑时不拦截方向键/回车,
    // 保证光标移动与输入框自身的回车提交不受影响。Esc 关闭弹层。
    function onKeyDown(e) {
        const view = document.getElementById('view-lessons');
        if (!view || !view.classList.contains('active')) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;

        if (e.key === 'Escape') {
            const sm = root.querySelector('#ls-switch-menu.open');
            if (sm) { toggleSwitchMenu(false); e.preventDefault(); return; }
            const ws = root.querySelector('#ls-sheet-overlay.open');
            if (ws) { closeWordSheet(); e.preventDefault(); return; }
            const io = root.querySelector('#ls-import-overlay.open');
            if (io) { closeImport(); e.preventDefault(); return; }
            return;
        }

        // 组小结页: 回车 = 继续下一组 (跟「回车下一题」的手感一致)
        if (e.key === 'Enter' && root.querySelector('#ls-cloze-nextgroup')) {
            nextClozeGroup(); e.preventDefault(); return;
        }

        // 其余快捷键只作用于填空的题目页 (结果页/设置页不响应)。
        // 以 clozeState + 题目页 DOM 为准, 单课与综合练习通用。
        if (!clozeState || !root.querySelector('.ls-cloze')) return;
        const st     = clozeState;
        const queue  = clozeQueue(st);
        const tag    = (e.target && e.target.tagName) || '';
        const typing = (tag === 'INPUT' || tag === 'TEXTAREA') && !e.target.disabled;
        if (typing) return;

        if (e.key === 'ArrowLeft')  { clozeGoPrev(); e.preventDefault(); return; }
        if (e.key === 'ArrowRight') { clozeGoNext(); e.preventDefault(); return; }
        if (e.key === 'Enter') {
            if (st.answers[queue[st.idx].id]) { clozeGoNext(); e.preventDefault(); }
            return;
        }
        if (/^[1-4]$/.test(e.key) && st.mode === 'choice') {
            const w = queue[st.idx];
            if (!st.answers[w.id] && st.opts[w.id]) {
                const oid = st.opts[w.id][Number(e.key) - 1];
                if (oid) { submitChoice(oid); e.preventDefault(); }
            }
            return;
        }
    }

    // ─── Init ───────────────────────────────────────────────
    function init() {
        root = document.getElementById('ls-root');
        if (!root) return;
        root.addEventListener('click', onClick);
        document.addEventListener('keydown', onKeyDown);
        // 记住上次打开的课 —— 同步重载/刷新后回到原处
        const last = window.DB?.getPref?.('lesson_last', '');
        if (last && lessonById(last)) openLesson(last);
        else renderHome();
    }

    return {
        init          : init,
        stopPlay      : stopPlay,
        speechEntries : speechEntries,
        parseImport   : parseImport,   // 纯函数, 供测试/调试
        _sattolo      : sattolo        // 供测试: 错位排列不变量
    };
})();
