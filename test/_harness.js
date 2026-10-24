// _harness.js — 多设备同步模拟器 (v147)
// ------------------------------------------------------------
// 在 Node 的 vm 沙箱里加载「真实的」config.js / db.js / sync.js (整个
// 文件, 不是抽函数), 每台设备一个独立沙箱 + 独立 localStorage, 共用一
// 个内存版 GitHub Gist 服务。时钟与定时器可控, 能快进数周。
//
// 历史教训: v142 的同步模块加载即崩 (const 暂时性死区), 而当时的测试
// 全都是把单个函数抽出来 eval —— 函数本身没错, 测试全绿, 模块却从没
// 跑起来过。这里坚持整文件加载, 加载失败直接抛错。
// ------------------------------------------------------------
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

// 兼容两种摆放: 仓库内 test/ 目录, 或旧习惯的「测试脚本与 VocabPeak-main 同级」
function repoDir() {
    const sib = path.join(__dirname, 'VocabPeak-main');
    if (fs.existsSync(path.join(sib, 'index.html'))) return sib;
    return path.join(__dirname, '..');
}
const DIR = repoDir();
const src = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ─── 可控时钟 ──────────────────────────────────────────────
function makeClock(iso) {
    const clock = { t: Date.parse(iso) };
    class FDate extends Date {
        constructor(...a) { if (a.length === 0) super(clock.t); else super(...a); }
        static now() { return clock.t; }
    }
    clock.Date     = FDate;
    clock.advance  = (ms) => { clock.t += ms; };
    clock.days     = (n) => { clock.t += n * 86400000; };
    clock.set      = (iso2) => { clock.t = Date.parse(iso2); };
    return clock;
}

// ─── 内存版 Gist 服务 ──────────────────────────────────────
function makeGistServer(clock) {
    const gists = {};
    let seq = 0, writes = 0;
    function json(status, obj) {
        return { ok: status >= 200 && status < 300, status,
                 json: async () => JSON.parse(JSON.stringify(obj)),
                 text: async () => JSON.stringify(obj) };
    }
    function view(g) {
        const files = {};
        Object.keys(g.files).forEach(n => {
            files[n] = { filename: n, content: g.files[n], truncated: false, size: g.files[n].length };
        });
        return { id: g.id, updated_at: g.updated_at, files };
    }
    async function fetch(url, opts) {
        opts = opts || {};
        const method = (opts.method || 'GET').toUpperCase();
        const m = String(url).match(/^https:\/\/api\.github\.com\/gists(?:\/([^/?]+))?(\?.*)?$/);
        if (!m) throw new Error('unexpected fetch ' + url);
        const id = m[1];
        if (!id && method === 'GET') return json(200, Object.values(gists).map(view));
        if (!id && method === 'POST') {
            const body = JSON.parse(opts.body);
            const g = { id: 'g' + (++seq), files: {}, updated_at: '' };
            Object.keys(body.files).forEach(n => { g.files[n] = body.files[n].content; });
            g.updated_at = new Date(clock.t).toISOString() + '#' + (++writes);
            gists[g.id] = g;
            return json(201, view(g));
        }
        const g = gists[id];
        if (!g) return json(404, { message: 'Not Found' });
        if (method === 'GET') return json(200, view(g));
        if (method === 'PATCH') {
            const body = JSON.parse(opts.body);
            Object.keys(body.files).forEach(n => { g.files[n] = body.files[n].content; });
            g.updated_at = new Date(clock.t).toISOString() + '#' + (++writes);
            return json(200, view(g));
        }
        throw new Error('unexpected ' + method + ' ' + url);
    }
    return {
        fetch, gists,
        writes: () => writes,
        create(files) {
            const g = { id: 'g' + (++seq), files: Object.assign({}, files),
                        updated_at: new Date(clock.t).toISOString() + '#' + (++writes) };
            gists[g.id] = g;
            return g.id;
        },
        payload(id) {
            const g = gists[id];
            const f = g && g.files['hsv-sync-kid.json'];
            return f ? JSON.parse(f) : null;
        }
    };
}

// ─── localStorage (Map) ────────────────────────────────────
function makeStorage(init) {
    const m = new Map(Object.entries(init || {}));
    return {
        _map: m,
        get length() { return m.size; },
        key: (i) => Array.from(m.keys())[i] ?? null,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(String(k), String(v)); },
        removeItem: (k) => { m.delete(k); },
        clear: () => m.clear(),
        dump: () => Object.fromEntries(m)
    };
}

// ─── 一台设备 = 一个沙箱 ──────────────────────────────────
// opts.modules: 要加载的文件 (默认 config + db + sync)
// opts.storage: 复用的 localStorage (模拟「同一台平板升级后重开应用」)
function makeDevice(name, env, opts) {
    opts = opts || {};
    const storage = opts.storage || makeStorage();
    const timers  = [];
    const quiet   = { log() {}, warn() {}, error() {}, info() {}, table() {} };
    const logs    = [];
    const con     = opts.verbose ? console : {
        log: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')),
        warn: (...a) => logs.push('W ' + a.join(' ')), error: (...a) => logs.push('E ' + a.join(' ')),
        table: () => {}
    };
    const doc = {
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, createElement: () => ({ style: {}, classList: { toggle() {}, add() {} },
            addEventListener() {}, appendChild() {} }),
        hidden: false, readyState: 'complete', body: { appendChild() {} }
    };
    const ctx = {
        console: con, Date: env.clock.Date, Math, JSON, Promise, Symbol, Object, Array, String,
        Number, Boolean, RegExp, Error, TypeError, Map, Set, WeakMap, isFinite, isNaN, parseInt,
        parseFloat, encodeURIComponent, decodeURIComponent, TextEncoder, TextDecoder, Uint8Array,
        ArrayBuffer, DataView, Intl,
        localStorage: storage,
        document: doc,
        navigator: { onLine: true, userAgent: opts.ua || 'Mozilla/5.0 (Linux; Android 14)' },
        fetch: env.server.fetch,
        setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
        clearTimeout: () => {},          // 防抖: 允许多次 push, 合并逻辑本就该幂等
        setInterval: () => 0, clearInterval: () => {},
        CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
        addEventListener() {}, dispatchEvent() { return true; },
        location: { reload() { logs.push('RELOAD'); }, hash: '' },
        crypto: require('crypto').webcrypto
    };
    ctx.window = ctx;
    ctx.self   = ctx;
    vm.createContext(ctx);
    const mods = opts.modules || ['config.js', 'db.js', 'sync.js'];
    mods.forEach(f => vm.runInContext(src(f), ctx, { filename: f }));   // 加载失败直接抛
    const dev = {
        name, ctx, storage, logs,
        get DB() { return ctx.DB; },
        get Sync() { return ctx.SyncManager; },
        // 跑完所有排队的定时器 (防抖推送、启动补推…), 中间让出微任务
        async runTimers(maxRounds) {
            for (let i = 0; i < (maxRounds || 50) && timers.length; i++) {
                const fn = timers.shift();
                try { await fn(); } catch (e) { logs.push('E timer ' + e.message); }
                await settle();
            }
            await settle();
        }
    };
    return dev;
}
async function settle() { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); }

// ─── 断言 ─────────────────────────────────────────────────
function makeChecker() {
    const st = { pass: 0, fail: 0 };
    const ok = (c, n, x) => {
        if (c) st.pass++;
        else { st.fail++; console.log('  ✗ ' + n + (x !== undefined ? ' → ' + x : '')); }
    };
    const sec = (t) => console.log('\n── ' + t + ' ──');
    const done = (title) => {
        console.log('\n' + '═'.repeat(46));
        console.log('  ' + (title ? title + ': ' : '') + '通过 ' + st.pass + ' 项, 失败 ' + st.fail + ' 项');
        console.log('═'.repeat(46));
        if (st.fail) process.exitCode = 1;
    };
    return { ok, sec, done, st };
}

module.exports = { DIR, src, makeClock, makeGistServer, makeStorage, makeDevice, settle, makeChecker };
