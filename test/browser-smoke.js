// browser-smoke.js — 真浏览器冒烟测试 (可选, 需要 playwright)
//   起一个本地静态服务器, 用 Chromium 打开 index.html (断开外网),
//   收集页面错误与 console.error, 并按方法探测各模块是否就位。
//   没装 playwright 时自动跳过 (npm i -D playwright && npx playwright install chromium)。
// 运行: node test/browser-smoke.js
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
srv.listen(0, async () => {
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('console', m => {
            if (m.type() === 'error' && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) {
                errors.push('console.error: ' + m.text());
            }
        });
        await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
        await page.goto('http://localhost:' + srv.address().port + '/index.html', { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        sec('页面错误');
        ok(errors.length === 0, '加载与启动过程无页面错误', errors.join(' | '));
        sec('模块就位');
        const probe = await page.evaluate(() => ({
            sync : typeof (window.SyncManager && window.SyncManager.init),
            db   : typeof (window.DB && window.DB.saveNotebook),
            les  : typeof (window.Lessons && window.Lessons.init),
            pack : typeof (window.TTSPack && window.TTSPack.playWord)
        }));
        ok(probe.sync === 'function', 'SyncManager.init 是函数 (不是浏览器自带的同名接口)');
        ok(probe.db === 'function' && probe.les === 'function' && probe.pack === 'function', 'DB / Lessons / TTSPack 就位');
    } finally {
        await browser.close();
        srv.close();
        done('真浏览器');
    }
});
