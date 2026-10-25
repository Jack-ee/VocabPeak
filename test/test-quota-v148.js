// test-quota-v148.js — localStorage 配额保护: 学习记录优先于拉取前快照
//   localStorage 与 EMPro 同源共享 (约 500 万字符)。sync.js 的拉取前快照最多
//   存三代生词本, 3500 新增词入库后生词本更大, 普通写入可能撞配额。db.js
//   写入失败时应逐代丢弃最老的快照再重试, 快照丢光仍写不进才抛错并提示。
// 运行: node test/test-quota-v148.js
'use strict';
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const H    = require('./_harness');

const { ok, sec, done } = H.makeChecker();

function quotaStorage(limit) {
    const m = new Map();
    const used = () => { let n = 0; m.forEach((v, k) => { n += k.length + v.length; }); return n; };
    return {
        _map: m, used,
        set limit(x) { limit = x; },
        get length() { return m.size; },
        key: (i) => Array.from(m.keys())[i] ?? null,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => {
            k = String(k); v = String(v);
            const prev = m.has(k) ? k.length + m.get(k).length : 0;
            if (used() - prev + k.length + v.length > limit) {
                const e = new Error('quota'); e.name = 'QuotaExceededError'; e.code = 22; throw e;
            }
            m.set(k, v);
        },
        removeItem: (k) => { m.delete(k); },
        clear: () => m.clear()
    };
}

function load(storage) {
    const toasts = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {}, info() {} },
        localStorage: storage, JSON, Math, Date, Object, Array, String, Number, Set, Map, Promise, RegExp, Error,
        indexedDB: undefined, setTimeout: () => 0, clearTimeout: () => {}
    };
    ctx.window = ctx;
    ctx.App = { showToast: (m) => toasts.push(m) };
    vm.createContext(ctx);
    ['config.js', 'db.js'].forEach(f => vm.runInContext(fs.readFileSync(path.join(H.DIR, f), 'utf8'), ctx, { filename: f }));
    return { DB: ctx.DB, toasts };
}

const word = (i, pad) => ({ word: 'w' + i, meaning: '释义' + i, enDef: 'x'.repeat(pad), srsLevel: 2, addedAt: i });
const nb   = (n, pad) => Array.from({ length: n }, (_, i) => word(i, pad));

sec('快照占满时, 生词本写入仍成功');
{
    const st = quotaStorage(1e7);
    const { DB, toasts } = load(st);
    DB.saveNotebook(nb(100, 300));                       // 约 4 万字符
    const snap = JSON.stringify({ v: 2, gens: [0, 1, 2].map(i => ({ ts: i, data: { k: 'y'.repeat(20000) } })) });
    st.setItem('_hsv_kid_prepull', snap);                // 三代快照约 6 万字符
    st.limit = st.used() + 5000;                         // 余量只剩 5000, 生词本要长 1.4 万
    let err = null;
    try { DB.saveNotebook(nb(140, 300)); } catch (e) { err = e; }
    ok(!err, '写入没有抛错', err && err.message);
    ok(JSON.parse(st.getItem('hsv_kid_notebook')).length === 140, '新生词本完整写入');
    const left = st.getItem('_hsv_kid_prepull');
    const gens = left ? JSON.parse(left).gens.length : 0;
    ok(gens >= 1 && gens < 3, '只丢掉必要的最老几代快照, 最新一代保留', gens);
    ok(toasts.length === 0, '能腾出空间时不打扰用户');
}

sec('快照丢光仍放不下: 抛错并只提示一次');
{
    const st = quotaStorage(30000);
    const { DB, toasts } = load(st);
    st.setItem('_hsv_kid_prepull', JSON.stringify({ v: 2, gens: [{ ts: 1, data: { k: 'z'.repeat(5000) } }] }));
    let e1 = null, e2 = null;
    try { DB.saveNotebook(nb(200, 300)); } catch (e) { e1 = e; }
    try { DB.setPref('lesson_progress', 'q'.repeat(40000)); } catch (e) { e2 = e; }
    ok(e1 && e1.name === 'QuotaExceededError' && e2, '真放不下时照旧抛错 (调用方行为不变)');
    ok(st.getItem('_hsv_kid_prepull') === null, '先把快照让出来了');
    ok(toasts.length === 1, '提示只出一次', toasts.length);
}

sec('普通写入不受影响');
{
    const st = quotaStorage(1e7);
    const { DB } = load(st);
    DB.setPref('lesson_source', 'ai');
    DB.setPrefQuiet('lesson_time', '{}');
    DB.saveStats({ streakDays: 3 });
    ok(DB.getPref('lesson_source', '') === 'ai' && JSON.parse(st.getItem('hsv_kid_stats')).streakDays === 3, 'setPref / setPrefQuiet / saveStats 照常');
}

done('配额保护 v148');
