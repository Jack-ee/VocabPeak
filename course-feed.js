/**
 * course-feed.js — VocabPeak 课程订阅 (课程分发第二阶段, v131)
 * ============================================================
 * 让课程像语音包一样走「发布源 + manifest 增量」分发, 分享对象打开
 * 应用即自动收到全部课程与后续更新, 彻底不占 Gist; 孩子的设备同时
 * 保有 Gist 通道, 两路按 id + _v 幂等合并, 谁先到都一样。
 *
 * 发布侧 (A 通道, 当前)
 *   tools/make-course-release.js 从备份提取出厂态课程, 生成
 *   courses/courses-manifest.json + 每课一个 <id>.json, 提交到仓库
 *   由 GitHub Pages 直接服务 (同源相对路径 "courses", 零配置)。
 *
 * B 通道 (私有化, 将来切换零客户端改动)
 *   课程发到私有仓库 Release + Worker 配 GH_TOKEN (音频包同一机制),
 *   订阅源填 Worker URL 即可 —— 本模块检测到 Worker 形态的源时自动
 *   改用 ?asset=<名>&key=<密钥> 的请求形态 (密钥存 pref
 *   course_feed_key)。manifest 格式两通道完全一致。
 *
 * 增量与安全
 *   • 只下载 manifest 里 _v 比本机新 (或本机没有) 的课, 逐文件
 *     sha256 校验, 不符即弃 (防中间缓存损坏/截断)。
 *   • 合并走 DB.mergeUserLessons: 只增不删、同 id 取 _v 新的一侧,
 *     本机更新过的课绝不会被订阅源的旧版覆盖。
 *   • manifest 与课程文件一律 no-store + 时间戳 (既定原则:
 *     manifest/JSON 端点必须不可缓存)。
 *   • 课程缓存未就绪 (initCourses 未完成) 时拒绝合并, 与 sync.js
 *     的守卫同一原则。
 *
 * Prefs (均随快照同步, 孩子多台设备一次配置)
 *   course_feed_url   订阅源。留空 = 同源 "courses" 目录 (默认)。
 *   course_feed_auto  '1'(默认) 启动时自动检查; '0' 关闭。
 *   course_feed_key   B 通道分发密钥, A 通道留空。
 *
 * Public API (window.CourseFeed)
 *   init()          boot 时调用; 按开关安排一次延时自动检查
 *   check(manual)   立即检查并增量拉取; manual=true 时出 toast
 *   lastResult()    最近一次检查结果 (设置页状态行用)
 * ============================================================
 */
window.CourseFeed = (function () {
    'use strict';

    const MANIFEST     = 'courses-manifest.json';
    const DEFAULT_BASE = 'courses';   // 同源相对目录 (GitHub Pages)
    const AUTO_DELAY   = 4000;        // boot 后错峰: 让首次 sync 拉取先落地

    let _checking = false;
    let _last     = null;             // { time, added, updated, failed, error }

    // ─── Prefs ───────────────────────────────────────────────
    function pref(name, fb) {
        const v = window.DB && window.DB.getPref
            ? window.DB.getPref(name, fb) : fb;
        return v == null ? fb : v;
    }
    function autoEnabled() { return pref('course_feed_auto', '1') !== '0'; }

    // ─── URL 构造 (A/B 双通道) ───────────────────────────────
    // A 通道: 目录源 —— <base>/<文件名>
    // B 通道: Worker 源 —— <base>?asset=<文件名>&key=<密钥>
    // Worker 形态判定: URL 含 workers.dev, 或本身已带 ? (自定义域名
    // 部署 Worker 时可在源 URL 末尾带 "?" 显式声明)。
    function isWorkerBase(base) {
        return /workers\.dev/i.test(base) || base.indexOf('?') >= 0;
    }
    function assetUrl(name) {
        const base = (pref('course_feed_url', '') || '').trim().replace(/\/+$/, '')
                  || DEFAULT_BASE;
        if (isWorkerBase(base)) {
            const key = (pref('course_feed_key', '') || '').trim();
            const sep = base.indexOf('?') >= 0 && !/\?$/.test(base) ? '&' : (/\?$/.test(base) ? '' : '?');
            return base + sep + 'asset=' + encodeURIComponent(name)
                 + (key ? '&key=' + encodeURIComponent(key) : '');
        }
        return base + '/' + name;
    }
    // manifest/课程文件一律绕开一切缓存: no-store + 时间戳
    function bust(url) {
        return url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
    }

    // ─── sha256 (十六进制) ───────────────────────────────────
    async function sha256hex(text) {
        const buf = await crypto.subtle.digest('SHA-256',
            new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // ─── 加密课程解密 (v140, 版权防护) ───────────────────────
    // 发布工具用 AES-256-GCM 加密后, 仓库里只有密文 blob (fork 者拿
    // 不到可读语料); 订阅端凭口令 (pref course_feed_pass, 随快照同步
    // 到孩子各设备) 解密。与发布侧的约定: 密钥 = PBKDF2(口令, salt,
    // 10 万轮, SHA-256), salt 由 manifest._encSalt 携带; 信封
    // {enc:1, iv, ct} 中 ct = 密文||tag (WebCrypto 解密所需连体格式)。
    function _b64bytes(s) {
        return Uint8Array.from(atob(s), c => c.charCodeAt(0));
    }
    async function deriveKey(pass, saltB64) {
        const km = await crypto.subtle.importKey('raw',
            new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: _b64bytes(saltB64),
              iterations: 100000, hash: 'SHA-256' },
            km, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    }
    async function decryptEnvelope(env, cryptoKey) {
        const pt = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: _b64bytes(env.iv) },
            cryptoKey, _b64bytes(env.ct));
        return JSON.parse(new TextDecoder().decode(pt));
    }

    // ─── 状态行 (设置页存在时更新) ───────────────────────────
    function setStatus(msg) {
        try {
            const el = document.getElementById('feed-status');
            if (el) el.textContent = msg || '';
        } catch (e) {}
    }
    function toast(msg) { try { window.App?.showToast?.(msg); } catch (e) {} }

    // ─── 主流程 ──────────────────────────────────────────────
    async function check(manual) {
        if (_checking) return _last;
        // 与 sync.js 同一守卫: initCourses 灌满缓存前绝不合并 ——
        // 空缓存上合并会把「订阅源集合」当全量整表写回 IndexedDB。
        if (!window.DB || !window.DB.coursesReady || !window.DB.coursesReady()) {
            if (manual) toast('\u8BFE\u7A0B\u5E93\u8FD8\u5728\u521D\u59CB\u5316\uFF0C\u7A0D\u540E\u518D\u8BD5');
            return null;
        }
        _checking = true;
        if (manual) setStatus('\u68C0\u67E5\u4E2D\u2026');
        try {
            // 1. manifest
            const mResp = await fetch(bust(assetUrl(MANIFEST)), { cache: 'no-store' });
            if (!mResp.ok) {
                const msg = mResp.status === 404
                    ? '\u8BA2\u9605\u6E90\u8FD8\u6CA1\u6709\u8BFE\u7A0B\u6E05\u5355 (404)'
                    : '\u8BA2\u9605\u6E90\u8BFB\u53D6\u5931\u8D25 (HTTP ' + mResp.status + ')';
                if (manual) { toast(msg); setStatus(msg); }
                else console.log('[Feed] manifest unavailable:', mResp.status);
                _last = { time: Date.now(), error: msg };
                return _last;
            }
            const manifest = await mResp.json();
            const list = (manifest && Array.isArray(manifest.courses))
                ? manifest.courses : null;
            if (!list) {
                if (manual) toast('\u6E05\u5355\u683C\u5F0F\u4E0D\u5BF9');
                _last = { time: Date.now(), error: 'bad manifest' };
                return _last;
            }

            // v140: 加密清单 —— 没配口令就到此为止, 给出明确指引;
            // 口令随快照同步, 孩子的设备一次配置全家生效。
            let cryptoKey = null;
            if (manifest._enc) {
                const pass = (pref('course_feed_pass', '') || '').trim();
                if (!pass) {
                    const msg = '\u8BFE\u7A0B\u5DF2\u52A0\u5BC6\uFF0C\u8BF7\u5728\u8BBE\u7F6E \u2192 \u8BFE\u7A0B\u8BA2\u9605 \u586B\u5BC6\u7801';
                    if (manual) toast(msg);
                    setStatus(msg);
                    _last = { time: Date.now(), error: 'need pass' };
                    return _last;
                }
                try { cryptoKey = await deriveKey(pass, manifest._encSalt || ''); }
                catch (e) {
                    if (manual) toast('\u5BC6\u7801\u5904\u7406\u5931\u8D25');
                    _last = { time: Date.now(), error: 'key derive failed' };
                    return _last;
                }
            }

            // 2. 与本机比对: 只取「本机没有」或「_v 更新」的课
            const local = {};
            (window.DB.loadUserLessons() || []).forEach(l => {
                if (l && l.id) local[l.id] = l._v || 0;
            });
            const wanted = list.filter(c => c && c.id && c.file &&
                (!(c.id in local) || (c._v || 0) > local[c.id]));

            if (!wanted.length) {
                const msg = '\u5DF2\u662F\u6700\u65B0 (' + list.length + ' \u95E8\u8BFE)';
                if (manual) { toast(msg); }
                setStatus(msg);
                _last = { time: Date.now(), added: 0, updated: 0, failed: 0,
                          total: list.length };
                return _last;
            }
            console.log('[Feed] ' + wanted.length + ' course(s) to fetch of ' +
                        list.length);

            // 3. 逐课下载 + sha256 校验
            const batch = [];
            let added = 0, updated = 0, failed = 0;
            for (const c of wanted) {
                if (manual) setStatus('\u4E0B\u8F7D\u4E2D\u2026 ' +
                    (batch.length + failed + 1) + '/' + wanted.length);
                try {
                    const r = await fetch(bust(assetUrl(c.file)), { cache: 'no-store' });
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    const text = await r.text();
                    if (c.sha256) {
                        const h = await sha256hex(text);
                        if (h !== c.sha256) throw new Error('sha256 mismatch');
                    }
                    // v140: sha 校验的是落盘文件本身 (密文即校验密文);
                    // 信封带 enc 标记则解密, 明文课照旧 —— 混合清单可用,
                    // 口令不对时 AES-GCM 认证失败会抛错, 计入失败数。
                    let obj = JSON.parse(text);
                    if (obj && obj.enc) {
                        if (!cryptoKey) throw new Error('encrypted, no key');
                        obj = await decryptEnvelope(obj, cryptoKey);
                    }
                    if (!obj || obj.id !== c.id) throw new Error('id mismatch');
                    if (obj._v == null) obj._v = c._v || 0;
                    batch.push(obj);
                    if (c.id in local) updated++; else added++;
                } catch (e) {
                    failed++;
                    console.warn('[Feed] skip ' + c.id + ':', e.message || e);
                }
            }

            // 4. 合并 (只增不删, 同 id 取 _v 新的一侧) + 通知
            let changed = false;
            if (batch.length) {
                changed = !!window.DB.mergeUserLessons(batch);
                if (changed) {
                    try {
                        window.dispatchEvent(new CustomEvent('hsv:datachanged',
                            { detail: { courses: true, source: 'course-feed' } }));
                    } catch (e) {}
                    // 孩子设备: 让新课随快照推上 Gist, 其他设备两路都能到
                    try { window.SyncManager?.triggerSave?.(); } catch (e) {}
                }
            }

            const msg = changed
                ? ('\u8BFE\u7A0B\u5DF2\u66F4\u65B0: \u65B0\u589E ' + added +
                   ' \u00b7 \u66F4\u65B0 ' + updated +
                   (failed ? ' \u00b7 \u5931\u8D25 ' + failed : ''))
                : (failed
                    ? (manifest._enc && !batch.length
                        ? '\u4E0B\u8F7D\u5931\u8D25 ' + failed + ' \u95E8 \u2014 \u5BC6\u7801\u662F\u5426\u6B63\u786E\uFF1F'
                        : '\u4E0B\u8F7D\u5931\u8D25 ' + failed + ' \u95E8')
                    : '\u5DF2\u662F\u6700\u65B0');
            console.log('[Feed] ' + msg);
            if (manual || changed) toast(msg);
            setStatus(msg);
            _last = { time: Date.now(), added, updated, failed, total: list.length };
            return _last;
        } catch (e) {
            // 离线/网络抖动: 自动检查静默跳过, 手动检查给出提示
            console.log('[Feed] check failed:', e.message || e);
            if (manual) { toast('\u68C0\u67E5\u5931\u8D25 \u2014 \u7F51\u7EDC\u4E0D\u53EF\u7528\uFF1F'); setStatus(''); }
            _last = { time: Date.now(), error: e.message || String(e) };
            return _last;
        } finally {
            _checking = false;
        }
    }

    // boot 时调用: 按开关安排一次延时自动检查 (错峰在首次同步之后)。
    // 平板离线启动时 fetch 会失败并静默跳过, 联网后的下次启动补上。
    function init() {
        if (!autoEnabled()) return;
        setTimeout(() => { check(false); }, AUTO_DELAY);
    }

    return {
        init       : init,
        check      : check,
        lastResult : function () { return _last; },
        _assetUrl  : assetUrl     // 供测试/调试: A/B 通道 URL 构造
    };
})();
