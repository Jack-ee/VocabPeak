// test-sw-offline-v148.js — 离线时 AI 短文不被误删 (真 Service Worker)
//   v148 审查发现: 离线时 SW 的网络优先回退会用 ignoreSearch 交回最老的
//   一份缓存 manifest, Stories.check() 据此把新篇目当成已下架删掉。修复:
//   带 t= 的请求只走网络不入缓存; stories.js 另有「清单不倒退」保护。
//   需要 playwright, 没装则跳过。
// 运行: node test/test-sw-offline-v148.js
'use strict';
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const H      = require('./_harness');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('跳过: 未安装 playwright'); process.exit(0); }

const { ok, sec, done } = H.makeChecker();
const sha  = t => crypto.createHash('sha256').update(t).digest('hex');
const s1   = fs.readFileSync(path.join(H.DIR, 'stories/S0001.json'), 'utf8');
const s2   = fs.readFileSync(path.join(H.DIR, 'stories/S0002.json'), 'utf8');
const e1   = { id: 'S0001', _v: JSON.parse(s1)._v, file: 'S0001.json', sha256: sha(s1) };
const e2   = { id: 'S0002', _v: JSON.parse(s2)._v, file: 'S0002.json', sha256: sha(s2) };
let manifest = { generation: '2026-10-25T00:00:00', stories: [e1] };

const MIME = { '.js': 'application/javascript', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/probe.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<!doctype html><meta charset=utf-8><script src="config.js"></script><script src="stories.js"></script>');
    }
    if (u.pathname === '/stories/stories-manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(manifest));
    }
    const p = path.join(H.DIR, decodeURIComponent(u.pathname));
    if (!p.startsWith(H.DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
});

srv.listen(0, async () => {
    const base    = 'http://localhost:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        const ctx  = await browser.newContext();
        const page = await ctx.newPage();
        await page.goto(base + '/probe.html');
        await page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
        await page.reload();
        ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'SW 已接管页面');
        await page.evaluate(() => Stories.load());

        sec('联网: 先 1 篇, 再 2 篇');
        await page.evaluate(() => Stories.check(false));
        manifest = { generation: '2026-10-25T01:00:00', stories: [e1, e2] };
        await page.evaluate(() => Stories.check(false));
        ok(JSON.stringify(await page.evaluate(() => Stories.list().map(s => s.id))) === '["S0001","S0002"]', '两篇都到位');

        sec('断网再检查');
        await ctx.setOffline(true);
        const r = await page.evaluate(() => Stories.check(false));
        ok(r && r.error, '离线检查失败返回, 不拿缓存旧清单', JSON.stringify(r));
        const keys = await page.evaluate(() => new Promise(res => {
            const q = indexedDB.open('hsv_stories', 1);
            q.onsuccess = () => { const g = q.result.transaction('stories').objectStore('stories').getAllKeys(); g.onsuccess = () => res(g.result); };
        }));
        ok(JSON.stringify(keys) === '["S0001","S0002"]', 'IndexedDB 里两篇都还在', JSON.stringify(keys));
        const cached = await page.evaluate(async () => {
            let n = 0;
            for (const name of await caches.keys()) {
                for (const req of await (await caches.open(name)).keys()) if (/[?&]t=/.test(req.url)) n++;
            }
            return n;
        });
        ok(cached === 0, '带 t= 的请求没有进 SW 缓存', cached);
    } catch (e) {
        ok(false, '测试异常', e && e.stack);
    } finally {
        await browser.close();
        srv.close();
        done('离线短文 v148');
    }
});
