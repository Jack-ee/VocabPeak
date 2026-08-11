// ============================================================
// sync.js — Learning data sync via GitHub Gist
//
// Design goals:
//   • Profile-scoped: each PROFILE_ID has its own Gist file, so
//     multiple users on the same Gist don't clobber each other.
//   • Bidirectional: pulls on load, on focus, and every 30s while
//     visible, so PC ↔ phone stay in sync without manual action.
//   • Whole-document last-write-wins, scoped to the current
//     profile's keys (plus the shared API key). The conflict
//     window is shrunk by aggressive pulls before edits — the
//     focus / visibility / 30s-poll triggers mean a device
//     usually has the latest remote state before the user starts
//     typing. There is still a window where two devices can edit
//     before either pulls; in that case the device that pushes
//     last wins for the keys it touched. A future revision can
//     add per-key timestamps for true key-level merging.
//   • Raw localStorage for sync metadata — bypassing DB.setPref
//     avoids the profile-prefix double-wrapping bug.
// ============================================================

window.SyncManager = (function() {

    const GIST_API     = 'https://api.github.com/gists';
    const DEBOUNCE_MS  = 3000;
    const POLL_MS      = 30000;

    // 应用存储前缀（单一来源，与 EMPro 的 "emp_" 隔离）。同源部署时这些
    // 裸键（token / gist id / api key）不带 profile 前缀，必须靠应用前缀
    // 区分，否则两个应用会共用同一套同步凭证和 Gist。
    const APP_PREFIX = (window.APP_CONFIG && window.APP_CONFIG.STORAGE_PREFIX) || 'hsv_';
    const APP_TAG    = APP_PREFIX.replace(/_+$/, '');   // "hsv_" -> "hsv"（用于 Gist 文件名）

    // Raw localStorage keys (NOT wrapped by DB.setPref — metadata must be
    // exactly-matched across devices, not profile-prefixed).
    const K_TOKEN          = APP_PREFIX + 'sync_token';
    const K_GIST_ID        = APP_PREFIX + 'sync_gist_id';
    const K_LAST_PULL      = APP_PREFIX + 'sync_last_pull';
    const K_LAST_PUSH      = APP_PREFIX + 'sync_last_push';
    const K_SYNC_API_KEY   = APP_PREFIX + 'sync_api_key';   // v72: opt-in flag for API key sync
    const K_API_KEY        = APP_PREFIX + 'api_key';        // shared AI key（同源隔离）

    let saveTimer     = null;
    let pollTimer     = null;
    let initialized   = false;
    let isSyncing     = false;
    let suspendHooks  = false;  // prevents triggerSave loop during pull

    // ─── Profile-scoped helpers ──────────────────────────────
    function profileId()  { return (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID) || 'default'; }
    function gistFile()   { return `${APP_TAG}-sync-${profileId()}.json`; }
    // 课程内容单独一个 Gist 文件 (v128): 内容与用户状态分层 —— 主载荷
    // 只放真正的用户数据 (回到 ~400 KB 且网页上可读), 课程走这个文件,
    // 按内容哈希判断变化, 没变就一个字节都不传。
    function coursesFile() { return `${APP_TAG}-courses-${profileId()}.json`; }
    const K_COURSES_HASH = APP_PREFIX + 'courses_pushed_hash';   // 本机记账, 不同步
    const K_GIST_STAMP   = APP_PREFIX + 'sync_gist_stamp';       // 上次见到的 Gist updated_at
    function keyPrefix()  { return `${APP_PREFIX}${profileId()}_`; }

    // ─── Settings accessors (raw localStorage) ───────────────
    function getToken()      { return localStorage.getItem(K_TOKEN)   || ''; }
    function setToken(t)     { t ? localStorage.setItem(K_TOKEN, t)   : localStorage.removeItem(K_TOKEN); }
    function getGistId()     { return localStorage.getItem(K_GIST_ID) || ''; }
    function setGistId(id)   { id ? localStorage.setItem(K_GIST_ID, id) : localStorage.removeItem(K_GIST_ID); }
    function getLastPull()   { return parseInt(localStorage.getItem(K_LAST_PULL) || '0', 10); }
    function setLastPull(t)  { localStorage.setItem(K_LAST_PULL, String(t)); }
    function getLastPush()   { return parseInt(localStorage.getItem(K_LAST_PUSH) || '0', 10); }
    function setLastPush(t)  { localStorage.setItem(K_LAST_PUSH, String(t)); }

    // v72: API-key sync is OPT-IN. Default false. The user must explicitly
    // turn this on (Settings → Sync → "Sync API key across devices") after
    // being warned that the key, even on a private Gist, is a credential.
    function isApiKeySyncEnabled() {
        return localStorage.getItem(K_SYNC_API_KEY) === 'true';
    }
    function setApiKeySyncEnabled(on) {
        if (on) localStorage.setItem(K_SYNC_API_KEY, 'true');
        else    localStorage.removeItem(K_SYNC_API_KEY);
    }

    // Bridge to the legacy DB.getPref-stored token, in case user had one saved
    // from the previous version. Migrate it once.
    function migrateLegacyToken() {
        if (getToken()) return;
        const legacy = window.DB?.getPref?.('sync_github_token', '');
        if (legacy) {
            setToken(legacy);
            console.log('[Sync] Migrated legacy GitHub token to new storage');
        }
    }

    // ─── Init ────────────────────────────────────────────────

    // Listen-mode check: when the user is auto-playing sentences, a
    // background pull that reloads the page would yank them out of
    // flow. Manual Push/Pull from Settings bypasses this — that's the
    // user's explicit request, we honor it immediately.
    //
    // We probe SentenceDrill's state via a getter rather than reaching
    // into module internals. If SentenceDrill isn't loaded yet or
    // doesn't expose the getter, we treat it as "not active" (safe default).
    // Returns true if ANY active playback session is running — either
    // sentence listen mode OR My Words autoplay. Sync pulls/pushes are
    // suppressed during playback so network traffic and page reloads
    // from a .setGistId/pull don't interrupt TTS.
    function isListenActive() {
        try {
            if (window.SentenceDrill?.isListenActive?.()) return true;
            if (window.MyWords?.isAutoplayActive?.())     return true;
            return false;
        } catch {
            return false;
        }
    }

    async function init() {
        if (initialized) return;
        initialized = true;
        migrateLegacyToken();
        fixPoisonedSyncTime();
        hookSaves();
        if (getToken() && getGistId()) {
            await pull(false);  // silent initial pull
        }
        updateSyncUI();
        startPolling();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    // One-time migration: earlier versions of sync.js incorrectly advanced
    // `lastPull` to Date.now() on no-op pulls, which could push it far
    // beyond any legitimate Gist timestamp and block all future pulls.
    // Zero it out once so the first pull after this upgrade always applies.
    function fixPoisonedSyncTime() {
        const FIX_FLAG = APP_PREFIX + 'sync_v2_fix_applied';
        if (localStorage.getItem(FIX_FLAG)) return;
        localStorage.removeItem(K_LAST_PULL);
        localStorage.removeItem(K_LAST_PUSH);
        localStorage.setItem(FIX_FLAG, '1');
        console.log('[Sync] Applied v2 timestamp fix');
    }

    function onFocus() {
        if (isListenActive()) return;
        if (getToken() && getGistId()) pull(false);
    }

    function onVisibilityChange() {
        if (isListenActive()) return;
        if (!document.hidden && getToken() && getGistId()) pull(false);
    }

    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(() => {
            if (isListenActive()) return;
            if (!document.hidden && getToken() && getGistId() && !isSyncing) {
                pull(false);
            }
        }, POLL_MS);
    }

    // ─── Gist I/O ────────────────────────────────────────────
    // readGist(force)
    //   force=true (手动同步): 无条件读取内容。
    //   force=false (后台轮询): 先看 Gist 元信息的 updated_at —— 任何
    //     文件变动都会推进它, 没变就直接返回 UNCHANGED, 一个字节的
    //     内容都不下载。这一层很要紧: 载荷超出 API 内联上限后每次拉取
    //     都要走 raw_url 全量下载, 30 秒一轮 = 每小时白下几十 MB。
    const UNCHANGED = Symbol('unchanged');
    async function readGist(force) {
        const token = getToken(), gistId = getGistId();
        if (!token || !gistId) return null;
        const resp = await fetch(`${GIST_API}/${gistId}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' }
        });
        if (!resp.ok) {
            if (resp.status === 404) setGistId('');  // Gist was deleted
            throw new Error(`Gist read failed: ${resp.status}`);
        }
        const gist = await resp.json();
        const stamp = gist.updated_at || '';
        if (!force && stamp && stamp === localStorage.getItem(K_GIST_STAMP)) {
            return UNCHANGED;
        }
        if (stamp) localStorage.setItem(K_GIST_STAMP, stamp);
        // 课程文件 (v128): 只在哈希与本机不同时才真正取内容 —— 否则
        // 每次轮询都白下载几百 KB。这里先把元信息留给 pull 判断。
        _lastCoursesFile = gist.files?.[coursesFile()] || null;
        const file = gist.files?.[gistFile()];
        if (!file) return null;

        // 超过 1 MB 时 GitHub API 只返回截断内容并标记 truncated ——
        // 直接 JSON.parse 必然抛错, 以前被 catch 吞掉变成 "无远端数据",
        // 拉取静默失效 (课程攒到 23 门就越过这条线, 已实际发生)。
        // 这时改从 raw_url 取全文。注意: 不能带 Authorization 头 ——
        // 那会触发 CORS 预检, 而 gist.githubusercontent.com 不接受预检;
        // raw 链接自带不可猜测的 sha, 本身不需要鉴权。
        let text = file.content;
        if (file.truncated && file.raw_url) {
            console.warn('[Sync] payload truncated by API (' + (file.size || '?') +
                         ' bytes) — fetching full content from raw_url');
            try {
                const raw = await fetch(file.raw_url);
                if (!raw.ok) throw new Error('HTTP ' + raw.status);
                text = await raw.text();
            } catch (e) {
                console.error('[Sync] raw_url fetch failed:', e);
                // v130: 戳记已在上面落盘, 但这次内容根本没拿到 —— 不回滚
                // 的话, 下一轮轮询会按 UNCHANGED 短路, 这次远端更新被永久
                // 跳过 (直到远端再次变化)。VPN 抖动下这是常态而非罕见。
                try { localStorage.removeItem(K_GIST_STAMP); } catch (e2) {}
                throw new Error('Gist read failed: payload exceeds 1MB and ' +
                                'raw fetch failed (' + (e.message || e) + ')');
            }
        }
        if (!text) return null;
        try { return JSON.parse(text); }
        catch (e) {
            console.error('[Sync] payload parse failed:', e);
            // v130: 同上 —— 解析失败即处理失败, 回滚戳记让下一轮重试
            try { localStorage.removeItem(K_GIST_STAMP); } catch (e2) {}
            return null;
        }
    }

    // readGist 每次刷新它, pull 随后据此决定要不要拉课程内容
    let _lastCoursesFile = null;

    // 取远端课程并按 id/版本合并进本机 (不删除, 见 db.mergeUserLessons)。
    // 大于 1 MB 时同样走 raw_url, 且不带鉴权头 (CORS 预检, 见 v127)。
    async function pullCourses() {
        const f = _lastCoursesFile;
        if (!f || !window.DB?.mergeUserLessons) return false;
        // v130: 课程缓存未灌满 (boot 的 initCourses 还没跑完) 时绝不合并。
        // SyncManager.init 在 DOMContentLoaded + 500ms 启动, 与 boot 的
        // await initCourses() 存在竞态 —— 空缓存上合并等于把「远端集合」
        // 当全量整表写回 IndexedDB, 本机未推送的课就没了 (与「课程被冲」
        // 事故同根)。清掉戳记, 让下一轮轮询 (30s 后, 缓存已就绪) 重试。
        if (!window.DB.coursesReady || !window.DB.coursesReady()) {
            console.warn('[Sync] courses cache not ready — deferring course pull');
            try { localStorage.removeItem(K_GIST_STAMP); } catch (e2) {}
            return false;
        }
        try {
            let text = f.content;
            if (f.truncated && f.raw_url) {
                const raw = await fetch(f.raw_url);
                if (!raw.ok) throw new Error('HTTP ' + raw.status);
                text = await raw.text();
            }
            if (!text) return false;
            const obj = JSON.parse(text);
            if (!obj || !Array.isArray(obj.lessons)) return false;
            // 远端哈希与本机一致 = 内容相同, 不必合并。顺手记账「云端已有
            // 此内容」(v130): 否则拉完课程的设备下一次任何推送都会把几百
            // KB 一模一样的课程文件再传一遍。
            if (obj._hash && obj._hash === window.DB.coursesHash()) {
                try { localStorage.setItem(K_COURSES_HASH, obj._hash); } catch (e2) {}
                return false;
            }
            const changed = window.DB.mergeUserLessons(obj.lessons);
            if (changed) {
                console.log('[Sync] merged courses from remote: now ' +
                            (window.DB.loadUserLessons() || []).length + ' lessons');
            }
            // v130: 合并后对账 —— 与远端一致则记账省流量; 本机是并集
            // (比远端多, 例如本机有未推送的导入课) 则安排一次防抖推送,
            // 把本机独有的课送上云。此前这个缺口意味着本机独有课程要等
            // 下一次无关的用户数据推送才会顺路上云。
            try {
                const h = window.DB.coursesHash();
                if (obj._hash && h === obj._hash) {
                    localStorage.setItem(K_COURSES_HASH, h);
                } else {
                    triggerSave();
                }
            } catch (e2) {}
            return changed;
        } catch (e) {
            console.error('[Sync] pullCourses failed:', e);
            // v130: 课程拉取失败也要回滚戳记 —— 否则戳记短路会让这次
            // 课程更新被永久跳过, 直到远端再次变化
            try { localStorage.removeItem(K_GIST_STAMP); } catch (e2) {}
            return false;
        }
    }

    async function writeGist(data) {
        const token = getToken();
        if (!token) return false;
        const json   = JSON.stringify(data);
        // 体积预警: 越过 1 MB 后 API 读取会返回截断内容 (拉取侧已改走
        // raw_url 兜底, 但这是个该知道的架构信号 —— 课程语料在长大)。
        // v130: 按真实 UTF-8 字节数算 —— 中文是 3 字节/字, json.length
        // 是 UTF-16 码元数, 会低估一半以上; GitHub 的截断线按字节算。
        let bytes = json.length;   // 下界: 每码元至少 1 字节
        try {
            if (typeof TextEncoder !== 'undefined') {
                bytes = new TextEncoder().encode(json).length;
            }
        } catch (e) {}
        if (bytes > 950000 || json.length > 950000) {
            console.warn('[Sync] payload is ' + Math.round(bytes / 1024) +
                         ' KB, over the 1 MB API inline limit — pulls now go ' +
                         'through raw_url; consider trimming or sharding.');
        }
        let gistId   = getGistId();
        const body   = { files: { [gistFile()]: { content: json } } };

        // 课程文件只在内容哈希变化时才一起写 —— 否则每次防抖推送都要
        // 上传几百 KB 不变的课程。PATCH 不提某个文件时该文件原样保留。
        try {
            const h = window.DB?.coursesHash?.();
            if (h && window.DB?.coursesReady?.()) {
                if (h !== localStorage.getItem(K_COURSES_HASH)) {
                    const list = window.DB.loadUserLessons() || [];
                    body.files[coursesFile()] = {
                        content: JSON.stringify({
                            _profile : profileId(),
                            _hash    : h,
                            _time    : Date.now(),
                            lessons  : list
                        })
                    };
                    console.log('[Sync] courses changed (' + list.length +
                                ' lessons, hash ' + h + ') — including in push');
                }
            }
        } catch (e) { console.warn('[Sync] courses push prep failed:', e); }

        try {
            let resp;
            if (gistId) {
                resp = await fetch(`${GIST_API}/${gistId}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
                    body: JSON.stringify(body)
                });
                if (resp.status === 404) {
                    // Gist was deleted — create a new one
                    setGistId('');
                    return writeGist(data);
                }
                if (!resp.ok) throw new Error(`Gist update failed: ${resp.status}`);
            } else {
                resp = await fetch(GIST_API, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github+json' },
                    body: JSON.stringify({
                        description: 'VocabPeak — learning data',
                        public: false,
                        ...body
                    })
                });
                if (!resp.ok) throw new Error(`Gist create failed: ${resp.status}`);
                const gist = await resp.json();
                setGistId(gist.id);
                console.log('[Sync] Created new Gist:', gist.id);
            }
            // 推送成功后记下已上传的课程哈希 (本机记账, 不进同步)
            try {
                const pushed = body.files[coursesFile()];
                if (pushed) {
                    localStorage.setItem(K_COURSES_HASH, window.DB.coursesHash());
                }
            } catch (e) {}
            // 推送会推进远端 updated_at: 清掉本机戳记, 让下一次轮询
            // 老老实实读一次 (期间别的设备可能也推过)
            try { localStorage.removeItem(K_GIST_STAMP); } catch (e) {}
            setLastPush(Date.now());
            updateSyncUI();
            return true;
        } catch (e) {
            console.warn('[Sync] Write failed:', e.message || e);
            return false;
        }
    }

    // ─── Collect / Merge ─────────────────────────────────────
    // Collects only the current profile's keys, plus the shared API key
    // (when the user has explicitly opted in to syncing it).
    // Credentials must never be written to the sync Gist. A secret in
    // cleartext in a Gist is an account-takeover risk and a likely trigger
    // for provider-side automatic key revocation. The OpenAI TTS key is
    // stored as a profile-prefixed pref, so without this it would be swept
    // into the payload along with ordinary settings.
    function isSecretPref(k) {
        return typeof k === 'string' && k.endsWith('_pref_tts_openai_key');
    }

    function collectSyncData() {
        const prefix   = keyPrefix();
        const data     = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            // 课程已迁出 localStorage (见 db.js initCourses), 这里再挡一道:
            // 老设备迁移前的残留键不该重新污染主载荷。
            if (k === prefix + 'lessons_user') continue;
            if (k.startsWith(prefix) && !isSecretPref(k)) data[k] = localStorage.getItem(k);
        }
        // v72: API key is now OPT-IN. Even on a private Gist, an API key
        // in cleartext is a credential — accidental Gist exposure (token
        // leak, public-fork) becomes an account takeover. Default off.
        if (isApiKeySyncEnabled()) {
            const apiKey = localStorage.getItem(K_API_KEY);
            if (apiKey) data[K_API_KEY] = apiKey;
        }

        return {
            _version   : 2,
            _syncTime  : Date.now(),
            _device    : getDeviceLabel(),
            _profile   : profileId(),
            data       : data
        };
    }

    // ─── 拉取前快照 (v123, 多代 v126) ────────────────────────
    // 键名以下划线开头 → 不匹配档案前缀 → 不进推送快照、不被拉取
    // 删除, 永远只属于本机。格式: { v:2, gens:[{ts,data}, ...] },
    // 最新在前; 兼容 v123 的单代格式 { ts, data }。
    // v128: 课程移出 —— 它已在 IndexedDB 且靠 id/版本合并保护, 不再是
    // 覆盖风险源; 每代快照少 700 KB, 三代保护才真正装得下 (此前配额
    // 只够一代, 保险被悄悄削弱)。
    const PREPULL_KEYS = ['lesson_progress', 'lesson_mixed', 'lesson_sess',
                          'lesson_phrase_sel', 'notebook'];
    const PREPULL_GENS = 3;

    function prePullKey(prefix) { return '_' + prefix + 'prepull'; }

    function readPrePullGens(prefix) {
        try {
            const raw = localStorage.getItem(prePullKey(prefix));
            if (!raw) return [];
            const obj = JSON.parse(raw);
            if (obj && Array.isArray(obj.gens)) return obj.gens.filter(g => g && g.data);
            if (obj && obj.data) return [{ ts: obj.ts || 0, data: obj.data }];   // v123 单代
            return [];
        } catch (e) { return []; }
    }

    // 写入时按配额逐代降级: 满了就少存一代, 保住最新的那一代。
    function writePrePullGens(prefix, gens) {
        for (let keep = Math.min(PREPULL_GENS, gens.length); keep >= 1; keep--) {
            try {
                localStorage.setItem(prePullKey(prefix),
                    JSON.stringify({ v: 2, gens: gens.slice(0, keep) }));
                return true;
            } catch (e) { /* 配额不足, 少留一代再试 */ }
        }
        return false;
    }

    // ─── 课文学习记录的字段级合并 (v120) ─────────────────────
    // 整档快照是「后写覆盖」: 平板离线练习后, 若拉取时远端快照更新
    // (哪怕内容更旧), 课内进度/练习档案会被整键覆盖, 主页显示回
    // 「未开始」—— 已实际发生。学习记录本质单调增长, 覆盖没有道理,
    // 这三个键改为逐字段合并, 两侧并集谁新/谁大取谁:
    //   lesson_progress : listened/matchDone 取或, clozeBest/clozeRuns 取大
    //   lesson_mixed    : 逐词条/短语取「最近练习时间」新的一侧
    //   lesson_sess     : 逐课逐槽 (填空/匹配) 取 ts 新的一侧
    // 合并结果比远端多时随下一次推送回云端 (同 day_ 键的并集回传)。
    function _safeParse(s, fb) {
        try { const v = JSON.parse(s); return (v && typeof v === 'object') ? v : fb; }
        catch (e) { return fb; }
    }
    function mergeLessonProgress(localStr, remoteStr) {
        const L = _safeParse(localStr, {});
        const R = _safeParse(remoteStr, {});
        const out = {};
        new Set(Object.keys(L).concat(Object.keys(R))).forEach(id => {
            const a = L[id] || {};
            const b = R[id] || {};
            const m = Object.assign({}, a, b);        // 未知字段以远端为准
            if (a.listened  || b.listened)  m.listened  = true;
            if (a.matchDone || b.matchDone) m.matchDone = true;
            if (a.clozeBest != null || b.clozeBest != null) {
                m.clozeBest = Math.max(
                    a.clozeBest != null ? a.clozeBest : -1,
                    b.clozeBest != null ? b.clozeBest : -1);
            }
            if (a.clozeRuns || b.clozeRuns) {
                m.clozeRuns = Math.max(a.clozeRuns || 0, b.clozeRuns || 0);
            }
            out[id] = m;
        });
        return JSON.stringify(out);
    }
    function mergeLessonMixed(localStr, remoteStr) {
        const L = _safeParse(localStr, {});
        const R = _safeParse(remoteStr, {});
        const out = { w: {}, p: {} };
        ['w', 'p'].forEach(part => {
            const lm = L[part] || {};
            const rm = R[part] || {};
            new Set(Object.keys(lm).concat(Object.keys(rm))).forEach(k => {
                const a = lm[k];
                const b = rm[k];
                out[part][k] = !a ? b : (!b ? a : (((b[2] || 0) >= (a[2] || 0)) ? b : a));
            });
        });
        return JSON.stringify(out);
    }
    function mergeLessonSess(localStr, remoteStr) {
        const L = _safeParse(localStr, {});
        const R = _safeParse(remoteStr, {});
        const out = {};
        new Set(Object.keys(L).concat(Object.keys(R))).forEach(id => {
            const a = L[id] || {};
            const b = R[id] || {};
            const m = {};
            ['c', 'm'].forEach(slot => {
                const x = a[slot];
                const y = b[slot];
                const v = !x ? y : (!y ? x : (((y.ts || 0) >= (x.ts || 0)) ? y : x));
                if (v) m[slot] = v;
            });
            if (Object.keys(m).length) out[id] = m;
        });
        return JSON.stringify(out);
    }
    // v132: 学习时长 { 天: { 课ID|mixed: {r:精读秒, e:练习秒, q:答题数,
    // qs:答题秒} } } —— 各字段都是单调递增计数, 按字段取 MAX。孩子基本
    // 单设备学习, MAX 幂等且防旧快照回退; 多设备同一天同一课并发时取
    // 大值不叠加, 只会少记不会虚报, 对"监督是否认真学"来说是安全方向。
    function mergeLessonTime(localStr, remoteStr) {
        const L = _safeParse(localStr, {});
        const R = _safeParse(remoteStr, {});
        const out = {};
        new Set(Object.keys(L).concat(Object.keys(R))).forEach(day => {
            const ld = L[day] || {};
            const rd = R[day] || {};
            out[day] = {};
            new Set(Object.keys(ld).concat(Object.keys(rd))).forEach(act => {
                const a = ld[act] || {};
                const b = rd[act] || {};
                out[day][act] = {
                    r : Math.max(a.r  || 0, b.r  || 0),
                    e : Math.max(a.e  || 0, b.e  || 0),
                    q : Math.max(a.q  || 0, b.q  || 0),
                    qs: Math.max(a.qs || 0, b.qs || 0)
                };
            });
        });
        return JSON.stringify(out);
    }

    // Merge remote payload into local storage.
    //   • If remote _syncTime > local last-pull, apply remote wholesale.
    //   • Local keys that are NOT in the remote payload are removed,
    //     so deletions on another device propagate to this one.
    //   • Skips if remote profile doesn't match (safety net).
    //   • Caveat: if this device has unsynced local-only additions
    //     (e.g. words added while offline) and a newer remote pull
    //     arrives, those local-only additions WILL be removed. In
    //     practice this is rare because triggerSave() debounces
    //     pushes within a few seconds of the edit.
    //
    // Returns:
    //   { applied: false }                                — profile mismatch / bad payload
    //   { applied: true, changed, configChanged, dataChangeCount } — applied
    //
    //   • changed:           any tracked key differs from local (data or config).
    //   • configChanged:     a key that needs a page reload to take effect
    //                        was modified. Currently this is only `emp_api_key`
    //                        because the AI engine reads it once at boot.
    //                        All other keys (notebook, prefs, history) take
    //                        effect on the next render and don't need a reload.
    //   • dataChangeCount:   how many data keys (notebook, history, etc.)
    //                        differ from local; used for the toast message.
    function mergeSyncData(payload) {
        if (!payload || !payload.data) return { applied: false };
        if (payload._profile && payload._profile !== profileId()) {
            console.warn('[Sync] Profile mismatch — remote:', payload._profile, 'local:', profileId());
            return { applied: false };
        }
        suspendHooks = true;
        try {
            const remote = payload.data;
            const prefix = keyPrefix();

            // Snapshot current local state for the same set of keys we'll
            // touch, so we can detect "nothing actually changed".
            const localBefore   = {};
            const localKeys     = new Set();
            const apiKeySyncOn  = isApiKeySyncEnabled();   // v72
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!k) continue;
                if (k.startsWith(prefix) && !isSecretPref(k))  { localKeys.add(k); localBefore[k] = localStorage.getItem(k); }
                else if (k === K_API_KEY && apiKeySyncOn) { localKeys.add(k); localBefore[k] = localStorage.getItem(k); }
            }

            let changed          = false;
            let configChanged    = false;
            let dataChangeCount  = 0;
            let mergedUnion      = 0;   // 字段级合并后比远端多的键数 (需回推)

            // ── 拉取前安全快照 (v123) ─────────────────────────
            // 套用远端前把学习数据的本机现值整份存起来。存储键以
            // 下划线开头, 不匹配档案前缀 → 不进推送快照、不被拉取
            // 删除, 永远只属于本机。仅保留最近一代, 每次套用前覆盖。
            // 误冲后可用 SyncManager.restorePrePull() 一键回滚 ——
            // 这是对「首次联网仍在跑旧版代码」这类竞态的兜底保险。
            // v126: 保留最近 PREPULL_GENS 代 —— 单代会被"下一次拉取"
            // 覆盖掉, 等发现数据不对时好快照往往已经没了。同数据不
            // 重复入栈, 避免无变化的轮询把好快照挤出去。
            try {
                const cur = {};
                PREPULL_KEYS.forEach(n => {
                    const v = localStorage.getItem(prefix + n);
                    if (v != null) cur[prefix + n] = v;
                });
                if (Object.keys(cur).length) {
                    const gens = readPrePullGens(prefix);
                    const same = gens[0] && JSON.stringify(gens[0].data) === JSON.stringify(cur);
                    if (!same) {
                        gens.unshift({ ts: Date.now(), data: cur });
                        writePrePullGens(prefix, gens);
                    }
                }
            } catch (e) { /* 配额不足等: 保险失败不阻塞正常同步 */ }

            // 走字段级合并的课文记录键 (见上方 mergeLesson* 注释)。
            // v132 修复 (高危): 这些记录全部经 DB.setPref 存储, 真实
            // localStorage 键带 pref_ 段 (如 hsv_kid_pref_lesson_progress)。
            // v123/v126 注册时漏了 pref_, 字段级合并与下面的"缺键不删除"
            // 保护从未路由到这几个键 —— 实际一直在整键覆盖, 且远端快照
            // 缺键时本地会被直接删除 (与历史"练习记录被冲"事故同形,
            // 之后未复发只是因为各设备的键集恰好齐了)。
            const mergeFns = {};
            mergeFns[prefix + 'pref_lesson_progress'] = mergeLessonProgress;
            mergeFns[prefix + 'pref_lesson_mixed']    = mergeLessonMixed;
            mergeFns[prefix + 'pref_lesson_sess']     = mergeLessonSess;
            mergeFns[prefix + 'pref_lesson_time']     = mergeLessonTime;   // v132

            // 内容型键 (v126): 这些键承载"攒起来的东西" —— 导入的课程、
            // 生词本、短语精选。远端快照里没有它们时只能说明对面是旧
            // 快照, 不能当成删除意图, 否则一台带旧数据的设备绑进来就
            // 会把另一端的导入课冲掉 (已实际发生)。真删课/删词会写出
            // 更短的数组, 那时键存在, 正常覆盖照旧生效。
            // (短语精选同样是 pref 存储, v132 一并补上 pref_ 段。)
            const contentKeys = new Set([
                prefix + 'lessons_user',
                prefix + 'pref_lesson_phrase_sel',
                prefix + 'notebook'
            ]);

            // Keys that REQUIRE a page reload to take effect. Anything not
            // in this set takes effect on the next render of the relevant
            // module — no reload needed, no UX disruption.
            const requiresReload = (k) => k === K_API_KEY;

            // Write remote keys, tracking real changes
            const legacyCoursesKey = prefix + 'lessons_user';
            Object.keys(remote).forEach(k => {
                // v130: 旧版设备的快照仍带课程整键 (v128 已迁 IndexedDB)。
                // 原样写回 localStorage 会重新占掉 ~700 KB 配额并绕过分层
                // 架构; 改喂 mergeUserLessons —— 本机没有的课收下, 已有的
                // 课不覆盖 (旧快照条目无 _v, 永远不会比本机新)。
                if (k === legacyCoursesKey) {
                    try {
                        const arr = JSON.parse(remote[k]);
                        if (Array.isArray(arr)) window.DB?.mergeUserLessons?.(arr);
                    } catch (e) {}
                    localKeys.delete(k);
                    return;
                }
                // v72: only accept inbound emp_api_key when the user has
                // opted in. An opted-out device must never silently inherit
                // an API key from another device's sync payload.
                const accept = (k.startsWith(prefix) && !isSecretPref(k)) || (k === K_API_KEY && apiKeySyncOn);
                if (accept) {
                    let toWrite = remote[k];
                    if (mergeFns[k] && localBefore[k] != null) {
                        toWrite = mergeFns[k](localBefore[k], remote[k]);
                        if (toWrite !== remote[k]) mergedUnion++;   // 并集超出远端
                    }
                    if (localBefore[k] !== toWrite) {
                        changed = true;
                        if (requiresReload(k)) configChanged = true;
                        else                   dataChangeCount++;
                    }
                    localStorage.setItem(k, toWrite);
                    localKeys.delete(k);
                }
            });

            // Remove local keys that no longer exist in remote
            // (so deletions on another device propagate correctly).
            //
            // 例外：按天日志（day_YYYY-MM-DD）只增不删。设备 A 离线学习几天
            // 后，若设备 B 先推送了不含那几天的快照，A 拉取时按原逻辑会把
            // 自己独有的日志当成"远端已删除"而抹掉。day 键天然按日隔离，
            // 本地又有 _pruneDayLog(400) 各自兜底，保留没有膨胀风险；这些
            // 键随本机下次推送并回云端（pull() 看到 preservedDayKeys>0 会
            // 主动补一次防抖推送，家长后台才能看到离线期间的记录）。
            // 注意：同一天两台设备各自离线学习仍是后写覆盖（同键 LWW），
            // day 键解决的是"跨天互删"，不做同日计数合并。
            let preservedDayKeys = 0;
            const dayPrefix = prefix + 'day_';
            if (localKeys.size > 0) {
                localKeys.forEach(k => {
                    if (k.startsWith(dayPrefix)) { preservedDayKeys++; return; }
                    // 课文记录键本地独有 (远端是旧快照, 还没有这些键) 时
                    // 同样保留并计入回推 —— 否则拉一次旧快照就把离线练习抹掉
                    if (mergeFns[k]) { mergedUnion++; return; }
                    // v126 根因修复: 内容型键「远端没有这个键」只说明对面
                    // 是旧快照, 绝不该解释成删除意图 —— 真的删课/删词会写
                    // 出更短的数组, 那时键是存在的, 覆盖照常生效。这一条
                    // 之前缺失, 一台带旧数据的设备绑进来就把导入课冲掉了。
                    if (contentKeys.has(k)) { mergedUnion++; return; }
                    changed = true;
                    if (requiresReload(k)) configChanged = true;
                    else                   dataChangeCount++;
                    localStorage.removeItem(k);
                });
            }

            setLastPull(payload._syncTime || Date.now());
            return { applied: true, changed, configChanged, dataChangeCount, preservedDayKeys, mergedUnion };
        } finally {
            suspendHooks = false;
        }
    }

    function getDeviceLabel() {
        const ua = navigator.userAgent || '';
        if (/Android/.test(ua))  return 'Android';
        if (/iPhone|iPad/.test(ua)) return 'iOS';
        if (/Mac/.test(ua))      return 'Mac';
        if (/Windows/.test(ua))  return 'Windows';
        if (/Linux/.test(ua))    return 'Linux';
        return 'Unknown';
    }

    // ─── Pull / Push ─────────────────────────────────────────
    async function pull(showToast) {
        if (!getToken() || !getGistId() || isSyncing) {
            if (showToast) window.App?.showToast?.('Set up GitHub sync in Settings first.');
            return false;
        }
        isSyncing = true;
        updateSyncUI();
        if (showToast) window.App?.showToast?.('Pulling...');
        try {
            // 手动同步强制读取; 后台轮询靠 updated_at 短路省流量
            const payload = await readGist(!!showToast);
            if (payload === UNCHANGED) {
                if (showToast) window.App?.showToast?.('Already up to date.');
                updateSyncUI();
                return true;
            }
            if (!payload) {
                if (showToast) window.App?.showToast?.('No remote data yet.');
                return false;
            }
            const remoteTime = payload._syncTime || 0;
            const lastPull   = getLastPull();
            const lastPush   = getLastPush();

            // Manual pulls (showToast=true) always apply remote if it has
            // a newer or equal _syncTime. Background polls use the strict
            // "strictly newer than last pull" check to avoid reload loops.
            const shouldApply = showToast
                ? (remoteTime >= lastPull)
                : (remoteTime > lastPull);

            // 课程走独立文件, 与 _syncTime 判定解耦: 用户数据没变但课程
            // 变了 (另一台设备导入了新课) 也要拉下来。
            const coursesChanged = await pullCourses();

            if (shouldApply && remoteTime > 0) {
                const result = mergeSyncData(payload) || {};

                // 合并保留了本地独有的按天日志（day_ 例外，见 mergeSyncData）
                // → 远端还缺这几天，安排一次防抖推送把并集补上云。不会形成
                // 推拉循环：push 成功后 lastPull 会推进到自己的 _syncTime，
                // 下一次轮询判定为无变化；另一台设备拉到并集后 preserved=0。
                if (result.preservedDayKeys > 0 || result.mergedUnion > 0) {
                    console.log('[Sync] Preserved ' + (result.preservedDayKeys || 0) +
                                ' day log(s), merged-union ' + (result.mergedUnion || 0) +
                                ' lesson-record key(s) — scheduling push to upload the union');
                    triggerSave();
                }

                // If the merge applied but no actual content changed (e.g. we
                // just pulled back our own push, or another tab pushed the
                // identical state), there is nothing to refresh — skip the
                // reload entirely. This is the main fix for the "PC reloads
                // every ~30s while I'm typing" complaint.
                if (!result.changed) {
                    if (coursesChanged) {
                        // 课程有更新: 用户数据无变化也要让课文模块重渲染
                        window.dispatchEvent(new CustomEvent('hsv:datachanged',
                            { detail: { courses: true } }));
                        if (showToast) window.App?.showToast?.('\u8BFE\u7A0B\u5DF2\u66F4\u65B0');
                    } else if (showToast) {
                        window.App?.showToast?.('Already up to date.');
                    } else {
                        console.log('[Sync] Pulled — no content change, skipping reload');
                    }
                    updateSyncUI();
                    return true;
                }

                // Real change. New policy (v=67):
                //   • Only reload if a CONFIG key changed (currently just
                //     emp_api_key — the AI engine reads it once at boot).
                //   • Data changes (notebook, history, progress) apply
                //     silently. Modules that need to re-render to show
                //     fresh data listen for the 'hsv:datachanged' event
                //     dispatched below.
                //   • A small toast tells the user something arrived.
                // This means: editing on phone → opening laptop won't
                // jerk the user out of whatever tab they're on. The data
                // is updated under the hood; next time the user navigates
                // to that module (or it re-renders), they see fresh data.
                if (!result.configChanged) {
                    const n = result.dataChangeCount || 0;
                    if (showToast) {
                        window.App?.showToast?.(n > 0
                            ? `Synced ${n} change${n === 1 ? '' : 's'} from cloud.`
                            : 'Synced from cloud.');
                    } else {
                        console.log(`[Sync] Pulled ${n} data change(s) — applied silently, no reload`);
                    }

                    // Notify live modules so they can refresh their views
                    // without a page reload. Each module decides whether
                    // to act on this (e.g. MyWords re-renders, Drill ignores).
                    try {
                        window.dispatchEvent(new CustomEvent('hsv:datachanged', {
                            detail: { source: 'sync-pull', count: n }
                        }));
                    } catch {}

                    updateSyncUI();
                    return true;
                }

                // Config change → reload required (e.g. API key was rotated).
                // Defer the reload while the user is mid-session (typing in
                // writing-lab, drilling, autoplay) to avoid disruption.
                const doReload = () => {
                    const busy = (() => {
                        try { return Boolean(window.App?.isStudySessionActive?.()); }
                        catch { return false; }
                    })();
                    if (busy && !showToast) {
                        // Background pull found a config change but the user
                        // is mid-flow. Retry shortly. Manual pulls (showToast)
                        // bypass this — the user explicitly asked.
                        console.log('[Sync] Config change pulled, but study session active — deferring reload');
                        setTimeout(doReload, 30000);
                        return;
                    }
                    location.reload();
                };

                if (showToast) window.App?.showToast?.('Configuration changed. Reloading...');
                else           console.log('[Sync] Pulled config change from Gist');
                setTimeout(doReload, showToast ? 600 : 300);
                return true;
            } else {
                // v130: 用户数据没到套用条件, 但课程可能已经合并了 (手动
                // 同步重复点击等场景) —— 课程有变化就派发刷新事件, 否则
                // 课文页要等下一次重载才看得到新课。
                if (coursesChanged) {
                    try {
                        window.dispatchEvent(new CustomEvent('hsv:datachanged',
                            { detail: { courses: true } }));
                    } catch (e) {}
                    if (showToast) window.App?.showToast?.('\u8BFE\u7A0B\u5DF2\u66F4\u65B0');
                } else if (showToast) {
                    window.App?.showToast?.('Already up to date.');
                }
                // IMPORTANT: do NOT advance lastPull here. The whole point of
                // lastPull is "the newest remote timestamp we've applied" — if
                // we update it on no-op pulls, future legitimate pulls (where
                // a different device pushed at a timestamp between our last
                // applied pull and now) get rejected.
                updateSyncUI();
                return true;
            }
        } catch (e) {
            console.log('[Sync] Pull error:', e.message || e);
            // v130: 拉取中途失败 (合并抛错等) 也回滚戳记 —— 否则下一轮
            // 轮询按 UNCHANGED 短路, 这次远端更新被永久跳过
            try { localStorage.removeItem(K_GIST_STAMP); } catch (e2) {}
            if (showToast) window.App?.showToast?.('Pull failed — check token/network.');
            return false;
        } finally {
            isSyncing = false;
            updateSyncUI();
        }
    }

    async function push(showToast) {
        if (!getToken() || isSyncing) {
            if (showToast) window.App?.showToast?.('Set GitHub token in Settings first.');
            return false;
        }
        isSyncing = true;
        updateSyncUI();
        if (showToast) window.App?.showToast?.('Syncing to cloud...');
        try {
            // Capture the payload's _syncTime BEFORE the network call so we
            // can advance lastPull in lockstep on success. This is the fix
            // for the "PC reloads ~30s after every edit" loop:
            //   without this, push set lastPush but left lastPull stale, so
            //   the next 30s poll always saw remote._syncTime > lastPull
            //   (because remote == our own push) and reloaded the page.
            //   With this, the next poll sees remoteTime == lastPull and
            //   skips. Other devices' pushes still trigger pulls correctly.
            const data = collectSyncData();
            const ok   = await writeGist(data);
            if (ok) setLastPull(data._syncTime);
            if (showToast) window.App?.showToast?.(ok ? 'Synced to cloud.' : 'Sync failed — check token.');
            return ok;
        } finally {
            isSyncing = false;
            updateSyncUI();
        }
    }

    // First-time setup: after a token is saved, look for an existing Gist
    // that matches our profile's sync file. If found, pull it (don't
    // overwrite). If not found, push to create one.
    // This prevents the footgun where a fresh device with empty data
    // would clobber an existing Gist on first save.
    async function setupSync() {
        if (!getToken()) return false;
        isSyncing = true;
        updateSyncUI();
        try {
            // If we already have a gist ID (legacy setup), just pull
            if (getGistId()) {
                window.App?.showToast?.('Syncing from cloud...');
                const payload = await readGist(true).catch(() => null);
                if (payload && payload._syncTime) {
                    mergeSyncData(payload);
                    window.App?.showToast?.('Synced from cloud. Reloading...');
                    setTimeout(() => location.reload(), 600);
                    return true;
                }
                // Gist exists but is empty — push current state
                await writeGist(collectSyncData());
                window.App?.showToast?.('Synced to cloud.');
                return true;
            }

            // No gist ID — search user's gists for one matching our sync filename
            window.App?.showToast?.('Looking for existing sync...');
            const resp = await fetch(`${GIST_API}?per_page=100`, {
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/vnd.github+json' }
            });
            if (!resp.ok) throw new Error(`Gist list failed: ${resp.status}`);
            const list = await resp.json();
            const target = gistFile();
            const matches = (list || []).filter(g => g.files && g.files[target]);

            // Sort newest-first by updated_at — handles the edge case where
            // past bugs created multiple sync Gists on the same account.
            matches.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            const match = matches[0];

            if (matches.length > 1) {
                console.warn(`[Sync] Found ${matches.length} sync Gists — picked newest (${match.id}). Older duplicates:`,
                    matches.slice(1).map(g => `${g.id} (${g.updated_at})`));
            }

            if (match) {
                // Found an existing Gist — adopt and pull
                setGistId(match.id);
                console.log('[Sync] Found existing Gist:', match.id);
                window.App?.showToast?.('Found existing sync. Pulling...');
                const payload = await readGist(true);
                if (payload && payload._syncTime) {
                    mergeSyncData(payload);
                    window.App?.showToast?.('Synced from cloud. Reloading...');
                    setTimeout(() => location.reload(), 600);
                    return true;
                }
                window.App?.showToast?.('Gist was empty. Pushed local data.');
                await writeGist(collectSyncData());
                return true;
            }

            // No existing Gist — create one via push
            window.App?.showToast?.('Creating new sync Gist...');
            const ok = await writeGist(collectSyncData());
            window.App?.showToast?.(ok ? 'Synced to cloud. Future devices will merge here.' : 'Setup failed — check token.');
            return ok;
        } catch (e) {
            console.warn('[Sync] setupSync error:', e.message || e);
            window.App?.showToast?.('Sync setup failed. Check token + network.');
            return false;
        } finally {
            isSyncing = false;
            updateSyncUI();
        }
    }

    function triggerSave() {
        if (suspendHooks || !getToken()) return;
        if (saveTimer) clearTimeout(saveTimer);
        // Defer the push while playback is active. Any data changes made
        // during playback (e.g. tracking progress on played sentences) will
        // still land in localStorage immediately; the Gist push just waits
        // until playback ends, at which point the next triggerSave (or the
        // 30s poll / focus pull) picks them up.
        saveTimer = setTimeout(() => {
            if (isListenActive()) {
                // Retry shortly; keeps debouncer behavior without losing the save.
                saveTimer = setTimeout(() => { if (!isListenActive()) push(false); }, 5000);
                return;
            }
            push(false);
        }, DEBOUNCE_MS);
    }

    // ─── Hook DB methods so changes auto-push ─────────────────
    // Prefs that change too frequently to be worth auto-syncing
    // (drafts on every keystroke, slider scrubs, scroll positions).
    // Data still gets picked up on the next push triggered by a real
    // save, the focus/visibility pull, or the 30s poll.
    // Prefs that must NOT trigger an immediate sync push. Two kinds:
    //   • High-frequency writers (drafts on every keystroke) — a push per
    //     keystroke would spam the API. The 3s debounce + next real save
    //     still carries the latest value to the cloud.
    //   • Device-local view state (reading position, shuffle order) — these
    //     are per-device; syncing them would yank the other device's
    //     position/order around on every poll.
    //
    // NOTE: genuine settings (voice, speed, group size, auto-pronounce, AI
    // provider/model, show-CN) used to be listed here too. That meant a
    // change made in isolation was never pushed — and the next 30s poll /
    // focus pull then CLOBBERED it with the stale remote value (the cause of
    // "voice speed resets on a fresh login"). They are debounce-synced now;
    // the 3s debounce already collapses slider scrubs into a single push, so
    // these settings persist across devices and reloads.
    const PREF_SYNC_BLOCKLIST = new Set([
        'wl_draft',          // writing lab draft (fires on every keystroke)
        'mw_progress',       // My Words position within a group (per device)
        'mw_pos_all', 'mw_pos_core', 'mw_pos_pronunciation',
        'mw_pos_spelling', 'mw_pos_weak',
        'mw_shuffle',        // shuffle on/off — per-device view preference
        'mw_shuffle_seed'    // shuffle permutation seed — per device
    ]);

    function hookSaves() {
        if (!window.DB) return;
        const methods = [
            'saveNotebook', 'saveStats', 'saveWritingEntry',
            'deleteWritingEntry', 'upsertNotebookWord', 'removeNotebookWord',
            'toggleFocus',
            // v130: 课程导入/删除/编辑走 saveUserLessons, 此前没有任何
            // 同步触发 —— 导入完不做别的学习动作, 课程就永远到不了云端。
            // 拉取路径走 mergeUserLessons (未钩), 不会形成推拉循环。
            // importAll 同理: 恢复备份改了一大批键, 也该推一次。
            'saveUserLessons', 'importAll'
        ];
        methods.forEach(m => {
            const orig = window.DB[m];
            if (typeof orig !== 'function') return;
            window.DB[m] = function(...args) {
                const result = orig.apply(this, args);
                triggerSave();
                return result;
            };
        });

        // Hook setPref selectively — expression progress uses it, and we
        // don't want those changes to be sync-invisible.
        const origSetPref = window.DB.setPref;
        if (typeof origSetPref === 'function') {
            window.DB.setPref = function(name, val) {
                const result = origSetPref.apply(this, [name, val]);
                if (!PREF_SYNC_BLOCKLIST.has(name)) triggerSave();
                return result;
            };
        }
    }

    // ─── UI: status indicator in header ──────────────────────
    function updateSyncUI() {
        let el = document.getElementById('sync-indicator');
        if (!el) {
            const hr = document.querySelector('.header-right');
            if (!hr) return;
            el = document.createElement('button');
            el.id = 'sync-indicator';
            el.className = 'header-btn';
            hr.insertBefore(el, hr.firstChild);
            el.addEventListener('click', handleSyncClick);
        }
        el.classList.toggle('syncing', isSyncing);
        const hasToken = Boolean(getToken());
        const hasGist  = Boolean(getGistId());
        const lastPush = getLastPush();
        const lastPull = getLastPull();
        const lastAny  = Math.max(lastPush, lastPull);

        if (hasToken && hasGist) {
            el.textContent = '\u2601\uFE0F';  // ☁️
            el.title = lastAny
                ? `Synced: ${new Date(lastAny).toLocaleTimeString()}\n(click to pull now)`
                : 'Cloud sync active — click to pull';
        } else if (hasToken) {
            el.textContent = '\u2601\uFE0F';
            el.title = 'First save will create your sync Gist';
        } else {
            el.textContent = '\u26A1';  // ⚡
            el.title = 'Set GitHub token in Settings to enable cloud sync';
        }
    }

    // 查看 / 回滚拉取前快照。控制台用法:
    //   SyncManager.restorePrePull()        只查看 (列出各代时间与课程)
    //   SyncManager.restorePrePull(true)    回滚到最新一代
    //   SyncManager.restorePrePull(true, 1) 回滚到第 1 代 (0 为最新)
    // 默认只查看是刻意的: 万一好快照已被后续拉取挤掉, 先看清楚再决
    // 定, 免得用更旧/同样残缺的数据盖掉现状。回滚后刷新页面, 并立刻
    // 手动同步一次把正确数据推回云端。
    function restorePrePull(doRestore, genIndex) {
        try {
            const prefix = keyPrefix();          // v126 修复: 原来漏了这行
            const gens   = readPrePullGens(prefix);
            if (!gens.length) {
                console.log('[Sync] \u6CA1\u6709\u62C9\u53D6\u524D\u5FEB\u7167');
                return null;
            }
            // 概览: 每代的时间 + 课程名 + 生词本条数, 一眼看出哪代是好的
            const summary = gens.map((g, i) => {
                const info = { gen: i, savedAt: new Date(g.ts || 0).toLocaleString() };
                try {
                    const ls = JSON.parse(g.data[prefix + 'lessons_user'] || '[]');
                    info.lessons = Array.isArray(ls) ? ls.map(l => l && l.title) : [];
                } catch (e) { info.lessons = '(\u89E3\u6790\u5931\u8D25)'; }
                try {
                    const nb = JSON.parse(g.data[prefix + 'notebook'] || '[]');
                    info.notebookCount = Array.isArray(nb) ? nb.length : 0;
                } catch (e) { info.notebookCount = -1; }
                return info;
            });
            if (!doRestore) {
                console.log('[Sync] \u62C9\u53D6\u524D\u5FEB\u7167 ' + gens.length + ' \u4EE3:');
                console.table ? console.table(summary) : console.log(summary);
                console.log('[Sync] \u786E\u8BA4\u8981\u56DE\u6EDA\u5C31\u6267\u884C: '
                    + 'SyncManager.restorePrePull(true)   \u6216\u6307\u5B9A\u4EE3: '
                    + 'SyncManager.restorePrePull(true, 1)');
                return { generations: summary, restored: false };
            }
            const gi = Math.max(0, Math.min(Number(genIndex) || 0, gens.length - 1));
            const g  = gens[gi];
            const keys = Object.keys(g.data);
            keys.forEach(k => localStorage.setItem(k, g.data[k]));
            console.log('[Sync] \u5DF2\u56DE\u6EDA ' + keys.length + ' \u4E2A\u952E\u5230 \u7B2C'
                + gi + ' \u4EE3 (' + new Date(g.ts || 0).toLocaleString()
                + ') \u2014 \u8BF7\u5237\u65B0\u9875\u9762, \u5E76\u7ACB\u5373\u624B\u52A8\u540C\u6B65\u4E00\u6B21');
            window.App?.showToast?.('\u5DF2\u56DE\u6EDA\u62C9\u53D6\u524D\u7684\u5B66\u4E60\u8BB0\u5F55');
            return { restoredKeys: keys, savedAt: g.ts, gen: gi, restored: true };
        } catch (e) {
            console.warn('[Sync] restorePrePull failed', e);
            return null;
        }
    }

    async function handleSyncClick() {
        if (!getToken()) {
            window.App?.showToast?.('Set GitHub token in Settings first.');
            window.App?.openSettings?.();
            return;
        }
        if (!getGistId()) {
            // No Gist yet — push first to create one
            await push(true);
            return;
        }
        // Manual pull
        await pull(true);
    }

    // ─── Public API ──────────────────────────────────────────
    return {
        init,
        restorePrePull,
        triggerSave,
        pull,
        push,
        setupSync,             // first-time setup: find existing Gist or create new
        updateSyncUI,
        setToken,              // for settings UI
        getToken,              // for settings UI
        isApiKeySyncEnabled,   // v72: settings UI reads this for the toggle state
        setApiKeySyncEnabled   // v72: settings UI flips this when user opts in/out
    };
})();
