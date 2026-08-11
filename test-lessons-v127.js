// test-lessons-v127.js — v127 (hsv-v30) 1MB 截断拉取修复
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const src = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');

console.log('\n── 1. 截断处理 ──');
ok(/if \(file\.truncated && file\.raw_url\)/.test(src), 'truncated 时走 raw_url');
const seg = src.slice(src.indexOf('if (file.truncated'), src.indexOf('if (!text) return null;'));
ok(/await fetch\(file\.raw_url\)/.test(seg), 'raw 请求不带任何 headers (避免 CORS 预检)');
ok(!/Authorization/.test(seg), 'raw 请求段内无 Authorization');
ok(/throw new Error\('Gist read failed: payload exceeds 1MB/.test(src), 'raw 也失败时抛错而非静默 null');
ok(/console\.error\('\[Sync\] payload parse failed:'/.test(src), '解析失败打印错误 (原来静默吞掉)');
ok(/if \(!file\) return null;/.test(src), '文件不存在仍安全返回');
ok(!/if \(!file\?\.content\) return null;/.test(src), '旧的 content 短路已移除 (它会跳过截断分支)');

console.log('\n── 2. 推送预警 ──');
ok(/json\.length > 950000/.test(src), '越过 950KB 打印预警');
ok(/over the 1 MB API inline limit/.test(src), '预警文案说明后果');

console.log('\n── 3. 行为仿真 ──');
// 桩: 截断响应 → 应走 raw_url 且不带 header
const payload = { _profile: 'kid', _syncTime: 123, data: { 'hsv_kid_notebook': '[1,2]' } };
let rawCalledWith = null;
global.fetch = async (url, opt) => {
    if (String(url).includes('api.github.com')) {
        return { ok: true, json: async () => ({ files: { 'hsv-sync-kid.json': {
            content: '{"_profile":"kid","_syncTi',   // 截断
            truncated: true, size: 1300000,
            raw_url: 'https://gist.githubusercontent.com/x/raw/abc/hsv-sync-kid.json'
        } } }) };
    }
    rawCalledWith = opt;
    return { ok: true, text: async () => JSON.stringify(payload) };
};
// 抽取 readGist 并注入依赖
function extract(name) {
    const i = src.indexOf('async function ' + name);
    let d = 0, st = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; st = true; }
        else if (src[j] === '}') { d--; if (st && d === 0) return src.slice(i, j + 1); }
    }
}
const GIST_API = 'https://api.github.com/gists';
const getToken = () => 't', getGistId = () => 'g', gistFile = () => 'hsv-sync-kid.json';
const setGistId = () => {};
const console_ = console;
eval(extract('readGist'));
(async () => {
    const got = await readGist();
    ok(got && got._syncTime === 123, '截断时成功取回完整载荷', JSON.stringify(got));
    ok(rawCalledWith === undefined || rawCalledWith === null || !rawCalledWith,
       'raw 请求确实没传 options/headers');
    // 非截断路径仍走 content
    global.fetch = async () => ({ ok: true, json: async () => ({ files: { 'hsv-sync-kid.json': {
        content: JSON.stringify(payload), truncated: false } } }) });
    const got2 = await readGist();
    ok(got2 && got2._syncTime === 123, '未截断时仍从 content 解析');

    console.log('\n── 4. 版本 ──');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '127', 'index.html 全部 ?v=127');
    ok(/const CACHE_NAME = 'hsv-v30'/.test(sw), 'sw.js CACHE_NAME = hsv-v30');
    ok(/hsv-v30 \(\?v=127\)/.test(sw), 'sw.js 有 v30 变更日志');

    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
