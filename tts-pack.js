/**
 * tts-pack.js - VocabPeak pre-generated pronunciation pack
 * ============================================================
 * Downloads a bundled pack of pre-generated word pronunciations and
 * stores it on the device, so playback of covered words needs no API
 * key, no proxy, and no live network.
 *
 * Storage
 *   A dedicated IndexedDB database, 'hsv-tts-pack', kept separate from
 *   the 'hsv-tts' live cache so that cache's size-based eviction can
 *   never delete a downloaded clip. Clips here are permanent until the
 *   word is removed or the pack is cleared.
 *
 * Download path
 *   The pack lives as a GitHub Release asset. Browsers cannot fetch
 *   Release assets directly - the download URL 302-redirects to a CDN
 *   blob that sends no CORS header. So the download is routed through
 *   the same Cloudflare Worker used for neural TTS, which fetches the
 *   asset server-side and adds the CORS header. The Worker URL is the
 *   'tts_proxy_url' preference set in Settings, Voice.
 *
 * Pack format (v148: shards)
 *   The pack is a set of shards plus one index, vocabpeak-audio-pack.
 *   index.json. Each shard is an .empack file: 8-byte magic "EMPACK1\0",
 *   uint32 LE manifest length, JSON manifest, then the clips' MP3 bytes.
 *   download() fetches the index, downloads only shards whose sha256
 *   differs from the copy on this device, verifies each, overwrites its
 *   clips, and once every shard is in sync deletes clips no shard lists
 *   any more (old voices, removed words). A release that has no index
 *   yet falls back to the legacy single-file pack.
 *
 * Public API (window.TTSPack)
 *   download(onStatus)      sync the pack; onStatus(msg) for UI
 *   checkForUpdates(opts)   -> Promise<{todo, bytes}|null>; cheap index
 *                              check; opts.autoMaxBytes downloads small
 *                              updates on its own (used at app start)
 *   getClip(word, voice)    -> Promise<Blob|null>
 *   getCachedVoices(word)   -> Promise<string[]> voices present for a word
 *   playWord(text, preferredVoices, onEnd, rate)
 *                           -> Promise<boolean>; plays a random cached
 *                              voice (restricted to preferredVoices when
 *                              given); false if the word is not in the pack.
 *                              rate (optional, 0.5-2): playbackRate with
 *                              pitch preserved
 *   stop()                  stop any pack clip currently playing
 *   deleteWord(word)         remove every voice's clip for a word
 *   status()                -> Promise<{generation,clipCount,voices,...}|null>
 *   clear()                  wipe the whole pack store
 * ============================================================
 */
window.TTSPack = (function () {
    'use strict';

    // Release asset names proxied through the Worker.
    const INDEX_ASSET    = 'vocabpeak-audio-pack.index.json';   // v148 shards
    const FULL_ASSET     = 'vocabpeak-audio-pack.empack';       // legacy
    const MANIFEST_ASSET = 'vocabpeak-audio-pack.manifest.json';

    const DB_NAME        = 'hsv-tts-pack';   // separate DB, never evicted（origin 隔离 VocabPeak）
    const STORE          = 'clips';
    const META_KEY       = '__meta__';       // meta record key; has no '|'
                                             // so it cannot collide with a
                                             // real 'voice|word' clip key
    const SHARD_PREFIX   = '__shard__:';     // per-shard sync record; no '|'
    const MAGIC          = 'EMPACK1\u0000';  // 8 bytes
    const IMPORT_CHUNK   = 200;              // clips per IndexedDB write tx
    const DELETE_CHUNK   = 1000;             // keys per IndexedDB delete tx
    const CHECK_KEY      = 'hsv_pack_checked_at';   // device-local, not synced
    const CHECK_EVERY_MS = 12 * 3600 * 1000;

    // --- IndexedDB ---------------------------------------------------

    let _dbPromise = null;
    function db() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve, reject) => {
            let req;
            try { req = indexedDB.open(DB_NAME, 1); }
            catch (e) { return reject(e); }
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains(STORE)) {
                    d.createObjectStore(STORE, { keyPath: 'k' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
        return _dbPromise;
    }

    function idbGet(key) {
        return db().then(d => new Promise((resolve) => {
            const rq = d.transaction(STORE, 'readonly')
                        .objectStore(STORE).get(key);
            rq.onsuccess = () => resolve(rq.result || null);
            rq.onerror   = () => resolve(null);
        }));
    }

    function idbAllKeys() {
        return db().then(d => new Promise((resolve) => {
            const rq = d.transaction(STORE, 'readonly')
                        .objectStore(STORE).getAllKeys();
            rq.onsuccess = () => resolve(rq.result || []);
            rq.onerror   = () => resolve([]);
        }));
    }

    function idbPutMany(records) {
        return db().then(d => new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readwrite');
            const os = tx.objectStore(STORE);
            records.forEach(r => os.put(r));
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        }));
    }

    function idbDeleteKeys(keys) {
        return db().then(d => new Promise((resolve) => {
            const tx = d.transaction(STORE, 'readwrite');
            const os = tx.objectStore(STORE);
            keys.forEach(k => os.delete(k));
            tx.oncomplete = () => resolve();
            tx.onerror    = () => resolve();
        }));
    }

    async function idbDeleteMany(keys) {
        for (let i = 0; i < keys.length; i += DELETE_CHUNK) {
            await idbDeleteKeys(keys.slice(i, i + DELETE_CHUNK));
        }
    }

    // --- Key helpers -------------------------------------------------

    // Words/phrases are matched case-insensitively; the pack stores them
    // lowercased. Internal whitespace is collapsed too, matching the
    // generator's normalisation (\" \".join(text.split())), so a key built
    // from a multi-word collocation or a sentence resolves the same on
    // both sides regardless of stray double spaces.
    function norm(word)            { return String(word || '').trim().toLowerCase().replace(/\s+/g, ' '); }
    function clipKey(word, voice)  { return voice + '|' + norm(word); }

    // --- Pack parsing ------------------------------------------------

    // Parse a .empack ArrayBuffer into a manifest and an array of clips,
    // each { word, voice, blob }. Throws on a bad magic header.
    function parsePack(buf) {
        const bytes = new Uint8Array(buf);
        const magic = new TextDecoder().decode(bytes.subarray(0, 8));
        if (magic !== MAGIC) throw new Error('not an EMPACK1 file');

        const dv       = new DataView(buf);
        const mLen     = dv.getUint32(8, true);
        const manifest = JSON.parse(
            new TextDecoder().decode(bytes.subarray(12, 12 + mLen)));
        const dataStart = 12 + mLen;

        const clips = (manifest.clips || []).map(c => ({
            word : norm(c.word),
            voice: c.voice,
            blob : new Blob(
                [buf.slice(dataStart + c.offset,
                           dataStart + c.offset + c.length)],
                { type: 'audio/mpeg' }),
        }));
        return { manifest: manifest, clips: clips };
    }

    // --- Worker URL --------------------------------------------------

    function workerBase() {
        const u = (window.DB && window.DB.getPref
                   ? window.DB.getPref('tts_proxy_url', '') : '') || '';
        return u.trim().replace(/\/+$/, '');   // strip any trailing slash
    }

    // 语音包密钥 (设置 → 语音): 分享者启用密钥门后由其发放; 留空
    // 表示 Worker 未设防或本机就是所有者部署。
    function packKey() {
        const k = (window.DB && window.DB.getPref
                   ? window.DB.getPref('pack_key', '') : '') || '';
        return k.trim();
    }

    function assetUrl(base, asset) {
        const key = packKey();
        return base + '?asset=' + encodeURIComponent(asset)
             + (key ? '&key=' + encodeURIComponent(key) : '');
    }

    // --- Download with progress -------------------------------------

    async function fetchWithProgress(url, onProgress) {
        const resp = await fetch(url);
        if (!resp.ok) {
            let detail = '';
            try { detail = (await resp.text()).slice(0, 200); } catch (e) { /* ignore */ }
            throw new Error('HTTP ' + resp.status + (detail ? ' \u2014 ' + detail : ''));
        }

        const total = Number(resp.headers.get('Content-Length')) || 0;
        if (!resp.body || !resp.body.getReader) {
            return new Uint8Array(await resp.arrayBuffer());
        }

        const reader = resp.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const step = await reader.read();
            if (step.done) break;
            chunks.push(step.value);
            received += step.value.length;
            if (onProgress) onProgress(received, total);
        }

        const out = new Uint8Array(received);
        let offset = 0;
        for (const c of chunks) { out.set(c, offset); offset += c.length; }
        return out;
    }

    async function sha256Hex(bytes) {
        try {
            if (!(window.crypto && crypto.subtle && crypto.subtle.digest)) return '';
            const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
            return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) { return ''; }      // no WebCrypto (plain http): skip the check
    }

    function mb(bytes) { return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + ' MB'; }

    // --- v148: sharded pack -----------------------------------------

    // Fetch the index. Resolves the index object, null when the release
    // has no index yet (legacy pack), and throws on other failures.
    async function fetchIndex(base) {
        const resp = await fetch(assetUrl(base, INDEX_ASSET) + '&t=' + Date.now(),
                                 { cache: 'no-store' });
        if (resp.status === 404) return null;
        if (!resp.ok) {
            let detail = '';
            try { detail = (await resp.text()).slice(0, 160); } catch (e) { /* ignore */ }
            throw new Error('HTTP ' + resp.status + (detail ? ' \u2014 ' + detail : ''));
        }
        const idx = await resp.json();
        if (!idx || !Array.isArray(idx.shards)) throw new Error('bad pack index');
        return idx;
    }

    function shardRecords(index) {
        return Promise.all(index.shards.map(sh => idbGet(SHARD_PREFIX + sh.id)));
    }

    // Shards whose device copy differs from the index.
    async function pendingShards(index) {
        const recs = await shardRecords(index);
        return index.shards.filter((sh, i) => !recs[i] || recs[i].sha256 !== sh.sha256);
    }

    // v148: 同一时刻只跑一个同步 —— 启动时的自动更新与手动点下载、或两个
    // 标签页同时同步, 若中间恰好发布了新包, 持旧索引的一方可能在另一方
    // 写好分片记录前把新片段剪掉。同页用 Promise 串行, 跨页用 Web Locks。
    let _syncChain = Promise.resolve();
    function serialized(fn) {
        const run = () => (navigator.locks && navigator.locks.request)
            ? navigator.locks.request('hsv-tts-pack-sync', fn)
            : fn();
        const p = _syncChain.then(run, run);
        _syncChain = p.catch(() => {});
        return p;
    }

    // 剪枝保险: 已是分片包的设备, 一次同步最多删掉 20% 的片段。超过说明
    // 发布侧出了问题 (比如有人提交了一份残缺的单词表), 宁可多占点空间
    // 也不把付费合成的音频从孩子平板上抹掉; 旧整包迁移不受此限。
    const PRUNE_MAX_FRACTION = 0.2;
    let   PRUNE_MIN          = 200;      // 小包 (测试) 下的绝对下限; _setPruneMin 可调

    async function syncShards(base, index, say) {
        if (!index.shards.length) throw new Error('pack index lists no shards');
        const prevMeta = await idbGet(META_KEY);
        const todo  = await pendingShards(index);
        const bytes = todo.reduce((n, sh) => n + (sh.size || 0), 0);
        let imported = 0;
        const failed = [];
        if (todo.length) {
            say('需要更新 ' + todo.length + '/' + index.shards.length + ' 个分片 (' + mb(bytes) + ')\u2026');
        }
        for (let i = 0; i < todo.length; i++) {
            const sh  = todo[i];
            const tag = (i + 1) + '/' + todo.length + ' ' + sh.id;
            try {
                // &h= 让浏览器缓存按内容区分: 同名分片重新发布后不会读到旧副本
                const raw = await fetchWithProgress(
                    assetUrl(base, sh.file) + '&h=' + String(sh.sha256 || '').slice(0, 12),
                    (recv, total) => say('下载 ' + tag + ' \u2026 '
                        + (total ? Math.floor(recv / total * 100) + '%' : mb(recv))));
                const got = await sha256Hex(raw);
                if (got && sh.sha256 && got !== sh.sha256) {
                    // 多半是发布进行中: 这次跳过, 下次再同步
                    failed.push(sh.id);
                    console.warn('[pack] shard ' + sh.id + ' sha256 mismatch; skipped');
                    continue;
                }
                say('写入 ' + tag + '\u2026');
                const parsed = parsePack(raw.buffer);
                const recs   = parsed.clips.map(c => ({ k: clipKey(c.word, c.voice), blob: c.blob }));
                for (let j = 0; j < recs.length; j += IMPORT_CHUNK) {
                    await idbPutMany(recs.slice(j, j + IMPORT_CHUNK));
                }
                // 分片记录最后写: 中途断电或关页, 下次会整片重来
                await idbPutMany([{ k: SHARD_PREFIX + sh.id, id: sh.id, sha256: sh.sha256,
                                    gen: sh.gen, keys: recs.map(r => r.k) }]);
                imported += recs.length;
            } catch (e) {
                failed.push(sh.id);
                console.warn('[pack] shard ' + sh.id + ' failed:', e && e.message);
            }
        }

        // 全部分片对齐后才清理: 删掉任何分片都不再列出的片段 (旧音色、
        // 已删的词) 和已下线的分片记录。有分片没对齐时不动, 免得误删。
        let pruned = 0;
        let held   = 0;
        if (!failed.length) {
            const live = new Set();
            const ids  = new Set(index.shards.map(sh => SHARD_PREFIX + sh.id));
            (await shardRecords(index)).forEach(r => (r && r.keys || []).forEach(k => live.add(k)));
            const keys  = await idbAllKeys();
            const drop  = keys.filter(k =>
                k !== META_KEY && (String(k).indexOf('|') > 0 ? !live.has(k)
                                   : String(k).indexOf(SHARD_PREFIX) === 0 && !ids.has(k)));
            const clipN = keys.filter(k => String(k).indexOf('|') > 0).length;
            const dropN = drop.filter(k => String(k).indexOf('|') > 0).length;
            const wasSharded = !!(prevMeta && prevMeta.format === 2);
            if (wasSharded && dropN > Math.max(PRUNE_MIN, clipN * PRUNE_MAX_FRACTION)) {
                console.warn('[pack] prune held: would delete ' + dropN + ' of ' + clipN
                             + ' clip(s); keeping them (publish-side problem?)');
                held = dropN;
            } else if (drop.length) {
                say('清理 ' + drop.length + ' 个过期片段\u2026');
                await idbDeleteMany(drop);
                pruned = drop.filter(k => String(k).indexOf('|') > 0).length;
            }
        }

        await idbPutMany([{
            k         : META_KEY,
            format    : 2,
            generation: index.generation,
            voices    : index.voices || [],
            clipCount : index.clipCount,
            size      : index.size,
            partial   : failed.length > 0,
            pruneHeld : held,
            importedAt: Date.now(),
        }]);
        try { localStorage.setItem(CHECK_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        return { todo: todo.length, bytes, imported, pruned, held, failed };
    }

    // --- Public: download -------------------------------------------

    async function download(onStatus) {
        const say  = (m) => { if (typeof onStatus === 'function') onStatus(m); };
        const base = workerBase();
        if (!base) {
            throw new Error('Set your Cloudflare Worker URL first - it is '
                          + 'the TTS proxy URL in the Neural voice section.');
        }

        say('检查更新\u2026');
        const index = await fetchIndex(base);
        if (!index) {
            // v148: 已经是分片包的设备绝不回退旧整包 —— 发布时索引会短暂
            // 404 (--clobber 先删后传), 这时去下 1.6 GB 旧整包会撑爆平板内存,
            // 还会把剪掉的旧音色灌回来。
            const meta = await idbGet(META_KEY);
            if (meta && meta.format === 2) {
                throw new Error('\u53D1\u97F3\u5305\u7D22\u5F15\u6682\u65F6\u53D6\u4E0D\u5230\uFF08\u53EF\u80FD\u6B63\u5728\u53D1\u5E03\uFF09\uFF0C\u8FC7\u51E0\u5206\u949F\u518D\u8BD5\u3002');
            }
            return downloadLegacy(say, base);
        }
        {
            const r = await serialized(() => syncShards(base, index, say));
            const total = index.clipCount + ' 个片段, ' + mb(index.size || 0)
                        + ', ' + (index.voices || []).length + ' 个音色';
            if (r.failed.length) {
                say('部分完成: ' + r.failed.length + ' 个分片没下好 (' + r.failed.join(', ')
                    + '), 稍后再点一次。');
            } else if (!r.todo && !r.pruned) {
                say('已是最新 \u2014 第 ' + index.generation + ' 代, ' + total + '。');
            } else {
                say('完成 \u2014 第 ' + index.generation + ' 代, ' + total
                    + (r.pruned ? ', 清理 ' + r.pruned + ' 个过期片段' : '') + '。');
            }
            return { generation: index.generation, clipCount: index.clipCount,
                     imported: r.imported, shardsUpdated: r.todo - r.failed.length,
                     shardsTotal: index.shards.length, pruned: r.pruned, held: r.held,
                     failed: r.failed };
        }
    }

    // At most every 12 h, look at the index; download on our own when the
    // update is small (new AI passages, a few words), otherwise just report.
    async function checkForUpdates(opts) {
        opts = opts || {};
        const base = workerBase();
        const meta = await idbGet(META_KEY);
        if (!base || !meta) return null;                 // nothing installed
        if (!opts.force) {
            let last = 0;
            try { last = Number(localStorage.getItem(CHECK_KEY)) || 0; } catch (e) { /* ignore */ }
            if (Date.now() - last < CHECK_EVERY_MS) return null;
        }
        try { localStorage.setItem(CHECK_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        const index = await fetchIndex(base);
        if (!index) return null;
        const todo  = await pendingShards(index);
        const bytes = todo.reduce((n, sh) => n + (sh.size || 0), 0);
        if (todo.length && opts.autoMaxBytes && bytes <= opts.autoMaxBytes) {
            const r = await serialized(() => syncShards(base, index, opts.onStatus || (() => {})));
            return { todo: todo.length, bytes, synced: !r.failed.length };
        }
        return { todo: todo.length, bytes, synced: false };
    }

    // --- Legacy single-file pack (releases without an index) ---------

    async function downloadLegacy(say, base) {

        // 1. Manifest check - skip the large download if already current.
        try {
            say('Checking for updates\u2026');
            // v130: manifest 必须绕开 HTTP 缓存 —— Worker/CDN 层的 max-age
            // 会让「检查更新」拿到旧 manifest, 新包刚发布时误报「已最新」
            // (EMPro 踩过的同一个坑: manifest/JSON 端点必须不可缓存)。
            // no-store 跳过浏览器缓存, 时间戳参数再兜一层中间缓存。
            const mResp = await fetch(
                assetUrl(base, MANIFEST_ASSET) + '&t=' + Date.now(),
                { cache: 'no-store' });
            if (mResp.ok) {
                const remote = await mResp.json();
                const meta   = await idbGet(META_KEY);
                if (meta && meta.generation === remote.generation) {
                    say('Already up to date \u2014 generation '
                        + remote.generation + ', '
                        + meta.clipCount + ' clip(s).');
                    return { upToDate: true, generation: remote.generation };
                }
            }
        } catch (e) {
            // The manifest is only an optimisation; on any failure just
            // fall through and download the full pack.
            console.warn('[pack] manifest check skipped:', e && e.message);
        }

        // 2. Download the full pack.
        say('Downloading\u2026');
        const raw = await fetchWithProgress(
            assetUrl(base, FULL_ASSET),
            (recv, total) => {
                say(total
                    ? 'Downloading\u2026 ' + Math.floor(recv / total * 100) + '%'
                    : 'Downloading\u2026 ' + (recv / 1048576).toFixed(1) + ' MB');
            });

        // 3. Parse.
        say('Unpacking\u2026');
        const parsed   = parsePack(raw.buffer);
        const manifest = parsed.manifest;

        // 4. Import - store only clips not already present, so a repeat
        //    download after a small change costs almost no work.
        const existing = new Set(await idbAllKeys());
        const fresh = parsed.clips
            .filter(c => !existing.has(clipKey(c.word, c.voice)))
            .map(c => ({ k: clipKey(c.word, c.voice), blob: c.blob }));
        if (fresh.length) {
            say('Saving ' + fresh.length + ' clip(s)\u2026');
            for (let i = 0; i < fresh.length; i += IMPORT_CHUNK) {
                await idbPutMany(fresh.slice(i, i + IMPORT_CHUNK));
            }
        }

        // 5. Record the meta row.
        await idbPutMany([{
            k         : META_KEY,
            generation: manifest.generation,
            voices    : manifest.voices || [],
            clipCount : manifest.clipCount || parsed.clips.length,
            importedAt: Date.now(),
        }]);

        say('Done \u2014 generation ' + manifest.generation + ', '
            + (manifest.clipCount || parsed.clips.length) + ' clip(s), '
            + (manifest.voices || []).length + ' voice(s).');
        return {
            generation: manifest.generation,
            clipCount : manifest.clipCount || parsed.clips.length,
            imported  : fresh.length,
        };
    }

    // --- Public: lookups --------------------------------------------

    async function getClip(word, voice) {
        const rec = await idbGet(clipKey(word, voice));
        return rec ? rec.blob : null;
    }

    // Which of the pack's voices have a clip for this word.
    async function getCachedVoices(word) {
        const meta = await idbGet(META_KEY);
        if (!meta || !meta.voices) return [];
        const w     = norm(word);
        const found = [];
        for (const v of meta.voices) {
            const rec = await idbGet(v + '|' + w);
            if (rec) found.push(v);
        }
        return found;
    }

    // Compare a word list against the installed pack. A word counts as
    // covered if at least one voice has a clip for it. Returns counts
    // plus the list of words that have no audio yet.
    async function coverage(words) {
        const keys = await idbAllKeys();
        const have = new Set();
        for (const k of keys) {
            if (k === META_KEY) continue;
            const bar = k.indexOf('|');
            if (bar > 0) have.add(k.slice(bar + 1));
        }
        const seen    = new Set();
        const missing = [];
        for (const w of (words || [])) {
            const n = norm(w);
            if (!n || seen.has(n)) continue;
            seen.add(n);
            if (!have.has(n)) missing.push(n);
        }
        return {
            total       : seen.size,
            covered     : seen.size - missing.length,
            missing     : missing.length,
            missingWords: missing,
        };
    }

    // --- Public: playback -------------------------------------------

    let _audio = null;
    // v144: 当前片段的结束回调 —— stop() 摘掉 onended 后必须由它放行
    // 调用方, 否则 await 这次播放的链条 (课文朗读) 永久挂起。与
    // app.js 的 speakNative 同一契约: onEnd 恰好调用一次。
    let _audioFinish = null;

    function stop() {
        try {
            if (_audio) {
                _audio.pause();
                _audio.onended = null;
                _audio.onerror = null;
                if (_audio.src) URL.revokeObjectURL(_audio.src);
                _audio = null;
            }
        } catch (e) { /* ignore */ }
        // 放行等待中的调用方 (置空在前, 防重入)
        const f = _audioFinish;
        _audioFinish = null;
        if (typeof f === 'function') { try { f(); } catch (e) { /* ignore */ } }
    }

    // ─── 会话音色锁定 (v143) ─────────────────────────────────
    // 课文连续朗读时, 逐句随机换音色会让听感支离破碎 (一段话里换了
    // 三个人读)。播放会话开始时锁定一个音色, 整场保持同一个"朗读者";
    // 下一次播放重新随机, "重听换个声音"的好处保留。
    // 单词卡的逐词随机不受影响 —— 那里换声音是刻意设计。
    let _sessionVoice = null;
    // v146: 每段换人 —— 音色池多于一个时, 避开上一段刚用过的那个,
    // 否则随机很容易连着两段同一个人, 听上去像没换。跨播放也记着,
    // 所以重听同一段大概率也是新声音。
    let _prevSessionVoice = null;
    function beginVoiceSession(preferredVoices) {
        const pool = (Array.isArray(preferredVoices) && preferredVoices.length)
            ? preferredVoices.map(v => String(v).toLowerCase())
            : [];
        if (!pool.length) { _sessionVoice = null; return null; }
        let choices = pool;
        if (pool.length > 1 && _prevSessionVoice) {
            const alt = pool.filter(v => v !== _prevSessionVoice);
            if (alt.length) choices = alt;
        }
        _sessionVoice     = choices[Math.floor(Math.random() * choices.length)];
        _prevSessionVoice = _sessionVoice;
        console.log('[pack] voice session: ' + _sessionVoice);
        return _sessionVoice;
    }
    // 只清当前锁定; _prevSessionVoice 故意保留, 让下一段/下一次继续换人
    function endVoiceSession() { _sessionVoice = null; }

    // Play one word from the pack. preferredVoices, when given, restricts
    // the random pick to the user's chosen voices; if none of those are
    // cached for this word, any cached voice is used so offline audio is
    // never wasted. A voice is picked at random each call, so the same
    // word sounds different on repeat at no network cost. Pack clips are
    // pre-rendered at a model learner pace and play at natural speed.
    // Resolves true if it played, false if the word is not in the pack
    // (the caller then falls back to the live or device voice).
    async function playWord(text, preferredVoices, onEnd, rate) {
        const cached = await getCachedVoices(text);
        if (!cached.length) {
            const meta = await idbGet(META_KEY);
            console.log('[pack] MISS ' + JSON.stringify(norm(text)) + ' \u2014 '
                + (meta ? ('pack has ' + meta.clipCount
                           + ' clip(s) but not this word')
                        : 'no pack installed') + '; falling back');
            return false;
        }

        let pool = cached;
        if (Array.isArray(preferredVoices) && preferredVoices.length) {
            const want     = new Set(preferredVoices.map(v => String(v).toLowerCase()));
            const narrowed = cached.filter(v => want.has(v));
            if (narrowed.length) pool = narrowed;
        }
        // v143: 会话锁定的音色优先 —— 该句没有这个音色的片段时才退回
        // 随机挑 (只影响这一句, 锁不变, 下一句有就继续用锁定的)。
        const voice = (_sessionVoice && pool.indexOf(_sessionVoice) >= 0)
            ? _sessionVoice
            : pool[Math.floor(Math.random() * pool.length)];
        const blob  = await getClip(text, voice);
        if (!blob) {
            console.log('[pack] MISS ' + JSON.stringify(norm(text))
                + ' \u2014 clip blob missing for voice ' + voice);
            return false;
        }
        console.log('[pack] HIT ' + JSON.stringify(norm(text)) + ' \u2014 voice '
            + voice + ' (cached: ' + cached.join(',') + ')');

        stop();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        // 变速不变调: clip 按自然语速生成, 慢速跟读用客户端变速实现,
        // 不生成慢速版包 (省包体、省合成费、速度连续可调)。
        const r = Number(rate);
        if (r && r > 0 && r !== 1) {
            try {
                audio.preservesPitch       = true;
                audio.webkitPreservesPitch = true;   // 旧版 Chrome/WebKit
                audio.playbackRate         = Math.min(2, Math.max(0.5, r));
            } catch (e) { /* ignore */ }
        }
        _audio = audio;

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            if (_audioFinish === finish) _audioFinish = null;
            if (_audio === audio) _audio = null;
            try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            if (typeof onEnd === 'function') onEnd();
        };
        _audioFinish = finish;          // v144: 交给 stop() 兜底放行
        audio.onended = finish;
        audio.onerror = finish;
        try { await audio.play(); }
        catch (e) {
            console.log('[pack] audio.play() rejected: ' + (e && e.message));
            finish();
        }
        return true;
    }

    // --- Public: maintenance ----------------------------------------

    // Remove every voice's clip for a word. Called when a vocabulary
    // word is deleted, so orphaned pack audio does not accumulate.
    async function deleteWord(word) {
        const meta   = await idbGet(META_KEY);
        // v148: 分片包的片段由发布侧管理 —— 词从单词表导出里消失后, 下一次
        // 同步自然剪掉; 这里删了反而回不来 (分片没变就不会重新导入), 而且
        // 同一段文本可能还被课文或短文用着。
        if (meta && meta.format === 2) return;
        const voices = (meta && meta.voices) || [];
        const w      = norm(word);
        const keys   = voices.map(v => v + '|' + w);
        if (keys.length) await idbDeleteKeys(keys);
    }

    async function status() {
        const meta = await idbGet(META_KEY);
        if (!meta) return null;
        return {
            generation: meta.generation,
            clipCount : meta.clipCount,
            voices    : meta.voices || [],
            importedAt: meta.importedAt,
            format    : meta.format || 1,
            size      : meta.size || 0,
            partial   : !!meta.partial,
            pruneHeld : meta.pruneHeld || 0,
        };
    }

    async function clear() {
        const d = await db();
        await new Promise((resolve) => {
            const tx = d.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).clear();
            tx.oncomplete = resolve;
            tx.onerror    = resolve;
        });
    }

    return {
        download       : download,
        checkForUpdates: checkForUpdates,      // v148: 分片增量检查
        _setPruneMin   : function (n) { PRUNE_MIN = Number(n) || 0; },   // 供测试
        getClip        : getClip,
        getCachedVoices: getCachedVoices,
        coverage       : coverage,
        playWord       : playWord,
        beginVoiceSession: beginVoiceSession,   // v143: 锁定会话音色
        endVoiceSession  : endVoiceSession,
        stop           : stop,
        deleteWord     : deleteWord,
        status         : status,
        clear          : clear,
    };
})();
