// ============================================================
// my-words.js — Word Study Module
// Modes: Browse (toggle CN) | Quiz (Chinese MCQ)
// ============================================================

window.MyWords = (function() {

    let currentIdx   = 0;
    let studyList    = [];
    let isEnriching  = false;
    let studyMode    = 'browse';
    let viewMode     = 'cards';
    let showChinese  = false;
    let quizScore    = 0;
    let quizTotal    = 0;
    let quizAnswered = false;
    let currentGroup = 0;
    let shuffleOn    = false;  // view-only shuffle toggle — never mutates stored order
    let shuffleSeed  = 0;      // stable seed so the shuffled order is consistent across renders/reloads
    let studyFilter  = 'all'; // 'all' | 'core' | 'pronunciation' | 'spelling'

    // --- Autoplay state ---
    // Per-component on/off lives in localStorage prefs (autoplay_endef,
    // autoplay_cn, autoplay_collo, autoplay_sent) and is read fresh inside
    // speakCurrentAndQueueNext so toggling Settings mid-session takes effect
    // on the next card. The word itself is always pronounced.
    let autoplayOn      = false;
    let autoplayTimer   = null;  // timeout id for next-word scheduling
    let autoplayToken   = 0;     // increments on every stop; callbacks check this to abort
    let wakeLock        = null;  // Screen Wake Lock sentinel while autoplay runs

    // --- Progress persistence (per-filter) ---
    function saveProgress() {
        // Guard against writing bad values. currentGroup or currentIdx can
        // transiently go to -1 if studyList was empty at a bad moment; we
        // don't want to persist that to localStorage (it would freeze the
        // UI on subsequent loads until a manual reset).
        const safeIdx   = Math.max(0, currentIdx   | 0);
        const safeGroup = Math.max(0, currentGroup | 0);
        const data = { idx: safeIdx, group: safeGroup, mode: studyMode, view: viewMode,
                       qScore: quizScore, qTotal: quizTotal, filter: studyFilter };
        window.DB.setPref('mw_progress', JSON.stringify(data));
        // Also save per-filter position
        window.DB.setPref('mw_pos_' + studyFilter, JSON.stringify({ idx: safeIdx, group: safeGroup, qScore: quizScore, qTotal: quizTotal }));
    }

    function loadProgress() {
        try {
            const raw = window.DB.getPref('mw_progress', '{}');
            return JSON.parse(raw);
        } catch { return {}; }
    }

    function loadFilterPosition(filter) {
        try {
            const raw = window.DB.getPref('mw_pos_' + filter, '{}');
            return JSON.parse(raw);
        } catch { return {}; }
    }

    function getGroupSize() {
        return parseInt(window.DB.getPref('group_size', '50')) || 50;
    }

    function getFilteredList() {
        if (studyFilter === 'all') return studyList;
        // Due filter pulls from DB directly so it always reflects current
        // review state (a word becomes "not due" the moment you review it).
        if (studyFilter === 'due') {
            try { return window.DB.getDueWords(); }
            catch { return studyList; }
        }
        return studyList.filter(w => {
            const focus = Array.isArray(w.focus) ? w.focus : [];
            return focus.includes(studyFilter);
        });
    }

    function getGroupCount() {
        return Math.max(1, Math.ceil(getFilteredList().length / getGroupSize()));
    }

    function getGroupWords() {
        const filtered = getFilteredList();
        const size     = getGroupSize();
        const start    = currentGroup * size;
        const group    = filtered.slice(start, start + size);
        // In quiz mode, put weak words first so they get practiced sooner
        if (studyMode === 'quiz' && studyFilter !== 'weak') {
            const weak    = group.filter(w => (w.focus || []).includes('weak'));
            const nonWeak = group.filter(w => !(w.focus || []).includes('weak'));
            return [...weak, ...nonWeak];
        }
        return group;
    }

    function init() {
        console.log('[MyWords] init started');
        showChinese = window.DB.getPref('show_cn_default', 'false') === 'true';
        shuffleOn   = window.DB.getPref('mw_shuffle', 'false') === 'true';
        shuffleSeed = parseInt(window.DB.getPref('mw_shuffle_seed', '0'), 10) || 0;
        autoLoadBuiltinIfFirstRun();   // 首次运行开箱即用：自动纳入核心词
        bindEvents();
        refreshStudyList();

        // Restore progress. Clamp both group and idx to >= 0 — without
        // Math.max(_, 0) these can go to -1 if studyList was transiently
        // empty (e.g. during a sync-pull reload), which then freezes the
        // UI on an empty render even after data becomes available.
        const prog = loadProgress();
        if (prog.mode)  studyMode    = prog.mode;
        if (prog.view)  viewMode     = prog.view;
        if (prog.filter) studyFilter  = prog.filter;
        // 'due' (复习 / SRS) is now a valid persisted filter — keep it so the
        // review mode survives reloads instead of snapping back to All.
        if (prog.group != null) currentGroup = Math.max(0, Math.min(prog.group, getGroupCount() - 1));
        if (prog.idx   != null) currentIdx   = Math.max(0, Math.min(prog.idx, getGroupWords().length - 1));
        if (prog.qScore != null) quizScore = prog.qScore;
        if (prog.qTotal != null) quizTotal = prog.qTotal;

        // Sync UI toggles — derive display mode from saved studyMode + viewMode
        const dm = studyMode === 'quiz' ? 'quiz' : viewMode === 'list' ? 'list' : 'cards';
        document.getElementById('mw-dm-cards')?.classList.toggle('active', dm === 'cards');
        document.getElementById('mw-dm-list')?.classList.toggle('active', dm === 'list');
        document.getElementById('mw-dm-quiz')?.classList.toggle('active', dm === 'quiz');
        // Sync filter pills
        document.querySelectorAll('.mw-filter-pill').forEach(b => {
            b.classList.toggle('active', b.dataset.filter === studyFilter);
        });
        const cnBtn = document.getElementById('mw-toggle-cn');
        if (cnBtn) {
            cnBtn.style.display = studyMode === 'quiz' ? 'none' : '';
            cnBtn.classList.toggle('active', showChinese);
            cnBtn.innerHTML = showChinese
                ? '\u{1F441}<span class="mw-btn-label"> Hide CN</span>'
                : '\u{1F441}<span class="mw-btn-label"> Show CN</span>';
        }

        render();
        console.log('[MyWords] init complete, words:', studyList.length, 'group:', currentGroup, 'idx:', currentIdx);

        // Defensive retry: if init ran before localStorage was fully
        // populated (e.g., racing with a sync pull that reloaded the
        // page), the initial render may show 0 words even though the
        // notebook is there. After a short delay, re-check and re-render
        // if the stored notebook now has words but studyList is empty.
        // Only triggers once — doesn't re-run on subsequent renders.
        setTimeout(() => {
            const stored = window.DB.loadNotebook();
            if (stored.length > 0 && studyList.length === 0) {
                console.warn('[MyWords] recovery: studyList was empty but storage has', stored.length, 'words — re-rendering');
                refreshStudyList();
                // Reset currentGroup/currentIdx defensively since previous
                // clamp produced bad values when list was empty.
                currentGroup = Math.max(0, Math.min(currentGroup, getGroupCount() - 1));
                currentIdx   = Math.max(0, Math.min(currentIdx,   getGroupWords().length - 1));
                render();
            }
        }, 800);

        // Self-healing render: if mw-area ends up empty but the notebook
        // has words, re-render. Triggers on page-visibility change (user
        // switches tabs back), window focus, and storage events (sync
        // pulls in another tab/SW). Catches the observed symptom where
        // the UI shows 0 words despite localStorage being intact.
        const maybeHeal = () => {
            const area = document.getElementById('mw-area');
            if (!area) return;
            const isOnMyWordsTab = document.getElementById('view-my-words')?.classList.contains('active');
            if (!isOnMyWordsTab) return;
            const hasNoContent = area.children.length === 0;
            const storedCount  = window.DB.loadNotebook().length;
            if (hasNoContent && storedCount > 0) {
                console.warn('[MyWords] self-heal: UI empty but storage has', storedCount, 'words — re-rendering');
                refreshStudyList();
                currentGroup = Math.max(0, Math.min(currentGroup, getGroupCount() - 1));
                currentIdx   = Math.max(0, Math.min(currentIdx,   getGroupWords().length - 1));
                render();
            }
        };
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) maybeHeal();
        });
        window.addEventListener('focus', maybeHeal);
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.includes('notebook')) maybeHeal();
        });

        // Sync pulls now apply data silently (without a page reload) and
        // dispatch this event so live modules can refresh their views.
        // Re-pull notebook from storage and re-render if MyWords is the
        // active tab. If the user is on a different tab, the next time
        // they open MyWords they'll see fresh data via the normal init.
        window.addEventListener('hsv:datachanged', () => {
            const isOnMyWordsTab = document.getElementById('view-my-words')?.classList.contains('active');
            refreshStudyList();
            window.App?.updateNotebookBadge?.();
            if (isOnMyWordsTab) {
                currentGroup = Math.max(0, Math.min(currentGroup, getGroupCount() - 1));
                currentIdx   = Math.max(0, Math.min(currentIdx, getGroupWords().length - 1));
                render();
                updateFilterCounts();
            }
        });

        // Also run one extra time after a slightly longer delay to catch
        // any post-load render clobbering (e.g., by sync pulls that
        // apply data without a full reload).
        setTimeout(maybeHeal, 2000);
    }

    function bindEvents() {
        // Import — 单一 addEventListener。旧版是三重绑定（HTML 内联
        // onclick + onclick 属性 + 监听器），点击一次触发两遍；开弹窗
        // 幂等所以看不出来，但掩盖了真实的处理链路。
        const importBtn = document.getElementById('mw-import-btn');
        if (importBtn) importBtn.addEventListener('click', openImportModal);
        document.getElementById('mw-import-close')?.addEventListener('click', closeImportModal);
        document.getElementById('mw-import-submit')?.addEventListener('click', handleImport);
        document.getElementById('mw-import-paste')?.addEventListener('click', pasteFromClipboard);
        const loadCore = document.getElementById('mw-load-core');
        const loadAll  = document.getElementById('mw-load-all');
        const hsMeta   = window.HS_VOCAB_META;
        if (loadCore) {
            if (hsMeta) loadCore.textContent = `载入核心词 (${hsMeta.core})`;
            loadCore.addEventListener('click', () => loadBuiltinVocab('core'));
        }
        if (loadAll) {
            if (hsMeta) loadAll.textContent = `载入全部 (${hsMeta.count})`;
            loadAll.addEventListener('click', () => loadBuiltinVocab('all'));
        }
        document.getElementById('mw-add-single')?.addEventListener('click', handleAddSingle);
        document.getElementById('mw-single-input')?.addEventListener('keydown', (e) => {
            const dropdown = document.getElementById('mw-search-dropdown');
            if (e.key === 'Enter') {
                e.preventDefault();
                // If dropdown has a highlighted item, navigate to it
                const highlighted = dropdown?.querySelector('.mw-sd-item.mw-sd-highlight');
                if (highlighted) {
                    highlighted.click();
                    return;
                }
                // If dropdown has exactly one match, navigate to it
                const items = dropdown?.querySelectorAll('.mw-sd-item');
                if (items && items.length === 1) {
                    items[0].click();
                    return;
                }
                // Otherwise add as new word
                handleAddSingle();
            }
            if (e.key === 'Escape') {
                closeSearchDropdown();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                navigateDropdown(e.key === 'ArrowDown' ? 1 : -1);
            }
        });
        document.getElementById('mw-single-input')?.addEventListener('input', handleSearchInput);
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.mw-quick-add')) closeSearchDropdown();
        });

        // Batch enrich
        document.getElementById('mw-batch-enrich')?.addEventListener('click', batchEnrichCopy);
        document.getElementById('mw-batch-paste')?.addEventListener('click', openBatchPasteModal);
        document.getElementById('mw-cloze-btn')?.addEventListener('click', () => {
            window.Cloze?.open?.(getGroupWords(), currentGroup, studyFilter);
        });

        // Navigation
        document.getElementById('mw-prev')?.addEventListener('click', () => { stopAutoplay(); navigate(-1); });
        document.getElementById('mw-next')?.addEventListener('click', () => { stopAutoplay(); navigate(1); });
        document.getElementById('mw-shuffle')?.addEventListener('click', () => { stopAutoplay(); toggleShuffle(); });

        // v75: swipe left/right anywhere on the card area to walk through
        // study words. Stops autoplay if running, mirroring the prev/next
        // button behavior. Skipped in list mode since list scrolls
        // vertically and a horizontal gesture there shouldn't navigate.
        const mwArea = document.getElementById('mw-area');
        if (mwArea && window.App?.bindSwipe) {
            window.App.bindSwipe(mwArea, {
                onPrev: () => {
                    if (viewMode === 'list') return;
                    stopAutoplay();
                    navigate(-1);
                },
                onNext: () => {
                    if (viewMode === 'list') return;
                    stopAutoplay();
                    navigate(1);
                }
            });
        }

        // Autoplay toggle
        document.getElementById('mw-autoplay')?.addEventListener('click', toggleAutoplay);

        // View / mode toggles — unified three-way
        document.getElementById('mw-dm-cards')?.addEventListener('click', () => { stopAutoplay(); setDisplayMode('cards'); });
        document.getElementById('mw-dm-list')?.addEventListener('click', () => { stopAutoplay(); setDisplayMode('list'); });
        document.getElementById('mw-dm-quiz')?.addEventListener('click', () => { stopAutoplay(); setDisplayMode('quiz'); });

        // Show/hide Chinese toggle
        document.getElementById('mw-toggle-cn')?.addEventListener('click', toggleChinese);

        // Focus filter pills
        document.querySelectorAll('.mw-filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                stopAutoplay();
                // Save current filter's position before switching
                saveProgress();
                // Switch filter
                studyFilter = btn.dataset.filter;
                // Restore saved position for this filter
                const pos    = loadFilterPosition(studyFilter);
                currentGroup = Math.min(pos.group || 0, Math.max(0, getGroupCount() - 1));
                currentIdx   = Math.min(pos.idx   || 0, Math.max(0, getGroupWords().length - 1));
                quizScore    = pos.qScore || 0;
                quizTotal    = pos.qTotal || 0;
                // Update active state
                document.querySelectorAll('.mw-filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                saveProgress();
                render();
            });
        });

        // Delegated clicks
        document.getElementById('mw-area')?.addEventListener('click', handleAreaClick);

        // Keyboard
        document.addEventListener('keydown', (e) => {
            const view = document.getElementById('view-my-words');
            if (!view || !view.classList.contains('active')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowLeft')  { e.preventDefault(); stopAutoplay(); navigate(-1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); stopAutoplay(); navigate(1); }
            if (e.key === ' ')          { e.preventDefault(); toggleChinese(); }
            if (e.key === 'p' || e.key === 'P') { e.preventDefault(); toggleAutoplay(); }
            // R = remove current word (with confirmation). Only fires in
            // card or quiz view — list view already has per-row buttons,
            // and a global R could remove the wrong word there.
            if ((e.key === 'r' || e.key === 'R') && viewMode === 'cards') {
                e.preventDefault();
                stopAutoplay();
                const words = getGroupWords();
                const w     = words[currentIdx];
                if (!w) return;
                if (!confirm(`确定移除 "${w.word}"？\n\n此操作无法撤销，但你之后可以重新添加。`)) return;
                window.DB.removeNotebookWord(w.word);
                refreshStudyList();
                if (currentIdx >= studyList.length) currentIdx = Math.max(0, studyList.length - 1);
                render();
                updateFilterCounts();
                window.App?.updateNotebookBadge?.();
                window.App?.showToast?.(`"${w.word}" removed.`);
            }
        });
    }

    function refreshStudyList() {
        const nb  = window.DB.loadNotebook();
        // Shuffle is a VIEW transform only — the stored notebook order is
        // never mutated, so switching back to sequential restores the
        // canonical order. The seed keeps the permutation stable across
        // re-renders and reloads.
        studyList = shuffleOn ? _seededShuffle(nb, shuffleSeed) : nb;
    }

    // Deterministic shuffle (mulberry32 PRNG + Fisher–Yates). A given seed
    // always yields the same permutation, so navigation stays coherent and
    // the order survives reloads. Returns a new array; input is untouched.
    function _seededShuffle(arr, seed) {
        let s = (seed >>> 0) || 1;
        const rng = () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // 无偏洗牌（Fisher–Yates，返回新数组，不动原数组）。
    // sort(() => Math.random() - 0.5) 的比较器不满足一致性要求，多数引擎
    // 下分布明显有偏——测验的正确选项会偏向固定槽位，学生可能学会"猜位置"。
    function _shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // Register a day of study activity for the streak. Idempotent per day
    // (cheap to call on every gesture) and tied to real user actions only —
    // never to background re-renders — so the streak reflects genuine study.
    function markStudyActivity() {
        try {
            const before = window.DB.loadStats?.().streakDays;
            window.DB.markActiveDay?.();
            const after  = window.DB.loadStats?.().streakDays;
            if (before !== after) window.App?.refreshStats?.();
        } catch {}
    }

    // =====================================================
    // MODE / VIEW
    // =====================================================

    function setDisplayMode(dm) {
        // dm = 'cards' | 'list' | 'quiz'
        if (dm === 'quiz') {
            studyMode    = 'quiz';
            viewMode     = 'cards';
            showChinese  = window.DB.getPref('show_cn_default', 'false') === 'true';
            quizAnswered = false;
            currentIdx   = 0;
            quizScore    = 0;
            quizTotal    = 0;
        } else {
            studyMode = 'browse';
            viewMode  = dm;  // 'cards' or 'list'
        }
        // Update three-way toggle active state
        document.getElementById('mw-dm-cards')?.classList.toggle('active', dm === 'cards');
        document.getElementById('mw-dm-list')?.classList.toggle('active', dm === 'list');
        document.getElementById('mw-dm-quiz')?.classList.toggle('active', dm === 'quiz');
        // CN toggle: visible in cards/list, hidden in quiz
        const cnBtn = document.getElementById('mw-toggle-cn');
        if (cnBtn) cnBtn.style.display = dm === 'quiz' ? 'none' : '';
        saveProgress();
        render();
    }

    // Legacy wrappers (for any external callers)
    function setStudyMode(mode) {
        setDisplayMode(mode === 'quiz' ? 'quiz' : 'cards');
    }
    function setView(mode) {
        setDisplayMode(mode === 'list' ? 'list' : 'cards');
    }

    function toggleChinese() {
        showChinese = !showChinese;
        markStudyActivity();
        const btn = document.getElementById('mw-toggle-cn');
        if (btn) {
            btn.classList.toggle('active', showChinese);
            // Keep the label in sync with state. Without this the button
            // text stays stale after a direct tap (only navigate()/lookup
            // refreshed it), so it could read "Show CN" while CN is shown.
            btn.innerHTML = showChinese
                ? '\u{1F441}<span class="mw-btn-label"> Hide CN</span>'
                : '\u{1F441}<span class="mw-btn-label"> Show CN</span>';
        }
        // Toggle all Chinese text elements
        document.querySelectorAll('.mw-cn').forEach(el => {
            el.classList.toggle('mw-cn-visible', showChinese);
        });
    }

    // =====================================================
    // IMPORT
    // =====================================================

    function openImportModal() { document.getElementById('mw-import-modal').classList.add('open'); }
    function closeImportModal() { document.getElementById('mw-import-modal').classList.remove('open'); }

    async function pasteFromClipboard() {
        try {
            const text = await navigator.clipboard.readText();
            document.getElementById('mw-import-input').value = text;
            window.App?.showToast?.('已从剪贴板粘贴。');
        } catch { window.App?.showToast?.('无法读取剪贴板，请手动粘贴。'); }
    }

    function handleImport() {
        const raw = (document.getElementById('mw-import-input')?.value || '').trim();
        if (!raw) { window.App?.showToast?.('请先粘贴你的单词表。'); return; }

        let count = 0;

        // Detect format: rich (WORD: / PHONETIC: / ...) or simple (word | meaning)
        if (raw.includes('WORD:') && raw.includes('PHONETIC:')) {
            count = importRichFormat(raw);
        } else {
            count = importSimpleFormat(raw);
        }

        window.App?.showToast?.(`已导入 ${count} 个单词。`);
        window.App?.updateNotebookBadge?.();
        refreshStudyList();
        currentIdx = 0;
        render();
        closeImportModal();
        document.getElementById('mw-import-input').value = '';
    }

    // 批量载入内置高中词库到生词本。与用户粘贴导入不同（那条走
    // upsertNotebookWord、会计入每日“新词”统计），这里一次性写入生词本，
    // 且不触碰每日日志——载入词库不等于当天学了这么多词。已有的词自动跳过。
    function loadBuiltinVocab(scope) {
        const all = window.HS_VOCAB;
        if (!Array.isArray(all) || !all.length) {
            window.App?.showToast?.('内置词库未加载。'); return;
        }
        const pick  = (scope === 'core') ? all.filter(v => v.level === '核心') : all;
        const label = (scope === 'core') ? '核心词' : '全部高中词汇';
        if (!confirm(`载入 ${pick.length} 个${label}到生词本？已有的词会自动跳过。`)) return;

        const nb   = window.DB.loadNotebook() || [];
        const have = new Set(nb.map(w => String(w.word || '').trim().toLowerCase()));
        const now  = Date.now();
        let added  = 0;
        for (const v of pick) {
            const key = String(v.word || '').trim().toLowerCase();
            if (!key || have.has(key)) continue;
            have.add(key);
            nb.push({
                word     : v.word,
                meaning  : v.meaning || '',
                enDef    : '',
                collo    : '',
                colloCn  : '',
                register : 'neutral',
                context  : '',
                focus    : [],
                level    : v.level || '',
                freq     : (typeof v.freq === 'number') ? v.freq : null,
                source   : '高中核心词汇',
                addedAt  : now
            });
            added++;
        }
        window.DB.saveNotebook(nb);          // 一次写入；同步钩子推送一次
        const skipped = pick.length - added;
        window.App?.showToast?.(`已载入 ${added} 个${label}${skipped > 0 ? `（跳过 ${skipped} 个已有）` : ''}。`);
        window.App?.updateNotebookBadge?.();
        refreshStudyList();
        currentIdx = 0;
        render();
        closeImportModal();
    }

    // 首次运行自动把「高中核心词汇」纳入生词本，做到开箱即用。
    // 安全前提：仅当①未标记过 ②生词本为空 ③本机还没配置云同步 时才载入。
    // 未配置同步时 push() 直接返回，saveNotebook 不会误推；一旦某台设备配置了
    // 同步，其它设备走同步拉取、不会重复自动载入，避免覆盖已丰富的数据。
    function autoLoadBuiltinIfFirstRun() {
        try {
            if (window.DB.getPref('builtin_autoloaded', '') === '1') return;
            const nb = window.DB.loadNotebook() || [];
            if (nb.length) { window.DB.setPref('builtin_autoloaded', '1'); return; }
            const pfx = (window.APP_CONFIG && window.APP_CONFIG.STORAGE_PREFIX) || 'hsv_';
            const syncConfigured = !!(localStorage.getItem(pfx + 'sync_token') || localStorage.getItem(pfx + 'sync_gist_id'));
            if (syncConfigured) return;   // 交给同步拉取，避免覆盖
            const all = window.HS_VOCAB;
            if (!Array.isArray(all) || !all.length) return;
            const now = Date.now();
            const entries = all.filter(v => v.level === '核心').map(v => ({
                word: v.word, meaning: v.meaning || '', enDef: '', collo: '', colloCn: '',
                register: 'neutral', context: '', focus: [], level: v.level || '',
                freq: (typeof v.freq === 'number') ? v.freq : null, source: '高中核心词汇', addedAt: now
            }));
            if (!entries.length) return;
            window.DB.saveNotebook(entries);          // 无 token → 不推送，安全
            window.DB.setPref('builtin_autoloaded', '1');
            console.log('[MyWords] 首次运行自动载入', entries.length, '个核心词');
        } catch (e) { console.warn('[MyWords] 自动载入内置词库失败', e); }
    }

    // 离线中文词典查询：命中返回 { meaning, collo }，否则 null。
    // 先精确匹配，再试小写、首字母大写（覆盖 April / abandon 两类键）。
    function dictLookup(word) {
        const d = window.BASIC_DICTIONARY;
        if (!d || !word) return null;
        const w = String(word).trim();
        if (!w) return null;
        return d[w]
            || d[w.toLowerCase()]
            || d[w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()]
            || null;
    }

    function importSimpleFormat(raw) {
        let words = [];

        // Detect format by analyzing content
        const hasNewlines   = raw.includes('\n');
        const hasPipe       = raw.includes('|');
        const hasTab        = raw.includes('\t');
        const hasCommas     = raw.includes(',');
        const hasSemicolons = raw.includes(';');

        if (hasNewlines && (hasPipe || hasTab)) {
            // Structured: one entry per line with | or tab separators
            // e.g. "word | meaning | notes"
            const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                const parts = line.split(/[|\t]/).map(s => s.trim());
                if (parts[0]) words.push({ word: parts[0], meaning: parts[1] || '', collo: parts[2] || '' });
            }
        } else if (hasNewlines && !hasCommas && !hasSemicolons) {
            // One word/phrase per line (no other delimiters)
            const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                if (line) words.push({ word: line });
            }
        } else if (hasCommas) {
            // Comma-separated: "word1, word2, word3" or "word1,word2"
            const items = raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
            for (const item of items) {
                // Each item might still have | for meaning
                if (item.includes('|')) {
                    const parts = item.split('|').map(s => s.trim());
                    words.push({ word: parts[0], meaning: parts[1] || '', collo: parts[2] || '' });
                } else {
                    words.push({ word: item });
                }
            }
        } else if (hasSemicolons) {
            // Semicolon-separated: "word1; word2; word3"
            const items = raw.split(/[;\n]/).map(s => s.trim()).filter(Boolean);
            for (const item of items) {
                if (item.includes('|')) {
                    const parts = item.split('|').map(s => s.trim());
                    words.push({ word: parts[0], meaning: parts[1] || '', collo: parts[2] || '' });
                } else {
                    words.push({ word: item });
                }
            }
        } else if (raw.includes(' ') && !hasNewlines) {
            // Space-separated: "word1 word2 word3 word4"
            // Only split if tokens look like a vocabulary list, not a phrase
            const tokens      = raw.split(/\s+/).filter(Boolean);
            const funcWords   = new Set(['i','a','an','the','is','am','are','was','were','be','it','my','me','your','you','we','our','he','she','his','her','they','them','their','to','of','in','on','at','by','for','with','from','not','no','do','does','did','has','have','had','can','could','will','would','shall','should','may','might']);
            const vocabTokens = tokens.filter(t => !funcWords.has(t.toLowerCase()));
            const avgLen      = vocabTokens.reduce((s, t) => s + t.length, 0) / (vocabTokens.length || 1);

            // Split only if: 4+ non-function tokens AND most tokens are content words
            if (vocabTokens.length >= 4 && vocabTokens.length > tokens.length * 0.7 && avgLen > 4) {
                for (const t of tokens) {
                    if (!funcWords.has(t.toLowerCase())) words.push({ word: t });
                }
            } else {
                words.push({ word: raw.trim() });
            }
        } else {
            // Single word/phrase
            words.push({ word: raw.trim() });
        }

        // Deduplicate and save
        let count = 0;
        const seen = new Set();
        for (const entry of words) {
            const w = (entry.word || '').trim();
            if (!w || w.length > 100) continue;
            const key = w.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const hit = entry.meaning ? null : dictLookup(w);
            window.DB.upsertNotebookWord({
                word    : w,
                meaning : entry.meaning || (hit && hit.meaning) || '',
                collo   : entry.collo   || (hit && hit.collo)   || '',
                source  : hit ? '离线词典' : 'Import',
                tags    : ['imported']
            });
            count++;
        }
        return count;
    }

    function importRichFormat(raw) {
        // Normalize line endings
        raw = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

        // Recognised field labels. A `LABEL: value` line is only treated
        // as a new field when LABEL is one of these — otherwise it is a
        // continuation line. This stops example/note text that happens to
        // begin with an uppercase word + colon (e.g. "WARNING: ...",
        // "NASA: ...") from being silently parsed as a phantom field and
        // dropping the rest of the entry's content.
        const KNOWN = new Set([
            'WORD', 'INPUT', 'PHONETIC', 'MEANING_CN', 'MEANING_EN',
            'REGISTER', 'COLLOCATIONS', 'COLLOCATIONS_CN',
            'EXAMPLE', 'EXAMPLE_CN', 'NOTE'
        ]);

        // Line-by-line parser. Lines matching a KNOWN `LABEL: value`
        // pattern start (or continue) a labelled field. Other lines are
        // treated as continuation of the previous field — appended with a
        // space — so multi-line NOTE / EXAMPLE_CN / COLLOCATIONS content
        // from the AI doesn't get silently dropped.
        const lines     = raw.split('\n');
        const results   = [];
        let current     = null;
        let lastLabel   = null;

        for (const line of lines) {
            const trimmed = line.trim();
            // An explicit '---' ends the current entry's field context.
            // A blank line is just skipped — it must NOT reset lastLabel,
            // or a blank line inside a multi-line NOTE/EXAMPLE would drop
            // every continuation line after it.
            if (trimmed === '---') { lastLabel = null; continue; }
            if (!trimmed)          { continue; }

            const m = trimmed.match(/^([A-Z][A-Z_]+):\s*(.*)$/);
            if (m && KNOWN.has(m[1])) {
                const label = m[1];
                const value = (m[2] || '').trim();

                // If we hit a new WORD:, save previous and start new entry
                if (label === 'WORD') {
                    if (current && current.WORD) results.push(current);
                    current   = { WORD: value };
                    lastLabel = 'WORD';
                } else if (current) {
                    current[label] = value;
                    lastLabel      = label;
                }
            } else if (current && lastLabel) {
                // Continuation line — append to the previous field with a
                // space separator. Skip if there's no field to append to
                // (e.g. stray text before the first WORD:).
                const prev = current[lastLabel] || '';
                current[lastLabel] = prev ? `${prev} ${trimmed}` : trimmed;
            }
        }
        // Don't forget the last entry
        if (current && current.WORD) results.push(current);

        let count = 0;
        for (const f of results) {
            // INPUT is the word exactly as the user stored it (the AI
            // echoes it back). WORD is the canonical lemma. Matching on
            // INPUT guarantees the original notebook row is updated even
            // when the AI lemmatised an inflected form — that was the
            // cause of "one word never finishes enriching".
            window.DB.upsertNotebookWord({
                word      : f.WORD              || f.INPUT || '',
                phonetic  : f.PHONETIC          || '',
                meaning   : f.MEANING_CN        || '',
                enDef     : f.MEANING_EN         || '',
                register  : normRegister(f.REGISTER),
                collo     : f.COLLOCATIONS      || '',
                colloCn   : f.COLLOCATIONS_CN   || '',
                context   : f.EXAMPLE           || '',
                contextCn : f.EXAMPLE_CN        || '',
                note      : f.NOTE              || '',
                source    : 'Batch enriched',
                tags      : ['enriched']
            }, { matchWord: f.INPUT || '', countNew: false });
            count++;
        }
        console.log('[importRich] parsed', results.length, 'entries, saved', count);
        return count;
    }

    // =====================================================
    // SEARCH / FIND WORD
    // =====================================================

    function handleSearchInput() {
        const input = document.getElementById('mw-single-input');
        const query = (input?.value || '').trim().toLowerCase();
        if (query.length < 1) { closeSearchDropdown(); return; }

        const matches = studyList.filter(w => {
            const word    = (w.word || '').toLowerCase();
            const meaning = (w.meaning || '').toLowerCase();
            const collo   = (w.collo || '').toLowerCase();
            return word.includes(query) || meaning.includes(query) || collo.includes(query);
        }).slice(0, 8); // limit to 8 results

        const dropdown = document.getElementById('mw-search-dropdown');
        if (!dropdown) return;

        if (matches.length === 0) {
            dropdown.innerHTML = `<div class="mw-sd-empty">No match — press Enter or + to add "<strong>${escHtml(query)}</strong>"</div>`;
            dropdown.style.display = 'block';
            return;
        }

        dropdown.innerHTML = matches.map((w, i) => {
            const meaning = w.meaning || w.enDef || '';
            const phonetic = w.phonetic ? `<span class="mw-sd-phonetic">${escHtml(w.phonetic)}</span>` : '';
            const collo    = w.collo ? `<span class="mw-sd-collo">${escHtml(w.collo)}</span>` : '';
            // Highlight the matching part in the word
            const wordHtml = highlightMatch(w.word || '', query);
            return `<div class="mw-sd-item" data-word="${escAttr(w.word)}" data-idx="${i}">
                <span class="mw-sd-word">${wordHtml}</span>
                ${phonetic}
                <span class="mw-sd-meaning">${escHtml(meaning)}</span>
                ${collo}
            </div>`;
        }).join('');
        dropdown.style.display = 'block';

        // Click to navigate
        dropdown.querySelectorAll('.mw-sd-item').forEach(item => {
            item.addEventListener('click', () => {
                navigateToWord(item.dataset.word);
                closeSearchDropdown();
                const input = document.getElementById('mw-single-input');
                if (input) input.value = '';
            });
        });
    }

    function highlightMatch(text, query) {
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx < 0) return escHtml(text);
        const before = escHtml(text.slice(0, idx));
        const match  = escHtml(text.slice(idx, idx + query.length));
        const after  = escHtml(text.slice(idx + query.length));
        return `${before}<mark>${match}</mark>${after}`;
    }

    function closeSearchDropdown() {
        const dropdown = document.getElementById('mw-search-dropdown');
        if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
    }

    function navigateDropdown(dir) {
        const dropdown = document.getElementById('mw-search-dropdown');
        if (!dropdown) return;
        const items   = [...dropdown.querySelectorAll('.mw-sd-item')];
        if (items.length === 0) return;
        const current = items.findIndex(i => i.classList.contains('mw-sd-highlight'));
        items.forEach(i => i.classList.remove('mw-sd-highlight'));
        let next = current + dir;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        items[next].classList.add('mw-sd-highlight');
        items[next].scrollIntoView({ block: 'nearest' });
    }

    function navigateToWord(wordText) {
        if (!wordText) return;
        const wordLow = wordText.toLowerCase();

        // Switch to "all" filter to find the word
        studyFilter = 'all';
        document.querySelectorAll('.mw-filter-pill').forEach(b =>
            b.classList.toggle('active', b.dataset.filter === 'all')
        );

        refreshStudyList();
        const globalIdx = studyList.findIndex(w => (w.word || '').toLowerCase() === wordLow);
        if (globalIdx < 0) {
            window.App?.showToast?.(`"${wordText}" not found.`);
            return;
        }

        // Calculate which group and position within group
        const size  = getGroupSize();
        currentGroup = Math.floor(globalIdx / size);
        currentIdx   = globalIdx % size;

        // Switch to card mode to show the card
        studyMode    = 'browse';
        viewMode     = 'cards';
        showChinese  = true; // show meaning since user is looking up
        document.getElementById('mw-dm-cards')?.classList.toggle('active', true);
        document.getElementById('mw-dm-list')?.classList.toggle('active', false);
        document.getElementById('mw-dm-quiz')?.classList.toggle('active', false);
        const cnBtn = document.getElementById('mw-toggle-cn');
        if (cnBtn) { cnBtn.style.display = ''; cnBtn.classList.add('active'); }

        saveProgress();
        render();
        window.App?.showToast?.(`已找到：${wordText}`);
    }

    // =====================================================
    // ADD SINGLE WORD
    // =====================================================

    function handleAddSingle() {
        const input = document.getElementById('mw-single-input');
        const word  = (input?.value || '').trim();
        if (!word) return;
        const hit = dictLookup(word);
        window.DB.upsertNotebookWord({
            word    : word,
            meaning : (hit && hit.meaning) || '',
            collo   : (hit && hit.collo)   || '',
            source  : hit ? '离线词典' : 'Quick add',
            tags    : ['imported']
        });
        input.value = '';
        window.App?.showToast?.(`"${word}" added.`);
        window.App?.updateNotebookBadge?.();
        refreshStudyList();
        // Keep current position — new word appends to the end of the list
        // Clamp index in case group bounds shifted
        const groupWords = getGroupWords();
        if (currentIdx >= groupWords.length) currentIdx = Math.max(0, groupWords.length - 1);
        saveProgress();
        render();
    }

    // =====================================================
    // BATCH ENRICH — copy prompt for all words, paste back
    // =====================================================

    function isWordComplete(w) {
        // A word is "complete" if it has phonetic + meaning + enDef + at least one collocation + example
        return Boolean(w.phonetic && w.meaning && w.enDef && w.collo && w.context);
    }

    // register 白名单。AI 回填的 REGISTER 会被拼进卡片的 class 与文本，
    // 若不收敛到已知集合，异常回复（含引号/尖括号）可注入 HTML 破版。
    // 入库（importRichFormat / enrichWithAPI）和渲染两侧都过这一层。
    const REGISTERS = new Set(['formal', 'neutral', 'casual', 'academic', 'technical']);
    function normRegister(r) {
        const v = String(r || '').trim().toLowerCase();
        return REGISTERS.has(v) ? v : 'neutral';
    }

    function batchEnrichCopy() {
        refreshStudyList();
        if (studyList.length === 0) { window.App?.showToast?.('没有可丰富的单词。'); return; }

        // 只补全「当前分组」里缺信息的词 —— 支持按组逐步回填，避免一次上千词。
        const groupWords      = getGroupWords();
        const incomplete      = groupWords.filter(w => !isWordComplete(w));
        const totalIncomplete = getFilteredList().filter(w => !isWordComplete(w)).length;

        if (incomplete.length === 0) {
            window.App?.showToast?.(totalIncomplete > 0
                ? `本组已全部完整。切到下一组继续补全（全部还剩 ${totalIncomplete} 个）。`
                : '所有单词都已完整！');
            return;
        }

        // 每行「单词 | 现有中文释义」——已有释义的词让 AI 原样保留、只补其它字段。
        const wordList = incomplete.map(w => (w.meaning ? `${w.word} | ${w.meaning}` : w.word)).join('\n');

        const prompt = `Please provide detailed vocabulary entries for each word/phrase below. Use this EXACT format for EACH word, separated by "---":

LEMMA RULE: If a word is inflected (plural, past tense, -ing/-ed form, comparative, superlative, irregular form), provide the entry for its BASE FORM (lemma) in the WORD field. Examples: "capping" → entry for "cap"; "went" → entry for "go"; "studies" → entry for "study"; "better" → entry for "good". For phrases, keep the phrase intact (don't lemmatize individual words inside a phrase). If the input is already in base form, use it unchanged.

ECHO RULE: Each line below is either "word" or "word | existing Chinese meaning". The INPUT field must contain ONLY the word part (before " | "), copied EXACTLY as it appears (same spelling, same case), even when WORD differs because of the LEMMA RULE. The app uses INPUT to match the entry back to the correct record, so it must never be changed or omitted.

MEANING RULE: These are Chinese senior-high-school (Gaokao) vocabulary words. If a line already gives a Chinese meaning after " | ", REUSE it verbatim in MEANING_CN (do not rewrite, shorten, or re-order it); only write MEANING_CN yourself when no meaning is given. Keep example sentences natural but appropriate for a high-school learner's level.

WORD: [the base form / lemma; for phrases, the phrase as given]
INPUT: [the original word, copied verbatim from the list below]
PHONETIC: [IPA pronunciation, e.g. /\u02C8r\u00E6m.b\u028A.t\u0259n/]
MEANING_CN: [reuse the provided Chinese meaning verbatim if one is given after " | "; otherwise a concise Chinese meaning, 2-20 chars]
MEANING_EN: [Clear English definition, 1-2 sentences]
REGISTER: [formal|neutral|casual|academic|technical]
COLLOCATIONS: [3-4 common collocations or phrases, separated by " \u00B7 "]
COLLOCATIONS_CN: [Chinese translation of each collocation above, same order, separated by " \u00B7 "]
EXAMPLE: [A natural example sentence using the word in context]
EXAMPLE_CN: [Chinese translation of the example sentence]
NOTE: [Usage tip: when/how native speakers use this, common mistakes to avoid, or cultural context. 1-2 sentences]
---

Here are the words that need enrichment (${incomplete.length} in this group):

${wordList}

IMPORTANT:
- Provide accurate IPA phonetic transcription
- Collocations and their Chinese translations must be in the same order
- Example sentences should reflect real-world usage, not textbook-style
- Notes should highlight what a Chinese speaker specifically needs to know
- Apply the LEMMA RULE above: return entries for base forms, not inflected input
- Apply the ECHO RULE above: every entry MUST include an INPUT line copying the original word verbatim
- Separate each entry with "---"
- Do NOT use markdown formatting, just plain text`;

        navigator.clipboard.writeText(prompt).then(() => {
            window.App?.showToast?.(`已复制本组 ${incomplete.length} 个待补全词的提示词${totalIncomplete > incomplete.length ? `（全部还剩 ${totalIncomplete} 个）` : ''}。到 Claude.ai 粘贴，再把结果回填。`, 5000);
            window.open('https://claude.ai/new', '_blank');
        }).catch(() => {
            openBatchPasteModal();
        });
    }

    function openBatchPasteModal() {
        let modal = document.getElementById('mw-batch-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id        = 'mw-batch-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-card">
                    <div class="modal-header">
                        <h2>粘贴丰富后的数据</h2>
                        <button class="modal-close" onclick="document.getElementById('mw-batch-modal').classList.remove('open')">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p class="settings-hint">Paste the full response from Claude.ai. All words will be updated with phonetics, meanings, examples, etc.</p>
                        <textarea id="mw-batch-input" class="mw-import-textarea" rows="12" placeholder="在此粘贴 AI 的回复..."></textarea>
                        <button class="wl-btn-primary" id="mw-batch-apply" style="width:100%;margin-top:10px">应用到所有单词</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('mw-batch-apply').addEventListener('click', () => {
                const text = (document.getElementById('mw-batch-input')?.value || '').trim();
                if (!text) { window.App?.showToast?.('请先粘贴 AI 的回复。'); return; }
                const count = importRichFormat(text);
                window.App?.showToast?.(`已更新 ${count} 个单词的丰富数据。`);
                window.App?.updateNotebookBadge?.();
                refreshStudyList();
                currentIdx = 0;
                showChinese = true;
                const cnBtn = document.getElementById('mw-toggle-cn');
                if (cnBtn) { cnBtn.classList.add('active'); cnBtn.innerHTML = '\u{1F441}<span class="mw-btn-label"> Hide CN</span>'; }
                render();
                modal.classList.remove('open');
                document.getElementById('mw-batch-input').value = '';
            });
        }
        modal.classList.add('open');
    }

    // =====================================================
    // NAVIGATION
    // =====================================================

    // ----- SRS REVIEW -----
    // Called when the user taps one of the four SRS feedback buttons in
    // due-filter card view. Records the review against the current word,
    // re-pulls the due list (the word is no longer due, so the list shrinks),
    // and advances to the next word. If no due words remain, shows a
    // celebratory toast and falls back to the All filter.
    function handleSrsReview(result) {
        const words = getGroupWords();
        const w     = words[currentIdx];
        if (!w) return;

        const updated = window.DB.recordReview?.(w.word, result);
        if (!updated) {
            window.App?.showToast?.('无法记录复习。');
            return;
        }

        const labels = { wrong: '明天', hard: '2天后', good: '几天后', easy: '更久' };
        window.App?.showToast?.(`已学 "${w.word}" \u2014 下次复习在 ${labels[result] || '几天后'}.`);

        // Refresh underlying data and the filtered list
        refreshStudyList();

        // If we're still in due-filter mode and the list shrank, snap idx
        // back into range and re-render.
        const remaining = getGroupWords();
        if (remaining.length === 0) {
            // All due words reviewed — celebrate and bounce to All view.
            const stats = window.DB.getReviewStats?.();
            window.App?.showToast?.(
                stats && stats.due === 0
                    ? '\u{1F389} All caught up! No more words due today.'
                    : 'No more words in this group.',
                4000
            );
            studyFilter = 'all';
            currentIdx  = 0;
            // Sync filter pill UI
            document.querySelectorAll('.mw-filter-pill').forEach(b => {
                b.classList.toggle('active', b.dataset.filter === 'all');
            });
            saveProgress();
            render();
            updateFilterCounts();
            return;
        }

        if (currentIdx >= remaining.length) currentIdx = 0;
        saveProgress();
        render();   // 完整渲染：renderBrowseCard 不会刷新顶部 x/y 计数器，复习后列表已缩短
    }

    function navigate(dir) {
        const words = getGroupWords();
        if (words.length === 0) return;
        markStudyActivity();
        currentIdx += dir;
        // Wrap within group
        if (currentIdx >= words.length) currentIdx = 0;
        if (currentIdx < 0) currentIdx = words.length - 1;
        showChinese  = window.DB.getPref('show_cn_default', 'false') === 'true';
        quizAnswered = false;
        const cnBtn = document.getElementById('mw-toggle-cn');
        if (cnBtn) {
            cnBtn.classList.toggle('active', showChinese);
            cnBtn.innerHTML = showChinese ? '\u{1F441}<span class="mw-btn-label"> Hide CN</span>' : '\u{1F441}<span class="mw-btn-label"> Show CN</span>';
        }
        saveProgress();
        render();
        speakCurrent();
    }

    function navigateGroup(dir) {
        const total = getGroupCount();
        currentGroup += dir;
        if (currentGroup >= total) currentGroup = 0;
        if (currentGroup < 0) currentGroup = total - 1;
        currentIdx   = 0;
        quizScore    = 0;
        quizTotal    = 0;
        quizAnswered = false;
        saveProgress();
        render();
    }

    function toggleShuffle() {
        shuffleOn = !shuffleOn;
        if (shuffleOn) {
            // Fresh permutation each time shuffle is switched on.
            shuffleSeed = ((Date.now() & 0x7fffffff) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
            window.DB.setPref('mw_shuffle_seed', String(shuffleSeed));
        }
        window.DB.setPref('mw_shuffle', shuffleOn ? 'true' : 'false');
        currentIdx   = 0;
        quizAnswered = false;
        updateShuffleBtn();
        saveProgress();
        render();
        window.App?.showToast?.(shuffleOn ? 'Shuffled.' : 'Sequential order.');
    }

    function updateShuffleBtn() {
        const btn = document.getElementById('mw-shuffle');
        if (!btn) return;
        btn.classList.toggle('mw-shuffle-on', shuffleOn);
        btn.title = shuffleOn
            ? 'Shuffle on \u2014 tap for sequential order'
            : 'Shuffle off \u2014 tap to shuffle';
    }

    function speakCurrent() {
        const words = getGroupWords();
        const w = words[currentIdx];
        if (w) window.App?.speak?.(w.word);
    }

    // =====================================================
    // AUTOPLAY — walk through words reading each one aloud
    // =====================================================

    function updateAutoplayBtn() {
        const btn = document.getElementById('mw-autoplay');
        if (!btn) return;
        if (autoplayOn) {
            btn.innerHTML = '&#x23F8;&#xFE0F;<span class="mw-btn-label"> Stop</span>';   // ⏸️ pause
            btn.title     = 'Stop auto-play';
            btn.classList.add('mw-autoplay-on');
        } else {
            btn.innerHTML = '&#x25B6;&#xFE0F;<span class="mw-btn-label"> Play</span>';   // ▶️ play
            btn.title     = 'Auto-play pronunciations';
            btn.classList.remove('mw-autoplay-on');
        }
    }

    function startAutoplay() {
        // Autoplay only makes sense in card view (browsing one word at a time).
        // If user is in list view, flip them to cards first.
        if (viewMode !== 'cards' || studyMode === 'quiz') {
            setDisplayMode('cards');
        }
        const words = getGroupWords();
        if (words.length === 0) {
            window.App?.showToast?.('没有可播放的单词。');
            return;
        }
        autoplayOn = true;
        autoplayToken++;
        acquireWakeLock();   // keep screen on while autoplay runs
        updateAutoplayBtn();
        speakCurrentAndQueueNext(autoplayToken);
    }

    function stopAutoplay() {
        autoplayOn = false;
        autoplayToken++;    // invalidates any pending callbacks
        if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
        window.App?.stopSpeak?.();
        releaseWakeLock();   // let the screen sleep again
        document.querySelectorAll('.mw-card-playing, .mw-speaking-now')
            .forEach(el => el.classList.remove('mw-card-playing', 'mw-speaking-now'));
        updateAutoplayBtn();
    }

    // --- Screen Wake Lock --------------------------------------------
    // Prevents the phone's screen from auto-dimming/locking during
    // autoplay sessions. Without this, Chrome suspends the tab when
    // the screen goes dark and TTS stops mid-session.
    // Browser auto-releases the lock when the tab is hidden; we re-
    // acquire it when autoplay is still on and the tab becomes visible.
    async function acquireWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.log('[Autoplay] Wake Lock API not supported — screen may dim during playback');
            return;
        }
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('[Autoplay] Screen wake lock acquired');
            wakeLock.addEventListener('release', () => {
                console.log('[Autoplay] Wake lock released by system');
                wakeLock = null;
            });
        } catch (err) {
            console.warn('[Autoplay] Wake lock request failed:', err.message);
            wakeLock = null;
        }
    }

    async function releaseWakeLock() {
        if (!wakeLock) return;
        try {
            await wakeLock.release();
        } catch (err) {
            console.warn('[Autoplay] Wake lock release failed:', err.message);
        }
        wakeLock = null;
    }

    // Re-acquire wake lock if the user switches to another tab and comes back
    // while autoplay is still running. The browser auto-releases on hide.
    document.addEventListener('visibilitychange', () => {
        if (autoplayOn && !document.hidden && !wakeLock) {
            acquireWakeLock();
        }
    });

    function toggleAutoplay() {
        if (autoplayOn) stopAutoplay();
        else            startAutoplay();
    }

    // Speak current word → each collocation → example sentence → wait → next.
    // The `myToken` pattern prevents stale callbacks from firing after stop.
    function speakCurrentAndQueueNext(myToken) {
        if (!autoplayOn || myToken !== autoplayToken) return;
        const words = getGroupWords();
        const w     = words[currentIdx];
        if (!w) { stopAutoplay(); return; }

        // Highlight current card so the user can follow along on mobile
        const cardEl = document.querySelector('.mw-card');
        if (cardEl) cardEl.classList.add('mw-card-playing');

        // Default kept in sync with speak()/speakNative() (0.9). A
        // different default here made autoplay run at a different pace
        // than a manual tap when no speed was saved yet.
        const rate = parseFloat(window.DB.getPref('speech_speed', '0.9')) || 0.9;

        // Per-component toggles (word itself is always on). Read fresh each
        // card so the user can flip these in Settings without restarting.
        const playEnDef = window.DB.getPref('autoplay_endef', 'true') === 'true';
        const playCn    = window.DB.getPref('autoplay_cn',    'true') === 'true';
        const playColo  = window.DB.getPref('autoplay_collo', 'true') === 'true';
        const playSent  = window.DB.getPref('autoplay_sent',  'true') === 'true';

        // Build the speech queue for this card. Each item is {text, lang}
        // so the TTS engine can switch between English and Chinese voices
        // between utterances. Order (per user preference):
        //   1. the word itself            (EN) — always on
        //   2. the English definition     (EN) — pref: autoplay_endef
        //   3. the Chinese meaning        (CN) — pref: autoplay_cn
        //   4. each collocation           (EN) — pref: autoplay_collo
        //   5. the example sentence       (EN) — pref: autoplay_sent
        const queue = [{ text: w.word, lang: 'en-US' }];
        if (playEnDef && w.enDef && w.enDef.trim()) {
            queue.push({ text: w.enDef, lang: 'en-US' });
        }
        if (playCn && w.meaning && w.meaning.trim()) {
            queue.push({ text: w.meaning, lang: 'zh-CN' });
        }
        if (playColo && w.collo) {
            (w.collo || '').split(/\s*·\s*/).map(s => s.trim()).filter(Boolean)
                .forEach(c => queue.push({ text: c, lang: 'en-US' }));
        }
        if (playSent && w.context && w.context.trim()) {
            queue.push({ text: w.context, lang: 'en-US' });
        }

        playQueue(queue, rate, myToken, () => {
            if (!autoplayOn || myToken !== autoplayToken) return;
            scheduleNext(myToken);
        });
    }

    // Play a list of {text, lang} items sequentially with a short pause
    // between each. Stops cleanly if autoplay is cancelled or the token
    // is invalidated. Accepts plain strings too for backward compat —
    // these default to the system voice (English).
    function playQueue(items, rate, myToken, onDone) {
        let i = 0;
        const next = () => {
            if (!autoplayOn || myToken !== autoplayToken) return;
            if (i >= items.length) { onDone && onDone(); return; }
            const entry = items[i++];
            const text  = typeof entry === 'string' ? entry : entry.text;
            const lang  = typeof entry === 'string' ? ''    : (entry.lang || '');
            // Briefly highlight which collocation/example is being spoken
            highlightSpeakable(text);
            // Chinese voices on most systems are fixed at rate 1.0 by the
            // engine regardless — but we pass rate anyway for consistency.
            const opts = lang ? { lang } : undefined;
            window.App?.speak?.(text, rate, () => {
                if (!autoplayOn || myToken !== autoplayToken) return;
                // Small pause between items (shorter than between-cards gap)
                autoplayTimer = setTimeout(next, 350);
            }, opts);
        };
        next();
    }

    // Add a transient glow to the collocation/example currently being spoken
    // so the user can visually track progress through the card.
    function highlightSpeakable(text) {
        const norm = (text || '').trim().toLowerCase();
        if (!norm) return;
        // Clear any prior highlights
        document.querySelectorAll('.mw-speaking-now').forEach(el => el.classList.remove('mw-speaking-now'));
        // Find a .mw-speakable element whose dataset.speak matches
        const match = Array.from(document.querySelectorAll('.mw-speakable'))
            .find(el => (el.dataset.speak || '').trim().toLowerCase() === norm);
        if (match) match.classList.add('mw-speaking-now');
    }

    function scheduleNext(myToken) {
        // Pause between words so the user has a beat to register it
        autoplayTimer = setTimeout(() => {
            if (!autoplayOn || myToken !== autoplayToken) return;
            // Clear the "playing" highlight from the outgoing card
            document.querySelectorAll('.mw-card-playing, .mw-speaking-now')
                .forEach(el => el.classList.remove('mw-card-playing', 'mw-speaking-now'));

            const words = getGroupWords();
            if (words.length === 0) { stopAutoplay(); return; }

            // Advance. If we hit the end of the group, stop gracefully
            // rather than looping — looping would play forever.
            if (currentIdx >= words.length - 1) {
                stopAutoplay();
                window.App?.showToast?.('本组已完成。');
                return;
            }
            currentIdx++;
            showChinese  = window.DB.getPref('show_cn_default', 'false') === 'true';
            quizAnswered = false;
            saveProgress();
            render();
            speakCurrentAndQueueNext(myToken);
        }, 1200);
    }

    // =====================================================
    // RENDER
    // =====================================================

    function render() {
        const area      = document.getElementById('mw-area');
        const counter   = document.getElementById('mw-counter');
        const groupInfo = document.getElementById('mw-group-info');
        if (!area) { console.warn('[MyWords] render: mw-area element missing, bailing'); return; }
        refreshStudyList();
        updateShuffleBtn();
        console.log('[MyWords] render: studyList=' + studyList.length + ' currentGroup=' + currentGroup + ' currentIdx=' + currentIdx + ' mode=' + studyMode + ' view=' + viewMode + ' filter=' + studyFilter);

        const words      = getGroupWords();
        const groupCount = getGroupCount();
        console.log('[MyWords] render: getGroupWords=' + words.length + ' groupCount=' + groupCount);

        // Update group info
        if (groupInfo) {
            if (groupCount > 1) {
                groupInfo.style.display = 'flex';
                groupInfo.innerHTML = `
                    <button class="mw-nav-btn mw-grp-btn" id="mw-prev-group">&#x25C0;</button>
                    <span class="mw-grp-label"><span class="mw-btn-label">组</span><span class="mw-grp-short">G</span><span class="mw-grp-num">${currentGroup + 1}/${groupCount}</span></span>
                    <button class="mw-nav-btn mw-grp-btn" id="mw-next-group">&#x25B6;</button>`;
                document.getElementById('mw-prev-group')?.addEventListener('click', () => navigateGroup(-1));
                document.getElementById('mw-next-group')?.addEventListener('click', () => navigateGroup(1));
            } else {
                groupInfo.style.display = 'none';
            }
        }

        // Update counter (position only — incomplete-word indicator
        // goes to a separate badge below the nav row)
        if (counter) {
            if (studyMode === 'quiz' && quizTotal > 0) {
                counter.textContent = `${currentIdx + 1}/${words.length} (${quizScore}/${quizTotal})`;
            } else {
                counter.textContent = words.length > 0 ? `${currentIdx + 1}/${words.length}` : '0 words';
            }
        }

        // Update enrich-badge — on desktop shows a parenthesized count
        // next to the "AI enrich" label (e.g. "✨ AI enrich (12)"). On
        // mobile the count span is hidden via CSS; the subtle accent
        // dot from .mw-has-pending remains the only visual indicator.
        // Tooltip is set in both cases for accessibility and for desktop
        // hover-to-confirm before acting.
        const enrichBtn   = document.getElementById('mw-batch-enrich');
        const enrichCount = document.getElementById('mw-enrich-count');
        if (enrichBtn) {
            const incomplete = getGroupWords().filter(w => !isWordComplete(w)).length;
            if (incomplete > 0) {
                enrichBtn.title = `AI 补全 —— 本组还有 ${incomplete} 个待补全`;
                enrichBtn.classList.add('mw-has-pending');
                if (enrichCount) enrichCount.textContent = ` (${incomplete})`;
            } else {
                enrichBtn.title = 'AI 补全 —— 本组已全部完整';
                enrichBtn.classList.remove('mw-has-pending');
                if (enrichCount) enrichCount.textContent = '';
            }
        }

        if (studyList.length === 0) {
            area.innerHTML = `<div class="mw-empty"><p>还没有单词。点上方的「导入 📥」载入内置高中核心词汇，或直接在上方快速添加。</p></div>`;
            updateFilterCounts();
            return;
        }

        if (words.length === 0 && studyFilter !== 'all') {
            const labels = { core: '\u2B50 核心', pronunciation: '\uD83D\uDD0A 发音', spelling: '\u270F\uFE0F 拼写' };
            area.innerHTML = `<div class="mw-empty"><p>No words marked as ${labels[studyFilter] || studyFilter} yet.</p><p style="font-size:13px;color:var(--text-tertiary)">Browse your words and tap the ${labels[studyFilter]} button to mark them, then come back here.</p></div>`;
            updateFilterCounts();
            return;
        }
        if (viewMode === 'list')       { renderList(); updateFilterCounts(); return; }
        if (studyMode === 'quiz')      { renderQuizCard(); updateFilterCounts(); return; }
        renderBrowseCard();
        updateFilterCounts();
    }

    function updateFilterCounts() {
        const allCount   = studyList.length;
        const coreCount  = studyList.filter(w => (w.focus || []).includes('core')).length;
        const pronCount  = studyList.filter(w => (w.focus || []).includes('pronunciation')).length;
        const spellCount = studyList.filter(w => (w.focus || []).includes('spelling')).length;
        const weakCount  = studyList.filter(w => (w.focus || []).includes('weak')).length;
        // Due count comes from DB rather than studyList so it reflects fresh
        // review state, not the (sometimes stale) cached list.
        let dueCount = 0;
        try { dueCount = window.DB.getDueCount?.() || 0; } catch {}

        const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n > 0 ? `(${n})` : ''; };
        set('mw-fc-due',           dueCount);
        set('mw-fc-all',           allCount);
        set('mw-fc-core',          coreCount);
        set('mw-fc-pronunciation', pronCount);
        set('mw-fc-spelling',      spellCount);
        set('mw-fc-weak',          weakCount);

        // Show/hide filter row. Always show if any words are marked OR
        // any due words exist OR we're not on the All filter.
        const hasAnyMarked = coreCount + pronCount + spellCount + weakCount > 0;
        const filterRow    = document.getElementById('mw-filter-row');
        if (filterRow) filterRow.style.display =
            (hasAnyMarked || dueCount > 0 || studyFilter !== 'all') ? 'flex' : 'none';
    }

    // ----- BROWSE (toggle CN) -----

    function renderBrowseCard() {
        const area  = document.getElementById('mw-area');
        const words = getGroupWords();
        const w     = words[currentIdx];
        if (!w) return;

        const hasMeaning = Boolean(w.meaning || w.enDef);
        const cnVis      = showChinese ? 'mw-cn-visible' : '';
        const reg        = normRegister(w.register);   // 旧数据也可能存了任意串，渲染侧再收敛一次

        const colloItems   = (w.collo   || '').split(/\s*·\s*/).filter(Boolean);
        const colloCnItems = (w.colloCn || '').split(/\s*·\s*/).filter(Boolean);

        const colloHtml = colloItems.length > 0 ? `
            <div class="mw-collo-grid2">
                ${colloItems.map((c, i) => `<div class="mw-collo2 mw-speakable" data-speak="${escAttr(c)}"><span class="mw-collo-icon2">&#x1F50A;</span><span class="mw-collo-en2">${escHtml(c)}</span>${colloCnItems[i] ? `<span class="mw-cn mw-collo-cn2 ${cnVis}">${escHtml(colloCnItems[i])}</span>` : ''}</div>`).join('')}
            </div>` : '';

        const exHtml = w.context ? `
            <div class="mw-ex2">
                <div class="mw-ex-en2 mw-speakable" data-speak="${escAttr(w.context)}">"${escHtml(w.context)}" <button class="speak-btn speak-btn-s" data-text="${escAttr(w.context)}">&#x1F50A;</button></div>
                ${w.contextCn ? `<div class="mw-cn mw-ex-cn2 ${cnVis}">${escHtml(w.contextCn)}</div>` : ''}
            </div>` : '';

        const noteHtml = w.note ? `<div class="mw-note2">${escHtml(w.note)}</div>` : '';

        // SRS feedback row — only shown when the user is studying due words.
        // This keeps the regular browse experience visually unchanged.
        // The four buttons map directly to the scheduler's result codes
        // (wrong/hard/good/easy) and are wired via .mw-srs-btn delegation.
        const srsHtml = studyFilter === 'due' ? `
            <div class="mw-srs-row">
                <span class="mw-srs-prompt">你记得多牢？</span>
                <div class="mw-srs-btns">
                    <button class="mw-srs-btn mw-srs-wrong" data-srs="wrong" title="忘记 \u2014 明天复习">\u274C 忘记</button>
                    <button class="mw-srs-btn mw-srs-hard"  data-srs="hard"  title="困难 \u2014 2天后复习">\u{1F914} 困难</button>
                    <button class="mw-srs-btn mw-srs-good"  data-srs="good"  title="良好 \u2014 标准间隔">\u{1F44D} 良好</button>
                    <button class="mw-srs-btn mw-srs-easy"  data-srs="easy"  title="容易 \u2014 更长间隔">\u{1F60E} 容易</button>
                </div>
            </div>` : '';

        area.innerHTML = `
            <div class="mw-card mw-card-compact">
                <div class="mw-row-top">
                    <div class="mw-col-word">
                        <div class="mw-word-row2">
                            <span class="mw-word2">${escHtml(w.word)}</span>
                            <button class="speak-btn" data-text="${escAttr(w.word)}" style="width:32px;height:32px;font-size:15px">&#x1F50A;</button>
                        </div>
                        ${w.phonetic ? `<span class="mw-ph2">${escHtml(w.phonetic)}</span>` : ''}
                        ${reg !== 'neutral' ? `<span class="wl-register-tag wl-register-${reg}" style="font-size:10px;margin-top:2px;display:inline-block">${reg}</span>` : ''}
                    </div>
                    <div class="mw-col-def">
                        ${w.meaning ? `<div class="mw-cn mw-cn2 ${cnVis}">${escHtml(w.meaning)}</div>` : ''}
                        ${w.enDef   ? `<div class="mw-en2 mw-speakable" data-speak="${escAttr(w.enDef)}"><span class="mw-endef-icon">&#x1F50A;</span>${escHtml(w.enDef)}</div>` : ''}
                    </div>
                </div>
                ${colloHtml}
                ${exHtml}
                ${noteHtml}
                ${srsHtml}
                <div class="mw-card-bottom">
                    <div class="mw-focus-tags">
                        ${focusBtn(w, 'core',          '\u2B50', 'Core')}
                        ${focusBtn(w, 'pronunciation', '\uD83D\uDD0A', 'Pronunciation')}
                        ${focusBtn(w, 'spelling',      '\u270F\uFE0F', 'Spelling')}
                    </div>
                    <div class="mw-card-actions">
                        <button class="mw-action-btn mw-enrich-btn" data-word="${escAttr(w.word)}">&#x2728; ${hasMeaning ? 'More' : 'Enrich'}</button>
                        ${!isWordComplete(w) ? '<span class="mw-incomplete-tag">needs enrich</span>' : ''}
                        <button class="mw-action-btn mw-delete-btn" data-word="${escAttr(w.word)}">&#x1F5D1;</button>
                    </div>
                </div>
            </div>`;
    }

    // ----- QUIZ (Chinese MCQ) -----

    function renderQuizCard() {
        const area  = document.getElementById('mw-area');
        const words = getGroupWords();
        const w     = words[currentIdx];
        if (!w) return;

        const correctMeaning = w.meaning || w.enDef || '(no definition)';
        const distractors    = buildDistractors(currentIdx, 3);
        const options = _shuffle([
            { text: correctMeaning, correct: true },
            ...distractors.map(d => ({ text: d, correct: false }))
        ]);

        area.innerHTML = `
            <div class="mw-card mw-quiz-card">
                <button class="mw-quiz-remove mw-delete-btn" data-word="${escAttr(w.word)}" title="从生词本移除此单词">&#x1F5D1;</button>
                <div class="mw-card-top">
                    <div class="mw-card-word-row" style="justify-content:center">
                        <span class="mw-card-word">${escHtml(w.word)}</span>
                        <button class="speak-btn speak-btn-lg" data-text="${escAttr(w.word)}" title="发音">&#x1F50A;</button>
                    </div>
                    ${w.phonetic ? `<span class="mw-card-phonetic" style="text-align:center;display:block">${escHtml(w.phonetic)}</span>` : ''}
                </div>
                <div class="mw-quiz-options">
                    ${options.map((o, i) => `
                        <button class="mw-quiz-option" data-correct="${o.correct}" data-idx="${i}">
                            <span class="mw-quiz-letter">${'ABCD'[i]}</span>
                            <span class="mw-quiz-text">${escHtml(o.text)}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="mw-quiz-feedback" id="mw-quiz-feedback"></div>
                <div class="mw-card-bottom">
                    <div class="mw-focus-tags">
                        ${focusBtn(w, 'core',          '\u2B50',         'Core')}
                        ${focusBtn(w, 'pronunciation', '\uD83D\uDD0A',   'Pron.')}
                        ${focusBtn(w, 'spelling',      '\u270F\uFE0F',   'Spell')}
                    </div>
                </div>
            </div>`;
    }

    function buildDistractors(groupIdx, count) {
        // Pull distractors from ALL words for variety, excluding current word
        // 以及与正确释义完全相同的文本——同义近形词（尤其内置词库里同释义的
        // 词）会造成"两个选项一模一样、只有一个算对"的无解题。顺带去重。
        const words   = getGroupWords();
        const current = words[groupIdx];
        const correct = (current && (current.meaning || current.enDef)) || '';
        const seen    = new Set([correct]);
        const pool    = [];
        studyList.forEach(w => {
            if (current && w.word === current.word) return;
            const m = w.meaning || w.enDef || '';
            if (!m || seen.has(m)) return;
            seen.add(m);
            pool.push(m);
        });
        const fallbacks = ['\u540D\u8BCD', '\u52A8\u8BCD', '\u5F62\u5BB9\u8BCD', '\u526F\u8BCD', '\u77ED\u8BED', '\u8868\u8FBE\u65B9\u5F0F'];
        for (const f of fallbacks) {
            if (pool.length >= count) break;
            if (!seen.has(f)) { pool.push(f); seen.add(f); }
        }
        let pad = 1;
        while (pool.length < count) pool.push(`\uFF08\u5E72\u6270\u9879 ${pad++}\uFF09`);
        return _shuffle(pool).slice(0, count);
    }

    function handleQuizAnswer(btn) {
        if (quizAnswered) return;
        quizAnswered = true;
        quizTotal++;
        markStudyActivity();

        const isCorrect = btn.dataset.correct === 'true';
        window.DB.bumpDaily?.({ quizTotal: 1, quizCorrect: isCorrect ? 1 : 0 });
        const words     = getGroupWords();
        const w         = words[currentIdx];
        const feedback  = document.getElementById('mw-quiz-feedback');

        document.querySelectorAll('.mw-quiz-option').forEach(b => {
            b.disabled = true;
            if (b.dataset.correct === 'true') b.classList.add('mw-quiz-correct');
        });

        if (isCorrect) {
            btn.classList.add('mw-quiz-correct');
            quizScore++;
            if (feedback) feedback.innerHTML = `<div class="mw-fb-correct">&#x2705; Correct!</div>`;
            // Track correct streak
            trackQuizResult(w, true);
        } else {
            btn.classList.add('mw-quiz-wrong');
            if (feedback) feedback.innerHTML = `<div class="mw-fb-wrong">&#x274C; Answer: ${escHtml(w.meaning || w.enDef || '')}</div>`;
            // Track wrong
            trackQuizResult(w, false);
        }

        const counter = document.getElementById('mw-counter');
        if (counter) counter.textContent = `${currentIdx + 1}/${words.length} (${quizScore}/${quizTotal})`;

        saveProgress();
        setTimeout(() => navigate(1), isCorrect ? 1200 : 2500);
    }

    /** Track quiz result: update wrongCount/correctStreak, manage weak tag. */
    function trackQuizResult(w, isCorrect) {
        if (!w || !w.word) return;
        const nb  = window.DB.loadNotebook();
        const idx = nb.findIndex(x => (x.word || '').toLowerCase() === w.word.toLowerCase());
        if (idx < 0) return;

        const entry = nb[idx];
        if (!entry.wrongCount)    entry.wrongCount    = 0;
        if (!entry.correctStreak) entry.correctStreak = 0;
        const focus = Array.isArray(entry.focus) ? [...entry.focus] : [];

        if (isCorrect) {
            entry.correctStreak++;
            // Graduate: 3 correct in a row removes weak tag
            if (entry.correctStreak >= 3 && focus.includes('weak')) {
                focus.splice(focus.indexOf('weak'), 1);
                entry.focus = focus;
            }
        } else {
            entry.wrongCount++;
            entry.correctStreak = 0;
            // Auto-tag as weak
            if (!focus.includes('weak')) {
                focus.push('weak');
                entry.focus = focus;
            }
        }

        nb[idx] = entry;
        window.DB.saveNotebook(nb);
        // Refresh in-memory list
        refreshStudyList();
    }

    // ----- LIST -----

    function renderList() {
        const area  = document.getElementById('mw-area');
        const words = getGroupWords();
        const cnVis = showChinese ? 'mw-cn-visible' : '';   // 释义默认隐藏，跟随「中文」开关
        area.innerHTML = `<div class="mw-list">${words.map((w, i) => {
            const complete = isWordComplete(w);
            const focus    = Array.isArray(w.focus) ? w.focus : [];
            const icons    = [
                focus.includes('core')          ? '\u2B50' : '',
                focus.includes('pronunciation') ? '\uD83D\uDD0A' : '',
                focus.includes('spelling')      ? '\u270F\uFE0F' : ''
            ].filter(Boolean).join('');
            return `
            <div class="mw-list-item ${i === currentIdx ? 'mw-list-active' : ''} ${!complete ? 'mw-list-incomplete' : ''}" data-idx="${i}">
                <button class="speak-btn" data-text="${escAttr(w.word)}">&#x1F50A;</button>
                <span class="mw-list-word">${escHtml(w.word)}</span>
                ${icons ? `<span class="mw-list-icons">${icons}</span>` : ''}
                ${w.phonetic ? `<span class="mw-list-phonetic">${escHtml(w.phonetic)}</span>` : ''}
                <span class="mw-list-meaning mw-cn ${cnVis}">${escHtml(w.meaning || w.enDef || '')}</span>
                ${!complete ? '<span class="mw-incomplete-tag">!</span>' : ''}
                <button class="mw-list-delete mw-delete-btn" data-word="${escAttr(w.word)}" title="移除">&#x1F5D1;</button>
            </div>`;
        }).join('')}</div>`;
    }

    // =====================================================
    // SINGLE WORD ENRICH (free or API)
    // =====================================================

    function enrichWord(word) {
        if (isEnriching) return;
        if (window.AIEngine.hasAPIKey()) { enrichWithAPI(word); }
        else { enrichWithClipboard(word); }
    }

    function enrichWithClipboard(word) {
        const prompt = `Please provide details for this English word/phrase. Use this EXACT format:

WORD: ${word}
PHONETIC: [IPA pronunciation, e.g. /ˈræm.bʊ.tən/]
MEANING_CN: [Chinese meaning, concise but complete]
MEANING_EN: [English definition, 1-2 sentences]
REGISTER: [formal|neutral|casual|academic|technical]
COLLOCATIONS: [3-4 common collocations separated by " · "]
COLLOCATIONS_CN: [Chinese for each collocation, same order, separated by " · "]
EXAMPLE: [one natural example sentence]
EXAMPLE_CN: [Chinese translation of the example]
NOTE: [usage tip for Chinese speakers, 1-2 sentences]`;

        navigator.clipboard.writeText(prompt).then(() => {
            window.App?.showToast?.('提示词已复制！到 Claude.ai 粘贴，再把结果回填。', 5000);
            window.open('https://claude.ai/new', '_blank');
            setTimeout(() => openSinglePasteModal(word), 1000);
        });
    }

    function openSinglePasteModal(word) {
        let modal = document.getElementById('mw-single-paste-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id        = 'mw-single-paste-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-card">
                    <div class="modal-header"><h2>粘贴 AI 回复</h2>
                        <button class="modal-close" onclick="document.getElementById('mw-single-paste-modal').classList.remove('open')">&times;</button></div>
                    <div class="modal-body">
                        <p class="settings-hint">Paste the response from Claude.ai below.</p>
                        <textarea id="mw-single-paste-input" class="mw-import-textarea" rows="8" placeholder="在此粘贴..."></textarea>
                        <button class="wl-btn-primary" id="mw-single-paste-apply" style="width:100%;margin-top:10px">应用</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }
        modal.dataset.word = word;
        document.getElementById('mw-single-paste-apply').onclick = () => {
            const text = (document.getElementById('mw-single-paste-input')?.value || '').trim();
            if (!text) return;
            importRichFormat(text);
            refreshStudyList();
            const idx = studyList.findIndex(w => w.word === modal.dataset.word);
            if (idx >= 0) currentIdx = idx;
            showChinese = true;
            const cnBtn = document.getElementById('mw-toggle-cn');
            if (cnBtn) { cnBtn.classList.add('active'); cnBtn.innerHTML = '\u{1F441}<span class="mw-btn-label"> Hide CN</span>'; }
            render();
            modal.classList.remove('open');
            document.getElementById('mw-single-paste-input').value = '';
            window.App?.showToast?.('单词已更新！');
        };
        modal.classList.add('open');
    }

    async function enrichWithAPI(word) {
        isEnriching = true;
        const btn = document.querySelector(`.mw-enrich-btn[data-word="${CSS.escape(word)}"]`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="wl-spinner"></span>'; }

        const prompt = `You are an English vocabulary expert helping a PhD-level Chinese speaker.
Return a JSON object:
{"word":"...","phonetic":"IPA","meaning":"Chinese meaning","enDef":"English def 1-2 sentences","register":"formal|neutral|casual|academic","collo":"collocations separated by ' · '","colloCn":"Chinese for each collocation, same order, separated by ' · '","context":"example sentence","contextCn":"Chinese translation of example","note":"usage tip for Chinese speakers"}
Return ONLY valid JSON.`;

        try {
            const r = await window.AIEngine.callClaudeJSON(prompt, `Word: ${word}`);
            window.DB.upsertNotebookWord({
                word: word, meaning: r.meaning || '', enDef: r.enDef || '', phonetic: r.phonetic || '',
                register: normRegister(r.register), collo: r.collo || '', colloCn: r.colloCn || '',
                context: r.context || '', contextCn: r.contextCn || '', note: r.note || '', source: 'AI enriched'
            }, { countNew: false });
            refreshStudyList(); showChinese = true;
            const cnBtn = document.getElementById('mw-toggle-cn');
            if (cnBtn) { cnBtn.classList.add('active'); cnBtn.innerHTML = '\u{1F441}<span class="mw-btn-label"> Hide CN</span>'; }
            render();
        } catch (err) { window.App?.showToast?.(window.AIEngine.friendlyError(err)); }
        finally { isEnriching = false; }
    }

    // =====================================================
    // CLICK HANDLERS
    // =====================================================

    function handleAreaClick(e) {
        // SRS feedback (only present in due-filter card view)
        const srsBtn = e.target.closest('.mw-srs-btn');
        if (srsBtn) {
            handleSrsReview(srsBtn.dataset.srs);
            return;
        }

        const quizOpt = e.target.closest('.mw-quiz-option');
        if (quizOpt) { handleQuizAnswer(quizOpt); return; }

        // Focus tag toggle
        const focusBtnEl = e.target.closest('.mw-focus-btn');
        if (focusBtnEl) {
            const word = focusBtnEl.dataset.word;
            const type = focusBtnEl.dataset.focus;
            const isOn = window.DB.toggleFocus(word, type);
            focusBtnEl.classList.toggle('mw-focus-active', isOn);
            refreshStudyList();
            updateFilterCounts();
            // Toast with hint
            const labels = { core: '\u2B50 核心', pronunciation: '\uD83D\uDD0A 发音', spelling: '\u270F\uFE0F 拼写' };
            const count  = studyList.filter(w => (w.focus || []).includes(type)).length;
            if (isOn) {
                window.App?.showToast?.(`已标记为 ${labels[type]}。点上方的 "${labels[type]} (${count})" 只学这些。`, 4000);
            } else {
                window.App?.showToast?.(`已移除 ${labels[type]} 标记。`);
            }
            return;
        }

        const enrichBtn = e.target.closest('.mw-enrich-btn');
        if (enrichBtn) { enrichWord(enrichBtn.dataset.word); return; }

        const deleteBtn = e.target.closest('.mw-delete-btn');
        if (deleteBtn) {
            // Always stop propagation so a delete inside a clickable list
            // row doesn't also navigate the user to the deleted word.
            e.stopPropagation();
            const word = deleteBtn.dataset.word;
            if (!word) return;
            if (!confirm(`确定移除 "${word}"？\n\n此操作无法撤销，但你之后可以重新添加。`)) return;
            window.DB.removeNotebookWord(word);
            refreshStudyList();
            if (currentIdx >= studyList.length) currentIdx = Math.max(0, studyList.length - 1);
            render();
            updateFilterCounts();
            window.App?.updateNotebookBadge?.();
            window.App?.showToast?.(`"${word}" removed.`);
            return;
        }

        const listItem = e.target.closest('.mw-list-item');
        if (listItem && listItem.dataset.idx !== undefined) {
            currentIdx = parseInt(listItem.dataset.idx, 10);
            setView('cards'); speakCurrent();
        }
    }

    function focusBtn(w, type, icon, label) {
        const focus  = Array.isArray(w.focus) ? w.focus : [];
        const active = focus.includes(type) ? 'mw-focus-active' : '';
        return `<button class="mw-focus-btn ${active}" data-focus="${type}" data-word="${escAttr(w.word)}">${icon}<span>${label}</span></button>`;
    }

    function escHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    function escAttr(s) {
        // v72: HTML attribute escaping. Old version used JS-style \\' which
        // meant words like "don't" became data-word="don\'t" — invalid in
        // HTML, breaking subsequent matching/saving/deletion lookups.
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\n/g, ' ');
    }

    return { init, render, refreshStudyList, startAutoplay, stopAutoplay, toggleAutoplay,
             isAutoplayActive: () => autoplayOn };
})();
