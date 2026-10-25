/**
 * stories.js — AI 短文 (v148)
 * ============================================================
 * 与教材课文分开的第二个阅读来源: 按《英语·单词本》3500 词的字母顺序,
 * 每篇 20 个以上目标词, 由 tools/stories/build_stories.py 校验后发布到
 * 同源 stories/ 目录 (stories-manifest.json + 每篇一个 Sxxxx.json)。
 * 结构与教材课文相同 (paras/sentences/words/phrases), 课文页的听读、
 * 点词、填空、短语四步全部复用; 多出 kind:'ai'、series、genre、
 * narrator (整篇朗读者音色)、gloss (超纲词释义) 等字段。
 *
 * 存储与同步
 *   • 短文是发布物, 存本机 IndexedDB hsv_stories, 不进 Gist (任何设备
 *     都能从站点重新拉取, 不占同步载荷)。
 *   • 学习记录 (听读/填空/短语进度、练习档案、会话、时长) 与教材课文
 *     共用 lesson_* 键, 按 Sxxxx id 区分, 照常随快照同步 —— 原有的
 *     合并规则 (字段级、取新) 全部适用。
 *   • 增量: manifest 里 _v 变了才下载, 逐篇 sha256 校验; 下架的篇目
 *     从本机删除 (学习记录保留)。
 *
 * HSVLex —— 点任意词查词 (统一词库 lexicon-3500.js)
 *   lemmas(tok)          词形 → 候选原型 (与 build_stories.py 规则一致)
 *   lookup(tok, gloss)   → { head, ipa, zh, level, n, collo, src } | null
 *                          先查统一词库, 再查短文自带 gloss, 再查离线词典
 *
 * Public API (window.Stories)
 *   load()          boot 时 await: 从 IndexedDB 灌内存缓存
 *   check(manual)   拉 manifest 增量更新; manual=true 时出 toast
 *   list()          全部短文 (按 id 排序)
 *   byId(id)        单篇
 *   ready()         缓存是否已就绪
 *   lastResult()    最近一次检查结果
 * ============================================================
 */
window.HSVLex = (function () {
    'use strict';

    let _map = null;
    let _irr = {};
    const LEVEL_NAME = { H: '高中核心', E: '高中拓展', J: '初中·值得学', B: '基础词', X: '常用词·词表外' };
    const CONTRACTIONS = { "won't": 'will', "can't": 'can', "shan't": 'shall', "ain't": 'be', "let's": 'let' };

    function index() {
        if (_map) return _map;
        _map = new Map();
        const L = window.HSV_LEXICON;
        if (L && Array.isArray(L.words)) {
            L.words.forEach(w => { if (w && w[0]) _map.set(String(w[0]).toLowerCase(), w); });
            _irr = L.irregular || {};
        }
        return _map;
    }

    // 词形 → 可能的原型 (顺序即优先级)。规则与 tools/stories/build_stories.py
    // 的 candidates() 一致, 发布侧的超纲检查与这里的查词结论相同。
    function candidates(tok) {
        let t = String(tok || '').toLowerCase().replace(/’/g, "'").replace(/^'+|'+$/g, '');
        const out = [t];
        const add = (x) => { if (x && out.indexOf(x) < 0) out.push(x); };
        if (CONTRACTIONS[t]) add(CONTRACTIONS[t]);
        else if (/(n't|'s|'re|'ve|'ll|'d|'m)$/.test(t)) { t = t.replace(/(n't|'s|'re|'ve|'ll|'d|'m)$/, ''); add(t); }
        if (_irr[t]) add(_irr[t]);
        // v148: 规则顺序与守卫 (审查发现 caring→car, hates→hat, shed→she 等误还原):
        //   • -s 先于 -es: notes→note, horses→horse; boxes 的 boxe 不是词, 自然落到 box
        //   • -ed/-ing 去掉后若是「辅-元-辅」短音节, 先试补 e: caring→care, hated→hate
        //   • 去掉词尾后的词干必须含元音: shed 不拆成 sh/she, Ming 不拆成 m/me
        const hasV = (x) => /[aeiouy]/.test(x);
        const cvc  = (x) => /(^|[^aeiou])[aeiou][^aeiouwxy]$/.test(x);
        if (/s$/.test(t) && !/ss$/.test(t)) add(t.slice(0, -1));
        if (/ies$/.test(t))  add(t.slice(0, -3) + 'y');
        if (/es$/.test(t))   add(t.slice(0, -2));
        if (/ied$/.test(t))  add(t.slice(0, -3) + 'y');
        if (/ed$/.test(t) && hasV(t.slice(0, -2))) {
            const st = t.slice(0, -2);
            if (cvc(st)) { add(st + 'e'); add(st); } else { add(st); add(st + 'e'); }
            if (t.length > 4 && t[t.length - 3] === t[t.length - 4]) add(t.slice(0, -3));
        }
        if (/ing$/.test(t) && hasV(t.slice(0, -3))) {
            const st = t.slice(0, -3);
            if (cvc(st)) { add(st + 'e'); add(st); } else { add(st); add(st + 'e'); }
            if (t.length > 5 && t[t.length - 4] === t[t.length - 5]) add(t.slice(0, -4));
        }
        if (/ier$/.test(t))  add(t.slice(0, -3) + 'y');
        if (/iest$/.test(t)) add(t.slice(0, -4) + 'y');
        if (/er$/.test(t) && t.length > 4 && hasV(t.slice(0, -2))) { add(t.slice(0, -2)); add(t.slice(0, -1)); }
        if (/est$/.test(t) && t.length > 5 && hasV(t.slice(0, -3))) { add(t.slice(0, -3)); add(t.slice(0, -2)); }
        if (/ily$/.test(t))  add(t.slice(0, -3) + 'y');
        if (/ly$/.test(t))   add(t.slice(0, -2));
        if (/ally$/.test(t)) add(t.slice(0, -4));
        out.slice().forEach(x => { if (_irr[x]) add(_irr[x]); });
        return out;
    }

    function lemmas(tok) {
        index();
        const out = [];
        candidates(tok).forEach(c => [c].concat(candidates(c)).forEach(d => {
            if (out.indexOf(d) < 0) out.push(d);
        }));
        return out;
    }

    // 逐个候选查 (原词形最先): 每个候选依次查统一词库 → 本篇 gloss → 离线词典,
    // 先命中的候选胜出。这样 sites 落到词典里的 site 而不是词库里的 sit,
    // inner/layer/pier 用词典里的原词而不还原成 inn/lay/pie。
    function lookup(tok, gloss) {
        const map  = index();
        const g    = gloss || {};
        const dict = window.BASIC_DICTIONARY || {};
        for (const c of lemmas(tok)) {
            const w = map.get(c);
            if (w) return { head: w[0], n: w[1] || 0, ipa: w[2] || '', zh: w[3] || '',
                            level: w[4] || '', collo: w[5] || '', src: 'lex' };
            if (g[c]) return { head: c, n: 0, ipa: '', zh: g[c], level: '', collo: '', src: 'gloss' };
            const d = dict[c];
            if (d && d.meaning) return { head: c, n: 0, ipa: '', zh: d.meaning, level: '',
                                         collo: d.collo || '', src: 'dict' };
        }
        return null;
    }

    function levelName(lv) { return LEVEL_NAME[lv] || ''; }

    return { lemmas: lemmas, lookup: lookup, levelName: levelName, _candidates: candidates };
})();

window.Stories = (function () {
    'use strict';

    const BASE       = 'stories';
    const MANIFEST   = 'stories-manifest.json';
    const AUTO_DELAY = 6000;           // boot 后错峰, 让同步与课程订阅先走
    const PREFIX     = (window.APP_CONFIG && window.APP_CONFIG.STORAGE_PREFIX) || 'hsv_';
    const DB_NAME    = PREFIX + 'stories';
    const STORE      = 'stories';
    const GEN_KEY    = PREFIX + 'stories_gen';     // 本机键 (无档案段, 不进同步)

    let _list     = [];
    let _ready    = false;
    let _checking = false;
    let _last     = null;
    let _db       = null;

    function open() {
        if (_db) return Promise.resolve(_db);
        return new Promise((resolve, reject) => {
            let rq;
            try { rq = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
            rq.onupgradeneeded = () => {
                if (!rq.result.objectStoreNames.contains(STORE)) {
                    rq.result.createObjectStore(STORE, { keyPath: 'id' });
                }
            };
            rq.onsuccess = () => { _db = rq.result; resolve(_db); };
            rq.onerror   = () => reject(rq.error);
        });
    }

    function all() {
        return open().then(d => new Promise((resolve, reject) => {
            const rq = d.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            rq.onsuccess = () => resolve(rq.result || []);
            rq.onerror   = () => reject(rq.error);
        }));
    }

    function write(puts, dels) {
        return open().then(d => new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readwrite');
            const os = tx.objectStore(STORE);
            (puts || []).forEach(s => os.put(s));
            (dels || []).forEach(id => os.delete(id));
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        }));
    }

    function sortList() { _list.sort((a, b) => String(a.id).localeCompare(String(b.id))); }

    async function load() {
        if (_ready) return _list.length;
        try { _list = (await all()).filter(s => s && s.id && s.kind === 'ai'); }
        catch (e) { console.warn('[Stories] IndexedDB 不可用:', e && e.message); _list = []; }
        sortList();
        _ready = true;
        return _list.length;
    }

    async function sha256hex(text) {
        try {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { return ''; }      // 非安全上下文没有 WebCrypto: 跳过校验
    }

    function bust(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now(); }
    function toast(msg) { try { window.App?.showToast?.(msg); } catch (e) { /* ignore */ } }

    async function check(manual) {
        if (_checking) return _last;
        if (!_ready) await load();
        _checking = true;
        try {
            const r = await fetch(bust(BASE + '/' + MANIFEST), { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const man  = await r.json();
            const list = Array.isArray(man && man.stories) ? man.stories : [];
            // v148: 只接受不比上次旧的清单。离线时 SW 可能交回缓存里的旧
            // manifest —— 拿它比对会把新篇目当成「已下架」删掉、把修订版
            // 换回旧版。generation 是发布时间 (YYYY-MM-DDTHH:MM:SS), 字典序
            // 即时间序; 旧清单直接忽略, 本机内容原样保留。
            const gen  = String((man && man.generation) || '');
            let   seen = '';
            try { seen = localStorage.getItem(GEN_KEY) || ''; } catch (e) { /* ignore */ }
            if (gen && seen && gen < seen) {
                console.warn('[Stories] ignoring stale manifest ' + gen + ' (have ' + seen + ')');
                _last = { time: Date.now(), stale: true, total: _list.length };
                return _last;
            }
            const have = {};
            _list.forEach(s => { have[s.id] = s; });
            const want = list.filter(e => e && e.id && e.file && (!have[e.id] || have[e.id]._v !== e._v));
            const gone = _list.filter(s => !list.some(e => e.id === s.id)).map(s => s.id);
            const puts = [];
            let failed = 0;
            for (const e of want) {
                try {
                    const fr = await fetch(bust(BASE + '/' + e.file), { cache: 'no-store' });
                    if (!fr.ok) throw new Error('HTTP ' + fr.status);
                    const text = await fr.text();
                    const h    = e.sha256 ? await sha256hex(text) : '';
                    if (h && h !== e.sha256) throw new Error('sha256 mismatch');
                    const obj = JSON.parse(text);
                    if (!obj || obj.id !== e.id || obj.kind !== 'ai') throw new Error('bad story file');
                    puts.push(obj);
                } catch (err) {
                    failed++;
                    console.warn('[Stories] skip ' + e.id + ':', err.message || err);
                }
            }
            if (puts.length || gone.length) {
                await write(puts, gone);
                const byId = {};
                _list.forEach(s => { byId[s.id] = s; });
                gone.forEach(id => { delete byId[id]; });
                puts.forEach(s => { byId[s.id] = s; });
                _list = Object.keys(byId).map(k => byId[k]);
                sortList();
                try {
                    window.dispatchEvent(new CustomEvent('hsv:datachanged',
                        { detail: { stories: true, source: 'stories' } }));
                } catch (e) { /* ignore */ }
            }
            if (gen && !failed) { try { localStorage.setItem(GEN_KEY, gen); } catch (e) { /* ignore */ } }
            const added = puts.filter(s => !have[s.id]).length;
            const msg   = (puts.length || gone.length)
                ? 'AI 短文已更新: 新增 ' + added + ' 篇' + (puts.length - added ? ' · 修订 ' + (puts.length - added) + ' 篇' : '')
                  + (gone.length ? ' · 下架 ' + gone.length + ' 篇' : '') + (failed ? ' · 失败 ' + failed : '')
                : (failed ? '下载失败 ' + failed + ' 篇' : '已是最新 (' + list.length + ' 篇)');
            if (manual || puts.length) toast(msg);
            _last = { time: Date.now(), added: added, updated: puts.length - added, removed: gone.length,
                      failed: failed, total: list.length };
            console.log('[Stories] ' + msg);
            return _last;
        } catch (e) {
            if (manual) toast('检查失败 — 网络不可用？');
            console.log('[Stories] check failed:', e.message || e);
            _last = { time: Date.now(), error: e.message || String(e) };
            return _last;
        } finally {
            _checking = false;
        }
    }

    function init() { setTimeout(() => { check(false); }, AUTO_DELAY); }

    return {
        load      : load,
        init      : init,
        check     : check,
        list      : function () { return _list.slice(); },
        byId      : function (id) { return _list.find(s => s.id === id) || null; },
        ready     : function () { return _ready; },
        lastResult: function () { return _last; }
    };
})();
