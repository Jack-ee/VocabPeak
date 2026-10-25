// test-book-v152.js — 默写本页 (真浏览器, 整站加载)
//   • 数据与 PDF 逐行一致: 3929 行的序号、页码、英文与 tools/lexicon 的提取结果完全相同
//   • 切到「默写本」才加载数据; 翻页 (按钮 / 输入页码 / ← →)、找序号或单词、记住页码
//   • 每行的单词本状态 (熟词 / 已学 / 薄弱); 遮住英文点一下看答案
//   • 词卡: 音标中文、搭配、短文原句与「读这篇」、斩 / 取消斩、卡内上一个 / 下一个
//   • 默写这一页 → 今日任务整页听写; 今日任务卡「看第 N 页」→ 默写本
//   • 窄屏不横向溢出
// 需要 playwright, 没装则跳过。运行: node test/test-book-v152.js
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

// PDF 提取结果 (序号 / 页码) 与还原的英文
const ROWS  = JSON.parse(fs.readFileSync(path.join(H.DIR, 'tools/lexicon/list3500-rows.json'), 'utf8'));
const WORDS = {};
fs.readFileSync(path.join(H.DIR, 'tools/lexicon/list3500-words.txt'), 'utf8').split('\n').forEach(l => {
    const m = l.trim().match(/^(\d+)\s+(.+)$/);
    if (m) WORDS[m[1]] = m[2];
});

function seedKid() {
    const old = Date.now() - 5 * 86400000;
    const nb  = HS_VOCAB.slice(0, 1615).map((v, i) => {
        const e = { word: v.word, meaning: v.meaning || '', level: v.level, source: '高中核心词汇', addedAt: i + 1 };
        if (i < 300) { e.srsLevel = 2; e.lastReview = old; e.nextReview = Date.now() + 3 * 86400000; e.reviewCount = 2; }
        return e;
    });
    const ab = nb.find(e => e.word === 'abrupt'); if (ab) ab.focus = ['weak'];
    localStorage.setItem('hsv_kid_notebook', JSON.stringify(nb));
    localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
    localStorage.setItem('hsv_kid_pref_display_name', 'T');
    localStorage.setItem('hsv_kid_pref_plan_mute', '1');
    return null;
}
async function fresh(browser, base, vp) {
    const ctx  = await browser.newContext({ viewport: vp || { width: 900, height: 1000 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
    await page.goto(base + '/__seed__', { waitUntil: 'load' });
    await page.addScriptTag({ path: path.join(H.DIR, 'vocab-hs-data.js') });
    await page.evaluate(seedKid);
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.Stories && Stories.check(true));
    await page.waitForTimeout(800);
    return { ctx, page, errors };
}
const rowNs = (page) => page.evaluate(() => [...document.querySelectorAll('.bk-row')].map(r => Number(r.dataset.n)));

srv.listen(0, async () => {
    const base    = 'http://localhost:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        sec('数据与 PDF 逐行一致');
        {
            const { ctx, page, errors } = await fresh(browser, base);
            ok(await page.evaluate(() => typeof window.HSV_BOOK === 'undefined'), '启动时不加载默写本数据');
            await page.click('.nav-tab[data-nav="book"]');
            await page.waitForSelector('.bk-row');
            const B = await page.evaluate(() => ({ rows: HSV_BOOK.rows.map(r => [r[0], r[1], Book.pageOf(r[0])]) }));
            const want = ROWS.map(r => [r.n, WORDS[String(r.n)], r.page - 1]);
            const diff = want.filter((w, i) => !B.rows[i] || B.rows[i][0] !== w[0] || B.rows[i][1] !== w[1] || B.rows[i][2] !== w[2]);
            ok(B.rows.length === 3929 && diff.length === 0, '3929 行的序号、英文、页码与 PDF 提取完全一致',
               B.rows.length + ' 行, 不一致 ' + diff.length + (diff[0] ? ' 例 ' + JSON.stringify(diff[0]) : ''));
            const ns = await rowNs(page);
            ok(ns.length === 32 && ns[0] === 1 && ns[31] === 32, '第 1 页 32 行 #1–#32', ns.length);
            const r2 = await page.evaluate(() => [...document.querySelectorAll('.bk-row[data-n="2"] span')].map(s => s.textContent.trim()));
            ok(r2[0] === '2' && r2[1] === 'abandon' && /bænd/.test(r2[2]) && /抛弃/.test(r2[3]), '每行: 序号 · 英文 · 音标 · 中文', r2.join(' | '));
            const st = await page.evaluate(() => ({
                a: document.querySelector('.bk-row[data-n="1"] .bk-st').textContent,
                ab: document.querySelector('.bk-row[data-n="2"] .bk-st').textContent,
                weak: [...document.querySelectorAll('.bk-row')].find(r => r.querySelector('.bk-en').textContent === 'abrupt')?.querySelector('.bk-st').textContent }));
            ok(st.a === '熟词' && st.ab === '已学' && st.weak === '薄弱', '每行显示单词本状态', JSON.stringify(st));
            ok(!errors.length, '无页面错误', errors.join(' | '));
            await ctx.close();
        }

        sec('翻页、找词、记住页码');
        {
            const { ctx, page } = await fresh(browser, base);
            await page.click('.nav-tab[data-nav="book"]');
            await page.waitForSelector('.bk-row');
            ok(await page.locator('#bk-prev').isDisabled(), '第 1 页没有上一页');
            await page.click('#bk-next');
            ok((await rowNs(page))[0] === 33 && (await page.inputValue('#bk-page')) === '2', '下一页: 第 2 页从 #33 开始');
            await page.keyboard.press('ArrowRight');
            ok((await page.inputValue('#bk-page')) === '3', '→ 键翻页');
            await page.keyboard.press('ArrowLeft');
            await page.fill('#bk-page', '120');
            await page.press('#bk-page', 'Enter');
            const last = await rowNs(page);
            ok(last[last.length - 1] === 3934 && await page.locator('#bk-next').isDisabled(), '输入页码跳到第 120 页 (最后 #3934)');
            await page.fill('#bk-find', '1234');
            await page.press('#bk-find', 'Enter');
            const f1 = await page.evaluate(() => ({ pg: document.getElementById('bk-page').value, hl: document.querySelector('.bk-row.hl')?.dataset.n }));
            const want = String(ROWS.find(r => r.n === 1234).page - 1);
            ok(f1.pg === want && f1.hl === '1234', '找序号 1234: 跳到它那一页并标出来', JSON.stringify(f1) + ' 应为第 ' + want + ' 页');
            await page.fill('#bk-find', 'Abandon');
            await page.press('#bk-find', 'Enter');
            const f2 = await page.evaluate(() => ({ pg: document.getElementById('bk-page').value, hl: document.querySelector('.bk-row.hl')?.dataset.n }));
            ok(f2.pg === '1' && f2.hl === '2', '找单词 abandon: 第 1 页 #2', JSON.stringify(f2));
            await page.fill('#bk-page', '5');
            await page.press('#bk-page', 'Enter');
            await page.reload({ waitUntil: 'load' });
            await page.waitForTimeout(1200);
            await page.click('.nav-tab[data-nav="book"]').catch(() => {});
            await page.waitForSelector('.bk-row');
            ok((await page.inputValue('#bk-page')) === '5', '重新打开回到上次看的第 5 页');
            await ctx.close();
        }

        sec('遮住英文 / 词卡');
        {
            const { ctx, page } = await fresh(browser, base);
            await page.click('.nav-tab[data-nav="book"]');
            await page.waitForSelector('.bk-row');
            await page.click('#bk-hide');
            ok(await page.locator('.bk-en.covered').count() === 32 && /显示英文/.test(await page.locator('#bk-hide').innerText()), '遮住英文: 整页 32 个都遮住');
            await page.click('.bk-row[data-n="3"] .bk-en');
            ok((await page.locator('.bk-row[data-n="3"] .bk-en').innerText()) === 'ability' && await page.locator('.bk-en.covered').count() === 31
               && !(await page.locator('#bk-sheet-ov.open').count()), '点遮住的英文: 只揭开这一个, 不弹词卡');
            await page.click('#bk-hide');
            await page.locator('.bk-row[data-n="2"] .bk-zh').click();
            await page.waitForSelector('#bk-sheet-ov.open');
            const sh = await page.locator('#bk-sheet').innerText();
            ok(/默写本 #2 · 第 1 页/.test(sh) && /abandon/.test(sh) && /抛弃/.test(sh) && /abandon hope/.test(sh), '词卡: 序号页码、中文、搭配', sh.slice(0, 120).replace(/\s+/g, ' '));
            ok(/读这篇短文 S\d{4}/.test(sh) && /abandon/i.test(await page.locator('.bk-ex-en').innerText()), '词卡: AI 短文原句与「读这篇」');
            await page.click('#bk-sh-next');
            ok(/默写本 #3/.test(await page.locator('#bk-sheet').innerText()), '卡内「下一个」看 #3');
            await page.keyboard.press('ArrowLeft');
            ok(/默写本 #2/.test(await page.locator('#bk-sheet').innerText()), '← 键回到 #2');
            // 斩 / 取消斩
            await page.click('#bk-sh-x');
            await page.locator('.bk-row[data-n="3"] .bk-zh').click();
            await page.click('#bk-cut');
            const c1 = await page.evaluate(() => ({ cut: DB.isCut(DB.loadNotebook().find(w => w.word === 'ability')),
                                                    chip: document.querySelector('.bk-row[data-n="3"] .bk-st').textContent }));
            ok(c1.cut && c1.chip === '熟词' && await page.locator('#bk-uncut').count() === 1, '词卡里斩: 单词本和这一行都变成熟词', JSON.stringify(c1));
            await page.click('#bk-uncut');
            ok(!(await page.evaluate(() => DB.isCut(DB.loadNotebook().find(w => w.word === 'ability')))), '取消斩');
            // 读这篇
            await page.locator('.bk-link[data-story]').click();
            await page.waitForSelector('.ls-text');
            ok(await page.locator('#view-lessons.active').count() === 1 && /S\d{4}/.test(await page.locator('.ls-head-sub').innerText()),
               '「读这篇短文」切到课文页并打开那篇');
            await ctx.close();
        }

        sec('默写这一页 / 今日任务卡联动');
        {
            const { ctx, page } = await fresh(browser, base);
            await page.click('.nav-tab[data-nav="book"]');
            await page.waitForSelector('.bk-row');
            await page.click('#bk-next');
            await page.click('#bk-dic');
            ok(/默写第 2 页/.test(await page.locator('#dl-stage').innerText()), '「默写这一页」打开今日任务的整页听写 (第 2 页)');
            await page.click('#dl-close');
            await page.click('.nav-tab[data-nav="my-words"]');
            await page.evaluate(() => { DB.setPref('plan_page', '7'); Daily.renderCard(); });
            await page.click('#dl-pagebook');
            await page.waitForSelector('#view-book.active .bk-row');
            ok((await page.inputValue('#bk-page')) === '7', '今日任务卡「看第 7 页」打开默写本第 7 页');
            await ctx.close();
        }

        sec('窄屏');
        {
            const { ctx, page } = await fresh(browser, base, { width: 390, height: 844 });
            await page.click('.nav-tab[data-nav="book"]');
            await page.waitForSelector('.bk-row');
            const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
            ok(!over, '390px 宽不横向溢出');
            await page.locator('.bk-row[data-n="2"]').click();
            const box = await page.locator('#bk-sheet').boundingBox();
            ok(box && box.width <= 390 && box.y > 0, '词卡从底部弹出, 不超出屏幕', JSON.stringify(box));
            await ctx.close();
        }
    } catch (e) {
        ok(false, '测试异常', e.stack || e.message);
    } finally {
        await browser.close();
        srv.close();
        done('默写本 (v152)');
    }
});
