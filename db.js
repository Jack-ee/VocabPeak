// ============================================================
// db.js — VocabPeak Data Layer
// ============================================================

(function() {
    // 存储前缀取自 config.js 的单一来源（与 EMPro 的 "emp_" 隔离）。
    const PREFIX = (window.APP_CONFIG && window.APP_CONFIG.STORAGE_PREFIX) || 'hsv_';

    function key(name) {
        const pid = (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID) || 'default';
        return `${PREFIX}${pid}_${name}`;
    }

    function safeJSON(str, fallback) {
        if (str === null || str === undefined) return fallback;
        try { return JSON.parse(str) || fallback; }
        catch { return fallback; }
    }

    // ─── 课程内容存储 (IndexedDB, v128) ──────────────────────
    // 课程是「内容」不是「用户状态」: 36 门课在每台设备、每个分享
    // 对象那里完全一样。原来它躺在 localStorage 的 lessons_user 键
    // 里, 并随用户快照整份同步, 后果有三:
    //   ① localStorage 按 origin 只有几 MB (还与同源的 EMPro 共享),
    //      课程 697 KB + 拉取前快照里的课程副本, 配额已经吃紧 ——
    //      三代快照实际只装下一代, 兜底保险被悄悄削弱;
    //   ② 同步载荷越过 1 MB, API 读取被截断 (v127 才修掉静默失效);
    //   ③ 课程进入整档 LWW 覆盖区 —— 前几天课程被冲就是这个通道。
    // 现在课程存 IndexedDB (配额几百 MB), 按 id 一课一条, 每条带
    // 版本时间戳 _v; 同步改用独立 Gist 文件 + 内容哈希增量 (见
    // sync.js), 主载荷只剩真正的用户数据。
    //
    // 对外仍是同步 API (loadUserLessons / saveUserLessons) —— 内存
    // 缓存在启动时由 initCourses() 灌满, 调用点一处都不用改。
    const CDB_NAME  = PREFIX + 'content';
    const CDB_STORE = 'courses';
    let _courses      = [];        // 内存缓存 (权威副本, 同步读写它)
    let _coursesReady = false;
    let _cdb          = null;

    function cdbOpen() {
        if (_cdb) return Promise.resolve(_cdb);
        return new Promise((resolve, reject) => {
            let req;
            try { req = indexedDB.open(CDB_NAME, 1); }
            catch (e) { reject(e); return; }
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(CDB_STORE)) {
                    db.createObjectStore(CDB_STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = () => { _cdb = req.result; resolve(_cdb); };
            req.onerror   = () => reject(req.error);
        });
    }

    function cdbAll() {
        return cdbOpen().then(db => new Promise((resolve, reject) => {
            const tx  = db.transaction(CDB_STORE, 'readonly');
            const req = tx.objectStore(CDB_STORE).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror   = () => reject(req.error);
        }));
    }

    // 整表覆写 (课程集合变动都走它: 清空 → 写入 → 单事务原子提交)
    function cdbReplaceAll(arr) {
        return cdbOpen().then(db => new Promise((resolve, reject) => {
            const tx    = db.transaction(CDB_STORE, 'readwrite');
            const store = tx.objectStore(CDB_STORE);
            store.clear();
            (arr || []).forEach(l => { if (l && l.id) store.put(l); });
            tx.oncomplete = () => resolve(true);
            tx.onerror    = () => reject(tx.error);
            tx.onabort    = () => reject(tx.error || new Error('tx aborted'));
        }));
    }

    // 内容哈希: 用于同步侧判断"课程有没有变", 避免每次推送都上传
    // 几百 KB。简单 FNV-1a, 冲突概率对这个用途足够低。
    // 比对内容时忽略版本字段本身
    function stripV(l) {
        const o = Object.assign({}, l);
        delete o._v;
        return o;
    }

    function coursesHash(arr) {
        const src = JSON.stringify((arr || []).map(l => [l.id, l._v || 0]).sort());
        let h = 0x811c9dc5;
        for (let i = 0; i < src.length; i++) {
            h ^= src.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16);
    }

    // ─── Lemma matcher ───────────────────────────────────────
    // Tests whether `inflected` is a plausible English inflection of
    // `base`. Designed for precision over recall — false negatives just
    // mean a word silently won't match and the existing "create new
    // row" behavior kicks in (annoying, not corrupting). False
    // positives could merge unrelated words, so we err on caution.
    // Covers the cases described in the memory note about inflected
    // forms (proved/prove, collections/collection, etc.).
    const IRREGULAR = {
        'am':['be'],'is':['be'],'are':['be'],'was':['be'],'were':['be'],'been':['be'],'being':['be'],
        'has':['have'],'had':['have'],'having':['have'],
        'does':['do'],'did':['do'],'done':['do'],'doing':['do'],
        'goes':['go'],'went':['go'],'gone':['go'],'going':['go'],
        'ran':['run'],'running':['run'],
        'saw':['see'],'seen':['see'],'seeing':['see'],
        'ate':['eat'],'eaten':['eat'],'eating':['eat'],
        'took':['take'],'taken':['take'],'taking':['take'],
        'gave':['give'],'given':['give'],'giving':['give'],
        'came':['come'],'coming':['come'],
        'made':['make'],'making':['make'],
        'knew':['know'],'known':['know'],'knowing':['know'],
        'thought':['think'],'thinking':['think'],
        'brought':['bring'],'bringing':['bring'],
        'bought':['buy'],'buying':['buy'],
        'caught':['catch'],'catching':['catch'],
        'taught':['teach'],'teaching':['teach'],
        'said':['say'],'saying':['say'],
        'told':['tell'],'telling':['tell'],
        'found':['find'],'finding':['find'],
        'got':['get'],'gotten':['get'],'getting':['get'],
        'putting':['put'],
        'setting':['set'],
        'lost':['lose'],'losing':['lose'],
        'held':['hold'],'holding':['hold'],
        'led':['lead'],'leading':['lead'],
        'met':['meet'],'meeting':['meet'],
        'reading':['read'],
        'wrote':['write'],'written':['write'],'writing':['write'],
        'spoke':['speak'],'spoken':['speak'],'speaking':['speak'],
        'broke':['break'],'broken':['break'],'breaking':['break'],
        'chose':['choose'],'chosen':['choose'],'choosing':['choose'],
        'drew':['draw'],'drawn':['draw'],
        'men':['man'],'women':['woman'],'children':['child'],
        'feet':['foot'],'teeth':['tooth'],'mice':['mouse'],'geese':['goose'],'people':['person'],
        'better':['good','well'],'best':['good','well'],
        'worse':['bad','ill'],'worst':['bad','ill'],
        'more':['many','much'],'most':['many','much'],
        'less':['little'],'least':['little'],
        'further':['far'],'furthest':['far'],'farther':['far'],'farthest':['far'],
        // Additional irregular verbs (past / past participle / -ing).
        'began':['begin'],'begun':['begin'],'beginning':['begin'],
        'drove':['drive'],'driven':['drive'],'driving':['drive'],
        'rose':['rise'],'risen':['rise'],'rising':['rise'],
        'fell':['fall'],'fallen':['fall'],'falling':['fall'],
        'flew':['fly'],'flown':['fly'],'flying':['fly'],
        'grew':['grow'],'grown':['grow'],'growing':['grow'],
        'threw':['throw'],'thrown':['throw'],'throwing':['throw'],
        'blew':['blow'],'blown':['blow'],'blowing':['blow'],
        'froze':['freeze'],'frozen':['freeze'],'freezing':['freeze'],
        'stole':['steal'],'stolen':['steal'],'stealing':['steal'],
        'swam':['swim'],'swum':['swim'],'swimming':['swim'],
        'sang':['sing'],'sung':['sing'],'singing':['sing'],
        'drank':['drink'],'drunk':['drink'],'drinking':['drink'],
        'rang':['ring'],'rung':['ring'],'ringing':['ring'],
        'sat':['sit'],'sitting':['sit'],
        'stood':['stand'],'standing':['stand'],
        'understood':['understand'],'understanding':['understand'],
        'won':['win'],'winning':['win'],
        'sent':['send'],'sending':['send'],
        'spent':['spend'],'spending':['spend'],
        'built':['build'],'building':['build'],
        'felt':['feel'],'feeling':['feel'],
        'kept':['keep'],'keeping':['keep'],
        'slept':['sleep'],'sleeping':['sleep'],
        'meant':['mean'],'meaning':['mean'],
        'dealt':['deal'],'dealing':['deal'],
        'left':['leave'],'leaving':['leave'],
        'heard':['hear'],'hearing':['hear'],
        'paid':['pay'],'paying':['pay'],
        'laid':['lay'],'laying':['lay'],
        'became':['become'],'becoming':['become'],
        'forgot':['forget'],'forgotten':['forget'],'forgetting':['forget'],
        'wore':['wear'],'worn':['wear'],'wearing':['wear'],
        'tore':['tear'],'torn':['tear'],'tearing':['tear'],
        'bore':['bear'],'borne':['bear'],'bearing':['bear'],
        'beat':['beat'],'beaten':['beat'],'beating':['beat'],
        'bit':['bite'],'bitten':['bite'],'biting':['bite'],
        'hid':['hide'],'hidden':['hide'],'hiding':['hide'],
        'rode':['ride'],'ridden':['ride'],'riding':['ride'],
        'shook':['shake'],'shaken':['shake'],'shaking':['shake'],
        'woke':['wake'],'woken':['wake'],'waking':['wake'],
        'shone':['shine'],'shining':['shine'],
        'shot':['shoot'],'shooting':['shoot'],
        'hung':['hang'],'hanging':['hang'],
        'sold':['sell'],'selling':['sell'],
        'fed':['feed'],'feeding':['feed'],
        'fled':['flee'],'fleeing':['flee'],
        'lit':['light'],'lighting':['light'],
        'slid':['slide'],'sliding':['slide'],
        'struck':['strike'],'striking':['strike'],
        'swung':['swing'],'swinging':['swing'],
        'sank':['sink'],'sunk':['sink'],'sinking':['sink'],
        'fought':['fight'],'fighting':['fight'],
        'sought':['seek'],'seeking':['seek'],
        'bent':['bend'],'bending':['bend'],
        'lent':['lend'],'lending':['lend'],
        'swept':['sweep'],'sweeping':['sweep'],
        'wept':['weep'],'weeping':['weep'],
        'crept':['creep'],'creeping':['creep'],
        'cutting':['cut'],'hitting':['hit'],'letting':['let'],
        'shutting':['shut'],'spreading':['spread'],'casting':['cast'],
        'costing':['cost'],'hurting':['hurt'],
        'forgave':['forgive'],'forgiven':['forgive'],'forgiving':['forgive'],
        'withdrew':['withdraw'],'withdrawn':['withdraw'],
        'arose':['arise'],'arisen':['arise'],'arising':['arise'],
        // Latin / Greek plurals → singular.
        'analyses':['analysis'],'crises':['crisis'],'theses':['thesis'],
        'hypotheses':['hypothesis'],'parentheses':['parenthesis'],
        'diagnoses':['diagnosis'],'criteria':['criterion'],
        'phenomena':['phenomenon'],'data':['datum'],'media':['medium'],
        'bacteria':['bacterium'],'curricula':['curriculum'],
        'memoranda':['memorandum'],'addenda':['addendum'],
        'indices':['index'],'matrices':['matrix'],'vertices':['vertex'],
        'appendices':['appendix'],'formulae':['formula'],'antennae':['antenna'],
        'alumni':['alumnus'],'fungi':['fungus'],'cacti':['cactus'],
        'nuclei':['nucleus'],'radii':['radius'],'syllabi':['syllabus'],
        'stimuli':['stimulus'],'foci':['focus']
    };

    // Common adjectives that double the final consonant in the
    // comparative / superlative (big → bigger). Kept as an explicit
    // allowlist so we never false-positive on agent nouns or verbs
    // (e.g. bet → better) from a blind doubling rule.
    const CVC_ADJ = new Set([
        'big','hot','thin','fat','sad','wet','fit','flat','slim','dim',
        'red','mad','glad','grim','tan','big'
    ]);

    function _isCVC(w) {
        if (w.length < 2) return false;
        if (/[wxy]$/.test(w)) return false;
        return /[^aeiou][aeiou][^aeiou]$/i.test(w);
    }

    function isInflectionOf(inflected, base) {
        const a = String(inflected || '').trim().toLowerCase();
        const b = String(base       || '').trim().toLowerCase();
        if (!a || !b) return false;

        // Identity
        if (a === b) return true;

        // Irregulars
        const bases = IRREGULAR[a];
        if (bases && bases.includes(b)) return true;

        // Regulars: inflected must be longer than base
        if (a.length <= b.length) return false;

        // Skip regular rules for phrases
        if (a.includes(' ') || b.includes(' ')) return false;

        const cand = new Set();

        // Plurals / 3rd-singular
        cand.add(b + 's');
        cand.add(b + 'es');
        if (/[^aeiou]y$/.test(b)) cand.add(b.slice(0, -1) + 'ies');
        if (/f$/.test(b))         cand.add(b.slice(0, -1) + 'ves');
        if (/fe$/.test(b))        cand.add(b.slice(0, -2) + 'ves');

        // Past tense / past participle
        if (/e$/.test(b)) {
            cand.add(b + 'd');
        } else {
            cand.add(b + 'ed');
            if (/[^aeiou]y$/.test(b)) cand.add(b.slice(0, -1) + 'ied');
            if (_isCVC(b))            cand.add(b + b.slice(-1) + 'ed');
        }

        // Present participle / gerund
        if (/ie$/.test(b)) {
            cand.add(b.slice(0, -2) + 'ying');
        } else if (/e$/.test(b) && !/ee$/.test(b)) {
            cand.add(b.slice(0, -1) + 'ing');
        } else {
            cand.add(b + 'ing');
            if (_isCVC(b)) cand.add(b + b.slice(-1) + 'ing');
        }

        // Adverb -ly
        cand.add(b + 'ly');
        if (/y$/.test(b) && !/[aeou]y$/.test(b)) cand.add(b.slice(0, -1) + 'ily');

        // Comparatives / superlatives: a blind base+'er' rule collides
        // with agent nouns (work→worker, teach→teacher), so we only
        // generate the consonant-doubling forms for the known CVC
        // adjective allowlist (big→bigger, hot→hottest). Regular -er/
        // -est adjectives are left to the irregular table or to exact /
        // INPUT-field matching, which is the precise path.
        if (CVC_ADJ.has(b)) {
            const dbl = b + b.slice(-1);
            cand.add(dbl + 'er');
            cand.add(dbl + 'est');
        }

        return cand.has(a);
    }

    // ─── Streak helpers ──────────────────────────────────────
    // Local calendar date (YYYY-MM-DD) in the user's timezone — NOT UTC.
    // toISOString().slice(0,10) gives the UTC date, which rolls early or
    // late depending on timezone (China is UTC+8, so a UTC date lags a
    // day) and would mis-count streaks.
    function _localYMD(d) {
        const dd = d || new Date();
        const y  = dd.getFullYear();
        const m  = String(dd.getMonth() + 1).padStart(2, '0');
        const da = String(dd.getDate()).padStart(2, '0');
        return `${y}-${m}-${da}`;
    }

    // Advance the daily streak on `stats` if today has not been counted
    // yet. Idempotent within a calendar day. Mutates and returns `stats`
    // but does NOT persist — the caller decides when to save.
    function _advanceStreak(stats) {
        const today = _localYMD();
        if (stats.lastActiveDate === today) return stats;  // already counted today
        const yd = new Date();
        yd.setDate(yd.getDate() - 1);
        const yesterday = _localYMD(yd);
        stats.streakDays = (stats.lastActiveDate === yesterday)
            ? (stats.streakDays || 0) + 1
            : 1;
        stats.lastActiveDate = today;
        return stats;
    }

    // Keep at most `keep` day-log keys, dropping the oldest. Bounds the
    // whole-snapshot sync payload while preserving well over a school year
    // of daily records (YYYY-MM-DD keys sort lexicographically = by date).
    function _pruneDayLog(keep) {
        try {
            const pre  = key('day_');
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(pre)) keys.push(k);
            }
            if (keys.length <= keep) return;
            keys.sort();
            keys.slice(0, keys.length - keep).forEach(k => localStorage.removeItem(k));
        } catch (e) { /* ignore */ }
    }

    window.DB = {
        // --- Profile ---
        getProfile: function() {
            return {
                id   : (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID)   || 'default',
                name : (window.APP_CONFIG && window.APP_CONFIG.PROFILE_NAME) || 'User'
            };
        },

        // --- API Key (stored separately, not profile-bound) ---
        getAPIKey: function() {
            return localStorage.getItem(`${PREFIX}api_key`) || '';
        },
        setAPIKey: function(k) {
            localStorage.setItem(`${PREFIX}api_key`, k || '');
        },

        // --- Preferences ---
        getPref: function(name, fallback) {
            const v = localStorage.getItem(key('pref_' + name));
            return v !== null ? v : fallback;
        },
        setPref: function(name, val) {
            localStorage.setItem(key('pref_' + name), val);
        },
        // v132: 静默写 pref —— 与 setPref 同一个键, 但不会被 sync.js 的
        // 推送钩子包装 (钩子按方法名包装 setPref 本身)。专给高频落盘的
        // 计时数据用: 学习时长每 30 秒 flush 一次, 走 setPref 会制造
        // 推送风暴; 走这里只落本地, 上云搭别的推送便车 (答题的 bumpDaily
        // 每题都在 triggerSave) 或由调用方在退出/切后台时补一次推送。
        setPrefQuiet: function(name, val) {
            localStorage.setItem(key('pref_' + name), val);
        },

        // --- Vocabulary Notebook ---
        loadNotebook: function() {
            return safeJSON(localStorage.getItem(key('notebook')), []);
        },
        saveNotebook: function(arr) {
            localStorage.setItem(key('notebook'), JSON.stringify(arr || []));
        },

        // ─── 课文精读: 用户导入的课 (IndexedDB, v128) ───────
        // 读写都走内存缓存, 保持同步签名; 落盘异步进 IndexedDB。
        // 启动时必须先 await initCourses() 灌满缓存。
        loadUserLessons: function() {
            return _courses.slice();
        },
        saveUserLessons: function(arr) {
            const now  = Date.now();
            const prev = {};
            _courses.forEach(l => { prev[l.id] = l; });
            // 只给内容真的变了的课打新版本号 —— 版本号参与内容哈希,
            // 无意义的 bump 会让同步误判"课程变了"而重传几百 KB。
            _courses = (arr || []).filter(l => l && l.id).map(l => {
                const old = prev[l.id];
                if (old && JSON.stringify(stripV(old)) === JSON.stringify(stripV(l))) {
                    return Object.assign({}, l, { _v: old._v || now });
                }
                return Object.assign({}, l, { _v: now });
            });
            cdbReplaceAll(_courses).catch(e =>
                console.error('[DB] 课程写入 IndexedDB 失败:', e));
            return _courses.length;
        },

        // 启动初始化: 从 IndexedDB 灌缓存; 首次运行把 localStorage
        // 里的旧课程迁移过来 (写入并核对成功后才删除旧键 —— 迁移
        // 途中断电/报错都不会丢课)。
        initCourses: async function() {
            if (_coursesReady) return _courses.length;
            const legacyRaw = localStorage.getItem(key('lessons_user'));
            try {
                _courses = await cdbAll();
            } catch (e) {
                console.error('[DB] 打开课程库失败, 回退 localStorage:', e);
                _courses      = safeJSON(legacyRaw, []);
                _coursesReady = true;
                return _courses.length;
            }
            if (!_courses.length && legacyRaw) {
                const legacy = safeJSON(legacyRaw, []);
                if (legacy.length) {
                    const now = Date.now();
                    const arr = legacy.filter(l => l && l.id)
                                      .map(l => Object.assign({}, l, { _v: l._v || now }));
                    try {
                        await cdbReplaceAll(arr);
                        const check = await cdbAll();
                        if (check.length === arr.length) {
                            localStorage.removeItem(key('lessons_user'));
                            console.log('[DB] 已把 ' + arr.length +
                                        ' 门课迁移到 IndexedDB, 并释放 localStorage');
                            _courses = check;
                        } else {
                            console.error('[DB] 迁移核对不符, 保留 localStorage 旧键');
                            _courses = arr;
                        }
                    } catch (e) {
                        console.error('[DB] 迁移失败, 保留 localStorage 旧键:', e);
                        _courses = arr;
                    }
                }
            } else if (_courses.length && legacyRaw) {
                // v130 残留清理: IndexedDB 已有课程但 localStorage 旧键还在
                // (旧版设备的快照曾把它回灌, 或迁移中断后又被同步写回)。
                // 把旧键里本机没有的课并进来 (旧键条目无 _v, 不会覆盖本机
                // 已有课), 写盘成功后删除旧键, 收回 ~700 KB 配额。写盘失败
                // 则保留旧键, 不丢任何课。
                let ok = true;
                try {
                    const legacy = safeJSON(legacyRaw, []);
                    const byId   = {};
                    _courses.forEach(l => { byId[l.id] = l; });
                    const now = Date.now();
                    let   add = 0;
                    (Array.isArray(legacy) ? legacy : []).forEach(l => {
                        if (l && l.id && !byId[l.id]) {
                            byId[l.id] = Object.assign({}, l, { _v: l._v || now });
                            add++;
                        }
                    });
                    if (add) {
                        const merged = Object.keys(byId).map(k => byId[k]);
                        await cdbReplaceAll(merged);
                        _courses = merged;
                        console.log('[DB] 残留旧键并入 ' + add + ' 门本机没有的课');
                    }
                } catch (e) {
                    ok = false;
                    console.error('[DB] 残留键合并失败, 保留旧键:', e);
                }
                if (ok) {
                    localStorage.removeItem(key('lessons_user'));
                    console.log('[DB] 已清理 localStorage 课程残留键, 收回配额');
                }
            }
            _courses.sort((a, b) => String(a.id).localeCompare(String(b.id)));
            _coursesReady = true;
            return _courses.length;
        },

        // 同步用: 按 id 并集合并, 同 id 取 _v 新的一侧, 不做删除 ——
        // 课程是内容, 「对面没有」只说明对面旧, 绝非删除意图 (v126
        // 同一原则)。返回是否发生了变化。
        mergeUserLessons: function(incoming) {
            if (!Array.isArray(incoming) || !incoming.length) return false;
            // v130 守卫: initCourses 灌满缓存前拒绝合并 —— 此时 _courses
            // 是空的, 合并结果会把「远端集合」当全量整表写回 IndexedDB,
            // 本机未推送的课就被抹掉了。sync.js 侧有同样的守卫, 这里是
            // 纵深防御 (任何未来调用点都不该能踩到这个坑)。
            if (!_coursesReady) {
                console.warn('[DB] mergeUserLessons before initCourses — refused');
                return false;
            }
            const byId = {};
            _courses.forEach(l => { byId[l.id] = l; });
            let changed = false;
            incoming.forEach(l => {
                if (!l || !l.id) return;
                const cur = byId[l.id];
                if (!cur || (l._v || 0) > (cur._v || 0)) { byId[l.id] = l; changed = true; }
            });
            if (!changed) return false;
            _courses = Object.keys(byId).map(k => byId[k])
                             .sort((a, b) => String(a.id).localeCompare(String(b.id)));
            cdbReplaceAll(_courses).catch(e =>
                console.error('[DB] 课程合并写入失败:', e));
            return true;
        },

        coursesHash:  function() { return coursesHash(_courses); },
        coursesReady: function() { return _coursesReady; },
        upsertNotebookWord: function(entry, opts) {
            const nb       = this.loadNotebook();
            const wLow     = String(entry.word || '').trim().toLowerCase();
            const matchLow = String((opts && opts.matchWord) || '').trim().toLowerCase();

            // 0) Explicit match key — the exact word the user already
            // stored (e.g. an inflected form "squeezed"). Supplied by the
            // batch importer via the AI-echoed INPUT field. This is the
            // precise path: it does not rely on inflection heuristics, so
            // a base form returned by the AI ("squeeze") still updates the
            // original row instead of creating an orphan duplicate.
            let idx = -1;
            if (matchLow) {
                idx = nb.findIndex(w => String(w.word || '').trim().toLowerCase() === matchLow);
            }

            // 1) Exact match on the canonical word.
            if (idx < 0) {
                idx = nb.findIndex(w => String(w.word || '').trim().toLowerCase() === wLow);
            }

            // 2) Lemma match: look for any existing entry whose stored
            // word is a plausible inflection of the incoming `word`.
            // Runs only if the exact match failed. The incoming word
            // is assumed to be a base form (that's what the batch-
            // enrich prompt asks the AI to return).
            let matchedViaLemma = false;
            if (idx < 0 && wLow) {
                idx = nb.findIndex(w => isInflectionOf(String(w.word || ''), wLow));
                if (idx >= 0) matchedViaLemma = true;
            }

            const item = {
                word       : entry.word,
                meaning    : entry.meaning    || '',
                enDef      : entry.enDef      || '',
                collo      : entry.collo      || '',
                colloCn    : entry.colloCn    || '',
                register   : entry.register   || 'neutral',
                context    : entry.context    || '',
                contextCn  : entry.contextCn  || '',
                phonetic   : entry.phonetic   || '',
                note       : entry.note       || '',
                tags       : Array.isArray(entry.tags) ? entry.tags : [],
                focus      : Array.isArray(entry.focus) ? entry.focus : [],
                source     : entry.source     || '',
                addedAt    : entry.addedAt    || Date.now(),
                reviewedAt : entry.reviewedAt || 0,
                strength   : entry.strength   || 0,
                wrongCount    : entry.wrongCount    || 0,
                correctStreak : entry.correctStreak || 0,
                // Stable index for audio-pack range builds. 0 means it is
                // not assigned yet; the app assigns a permanent number on
                // export. The merge loop below preserves an existing
                // non-zero index, so enriching a word never renumbers it.
                packIndex     : entry.packIndex     || 0
            };

            if (idx >= 0) {
                // Merge: keep existing fields if new ones are empty.
                // When lemma-matched, we DO overwrite the stored
                // word with the canonical base form so the notebook
                // standardizes on lemmas (squeezed → squeeze).
                const old = nb[idx];
                Object.keys(item).forEach(k => {
                    if (k === 'addedAt') return;
                    if (k === 'word') {
                        // Lemma match: adopt the canonical base form
                        // Exact match: already equal, no-op
                        return;
                    }
                    if (Array.isArray(item[k]) && item[k].length === 0 && Array.isArray(old[k]) && old[k].length > 0) {
                        item[k] = old[k];
                        return;
                    }
                    if (!item[k] && old[k]) item[k] = old[k];
                });
                // Preserve original addedAt
                item.addedAt = old.addedAt || item.addedAt;
                // 保留模板未列出的旧字段（srsLevel / nextReview / lastReview /
                // reviewCount / mistakeCount / level / freq …）。item 是按固定
                // 模板新建的对象，缺了这一步，AI 补全会整体替换条目，把 SRS
                // 复习进度和内置词库元数据一并清空（词立刻变回"到期"）。
                Object.keys(old).forEach(k => {
                    if (!(k in item)) item[k] = old[k];
                });
                if (matchedViaLemma) {
                    console.log(`[DB] Lemma-matched "${old.word}" → "${item.word}", merged.`);
                }
                nb[idx] = item;
            } else {
                nb.push(item);
                // 只有真正新增才计入每日新词。批量回填（AI 补全）传
                // countNew:false 跳过——补全产生的孤儿条目不等于当天学了新词。
                if (!opts || opts.countNew !== false) {
                    this.bumpDaily({ newWords: 1 });
                }
            }
            this.saveNotebook(nb);
            return item;
        },
        removeNotebookWord: function(word) {
            const nb   = this.loadNotebook();
            const wLow = String(word || '').toLowerCase();
            const next = nb.filter(w => String(w.word || '').toLowerCase() !== wLow);
            this.saveNotebook(next);
            // Drop the word's offline pack audio too, so the pack store
            // does not keep clips for vocabulary that has been removed.
            try { window.TTSPack && window.TTSPack.deleteWord(word); }
            catch (e) { /* ignore */ }
        },
        toggleFocus: function(word, focusType) {
            const nb   = this.loadNotebook();
            const wLow = String(word || '').toLowerCase();
            const idx  = nb.findIndex(w => String(w.word || '').toLowerCase() === wLow);
            if (idx < 0) return false;
            const w     = nb[idx];
            const focus = Array.isArray(w.focus) ? [...w.focus] : [];
            const i     = focus.indexOf(focusType);
            if (i >= 0) focus.splice(i, 1);
            else        focus.push(focusType);
            w.focus = focus;
            nb[idx] = w;
            this.saveNotebook(nb);
            return focus.includes(focusType);
        },

        // --- Spaced Repetition (SRS) ---
        // Each word can carry optional review state. All fields are optional;
        // a word with none of them is treated as "new, due now". This means
        // existing words from before this feature shipped automatically appear
        // in the Due filter without any migration step.
        //
        // Word fields used here:
        //   srsLevel    — integer 0..5 (0 = new / failed, 5 = mastered)
        //   nextReview  — ms-since-epoch; null/missing = due now
        //   lastReview  — ms-since-epoch of most recent review
        //   reviewCount — total reviews ever performed
        //   mistakeCount — total times marked "wrong"
        //
        // Intervals (in days), indexed by level after the review:
        //   level 0  → 1
        //   level 1  → 3
        //   level 2  → 7
        //   level 3  → 14
        //   level 4  → 30
        //   level 5+ → 60
        // Easy clicks scale these by ~2x (e.g. 60 → 120 days at level 5).

        SRS_INTERVALS: [1, 3, 7, 14, 30, 60],

        // Pure scheduler — given a current level and a result, returns
        // the new level and how many days until the next review.
        // Exposed so other modules (e.g. the future Mistake Bank) can
        // reuse the same logic.
        scheduleReview: function(currentLevel, result) {
            const lvl       = Math.max(0, Math.min(5, Number(currentLevel) || 0));
            const intervals = this.SRS_INTERVALS;
            let newLevel    = lvl;
            let daysToAdd   = 1;
            switch (result) {
                case 'wrong':
                    newLevel  = 0;
                    daysToAdd = 1;
                    break;
                case 'hard':
                    newLevel  = lvl;
                    daysToAdd = 2;
                    break;
                case 'good':
                    newLevel  = Math.min(5, lvl + 1);
                    daysToAdd = intervals[newLevel];
                    break;
                case 'easy':
                    newLevel  = Math.min(5, lvl + 2);
                    daysToAdd = intervals[newLevel] * 2;
                    break;
                default:
                    // Unknown result → safe no-op (treat as good)
                    newLevel  = Math.min(5, lvl + 1);
                    daysToAdd = intervals[newLevel];
            }
            return { newLevel: newLevel, daysToAdd: daysToAdd };
        },

        // Record a review on a word. Returns the updated word entry,
        // or null if the word wasn't found in the notebook.
        recordReview: function(word, result) {
            const nb   = this.loadNotebook();
            const wLow = String(word || '').toLowerCase();
            const idx  = nb.findIndex(w => String(w.word || '').toLowerCase() === wLow);
            if (idx < 0) return null;

            const entry = nb[idx];
            const sched = this.scheduleReview(entry.srsLevel, result);
            const now   = Date.now();

            entry.srsLevel    = sched.newLevel;
            entry.lastReview  = now;
            entry.nextReview  = now + sched.daysToAdd * 86400000;
            entry.reviewCount = (entry.reviewCount || 0) + 1;
            if (result === 'wrong') {
                entry.mistakeCount = (entry.mistakeCount || 0) + 1;
            }

            nb[idx] = entry;
            this.saveNotebook(nb);
            this.bumpDaily({ reviewed: 1 });
            return entry;
        },

        // Quiz-mistake hook (课文填空答错自动强化). Pulls the word's
        // spaced-repetition state back to "due now" WITHOUT counting a
        // review: srsLevel resets to 0 and nextReview is cleared, so the
        // word surfaces in the My Words due queue immediately and then
        // climbs the normal forgetting-curve intervals (1/3/7/14/30/60d)
        // as it gets reviewed. recordReview() is wrong for this case —
        // it would schedule the word for tomorrow and inflate the daily
        // "reviewed" counter even though no review session happened.
        flagQuizMistake: function(word) {
            const nb   = this.loadNotebook();
            const wLow = String(word || '').toLowerCase();
            const idx  = nb.findIndex(w => String(w.word || '').toLowerCase() === wLow);
            if (idx < 0) return null;
            const e = nb[idx];
            e.srsLevel     = 0;
            e.nextReview   = null;                     // null = due now
            e.mistakeCount = (e.mistakeCount || 0) + 1;
            nb[idx] = e;
            this.saveNotebook(nb);
            return e;
        },

        // ─── 薄弱词统一记账 (v134) ──────────────────────────
        // 全应用唯一的对错记账入口: 单词测验与课文填空都走这里,
        // weak 打标 / 毕业 / 计数口径全局一致 (v134 之前课文答错只拉
        // SRS 不打 weak, 课文答对不推动毕业 —— 两线各记各的)。
        //
        // 毕业规则 (家长定的, 别放宽):
        //   薄弱词只因「真实掌握」退出, 绝不因时间流逝退出 ——
        //   学期中几个月没空练, 回来它必须还在。
        //   掌握的判定: 连对 >= 4 次, 且这些连对分布在 >= 3 个不同
        //   学习日 (streakDays)。一天之内刷出的连对不算数, 隔天还
        //   记得才叫掌握。答错则连对与日期全部清零, 重新攒。
        //   所有进度只增不衰减: 长期不练, 攒到一半的进度原样保留。
        //
        // source: 'quiz' (单词测验) 计 wrongCount; 'lesson' (课文
        // 练习) 计 mistakeCount 并把 SRS 拉回立即到期 (原
        // flagQuizMistake 的职责并入, 避免调用两次双计)。
        // _today 仅测试注入用, 生产不传。
        GRADUATE_STREAK: 4,
        GRADUATE_DAYS  : 3,
        recordWordResult: function(word, isCorrect, source, _today) {
            const nb   = this.loadNotebook();
            const wLow = String(word || '').toLowerCase();
            const idx  = nb.findIndex(w => String(w.word || '').toLowerCase() === wLow);
            if (idx < 0) return null;              // 不在生词本: 不记账 (课文答对的常见情形)
            const e     = nb[idx];
            const today = _today || (() => {
                const d = new Date();
                return d.getFullYear() + '-' +
                       String(d.getMonth() + 1).padStart(2, '0') + '-' +
                       String(d.getDate()).padStart(2, '0');
            })();
            const focus = Array.isArray(e.focus) ? [...e.focus] : [];
            e.lastResultAt = Date.now();           // 后台"多久没练"用
            if (isCorrect) {
                e.correctStreak = (e.correctStreak || 0) + 1;
                const sd = Array.isArray(e.streakDays) ? e.streakDays : [];
                if (sd.indexOf(today) < 0) sd.push(today);
                e.streakDays = sd;
                if (focus.includes('weak')
                    && e.correctStreak >= this.GRADUATE_STREAK
                    && sd.length >= this.GRADUATE_DAYS) {
                    focus.splice(focus.indexOf('weak'), 1);
                    e.focus      = focus;
                    e.streakDays = [];             // 毕业后清空, 下个周期干净起步
                    console.log('[DB] 薄弱词毕业: ' + e.word);
                }
            } else {
                if (source === 'lesson') {
                    e.mistakeCount = (e.mistakeCount || 0) + 1;
                    e.srsLevel     = 0;            // 课文答错: SRS 拉回立即到期
                    e.nextReview   = null;
                } else {
                    e.wrongCount = (e.wrongCount || 0) + 1;
                }
                e.correctStreak = 0;
                e.streakDays    = [];
                if (!focus.includes('weak')) {
                    focus.push('weak');
                    e.focus = focus;
                }
            }
            nb[idx] = e;
            this.saveNotebook(nb);
            return e;
        },

        // ─── 今日特训选词 (v134) ────────────────────────────
        // 三路聚合, 一键零决策: 家长说"去复习", 孩子点一下就开练。
        //   1) weak 标签词 (主力, +4 分)
        //   2) 课文练习里最近一次答错的词 (lemma 映射到生词本, +3 分)
        //   3) 复习过且已到期的词 (nextReview 存在且 <= now, +2 分;
        //      注意与 getDueWords 口径不同 —— 那边把"从没复习过"也算
        //      到期, 在这里会让 1654 词全命中, 特训就失去焦点了)
        // 错次多的排前面 (微调分)。返回按分数倒序的前 n 个。
        getTrainerWords: function(n) {
            n = n || 12;
            const now = Date.now();
            const wrongLemmas = new Set();
            try {
                const rec = JSON.parse(this.getPref('lesson_mixed',
                    '{"w":{},"p":{}}') || '{}').w || {};
                const lem = {};
                (this.loadUserLessons() || []).forEach(l =>
                    (l.words || []).forEach(w => {
                        if (w.id && w.lemma) lem[w.id] = String(w.lemma).toLowerCase();
                    }));
                Object.keys(rec).forEach(id => {
                    const e = rec[id];
                    if (e && e[0] && !e[3] && lem[id]) wrongLemmas.add(lem[id]);
                });
            } catch (e) {}
            const score = w => {
                let s = 0;
                if ((w.focus || []).includes('weak'))                 s += 4;
                if (wrongLemmas.has(String(w.word || '').toLowerCase())) s += 3;
                if (w.nextReview != null && w.nextReview <= now)      s += 2;
                s += Math.min(3, (w.wrongCount || 0) + (w.mistakeCount || 0)) * 0.1;
                return s;
            };
            return this.loadNotebook()
                .map(w => ({ w: w, s: score(w) }))
                .filter(x => x.s >= 2)
                .sort((a, b) => b.s - a.s)
                .slice(0, n)
                .map(x => x.w);
        },

        // ─── weak 标签一次性迁移 (v134) ─────────────────────
        // 合流之前课文答错只加 mistakeCount 不打 weak 标签, 这批词在
        // 应用内的薄弱筛选和新版后台口径 (只认标签) 里都会漏掉。补打
        // 一次, 让它们进入统一的毕业流程。幂等: pref 标志防重跑。
        migrateWeakTags: function() {
            if (this.getPref('weak_migrated_v134', '') === '1') return 0;
            const nb  = this.loadNotebook();
            let   fix = 0;
            nb.forEach(e => {
                const focus = Array.isArray(e.focus) ? e.focus : (e.focus = []);
                if (((e.mistakeCount || 0) + (e.wrongCount || 0)) > 0
                    && !focus.includes('weak')) {
                    focus.push('weak');
                    e.focus = focus;
                    fix++;
                }
            });
            if (fix) this.saveNotebook(nb);
            this.setPref('weak_migrated_v134', '1');
            if (fix) console.log('[DB] weak 标签迁移: 补打 ' + fix + ' 词');
            return fix;
        },

        // Words due today (or earlier). Treats missing nextReview as
        // "due now" so the entire pre-SRS notebook surfaces on first use.
        getDueWords: function() {
            const now = Date.now();
            return this.loadNotebook().filter(w => {
                if (w.nextReview == null) return true;
                return Number(w.nextReview) <= now;
            });
        },

        getDueCount: function() {
            return this.getDueWords().length;
        },

        // Aggregate review state across the notebook.
        // Useful for the future learning-record dashboard.
        getReviewStats: function() {
            const nb  = this.loadNotebook();
            const now = Date.now();
            let due = 0, mastered = 0, learning = 0, neverReviewed = 0;
            for (const w of nb) {
                if (w.nextReview == null)                   { due++; neverReviewed++; }
                else if (Number(w.nextReview) <= now)         due++;
                if (Number(w.srsLevel) >= 5)                  mastered++;
                else if (Number(w.srsLevel) > 0)              learning++;
            }
            return {
                total         : nb.length,
                due           : due,
                neverReviewed : neverReviewed,
                learning      : learning,
                mastered      : mastered
            };
        },

        // --- Writing History ---
        loadWritingHistory: function() {
            return safeJSON(localStorage.getItem(key('writing_history')), []);
        },
        saveWritingEntry: function(entry) {
            const history = this.loadWritingHistory();
            entry.id        = entry.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            entry.timestamp = entry.timestamp || Date.now();
            history.unshift(entry);
            // Keep last 200 entries
            if (history.length > 200) history.length = 200;
            localStorage.setItem(key('writing_history'), JSON.stringify(history));
            return entry;
        },
        deleteWritingEntry: function(id) {
            const history = this.loadWritingHistory().filter(e => e.id !== id);
            localStorage.setItem(key('writing_history'), JSON.stringify(history));
        },

        // --- Statistics ---
        loadStats: function() {
            return safeJSON(localStorage.getItem(key('stats')), {
                totalSessions    : 0,
                totalCorrections : 0,
                avgScore         : 0,
                streakDays       : 0,
                lastActiveDate   : null,
                modeUsage        : {}
            });
        },
        saveStats: function(stats) {
            localStorage.setItem(key('stats'), JSON.stringify(stats || {}));
        },
        bumpSession: function(mode, score) {
            const stats = this.loadStats();

            stats.totalSessions++;
            if (typeof score === 'number') {
                const prev    = stats.avgScore || 0;
                const n       = stats.totalSessions;
                stats.avgScore = Math.round(((prev * (n - 1)) + score) / n);
            }

            // Streak (shared, timezone-correct, idempotent per day)
            _advanceStreak(stats);

            // Mode usage
            if (mode) {
                stats.modeUsage       = stats.modeUsage || {};
                stats.modeUsage[mode] = (stats.modeUsage[mode] || 0) + 1;
            }

            this.saveStats(stats);
            return stats;
        },

        // Mark today as an active study day WITHOUT recording a discrete
        // session. Used by continuous-study surfaces (My Words browse / quiz)
        // where there is no natural "session complete" event but the user is
        // clearly active. Idempotent within a calendar day, so it is safe to
        // call on every study gesture — only the first call each day changes
        // anything (and only then does it persist / trigger a sync push).
        // Deliberately leaves totalSessions / modeUsage untouched so the
        // per-session averages stay meaningful.
        markActiveDay: function() {
            const stats  = this.loadStats();
            const before = stats.lastActiveDate;
            _advanceStreak(stats);
            if (stats.lastActiveDate !== before) this.saveStats(stats);
            return stats;
        },

        // --- Daily activity log (per-day keys) ---
        // Each calendar day is its own key (hsv_{profile}_day_YYYY-MM-DD) so
        // two devices editing DIFFERENT days never collide under whole-snapshot
        // last-write-wins sync. Records are tiny counters, read by the parent
        // dashboard to show what was studied each day.
        loadDay: function(ymd) {
            return safeJSON(localStorage.getItem(key('day_' + (ymd || _localYMD()))), null);
        },
        // Increment today's counters by `delta` (any of newWords / reviewed /
        // quizTotal / quizCorrect). Safe to call on every study gesture.
        bumpDaily: function(delta) {
            delta = delta || {};
            const ymd = _localYMD();
            const k   = key('day_' + ymd);
            const rec = safeJSON(localStorage.getItem(k), null)
                     || { date: ymd, newWords: 0, reviewed: 0, quizTotal: 0, quizCorrect: 0 };
            rec.newWords    += (delta.newWords    || 0);
            rec.reviewed    += (delta.reviewed    || 0);
            rec.quizTotal   += (delta.quizTotal   || 0);
            rec.quizCorrect += (delta.quizCorrect || 0);
            rec.updatedAt    = Date.now();
            localStorage.setItem(k, JSON.stringify(rec));
            this.markActiveDay();          // keep the streak in step with activity
            _pruneDayLog(400);             // bound the synced payload (~13 months)
            // Day keys are written directly (not via a hooked DB method), so
            // nudge the sync layer to push. Optional-chained: no-op if absent.
            try { window.SyncManager && window.SyncManager.triggerSave && window.SyncManager.triggerSave(); }
            catch (e) { /* sync optional */ }
            return rec;
        },
        // All day records, oldest first — for the dashboard timeline.
        listDays: function() {
            const pre = key('day_');
            const out = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(pre)) {
                    const r = safeJSON(localStorage.getItem(k), null);
                    if (r) out.push(r);
                }
            }
            out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
            return out;
        },

        // --- Export / Import ---
        // exportAll(opts) — opts.includeApiKey (default false): when true,
        // bundles `hsv_api_key` into the backup. The API key is plaintext;
        // omitting it by default protects users who share backup files.
        // The sync token and gist id are NEVER exported — they're device-
        // local credentials, not learning data.
        exportAll: function(opts) {
            const includeApiKey = Boolean(opts && opts.includeApiKey);
            const pid           = (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID) || 'default';
            const data          = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(`${PREFIX}${pid}_`)) {
                    data[k] = localStorage.getItem(k);
                }
            }
            if (includeApiKey) {
                const apiKey = localStorage.getItem(`${PREFIX}api_key`) || '';
                if (apiKey) data[`${PREFIX}api_key`] = apiKey;
            }
            // 课程 (v128) 已搬到 IndexedDB, 但备份文件格式保持不变 ——
            // 仍以 lessons_user 键导出。否则备份会静默丢掉全部课程,
            // 且 make-course-pack.js / merge-restore-backup.js 等工具
            // 全部失效。导入侧对应地把它写回 IndexedDB。
            if (_courses.length) {
                data[`${PREFIX}${pid}_lessons_user`] = JSON.stringify(_courses);
            }
            return JSON.stringify(data, null, 2);
        },

        // importAll(jsonStr, opts) — opts.replace (default false):
        //   • replace=true: clear all current profile keys before applying the
        //     backup. This is true overwrite — stale words, history, and
        //     prefs that aren't in the backup are removed.
        //   • replace=false: merge — incoming keys are written, but existing
        //     keys not present in the backup are preserved (legacy behavior).
        // The shared API key (`hsv_api_key`) is touched only if the backup
        // contains it; otherwise the local key is preserved either way.
        importAll: function(jsonStr, opts) {
            const data = safeJSON(jsonStr, null);
            if (!data) return false;
            const replace = Boolean(opts && opts.replace);

            if (replace) {
                const pid    = (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID) || 'default';
                const prefix = `${PREFIX}${pid}_`;
                const drop   = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(prefix)) drop.push(k);
                }
                drop.forEach(k => localStorage.removeItem(k));
            }

            const pidNow    = (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID) || 'default';
            const lessonsKey = `${PREFIX}${pidNow}_lessons_user`;
            let incoming     = null;
            Object.keys(data).forEach(k => {
                if (!k.startsWith(PREFIX)) return;
                // 课程走 IndexedDB (v128): 不能落回 localStorage, 否则
                // 又回到配额与整档同步的老路。replace 时整表覆写,
                // 非 replace 时按 id/版本合并 (课程包并入自己的数据)。
                if (k.endsWith('_lessons_user')) { incoming = safeJSON(data[k], null); return; }
                localStorage.setItem(k, data[k]);
            });
            if (Array.isArray(incoming)) {
                const now = Date.now();
                const arr = incoming.filter(l => l && l.id)
                                    .map(l => Object.assign({}, l, { _v: l._v || now }));
                if (replace) {
                    _courses = arr.sort((a, b) => String(a.id).localeCompare(String(b.id)));
                    cdbReplaceAll(_courses).catch(e =>
                        console.error('[DB] 导入课程写入失败:', e));
                } else {
                    this.mergeUserLessons(arr);
                }
                console.log('[DB] 导入课程 ' + arr.length + ' 门 (' +
                            (replace ? '覆盖' : '合并') + ')');
            } else if (replace) {
                _courses = [];
                cdbReplaceAll([]).catch(() => {});
            }
            return true;
        },

        // --- Factory Reset ---
        // factoryReset(opts) — opts.clearCredentials (default false):
        //   • false: only profile-prefixed learning data is wiped; API key,
        //     GitHub sync token, and Gist id are preserved (matches the
        //     historical behavior so a "reset" doesn't surprise-revoke
        //     credentials the user already configured).
        //   • true: also clears `hsv_api_key`, `hsv_sync_token`,
        //     `hsv_sync_gist_id`, and the sync timestamp markers, for a
        //     true full-wipe (e.g. handing the device to someone else).
        factoryReset: function(opts) {
            const clearCreds = Boolean(opts && opts.clearCredentials);
            const pid        = (window.APP_CONFIG && window.APP_CONFIG.PROFILE_ID) || 'default';
            const toRemove   = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(`${PREFIX}${pid}_`)) {
                    toRemove.push(k);
                }
            }
            toRemove.forEach(k => localStorage.removeItem(k));
            // v130: 拉取前快照 (键名下划线开头, 不匹配档案前缀) 也是学习
            // 数据 —— 转交设备时属于隐私残留, 重置一并清掉。
            localStorage.removeItem('_' + PREFIX + pid + '_prepull');
            // 课程 (v128) 在 IndexedDB, 不在上面按前缀清除的范围内 ——
            // 全部重置必须一并清掉, 否则重置后课程还在 (给别人用的
            // 设备会残留上一个人的课程内容)。
            _courses = [];
            localStorage.removeItem(`${PREFIX}courses_pushed_hash`);
            cdbReplaceAll([]).catch(e => console.error('[DB] 清空课程库失败:', e));
            if (clearCreds) {
                [
                    `${PREFIX}api_key`,
                    `${PREFIX}sync_token`,
                    `${PREFIX}sync_gist_id`,
                    `${PREFIX}sync_last_pull`,
                    `${PREFIX}sync_last_push`,
                    `${PREFIX}sync_v2_fix_applied`,
                    // v130: 漏网之鱼 —— Gist 戳记与「同步 API key」开关也是
                    // 同步侧状态, 真全清时不该留下
                    `${PREFIX}sync_gist_stamp`,
                    `${PREFIX}sync_api_key`
                ].forEach(k => localStorage.removeItem(k));
            }
        },

        // --- Lemma utilities (exposed for debugging / sweeps) ---

        /**
         * Test whether one word is a plausible English inflection of another.
         * Useful from DevTools to verify match behavior:
         *   window.DB.isInflectionOf('squeezed', 'squeeze')  // true
         */
        isInflectionOf: isInflectionOf,

        /**
         * One-time sweep: find notebook entries where the stored word is
         * an inflection of another stored word, and merge them into the
         * base-form entry. Useful after a botched paste-back to clean
         * up duplicates like [squeezed (incomplete), squeeze (enriched)].
         *
         * Returns { merged, removed } counts. Dry run by default — pass
         * `{apply: true}` to actually modify the notebook.
         */
        dedupByLemma: function(opts) {
            const apply = Boolean(opts && opts.apply);
            const nb    = this.loadNotebook();
            const keep  = nb.slice();
            const actions = [];

            // For each pair (i, j) where keep[i] is an inflection of keep[j],
            // merge i into j. We iterate with a "dropped" set to avoid
            // merging the same entry twice.
            const dropped = new Set();

            for (let i = 0; i < keep.length; i++) {
                if (dropped.has(i)) continue;
                const wi = String(keep[i]?.word || '').trim();
                if (!wi) continue;

                for (let j = 0; j < keep.length; j++) {
                    if (i === j || dropped.has(j)) continue;
                    const wj = String(keep[j]?.word || '').trim();
                    if (!wj) continue;

                    // Is wi an inflection of wj?
                    if (isInflectionOf(wi, wj)) {
                        // Merge i into j: for each field, prefer non-empty value
                        const a = keep[i], b = keep[j];
                        Object.keys(a).forEach(k => {
                            if (k === 'word' || k === 'addedAt') return;
                            if (Array.isArray(b[k]) && b[k].length === 0 && Array.isArray(a[k]) && a[k].length > 0) {
                                b[k] = a[k];
                                return;
                            }
                            if (!b[k] && a[k]) b[k] = a[k];
                        });
                        // Keep earliest addedAt
                        if (a.addedAt && (!b.addedAt || a.addedAt < b.addedAt)) b.addedAt = a.addedAt;
                        actions.push({ drop: wi, keep: wj });
                        dropped.add(i);
                        break;
                    }
                }
            }

            const next = keep.filter((_, i) => !dropped.has(i));
            const result = { merged: actions.length, removed: dropped.size, actions, dryRun: !apply };

            if (apply) {
                this.saveNotebook(next);
            }
            console.log(`[DB] dedupByLemma: ${apply ? 'APPLIED' : 'DRY RUN'} — would merge ${actions.length} entries.`);
            actions.forEach(a => console.log(`  merge "${a.drop}" → "${a.keep}"`));
            return result;
        },

        /**
         * Group notebook entries that are inflected forms of one another
         * (cap / capping / caps, collection / collections, ...). Read-only;
         * powers the "Merge word forms" review tool. Returns an array of
         *   { base, members: [{ word, complete, isBase }] }
         * where `base` is the suggested form to keep (the shortest root the
         * others inflect from, tie-broken toward the more-complete entry) and
         * `members` are ALL forms in the group (base included, flagged via
         * isBase). Only groups with 2+ entries are returned.
         */
        findInflectionGroups: function() {
            const nb    = this.loadNotebook();
            const n     = nb.length;
            const words = nb.map(w => String((w && w.word) || '').trim());

            // Union-Find over indices: two entries join a group when either
            // is a plausible inflection of the other.
            const parent = Array.from({ length: n }, (_, i) => i);
            const find   = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
            const union  = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

            for (let i = 0; i < n; i++) {
                if (!words[i]) continue;
                for (let j = i + 1; j < n; j++) {
                    if (!words[j]) continue;
                    if (isInflectionOf(words[i], words[j]) || isInflectionOf(words[j], words[i])) union(i, j);
                }
            }

            const isComplete = (w) => Boolean(w && (w.meaning || w.enDef) && (w.collo || w.example || w.context));

            const clusters = {};
            for (let i = 0; i < n; i++) {
                if (!words[i]) continue;
                const r = find(i);
                (clusters[r] = clusters[r] || []).push(i);
            }

            const groups = [];
            Object.keys(clusters).forEach(rootKey => {
                const idxs = clusters[rootKey];
                if (idxs.length < 2) return;

                // A "root" is a member that is not an inflection of any OTHER
                // member (i.e. the base form). Prefer the shortest root, then
                // the more-complete entry, then alphabetical for stability.
                const isRoot = (i) => !idxs.some(j => j !== i && isInflectionOf(words[i], words[j]));
                let roots = idxs.filter(isRoot);
                if (roots.length === 0) roots = idxs.slice();
                roots.sort((a, b) => {
                    if (words[a].length !== words[b].length) return words[a].length - words[b].length;
                    const ca = isComplete(nb[a]) ? 0 : 1;
                    const cb = isComplete(nb[b]) ? 0 : 1;
                    if (ca !== cb) return ca - cb;
                    return words[a].localeCompare(words[b]);
                });
                const baseIdx = roots[0];

                const members = idxs
                    .slice()
                    .sort((a, b) => words[a].localeCompare(words[b]))
                    .map(i => ({
                        index    : i,
                        word     : words[i],
                        complete : isComplete(nb[i]),
                        isBase   : i === baseIdx,
                        hint     : String((nb[i] && (nb[i].meaning || nb[i].enDef)) || '').slice(0, 48)
                    }));

                groups.push({ base: words[baseIdx], members });
            });

            // Most-actionable groups first (more forms = more clutter removed).
            groups.sort((a, b) => b.members.length - a.members.length);
            return groups;
        },

        /**
         * Merge groups of notebook entries by INDEX, in one atomic pass.
         * Keying on indices (not word strings) is essential: a group can hold
         * two entries with the identical word (a true duplicate), which a
         * string key cannot tell apart. All operations run against a single
         * snapshot, so indices stay valid; the notebook is saved once.
         *
         *   operations: [{ keepIndex, dropIndices: [..] }, ...]
         *
         * For each op, every drop entry is folded into its keep entry — the
         * keep entry's own non-empty fields win, its blanks are filled from
         * the drops, array fields (focus tags, ...) are unioned, the earliest
         * addedAt is preserved — then the drops are removed.
         * Returns { merged, groups }: entries removed, and groups affected.
         */
        mergeGroups: function(operations) {
            const nb     = this.loadNotebook();
            const remove = new Set();
            let merged = 0, groups = 0;

            (operations || []).forEach(op => {
                const keepIndex = (op && Number.isInteger(op.keepIndex)) ? op.keepIndex : -1;
                const drops     = (op && Array.isArray(op.dropIndices)) ? op.dropIndices : [];
                const keep      = nb[keepIndex];
                if (!keep) return;

                let any = false;
                drops.forEach(di => {
                    if (di === keepIndex || remove.has(di)) return;
                    const w = nb[di];
                    if (!w) return;
                    Object.keys(w).forEach(k => {
                        if (k === 'word' || k === 'addedAt') return;
                        if (Array.isArray(w[k])) {
                            const base = Array.isArray(keep[k]) ? keep[k] : [];
                            const seen = new Set(base);
                            w[k].forEach(v => { if (!seen.has(v)) { base.push(v); seen.add(v); } });
                            keep[k] = base;
                            return;
                        }
                        const empty = keep[k] === undefined || keep[k] === null || keep[k] === '';
                        if (empty && w[k] !== undefined && w[k] !== null && w[k] !== '') keep[k] = w[k];
                    });
                    if (w.addedAt && (!keep.addedAt || w.addedAt < keep.addedAt)) keep.addedAt = w.addedAt;
                    remove.add(di);
                    merged++;
                    any = true;
                });
                if (any) groups++;
            });

            if (remove.size === 0) return { merged: 0, groups: 0 };
            const next = nb.filter((_, i) => !remove.has(i));
            this.saveNotebook(next);
            console.log(`[DB] mergeGroups: removed ${remove.size} entr${remove.size === 1 ? 'y' : 'ies'} across ${groups} group(s).`);
            return { merged, groups };
        }
    };
})();
