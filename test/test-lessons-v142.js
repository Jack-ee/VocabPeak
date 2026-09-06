// test-lessons-v142.js — v142 (hsv-v45) 离线补推 + 一键配置链接
//   • 脏标志生命周期: 失败标脏 / 成功清脏 / 抛错也标脏 / 跨重启存活
//   • 四个补推时机接线; 离线 triggerSave 不空跑; 轮询先推后拉
//   • 配置链接: 编解码往返、绝不含 token、确认后才写、导入清 hash
// 运行: node test-lessons-v142.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const syncSrc  = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
const setupSrc = fs.readFileSync(path.join(DIR, 'setup-link.js'), 'utf8');

// ─── 1. 脏标志行为仿真 ──────────────────────────────────────
sec('1. 离线补推');
function extract(name, isAsync) {
    const tag = (isAsync ? 'async function ' : 'function ') + name + '(';
    const i = syncSrc.indexOf(tag);
    let d = 0, st = false;
    for (let j = i; j < syncSrc.length; j++) {
        if (syncSrc[j] === '{') { d++; st = true; }
        else if (syncSrc[j] === '}') { d--; if (st && d === 0) return syncSrc.slice(i, j + 1); }
    }
}
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null),
                        setItem: (k, v) => { store[k] = String(v); },
                        removeItem: k => { delete store[k]; } };
const K_PUSH_DIRTY = 'hsv_sync_push_dirty';
eval(extract('markDirty')); eval(extract('clearDirty')); eval(extract('isDirty'));

// push 仿真: 走真实的 push 体 (桩掉依赖)
let netMode = 'ok', pushes = 0;
let isSyncing = false;
const getToken = () => 't', getGistId = () => 'g';
const updateSyncUI = () => {}, setLastPull = () => {};
const collectSyncData = () => ({ _syncTime: 1 });
const writeGist = async () => {
    pushes++;
    if (netMode === 'throw') throw new Error('Failed to fetch');   // 离线典型
    return netMode === 'ok';
};
global.window = { App: { showToast() {} } };
eval(extract('push', true));

(async () => {
    // 1a. 离线抛错 → 标脏
    netMode = 'throw';
    let r = await push(false);
    ok(r === false && isDirty(), '推送抛错 (离线) → 标脏');
    // 1b. 返回 false → 标脏
    delete store[K_PUSH_DIRTY]; netMode = 'fail';
    r = await push(false);
    ok(r === false && isDirty(), '推送返回失败 → 标脏');
    // 1c. 成功 → 清脏
    netMode = 'ok';
    r = await push(false);
    ok(r === true && !isDirty(), '推送成功 → 清脏');
    // 1d. 跨重启存活
    markDirty();
    ok(store[K_PUSH_DIRTY] === '1', '脏标志写在 localStorage (跨重启存活)');

    // 1e. flushPending: 脏且在线才推
    eval(extract('flushPending', true));
    // Node 22 的内置 navigator 是只读 getter, 赋值会被静默忽略 ——
    // 必须用 defineProperty 才能仿真离线状态
    const setOnline = (v) => Object.defineProperty(global, 'navigator',
        { value: { onLine: v }, configurable: true, writable: true });
    setOnline(false);
    pushes = 0;
    await flushPending('t');
    ok(pushes === 0, '离线时不做无谓推送');
    setOnline(true);
    await flushPending('t');
    ok(pushes === 1 && !isDirty(), '联网后补推成功并清脏');
    pushes = 0;
    await flushPending('t');
    ok(pushes === 0, '不脏则不推 (无重复流量)');

    // ─── 2. 接线 ────────────────────────────────────────────
    sec('2. 补推时机与接线');
    ok(/window\.addEventListener\('online', \(\) => \{ flushPending\('online'\); \}\)/.test(syncSrc),
       '网络恢复事件补推');
    ok(/if \(isDirty\(\)\) setTimeout\(\(\) => flushPending\('startup'\), 2000\)/.test(syncSrc),
       '启动时若已脏则补推 (离线学完关机, 下次开机联网即上云)');
    ok(/if \(isDirty\(\)\) \{ flushPending\('focus'\); return; \}/.test(syncSrc), 'focus 补推');
    ok(/if \(isDirty\(\)\) \{ flushPending\('poll'\); return; \}/.test(syncSrc),
       '轮询先补推再拉取 (顺序: 先推避免与旧快照对账)');
    ok(/navigator\.onLine === false\) \{\n            markDirty\(\);\n            return;/.test(syncSrc),
       '离线时 triggerSave 直接标脏不空跑');
    ok(/pending \? '\\u2601\\uFE0F\\u2191'/.test(syncSrc), '同步图标显示待上传态 ☁️↑');
    ok(/if \(isDirty\(\)\) \{ await push\(true\); return; \}/.test(syncSrc),
       '点击图标时优先推送 (而非拉取)');
    ok(/hasPendingPush: isDirty/.test(syncSrc), '公开 hasPendingPush 供调试');

    // ─── 3. 配置链接 ────────────────────────────────────────
    sec('3. 一键配置链接');
    global.TextEncoder = require('util').TextEncoder;
    global.TextDecoder = require('util').TextDecoder;
    global.btoa = s => Buffer.from(s, 'binary').toString('base64');
    global.atob = s => Buffer.from(s, 'base64').toString('binary');
    const prefs = { tts_proxy_url: 'https://vocabpeak-tts.foo.workers.dev',
                    course_feed_url: '', pack_key: 'PK-123',
                    course_feed_pass: '口令中文' };
    global.window = { DB: { getPref: (n, fb) => prefs[n] ?? fb }, App: { showToast() {} } };
    global.location = { origin: 'https://jack-ee.github.io', pathname: '/VocabPeak/', hash: '', search: '' };
    (new Function('window', 'location', 'TextEncoder', 'TextDecoder', 'btoa', 'atob', 'history', 'console', setupSrc))
        (global.window, global.location, global.TextEncoder, global.TextDecoder,
         global.btoa, global.atob, { replaceState() {} }, { log() {}, warn() {} });
    const SL = global.window.SetupLink;

    const urlNo = SL.build(false);
    ok(urlNo.startsWith('https://jack-ee.github.io/VocabPeak/#setup='), '链接用 hash 不用 query (不进服务器日志)');
    let p = SL._dec(urlNo.split('#setup=')[1]);
    ok(p.tts === prefs.tts_proxy_url && !p.pk && !p.cp, '不含密钥模式: 只带地址');
    const urlYes = SL.build(true);
    p = SL._dec(urlYes.split('#setup=')[1]);
    ok(p.pk === 'PK-123' && p.cp === '口令中文', '含密钥模式: 中文口令编解码正确 (UTF-8 安全)');
    ok(!/token|gist/i.test(urlYes) && !('token' in p) && !('gist' in p),
       '绝不含 GitHub token / Gist ID (同步必须各自配置)');
    ok(!p.feed, '空值字段不入载荷 (链接更短)');

    // 导入: 确认框拒绝则不写
    let written = {};
    global.window.DB.setPref = (n, v) => { written[n] = v; };
    global.window.confirm = () => false;
    global.location.hash = '#setup=' + SL._enc({ v: 1, tts: 'https://x.workers.dev' });
    ok(SL.applyFromHash() === false && Object.keys(written).length === 0,
       '用户拒绝确认 → 一个字段都不写');
    // 确认则写
    global.window.confirm = () => true;
    global.setTimeout = (fn) => 0;   // 拦住 reload
    global.location.reload = () => {};
    global.location.hash = '#setup=' + SL._enc({ v: 1, tts: 'https://y.workers.dev', cp: 'pw' });
    ok(SL.applyFromHash() === true && written.tts_proxy_url === 'https://y.workers.dev'
       && written.course_feed_pass === 'pw', '确认后写入配置');
    // 坏载荷不炸
    global.location.hash = '#setup=@@@bad@@@';
    ok(SL.applyFromHash() === false, '坏链接静默失败不抛');
    ok(/history\.replaceState/.test(setupSrc), '导入后清 hash (不留在历史/截图)');
    ok(/if \(!p \|\| p\.v !== 1\)/.test(setupSrc), '版本号校验');

    // ─── 4. 版本 ────────────────────────────────────────────
    sec('4. 版本');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '142', 'index.html 全部 ?v=142 (' + vs.length + ' 处)');
    ok(vs.length === 26, '?v= 引用 26 处 (25 + setup-link.js)');
    ok(/'\.\/setup-link\.js',/.test(sw), 'sw.js 预缓存新模块 (离线可用)');
    ok(/const CACHE_NAME = 'hsv-v45'/.test(sw), 'sw.js CACHE_NAME = hsv-v45');
    ok(/hsv-v45 \(\?v=142\)/.test(sw), 'sw.js 有 v45 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
