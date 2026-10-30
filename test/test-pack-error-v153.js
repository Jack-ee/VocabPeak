// test-pack-error-v153.js — 音频包下载失败时的提示 (真浏览器, 整站加载)
//   • 失败原因留在「下载音频包」下面, 不被「尚未安装音频包」盖掉
//   • Worker 不认 VocabPeak 文件名 (EMPro 的 Worker, 400) → 提示改 TTS 代理地址, 带当前地址
//   • Worker 不放行当前网址 (403 Origin not allowed) → 提示从正式网址打开
//   • 连不上 Worker → 提示检查网络和地址; 没填地址 → 提示先填
// 需要 playwright, 没装则跳过。运行: node test/test-pack-error-v153.js
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const H    = require('./_harness');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('跳过: 未安装 playwright'); process.exit(0); }

const { ok, sec, done } = H.makeChecker();
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    const p   = path.join(H.DIR, path.normalize(rel));
    if (!p.startsWith(H.DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(buf);
    });
});

const EMPRO   = 'https://empro-tts.example.workers.dev';
const PICKY   = 'https://picky-tts.example.workers.dev';
const OFFLINE = 'https://down-tts.example.workers.dev';
const CORS    = { 'Access-Control-Allow-Origin': '*' };

function seed() {
    localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
    localStorage.setItem('hsv_kid_pref_display_name', 'T');
    localStorage.setItem('hsv_kid_pref_plan_mute', '1');
    return null;
}

// 点「下载音频包」, 等 waitMs 后读状态行 (足够让旧逻辑的状态刷新把原因盖掉)
async function clickDownload(page, proxy, waitMs) {
    await page.evaluate(p => window.DB.setPref('tts_proxy_url', p), proxy);
    await page.evaluate(() => document.getElementById('settings-pack-download').click());
    await page.waitForFunction(() => !document.getElementById('settings-pack-download').disabled,
                               null, { timeout: 15000 });
    await page.waitForTimeout(waitMs || 1500);
    return page.evaluate(() => document.getElementById('settings-pack-status').textContent);
}

(async () => {
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base    = 'http://127.0.0.1:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        const ctx    = await browser.newContext({ viewport: { width: 900, height: 1000 } });
        const page   = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => d.accept());
        await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
        await page.route(EMPRO + '/**', r => r.fulfill({
            status: 400, headers: CORS, body: 'Unknown or disallowed asset name' }));
        await page.route(PICKY + '/**', r => r.fulfill({
            status: 403, headers: CORS, body: 'Origin not allowed' }));
        await page.goto(base + '/__seed__', { waitUntil: 'load' });
        await page.evaluate(seed);
        await page.goto(base + '/index.html', { waitUntil: 'load' });
        await page.waitForTimeout(1500);

        sec('Worker 不认 VocabPeak 的文件名 (填成了 EMPro 的 Worker)');
        const s1 = await clickDownload(page, EMPRO);
        ok(/下载失败/.test(s1), '状态行显示下载失败', s1);
        ok(!/尚未安装/.test(s1), '失败原因没被「尚未安装音频包」盖掉', s1);
        ok(/不提供 VocabPeak 的音频包/.test(s1) && /EMPro/.test(s1), '说明是 Worker 不对, 点名 EMPro', s1);
        ok(s1.includes(EMPRO), '带上当前 TTS 代理地址', s1);
        await page.waitForTimeout(1500);
        const s1b = await page.evaluate(() => document.getElementById('settings-pack-status').textContent);
        ok(s1b === s1, '3 秒后原因仍在', s1b);

        sec('Worker 不放行当前网址');
        const s2 = await clickDownload(page, PICKY);
        ok(/不接受当前网址/.test(s2) && /jack-ee\.github\.io\/VocabPeak/.test(s2), '提示从正式网址打开', s2);

        sec('连不上 Worker');
        const s3 = await clickDownload(page, OFFLINE);
        ok(/连不上 Worker/.test(s3) && s3.includes(OFFLINE), '提示检查网络和地址, 带地址', s3);

        sec('没填 TTS 代理地址');
        const s4 = await clickDownload(page, '');
        ok(/先在「神经语音」里填 TTS 代理地址/.test(s4), '提示先填地址', s4);

        sec('其他');
        ok(await page.evaluate(() => document.getElementById('settings-pack-download').textContent !== 'Working…'),
           '按钮文字恢复');
        ok(errors.length === 0, '无页面报错', errors.join(' | '));
        await ctx.close();
    } finally {
        await browser.close();
        srv.close();
    }
    done('音频包下载失败提示 (v153)');
})().catch(e => { console.error(e); process.exit(1); });
