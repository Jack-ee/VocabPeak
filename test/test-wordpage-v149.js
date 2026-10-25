// test-wordpage-v149.js — 单词本整本并入的启动路径 + 紧凑排版 (真浏览器)
//   • 孩子平板 (1747 个内置词, 停在第 4 组第 18 个词): 升级后启动即并入,
//     单词页仍停在同一个词; 顶栏词数更新为总词库
//   • 配了同步但从没拉取过的新设备: 不在本机先并, 等云端数据到了再并
//   • 家长后台: 熟词 (斩) 单列
//   • 课文页: 列表头部两行、课内页头与三步切换并成一行
// 需要 playwright, 没装则跳过。运行: node test/test-wordpage-v149.js
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

async function fresh(browser, base, seed, vp) {
    const ctx  = await browser.newContext({ viewport: vp || { width: 1000, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
    // 先在同源的空白页上写种子, 免得应用在种子写入前后各跑一遍启动
    await page.goto(base + '/__seed__', { waitUntil: 'load' });
    await page.addScriptTag({ path: path.join(H.DIR, 'vocab-hs-data.js') });
    const info = await page.evaluate(seed);
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    return { ctx, page, errors, info };
}

srv.listen(0, async () => {
    const base    = 'http://localhost:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        sec('孩子平板: 升级即并入, 单词页停在同一个词');
        {
            const { ctx, page, errors, info } = await fresh(browser, base, () => {
                const nb = HS_VOCAB.slice(0, 1747).map((v, i) => ({
                    word: v.word, meaning: v.meaning || '', enDef: '', collo: '', colloCn: '', register: 'neutral',
                    context: '', focus: [], level: v.level || '', freq: v.freq ?? null, source: '高中核心词汇',
                    addedAt: 1761000000000 + i, srsLevel: i % 4, nextReview: i % 3 ? null : 1761000000000 }));
                localStorage.setItem('hsv_kid_notebook', JSON.stringify(nb));
                localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
                localStorage.setItem('hsv_kid_pref_display_name', 'T');
                localStorage.setItem('hsv_kid_pref_mw_progress',
                    JSON.stringify({ idx: 17, group: 3, mode: 'browse', view: 'cards', filter: 'all' }));
                return { at: nb[3 * 50 + 17].word, n: nb.length };
            });
            const st = await page.evaluate(() => ({
                word : document.querySelector('.mw-word2')?.textContent || '',
                n    : DB.loadNotebook().length,
                badge: document.getElementById('stat-notebook')?.textContent || '',
                flag : DB.getPref('lex3500_merged', ''),
                kept : DB.loadNotebook().filter(w => w.source === '高中核心词汇').length
            }));
            ok(st.flag === '1' && st.n > 3800, '启动即并入', JSON.stringify(st));
            ok(st.kept === info.n, '原有 ' + info.n + ' 个词条全部保留', st.kept);
            ok(st.word === info.at, '单词页仍停在原来那个词 (' + info.at + ')', st.word);
            ok(st.badge === String(st.n), '顶栏词数 = 总词库', st.badge);
            await page.waitForTimeout(1500);
            const toast = await page.evaluate(() => [...document.querySelectorAll('#toast-container .toast')].map(t => t.textContent).join(' | '));
            ok(/并入单词本/.test(toast) && /熟词/.test(toast), '提示孩子发生了什么', toast);
            ok(!errors.length, '无页面错误', errors.join(' | '));
            await ctx.close();
        }

        sec('配了同步但从没拉取过的新设备: 等云端数据');
        {
            const { ctx, page } = await fresh(browser, base, () => {
                localStorage.setItem('hsv_kid_notebook', JSON.stringify([{ word: 'bear', meaning: '熊', addedAt: 1 }]));
                localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
                localStorage.setItem('hsv_kid_pref_display_name', 'T');
                localStorage.setItem('hsv_sync_token', 'tok');
                localStorage.setItem('hsv_sync_gist_id', 'g1');
                return null;
            });
            const before = await page.evaluate(() => ({ n: DB.loadNotebook().length, flag: DB.getPref('lex3500_merged', '') }));
            ok(before.n === 1 && before.flag === '', '首次同步前不在本机并入', JSON.stringify(before));
            const after = await page.evaluate(() => {
                localStorage.setItem('hsv_sync_last_pull', String(Date.now()));
                window.dispatchEvent(new CustomEvent('hsv:datachanged', { detail: {} }));
                return { n: DB.loadNotebook().length, flag: DB.getPref('lex3500_merged', '') };
            });
            ok(after.n > 3800 && after.flag === '1', '云端数据到了 (hsv:datachanged) 再并', JSON.stringify(after));
            await ctx.close();
        }

        sec('家长后台: 熟词 (斩) 单列');
        {
            const ctx  = await browser.newContext();
            const dash = await ctx.newPage();
            await dash.goto(base + '/dashboard.html', { waitUntil: 'load' });
            const s = await dash.evaluate(() => computeStats({ days: [], stats: {}, notebook: [
                { word: 'a', nextReview: Date.now() + 3650 * 86400000 },
                { word: 'b', srsLevel: 5, nextReview: Date.now() + 60 * 86400000 },
                { word: 'c', srsLevel: 2 }, { word: 'd' }] }));
            ok(s.cut === 1 && s.mastered === 1 && s.learning === 1 && s.fresh === 1 && s.vocab === 4,
               '熟词不算已掌握也不算新词', JSON.stringify(s));
            await ctx.close();
        }

        sec('课文页紧凑排版');
        for (const vp of [{ width: 1000, height: 900 }, { width: 390, height: 844 }]) {
            const { ctx, page } = await fresh(browser, base, () => {
                localStorage.setItem('hsv_kid_notebook', JSON.stringify([{ word: 'bear', meaning: '熊', addedAt: 1 }]));
                localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
                localStorage.setItem('hsv_kid_pref_display_name', 'T');
                return null;
            }, vp);
            await page.click('.nav-tab[data-nav="lessons"]');
            await page.waitForSelector('.ls-card');
            const lay = await page.evaluate(() => {
                const top  = document.querySelector('.ls-home-top').getBoundingClientRect();
                const card = document.querySelector('.ls-card').getBoundingClientRect();
                const nav  = document.querySelector('.app-nav').getBoundingClientRect();
                return { gap: Math.round(card.top - nav.bottom), topH: Math.round(top.height),
                         over: document.documentElement.scrollWidth > window.innerWidth };
            });
            const lim = vp.width < 700 ? 170 : 120;      // 窄屏练习条折成两行
            ok(lay.gap < lim && lay.topH < 48 && !lay.over,
               vp.width + 'px: 导航下方 ' + lim + 'px 内出现第一张课程卡, 无横向滚动', JSON.stringify(lay));
            await page.locator('.ls-card').first().click();
            await page.waitForSelector('.ls-text');
            const rd = await page.evaluate(() => {
                const head = document.querySelector('.ls-top .ls-head').getBoundingClientRect();
                const tabs = document.querySelector('.ls-top .ls-tabs').getBoundingClientRect();
                const text = document.querySelector('.ls-text').getBoundingClientRect();
                const nav  = document.querySelector('.app-nav').getBoundingClientRect();
                return { oneRow: Math.abs(head.top - tabs.top) < 12, gap: Math.round(text.top - nav.bottom),
                         over: document.documentElement.scrollWidth > window.innerWidth };
            });
            ok((vp.width < 700 || rd.oneRow) && rd.gap < (vp.width < 700 ? 160 : 110) && !rd.over,
               vp.width + 'px: 课内页正文紧接页头' + (vp.width >= 700 ? ' (页头与三步切换同一行)' : ''), JSON.stringify(rd));
            await ctx.close();
        }
    } catch (e) {
        ok(false, '测试异常', e.message);
    } finally {
        await browser.close();
        srv.close();
        done('单词本并入 + 紧凑排版 (v149)');
    }
});
