// test-enrich-v154.js — 单词卡详细信息一次补齐
//   • 数据: 词库每个词头都有一条, 每条过 tools/enrich/validate.js 的检查, 搭配与中文一一对应
//   • 单词页: 3500 词的卡片显示英文释义 / 搭配中文 / 例句 / 提示, 不再标 needs enrich;
//     自己的内容优先; 只补显示, 单词本存储一个字节都不变; AI 丰富只数自己加的词
//   • 今日任务新词卡、默写本词卡也用上
// 需要 playwright (浏览器部分), 没装则只跑数据检查。运行: node test/test-enrich-v154.js
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const H    = require('./_harness');
const { checkEntry } = require('../tools/enrich/validate.js');

const { ok, sec, done } = H.makeChecker();

// ─── 数据 ───────────────────────────────────────────────
sec('数据完整');
const box = {};
new Function('window', fs.readFileSync(path.join(H.DIR, 'lexicon-3500.js'), 'utf8'))(box);
new Function('window', fs.readFileSync(path.join(H.DIR, 'enrich-3500.js'), 'utf8'))(box);
const LEX = box.HSV_LEXICON.words.map(w => w[0]).filter(w => !/ (ad|pro)$/.test(w));
const ENR = box.HSV_ENRICH.words;
const missing = LEX.filter(w => !ENR[w]);
ok(missing.length === 0, '词库 ' + LEX.length + ' 个词头都有详细信息', '缺 ' + missing.length + ': ' + missing.slice(0, 8).join(', '));
ok(box.HSV_ENRICH.count === Object.keys(ENR).length, 'count 与条目数一致', box.HSV_ENRICH.count);
const bad = [];
for (const [w, r] of Object.entries(ENR)) {
    const cs = r[2].split(' · '), cz = r[3].split(' · ');
    const rec = { w, def: r[0], reg: r[1], col: cs.map((c, i) => [c, cz[i] || '']), ex: r[4], exCn: r[5], note: r[6] };
    const errs = checkEntry(rec).filter(x => x.level === 'error');
    if (cs.length !== cz.length) errs.push({ msg: '搭配与中文个数不同' });
    if (errs.length) bad.push(w + ': ' + errs.map(x => x.msg).join('; '));
}
ok(bad.length === 0, '每条都过校验 (释义英文、2–3 个搭配配中文、例句含该词、提示中文)', bad.slice(0, 5).join(' | '));
const sizeKB = fs.statSync(path.join(H.DIR, 'enrich-3500.js')).size / 1024;
ok(sizeKB < 2600, '数据文件 ' + sizeKB.toFixed(0) + ' KB (空闲时才加载)');
const sw = fs.readFileSync(path.join(H.DIR, 'sw.js'), 'utf8');
ok(/'\.\/enrich\.js'/.test(sw) && /'\.\/enrich-3500\.js'/.test(sw), 'SW 预缓存 enrich.js 与数据, 离线可用');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('跳过浏览器部分: 未安装 playwright'); done('单词卡详细信息 (v154)'); return; }

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

// 小单词本: accept (像截图那样只有音标、中文、一个搭配)、abandon (自己写过例句)、一个自己加的生词
function seedSmall() {
    const nb = [
        { word: 'accept',  meaning: 'vt.接受', phonetic: '/əkˈsept/', collo: 'accept an offer', colloCn: '', enDef: '', register: 'neutral',
          context: '', focus: [], source: '默写本 #25', addedAt: 1 },
        { word: 'abandon', meaning: 'v.抛弃，舍弃，放弃', phonetic: '/əˈbændən/', collo: 'abandon hope', colloCn: '', enDef: '', register: 'neutral',
          context: 'My own sentence about how we abandon old habits.', contextCn: '我自己写的句子。', focus: [], source: '默写本 #2', addedAt: 2 },
        { word: 'zyxwvut', meaning: '测试生词', phonetic: '', collo: '', colloCn: '', enDef: '', register: 'neutral',
          context: '', focus: [], source: 'manual', addedAt: 3 },
    ];
    localStorage.setItem('hsv_kid_notebook', JSON.stringify(nb));
    localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
    localStorage.setItem('hsv_kid_pref_lex3500_merged', '1');
    localStorage.setItem('hsv_kid_pref_display_name', 'T');
    localStorage.setItem('hsv_kid_pref_plan_mute', '1');
    return null;
}
async function fresh(browser, base, vp) {
    const ctx  = await browser.newContext({ viewport: vp || { width: 1000, height: 1000 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
    await page.goto(base + '/__seed__', { waitUntil: 'load' });
    await page.evaluate(seedSmall);
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => window.HSVEnrich && window.HSVEnrich.ready(), null, { timeout: 15000 });
    await page.waitForTimeout(400);
    return { ctx, page, errors };
}
async function goWord(page, w) {
    await page.click('.nav-tab[data-nav="my-words"]').catch(() => {});
    await page.fill('#mw-single-input', w);
    await page.waitForSelector(`.mw-sd-item[data-word="${w}"]`);
    await page.click(`.mw-sd-item[data-word="${w}"]`);
    await page.waitForTimeout(200);
    return page.locator('.mw-card').innerText();
}

srv.listen(0, async () => {
    const base    = 'http://localhost:' + srv.address().port;
    const browser = await chromium.launch();
    const A       = ENR.accept;
    try {
        sec('单词页卡片');
        {
            const { ctx, page, errors } = await fresh(browser, base);
            const before = await page.evaluate(() => localStorage.getItem('hsv_kid_notebook'));
            const t = await goWord(page, 'accept');
            const col0 = A[2].split(' · ')[0], cn0 = A[3].split(' · ')[0];
            ok(t.includes(A[0]), '英文释义', A[0]);
            ok(t.includes(col0) && t.includes(cn0), '搭配配中文', col0 + ' / ' + cn0);
            ok(t.includes(A[4]) && t.includes(A[5]), '例句与翻译', A[4]);
            ok(t.includes(A[6]), '用法提示', A[6]);
            ok(!/needs enrich/.test(t), '不再标 needs enrich');
            ok(/accept an offer/.test(t), '原有搭配保留');
            const t2 = await goWord(page, 'abandon');
            ok(t2.includes('My own sentence about how we abandon old habits.') && !t2.includes(ENR.abandon[4]),
               '自己写过的例句优先, 不被覆盖');
            ok(t2.includes(ENR.abandon[0]), '其余空字段照样补上');
            const t3 = await goWord(page, 'zyxwvut');
            ok(/needs enrich/.test(t3), '自己加的生词 (数据里没有) 仍标 needs enrich');
            const cnt = await page.locator('#mw-enrich-count').innerText();
            ok(cnt.trim() === '(1)', 'AI 丰富只数自己加的词', cnt);
            const after = await page.evaluate(() => localStorage.getItem('hsv_kid_notebook'));
            ok(before === after, '只补显示: 单词本存储一个字节都没变 (同步数据不变大)');
            ok(!errors.length, '无页面错误', errors.join(' | '));
            await ctx.close();
        }

        sec('今日任务新词卡 / 默写本词卡');
        {
            const { ctx, page } = await fresh(browser, base);
            await page.click('.nav-tab[data-nav="my-words"]').catch(() => {});
            await page.click('#dl-start');
            await page.waitForSelector('.dl-learn');
            const w  = (await page.locator('.dl-word').innerText()).replace(/\s*\u{1F50A}.*/u, '').trim();
            const lt = await page.locator('.dl-learn').innerText();
            ok(ENR[w] && lt.includes(ENR[w][6]), '新词卡显示用法提示 (' + w + ')');
            ok(ENR[w] && lt.includes(ENR[w][3].split(' · ')[0]), '新词卡搭配带中文');
            await page.click('#dl-close');
            await page.click('.nav-tab[data-nav="book"]');
            await page.waitForSelector('.bk-row');
            await page.locator('.bk-row[data-n="25"] .bk-zh').click();
            await page.waitForSelector('#bk-sheet-ov.open');
            const sh = await page.locator('#bk-sheet').innerText();
            ok(sh.includes(A[0]) && sh.includes(A[3].split(' · ')[0]) && sh.includes(A[6]), '默写本词卡: 英文释义、搭配中文、提示');
            ok(await page.locator('.bk-ex-en').count() === 1, '默写本词卡有例句');
            await ctx.close();
        }
    } catch (e) {
        ok(false, '测试异常', e.stack || e.message);
    } finally {
        await browser.close();
        srv.close();
        done('单词卡详细信息 (v154)');
    }
});
