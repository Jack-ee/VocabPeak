// sw.js — VocabPeak Service Worker

// hsv-v14 (?v=111) — 课文精读: 键盘快捷键 + 匹配乱序修正:
//   • 填空题目页快捷键 (桌面): ←/→ 切换题目、1-4 选择选项 (选项带
//     序号角标)、回车下一题、Esc 关闭弹层; 拼写输入框聚焦时不拦截。
//   • 短语匹配中文列改用 Sattolo 错位排列 (零不动点) —— 原普通洗牌
//     平均留 1 个位置对齐, 首行 20% 概率直接命中, 观感如未打乱;
//     收尾轮只剩 1 对时并入上一轮, 消除必然对齐。

// hsv-v13 (?v=110) — 课文精读: 应用内导入课文 (Windows 端粘贴):
//   • 课程列表新增「导入课文」: 复制识别提示词 → 粘贴 AI 输出的
//     JSON → 规范化(全角标点/弯引号/围栏剥离) → 校验报告 → 预览
//     确认入库。词-句关联与全部 ID 由导入器自动生成。
//   • 导入课存 hsv_{pid}_lessons_user, 随整档快照同步到平板;
//     内置课只读, 导入课卡片可删除(进度记录一并清除)。
//   • docs/lesson-import-prompt.md 入预缓存, 供应用内一键复制。

// hsv-v12 (?v=109) — 课文精读: 填空页体验改进 (实测反馈):
//   • 填空支持上一题/下一题自由导航, 可跳过可回看; 已答题回显
//     选项着色与反馈; 「交卷」出结果, 未答完不刷新最佳成绩且可
//     一键回到未作答题继续。
//   • 「中文」开关控制释义提示 (两种模式统一), 偏好持久化。
//   • 填空句可整句朗读 (未答时即听力填空练法); 课文页每段新增
//     整段播放按钮。

// hsv-v11 (?v=108) — 课文精读模块 (Lessons):
//   • 新增 lessons-data.js (两课语料: 短文按句切分 + 63 个蓝色词条
//     含原型/词形/释义/短语)、lessons.js (听读/点词/填空/短语四步)、
//     lessons.css，三者全部纳入预缓存。
//   • 导航新增「课文」tab；app.js 启动时初始化 Lessons，切 tab 停播。
//   • wordlist 导出与覆盖率统计追加课文语料条目（含整句），配合
//     音频包在无英文系统语音的平板上离线整篇朗读。

// v12 — fixes PWA install on mobile:
//   • v11: removed phantom files (dictionary.js, vocab.js, stories.js,
//     i18n.js) that were breaking cache.addAll().
//   • v12: added maskable icon entries for proper Android webapk build.
//     The previous icons were JPEG-in-PNG files (wrong MIME and wrong
//     dimensions), which made Android silently fail the install-to-
//     launcher step after reporting "installed successfully".
//   • Resilient install: individual cache.put calls so any single missing
//     file is logged as a warning, not a fatal error.
//   • Network-first for local assets (picks up deploys without a hard reload).
// v15 — cache-busting version strings on asset URLs:
//   • index.html now references style.css?v=15, app.js?v=15, etc.
//   • Offline fallback uses { ignoreSearch: true } so a versioned request
//     like style.css?v=15 still matches the plain style.css entry cached
//     at install time. This keeps the app working offline across deploys.

// v94 — audio pack: diagnostic logging on the playback path
//   (tagged "[pack]", visible in the debug panel Log tab).

// v93 — audio pack playback:
//   • speak() now plays English words from the downloaded pack when a
//     clip exists — no key, proxy, or network for covered words —
//     falling back to the neural and then the device voice otherwise.
//   • each play picks a random voice from the chosen set, so a word
//     sounds different on repeat during autoplay.
//   • removing a notebook word also deletes its pack audio.

// v92 — audio pack: word limit and a more compact Voice panel:
//   • a "Words/build" field caps how many words each cloud build
//     generates; it is written into the exported word list and the
//     generator reads it from a "# limit:" header.
//   • Settings → Voice is tightened: two-column auto-pronounce, side
//     by side pack buttons, shorter help text.

// v91 — audio pack: voice picker, coverage, word-list export:
//   • Settings → Voice gains voice checkboxes, a coverage line
//     (how many words still lack pronunciation), and an Export word
//     list button that writes wordlist.txt with the chosen voices.
//   • the pack generator reads voices from a "# voices:" header in
//     the word list, so voices are chosen in the app, not source.

// v90 — pre-generated pronunciation pack:
//   • new module tts-pack.js: downloads a bundled pack of word audio
//     into a dedicated, never-evicted IndexedDB store ('hsv-tts-pack').
//   • the pack is fetched through the existing Cloudflare Worker,
//     which now also relays the GitHub Release asset (Release assets
//     send no CORS header, so a direct browser fetch is blocked).
//   • Settings → Voice gains a "Download audio pack" button.

// v89 — stop syncing the OpenAI key:
//   • the OpenAI TTS key is a credential and is now excluded
//     from the Gist sync payload (like the AI provider key), so
//     it is never written to GitHub. Removes a key-exposure path.

// v88 — honest neural voice test:
//   • the Test button now uses a unique sentence each run so
//     the proxy edge cache can't serve a stale clip — a passing
//     test now genuinely means the OpenAI key works.

// v87 — OpenAI key sanitization:
//   • strip non-ASCII characters (zero-width spaces, smart
//     quotes, full-width letters) from the key before it is put
//     in the Authorization header — fixes the fetch() error
//     'String contains non ISO-8859-1 code point'.

// v86 — bilingual voice routing:
//   • Chinese text always uses the device's native Chinese
//     voice; the OpenAI neural voice is reserved for English.

// v85 — neural TTS via CORS proxy:
//   • OpenAI blocks direct browser calls; TTS requests now go
//     through a user-supplied proxy URL (a Cloudflare Worker).
//   • new 'TTS proxy URL' field in Settings → Voice.

// v84 — neural TTS debug output:
//   • [tts] console logs for voice resolution, HTTP status, and
//     byte size (auto-captured by the debug panel log).
//   • Test button shows a visible status line: voice + KB size.

// v83 — neural TTS diagnostics:
//   • 'Test neural voice' now reports the real outcome (works,
//     or the specific error) instead of silently downgrading.
//   • a neural failure during playback shows a one-time toast so
//     a silent fallback no longer looks like 'the switch does nothing'.

// v82 — neural TTS reliability:
//   • synthesised clips persist in IndexedDB — each text is
//     fetched from OpenAI at most once per device, then reused
//     across reloads and offline.
//   • transient failures (429 / network) retried with backoff
//     before falling back, fixing the mixed-voice autoplay.

// v81 — settings redesign:
//   • Settings split into 5 tabs (General / Voice / AI / Sync /
//     Data) so it no longer scrolls as one long page.

// v80 — multi-user:
//   • per-install PROFILE_ID (no data / Gist collision between
//     users); first run asks for a display name.
//   • non-owner installs see only a demo subset of Expressions;
//     the Ref tab stays shared in full.

// v79 — neural TTS:
//   • optional OpenAI gpt-4o-mini-tts voice engine for far less
//     robotic sentence playback; device voice remains the offline
//     fallback. Settings → Voice → Voice engine.

// v78 — batch paste-back fix:
//   • enriched entries now carry an INPUT field echoing the original
//     word, so an inflected word ('squeezed') updates its own row
//     instead of leaving an orphan when the AI returns the lemma.
//   • wider irregular-verb / Latin-plural lemma table.

// v95 — fix \"app stuck on an old version\":
//   • the network-first fetch handler now passes { cache: 'no-cache' }
//     so a request really goes to the server instead of being satisfied
//     by the browser / CDN HTTP cache. GitHub Pages sends a max-age, so
//     plain fetch(e.request) could return a stale document that still
//     referenced the previous ?v= assets — the app then loaded an old
//     build even though a new one was deployed.
//   • index.html registers the SW with updateViaCache:'none' so the
//     worker script itself is never served stale either.

// v96 — redeploy of the audio-pack Range UI (app.js / index.html / db.js)
//        after an older copy was accidentally republished; cache bumped so
//        the corrected files refresh cleanly on every device.

// v107 — batch-2 fixes:
//   • sync: local-only day logs are no longer deleted by whole-snapshot
//     pulls (day_ keys are add-only in the merge; the union is pushed
//     back after a pull that preserved any);
//   • unbiased Fisher-Yates shuffles for quiz/drill options (was the
//     biased sort(random) pattern in my-words + vocab-drill);
//   • data-changed event renamed emp:datachanged → hsv:datachanged;
//   • import button reduced to a single listener; backup filename is
//     now vocabpeak-backup-*.json.

// v106 — batch-1 fixes (see repo notes):
//   • enrichment merge no longer wipes SRS state / builtin metadata;
//   • AI paste-back orphans no longer inflate the daily new-word count;
//   • REGISTER whitelisted at import and render (HTML-injection fix);
//   • cloze result colors follow the light/dark theme variables;
//   • group-size default unified at 50; SRS review refreshes the counter;
//   • EMPro cross-app residue removed (expr_ bare-key migration,
//     sync-test.html emp_sync_* keys retargeted to hsv_sync_*).

// 缓存名与 EMPro 隔离：Cache Storage 也是按 origin 共享的，两个应用
// 的 CACHE_NAME 必须不同，否则会互相删除对方的缓存。
const CACHE_NAME = 'hsv-v14';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './style.css',
    './expressions-coach.css',
    './config.js',
    './dictionary.js',
    './vocab-hs-data.js',
    './lessons-data.js',
    './lessons.js',
    './lessons.css',
    './docs/lesson-import-prompt.md',
    './db.js',
    './ai-engine.js',
    './my-words.js',
    './cloze.js',
    './writing-lab.js',
    './vocab-drill.js',
    './reader.js',
    './speaking-coach.js',
    './expressions-data.js',
    './expressions-coach.js',
    './sentence.js',
    './sentence-drill.js',
    './sync.js',
    './tts-pack.js',
    './app.js',
    './debug-panel.js',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-192.png',
    './icon-maskable-512.png'
];

// Install — cache assets individually so a single failure doesn't kill install.
// This is essential for PWA installability: if install fails, the SW never
// activates, and Chrome on Android won't offer the "Install" prompt.
self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(ASSETS.map(async (url) => {
            try {
                const resp = await fetch(url, { cache: 'reload' });
                if (resp && resp.ok) {
                    await cache.put(url, resp);
                } else {
                    console.warn('[SW] Skipped (bad response):', url, resp && resp.status);
                }
            } catch (err) {
                console.warn('[SW] Skipped (fetch failed):', url, err && err.message);
            }
        }));
    })());
    self.skipWaiting();
});

// Activate — clean old caches, take control immediately
self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// Fetch — network-first for local GETs, fall back to cache when offline.
// Cross-origin requests (API providers, GitHub Gist, Google Fonts, Google TTS)
// pass straight through — never cached, never intercepted.
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Cross-origin: pass through untouched
    if (url.hostname !== location.hostname) {
        return;  // let browser handle it
    }

    // Any non-GET (or sync file): never cache
    if (e.request.method !== 'GET' || url.pathname.includes('hsv-sync')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // Local GETs: network-first, fall back to cache when offline.
    // { cache: 'no-cache' } forces the browser to revalidate with the
    // server instead of returning a stale HTTP-cached copy. This is the
    // fix for \"a new deploy never shows up\": without it, network-first
    // could still hand back an old document from the CDN/browser cache.
    e.respondWith((async () => {
        try {
            const fresh = await fetch(e.request, { cache: 'no-cache' });
            if (fresh && fresh.ok && fresh.type !== 'opaque') {
                const cache = await caches.open(CACHE_NAME);
                cache.put(e.request, fresh.clone()).catch(() => {});
            }
            return fresh;
        } catch {
            // Offline fallback: ignore ?v=N query strings so a request for
            // style.css?v=15 still matches the plain style.css entry cached
            // at install time. Without ignoreSearch we'd miss every asset
            // after the first cache-bust and break offline mode.
            const cached = await caches.match(e.request, { ignoreSearch: true });
            if (cached) return cached;
            if (e.request.destination === 'document') {
                return (await caches.match('./index.html')) || new Response('Offline', { status: 504 });
            }
            return new Response('Offline', { status: 504 });
        }
    })());
});

// Support a manual "activate new SW" message from the page
self.addEventListener('message', (e) => {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
