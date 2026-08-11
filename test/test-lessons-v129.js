// test-lessons-v129.js — v129 (hsv-v32) Gist 未变不下载内容
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const src = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');

console.log('\n── 1. 结构 ──');
ok(/const UNCHANGED = Symbol\('unchanged'\)/.test(src), 'UNCHANGED 哨兵值');
ok(/async function readGist\(force\)/.test(src), 'readGist 接 force 参数');
ok(/if \(!force && stamp && stamp === localStorage\.getItem\(K_GIST_STAMP\)\)/.test(src), '非强制时按戳记短路');
ok(/const payload = await readGist\(!!showToast\);/.test(src), '手动同步强制读取');
ok(/payload === UNCHANGED/.test(src), 'pull 处理 UNCHANGED');
ok((src.match(/readGist\(true\)/g) || []).length === 2, '首次配对等场景强制读取 (2 处)');
ok(/localStorage\.removeItem\(K_GIST_STAMP\)/.test(src), '推送后清戳记');
ok(/payload truncated by API/.test(src) && !/payload > 1MB/.test(src), '截断文案已修正');

console.log('\n── 2. 行为仿真 ──');
// 桩: 同一 updated_at 连续两次轮询, 第二次不应发起内容读取
function extract(name) {
    const i = src.indexOf('async function ' + name);
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null),
                        setItem: (k, v) => { store[k] = String(v); },
                        removeItem: k => { delete store[k]; } };
const GIST_API = 'https://api.github.com/gists';
const K_GIST_STAMP = 'hsv_sync_gist_stamp';
const getToken = () => 't', getGistId = () => 'g';
const gistFile = () => 'f.json', coursesFile = () => 'c.json';
const setGistId = () => {};
const UNCHANGED = Symbol('unchanged');
let _lastCoursesFile = null;
let rawFetches = 0;
const payloadObj = { _profile: 'kid', _syncTime: 5, data: {} };
global.fetch = async (url) => {
    if (String(url).includes('api.github.com')) {
        return { ok: true, json: async () => ({
            updated_at: '2026-08-11T09:00:00Z',
            files: { 'f.json': { content: '{"trunc', truncated: true, size: 602023,
                                 raw_url: 'https://gist.githubusercontent.com/raw/x' } }
        }) };
    }
    rawFetches++;
    return { ok: true, text: async () => JSON.stringify(payloadObj) };
};
eval(extract('readGist'));
(async () => {
    const a = await readGist(false);
    ok(a && a._syncTime === 5, '首次轮询正常读到内容');
    ok(rawFetches === 1, '首次走了一次 raw 下载');
    const b = await readGist(false);
    ok(b === UNCHANGED, '第二次轮询返回 UNCHANGED');
    ok(rawFetches === 1, '第二次没有再下载内容 (省下 602 KB)');
    const c = await readGist(true);
    ok(c && c._syncTime === 5, '手动强制仍读取');
    ok(rawFetches === 2, '强制读取确实下载');
    delete store[K_GIST_STAMP];
    const d = await readGist(false);
    ok(d && d._syncTime === 5, '戳记被清除后如实重读 (推送后场景)');

    console.log('\n── 3. 版本 ──');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '129', 'index.html 全部 ?v=129');
    ok(/const CACHE_NAME = 'hsv-v32'/.test(sw), 'sw.js CACHE_NAME = hsv-v32');
    ok(/hsv-v32 \(\?v=129\)/.test(sw), 'sw.js 有 v32 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
