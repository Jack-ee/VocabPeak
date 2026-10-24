// test-load-v147.js — 整站加载冒烟测试 (v147)
//   按 index.html 的顺序, 在同一个沙箱里加载全部 <script src>, 要求:
//   每个文件都不抛错, 各模块的全局对象都在、关键方法都是函数。
//   v142 事故的教训: sync.js 加载即崩, 而浏览器自带同名的 SyncManager
//   接口, 所以「window.SyncManager 存在」不能当证据 —— 这里按方法探测。
// 运行: node test/test-load-v147.js
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const H    = require('./_harness');
const { ok, sec, done } = H.makeChecker();

const idx     = H.src('index.html');
const scripts = [...idx.matchAll(/<script src="([^"?]+)(?:\?v=\d+)?"><\/script>/g)].map(m => m[1]);

// 宽松 DOM: 取任何属性都返回可调用的自身, 足以让各模块完成「定义」阶段
function loose() {
    const fn = function () { return p; };
    const p = new Proxy(fn, {
        get(t, k) {
            if (k === Symbol.toPrimitive) return () => '';
            if (k === 'then' || k === Symbol.iterator) return undefined;
            if (k === 'length') return 0;
            if (k === 'style' || k === 'dataset') return {};
            if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
            return p;
        },
        apply() { return p; }, construct() { return p; }, set() { return true; }
    });
    return p;
}
const store = H.makeStorage();
const errors = [];
const ctx = {
    console: { log() {}, info() {}, warn() {}, table() {}, error: (...a) => errors.push(a.join(' ')) },
    localStorage: store, sessionStorage: H.makeStorage(),
    navigator: { onLine: true, userAgent: 'Mozilla/5.0 (Linux; Android 14)', serviceWorker: undefined,
                 clipboard: undefined, wakeLock: undefined },
    document: Object.assign(loose(), {
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, removeEventListener() {}, readyState: 'loading', hidden: false,
        createElement: () => loose(), body: loose(), head: loose(), documentElement: loose()
    }),
    location: { hash: '', search: '', href: 'https://jack-ee.github.io/VocabPeak/', reload() {} },
    history: { replaceState() {} },
    fetch: async () => { throw new Error('offline'); },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    CustomEvent: class {}, Event: class {}, Audio: class { play() { return Promise.resolve(); } },
    Blob: class {}, URL: { createObjectURL: () => '', revokeObjectURL() {} },
    screen: { width: 1280, height: 800, orientation: { type: 'landscape-primary' } },
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
    indexedDB: undefined, caches: undefined, crypto: require('crypto').webcrypto,
    TextEncoder, TextDecoder, Intl, Date, Math, JSON, Promise, Map, Set, WeakMap, Symbol,
    // 浏览器自带的同名接口 —— 模块若加载失败, 这个「假货」会留在原地
    SyncManager: function SyncManager() {}
};
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

sec('逐个加载 index.html 引用的脚本 (' + scripts.length + ' 个)');
scripts.forEach(f => {
    let err = null;
    try { vm.runInContext(fs.readFileSync(path.join(H.DIR, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { err = e; }
    ok(!err, f + ' 加载不抛错', err && (err.constructor.name + ': ' + err.message));
});

sec('模块就位 (按方法探测, 不信同名全局)');
const expect = {
    DB        : ['saveNotebook', 'loadNotebook', 'recordReview', 'isTestDevice', 'setTestDevice'],
    SyncManager: ['init', 'push', 'pull', 'triggerSave', 'setupSync'],
    AIEngine  : [], MyWords: ['init'], Lessons: ['init'], TTSPack: ['playWord', 'download'],
    CourseFeed: ['check', 'init'], SetupLink: ['applyFromHash'], Cloze: ['open']
};
Object.keys(expect).forEach(n => {
    const g = ctx[n];
    ok(!!g && typeof g === 'object', n + ' 已定义');
    expect[n].forEach(m => ok(g && typeof g[m] === 'function', n + '.' + m + ' 是函数'));
});

done('整站加载');
