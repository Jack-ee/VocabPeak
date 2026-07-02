/**
 * cloze.js - VocabPeak 巩固短文（选词填空）
 * ============================================================
 * 针对「当前分组」的词，让 AI 生成 2-3 篇短文，每处挖空给 3-4 个选项（只选不拼）。
 * 生成走"复制提示词 → Claude.ai → 回填"的流程，和 AI 补全一致。生成后的短文
 * 按 (筛选, 组号) 存进偏好里（随云同步），学生打开即做，选项即时判对错。
 *
 * 对外只暴露 window.Cloze.open(words, groupIdx, filter)。
 * ============================================================
 */
window.Cloze = (function () {
    'use strict';

    const KEY_PREFIX = 'cloze_';        // 走 DB.setPref/getPref，会随快照同步
    let   ctxWords   = [];              // 当前分组的词
    let   ctxGroup   = 0;
    let   ctxFilter  = 'all';

    // ---- 存取（按 筛选_组号 存一份短文数组）----
    function storeKey(filter, groupIdx) { return `${KEY_PREFIX}${filter}_${groupIdx}`; }
    function load(filter, groupIdx) {
        try { return JSON.parse(window.DB.getPref(storeKey(filter, groupIdx), '') || 'null') || null; }
        catch (e) { return null; }
    }
    function save(filter, groupIdx, passages) {
        try { window.DB.setPref(storeKey(filter, groupIdx), JSON.stringify(passages)); }
        catch (e) { /* ignore */ }
    }

    // ---- 小工具 ----
    function escHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
        ));
    }
    function escAttr(s) { return escHtml(s); }
    function shuffle(a) {
        const arr = a.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ---- 生成提示词 ----
    function buildPrompt(words) {
        const list = words.map(w => w.word).filter(Boolean).join(', ');
        return [
            'You are an English teacher creating consolidation exercises for a Chinese',
            'senior-high-school student. Using the target vocabulary below, write 2-3 short',
            'English passages (each about 60-110 words) and turn the target words that appear',
            'into multiple-choice cloze blanks.',
            '',
            'Target words: ' + list,
            '',
            'Rules:',
            '1. Passages must be coherent and natural, with vocabulary and grammar at',
            '   senior-high-school level. Use as many target words as read naturally across',
            '   the passages (you need not use every word).',
            '2. Format EACH blank INLINE exactly as: [[answer|distractor1|distractor2|distractor3]]',
            '   - Pipe-separated. The FIRST item is the correct answer; the next three are',
            '     distractors (4 options total).',
            '   - Prefer distractors drawn from the target-word list so the exercise reviews',
            '     the group.',
            '   - Multiple choice only, no spelling, so every blank must carry its options.',
            '3. Separate passages with a line containing only ###',
            '4. Start each passage with a line "TITLE: <a short English title>".',
            '5. Plain text only. No markdown, no extra commentary.',
            '',
            'Example sentence: The scientist decided to [[abandon|absorb|abolish|adopt]] the project.'
        ].join('\n');
    }

    // ---- 解析 AI 回复 → 短文数组 ----
    function parseBody(body) {
        const segs = [];
        const re   = /\[\[(.+?)\]\]/g;
        let last = 0, m;
        while ((m = re.exec(body)) !== null) {
            if (m.index > last) segs.push({ t: 'text', v: body.slice(last, m.index) });
            let parts = m[1].split('|').map(s => s.trim()).filter(Boolean);
            const answer = parts[0];
            let options  = [];
            parts.forEach(p => { if (!options.includes(p)) options.push(p); });
            if (!options.includes(answer)) options.unshift(answer);
            options = options.slice(0, 4);
            if (!answer || options.length < 2) {
                segs.push({ t: 'text', v: m[0] });          // 格式异常 → 原样保留
            } else {
                segs.push({ t: 'blank', answer: answer, options: shuffle(options) });
            }
            last = re.lastIndex;
        }
        if (last < body.length) segs.push({ t: 'text', v: body.slice(last) });
        return segs;
    }

    function parse(text) {
        const chunks = String(text || '').split(/^\s*#{3,}\s*$/m).map(s => s.trim()).filter(Boolean);
        const passages = [];
        for (const chunk of chunks) {
            let title = '';
            const bodyLines = [];
            for (const ln of chunk.split('\n')) {
                const mm = ln.match(/^\s*TITLE\s*[:：]\s*(.+)$/i);
                if (mm && !title) title = mm[1].trim();
                else bodyLines.push(ln);
            }
            const body = bodyLines.join('\n').trim();
            if (!body) continue;
            const segments = parseBody(body);
            if (segments.some(s => s.t === 'blank')) passages.push({ title: title, segments: segments });
        }
        return passages;
    }

    // ---- 渲染一篇短文 ----
    function passageHtml(p, pIdx) {
        let inner = '';
        for (const s of p.segments) {
            if (s.t === 'text') {
                inner += escHtml(s.v).replace(/\n/g, '<br>');
            } else {
                const opts = ['<option value="">（选择）</option>']
                    .concat(s.options.map(o => `<option value="${escAttr(o)}">${escHtml(o)}</option>`))
                    .join('');
                inner += `<select class="cz-blank" data-answer="${escAttr(s.answer)}">${opts}</select>`;
            }
        }
        return `
            <div class="cz-passage" data-p="${pIdx}">
                ${p.title ? `<h4 class="cz-title">${escHtml(p.title)}</h4>` : ''}
                <div class="cz-body">${inner}</div>
                <div class="cz-foot">
                    <span class="cz-score" data-p="${pIdx}"></span>
                    <button class="cz-reset" data-p="${pIdx}">重做本篇</button>
                </div>
            </div>`;
    }

    function renderPassages(passages) {
        const box = document.getElementById('cz-passages');
        if (!box) return;
        if (!passages || !passages.length) {
            box.innerHTML = `<div class="cz-empty">本组还没有短文。展开上方「生成 / 重新生成短文」，用 AI 生成一批。</div>`;
            return;
        }
        box.innerHTML = passages.map((p, i) => passageHtml(p, i)).join('');
        box.querySelectorAll('.cz-score').forEach(el => updateScore(parseInt(el.dataset.p, 10)));
    }

    function updateScore(pIdx) {
        const passage = document.querySelector(`.cz-passage[data-p="${pIdx}"]`);
        if (!passage) return;
        const blanks = passage.querySelectorAll('.cz-blank');
        let answered = 0, correct = 0;
        blanks.forEach(sel => {
            if (sel.value) {
                answered++;
                if (sel.value === sel.dataset.answer) correct++;
            }
        });
        const scoreEl = passage.querySelector('.cz-score');
        if (scoreEl) {
            scoreEl.textContent = answered
                ? `答对 ${correct} / ${blanks.length}`
                : `共 ${blanks.length} 空`;
            scoreEl.className = 'cz-score' + (answered === blanks.length
                ? (correct === blanks.length ? ' cz-allright' : ' cz-somewrong') : '');
        }
    }

    // ---- 样式（只注入一次，适配深浅主题）----
    function injectStyles() {
        if (document.getElementById('cz-styles')) return;
        const css = `
        .cz-card { max-width: 720px; }
        .cz-gen { margin-bottom: 14px; border: 1px solid var(--border, #33456b); border-radius: 10px; padding: 8px 12px; }
        .cz-gen > summary { cursor: pointer; font-weight: 600; font-size: 14px; padding: 4px 0; }
        .cz-gen textarea { width: 100%; margin: 8px 0; }
        .cz-gen .cz-hint { font-size: 12px; color: var(--text-tertiary, #8ba3c0); margin: 4px 0 8px; line-height: 1.5; }
        .cz-gen .wl-btn-primary, .cz-gen .wl-btn-secondary { width: 100%; margin-top: 6px; }
        .cz-passage { border: 1px solid var(--border, #33456b); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
        .cz-title { margin: 0 0 8px; font-size: 15px; }
        .cz-body { line-height: 2.1; font-size: 15px; }
        /* 正确/错误色走主题变量（style.css 深浅两套都定义了 --success /
           --danger 及其 -bg），硬编码色在深色卡片底上对比度不足。 */
        .cz-blank { margin: 0 2px; padding: 2px 6px; border-radius: 7px; border: 1px solid var(--border, #7c93b5);
                    background: var(--bg-surface, rgba(127,127,127,0.10)); color: inherit; font-size: 14px; font-family: inherit;
                    max-width: 46vw; vertical-align: baseline; }
        .cz-blank.cz-correct { border-color: var(--success, #2ecc71); color: var(--success, #1e9e57); background: var(--success-bg, rgba(46,204,113,0.14)); font-weight: 600; }
        .cz-blank.cz-wrong   { border-color: var(--danger, #e2664f); color: var(--danger, #d0402a); background: var(--danger-bg, rgba(226,102,79,0.14)); font-weight: 600; }
        .cz-foot { display: flex; align-items: center; gap: 12px; margin-top: 10px; }
        .cz-score { font-size: 12.5px; color: var(--text-tertiary, #8ba3c0); flex: 1; }
        .cz-score.cz-allright { color: var(--success, #1e9e57); font-weight: 600; }
        .cz-score.cz-somewrong { color: var(--danger, #d0402a); }
        .cz-reset { background: none; border: 1px solid var(--border, #33456b); border-radius: 8px; padding: 4px 10px;
                    font-size: 12px; color: var(--text-secondary, #b6c6de); cursor: pointer; }
        .cz-reset:hover { border-color: var(--accent, #f0b429); color: inherit; }
        .cz-empty { color: var(--text-tertiary, #8ba3c0); font-size: 13.5px; padding: 10px 2px; line-height: 1.6; }
        `;
        const st = document.createElement('style');
        st.id = 'cz-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    // ---- 弹窗 ----
    function ensureModal() {
        let modal = document.getElementById('cz-modal');
        if (modal) return modal;
        injectStyles();
        modal = document.createElement('div');
        modal.id = 'cz-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card cz-card">
                <div class="modal-header">
                    <h2 id="cz-heading">巩固短文 · 本组</h2>
                    <button class="modal-close" id="cz-close">&times;</button>
                </div>
                <div class="modal-body">
                    <details class="cz-gen" id="cz-gen">
                        <summary>生成 / 重新生成短文</summary>
                        <div class="cz-hint" id="cz-genhint"></div>
                        <button class="wl-btn-primary" id="cz-copy">① 复制生成提示词并打开 Claude.ai</button>
                        <textarea class="mw-import-textarea" id="cz-paste" rows="9" placeholder="② 把 AI 的整段回复粘贴到这里…"></textarea>
                        <button class="wl-btn-primary" id="cz-build">③ 生成短文</button>
                    </details>
                    <div id="cz-passages"></div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        // 关闭
        modal.querySelector('#cz-close').addEventListener('click', () => modal.classList.remove('open'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

        // 复制提示词 + 打开 Claude.ai
        modal.querySelector('#cz-copy').addEventListener('click', () => {
            const prompt = buildPrompt(ctxWords);
            navigator.clipboard.writeText(prompt).then(() => {
                window.App?.showToast?.('已复制生成提示词。到 Claude.ai 粘贴，再把结果回填。', 5000);
                window.open('https://claude.ai/new', '_blank');
            }).catch(() => {
                window.App?.showToast?.('复制失败，请手动全选提示词。');
            });
        });

        // 回填生成
        modal.querySelector('#cz-build').addEventListener('click', () => {
            const text = (modal.querySelector('#cz-paste').value || '').trim();
            if (!text) { window.App?.showToast?.('请先粘贴 AI 的回复。'); return; }
            const passages = parse(text);
            if (!passages.length) {
                window.App?.showToast?.('没解析出短文。确认粘贴了完整回复，且每空是 [[答案|干扰1|干扰2|干扰3]] 格式。');
                return;
            }
            save(ctxFilter, ctxGroup, passages);
            renderPassages(passages);
            modal.querySelector('#cz-paste').value = '';
            modal.querySelector('#cz-gen').open = false;
            const blanks = passages.reduce((n, p) => n + p.segments.filter(s => s.t === 'blank').length, 0);
            window.App?.showToast?.(`已生成 ${passages.length} 篇短文，共 ${blanks} 个填空。`);
        });

        // 选词判对错 + 重做（事件委托）
        const box = modal.querySelector('#cz-passages');
        box.addEventListener('change', (e) => {
            const sel = e.target.closest('.cz-blank');
            if (!sel) return;
            sel.classList.remove('cz-correct', 'cz-wrong');
            if (sel.value) sel.classList.add(sel.value === sel.dataset.answer ? 'cz-correct' : 'cz-wrong');
            const p = sel.closest('.cz-passage');
            if (p) updateScore(parseInt(p.dataset.p, 10));
        });
        box.addEventListener('click', (e) => {
            const btn = e.target.closest('.cz-reset');
            if (!btn) return;
            const p = btn.closest('.cz-passage');
            if (!p) return;
            p.querySelectorAll('.cz-blank').forEach(sel => {
                sel.value = '';
                sel.classList.remove('cz-correct', 'cz-wrong');
            });
            updateScore(parseInt(p.dataset.p, 10));
        });

        return modal;
    }

    // ---- 对外入口 ----
    function open(words, groupIdx, filter) {
        ctxWords  = Array.isArray(words) ? words : [];
        ctxGroup  = groupIdx || 0;
        ctxFilter = filter || 'all';

        if (!ctxWords.length) {
            window.App?.showToast?.('本组没有单词，无法生成短文。');
            return;
        }
        const modal = ensureModal();
        modal.querySelector('#cz-heading').textContent = `巩固短文 · 第 ${ctxGroup + 1} 组`;
        modal.querySelector('#cz-genhint').textContent =
            `用本组 ${ctxWords.length} 个词，让 AI 写 2-3 篇选词填空短文（每空 3-4 个选项，只选不拼）。`;
        modal.querySelector('#cz-paste').value = '';

        const existing = load(ctxFilter, ctxGroup);
        renderPassages(existing);
        modal.querySelector('#cz-gen').open = !(existing && existing.length);   // 没短文就展开生成区
        modal.classList.add('open');
    }

    return { open: open };
})();
