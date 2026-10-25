// test-daily-v150.js — 今日任务 + 默写本页码 (真浏览器, 整站加载)
//   • 任务推导: 到期按今天结束前算、薄弱优先、新词按默写本顺序/起始页、三档题量
//   • 一轮做完: 复习答错本轮再考 (只记一次账)、新词斩掉补位、自测记 learnedAt、
//     默写对/错/英美拼写、写错照写一遍; 中途关掉再开从剩下的接着做
//   • 默写一页 (含熟词, 写错的熟词取消斩); 再学 5 个
//   • 测试设备不写单词本; 时长记 daily 桶; 当天完成情况进 day_ 日志与家长后台
//   • 默写本页码: pageOf 边界、短文页码范围、按页找短文
//   • 同步: spellAt 随学习状态合并, learnedAt 不丢
// 需要 playwright, 没装则跳过。运行: node test/test-daily-v150.js
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

// 孩子平板: 1615 个内置核心词, 前 300 个复习过 (多数 5 天前到期), 已并入 3500
function seedKid() {
    const old = Date.now() - 5 * 86400000;
    const nb  = HS_VOCAB.slice(0, 1615).map((v, i) => {
        const e = { word: v.word, meaning: v.meaning || '', level: v.level, source: '高中核心词汇', addedAt: i + 1 };
        if (i < 300) {
            e.srsLevel = 1 + i % 3; e.lastReview = old; e.reviewCount = 2;
            e.nextReview = i % 4 ? old + 86400000 : Date.now() + 9 * 86400000;
        }
        return e;
    });
    nb[250].focus = ['weak'];                                   // 薄弱词排最前
    const eve = new Date(); eve.setHours(23, 0, 0, 0);
    nb[299].nextReview = eve.getTime();                         // 今晚 23 点到期: 现在也算
    localStorage.setItem('hsv_kid_notebook', JSON.stringify(nb));
    localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
    localStorage.setItem('hsv_kid_pref_display_name', 'T');
    return { weak: nb[250].word, eve: nb[299].word };
}

async function fresh(browser, base, seed, vp) {
    const ctx  = await browser.newContext({ viewport: vp || { width: 800, height: 1100 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());
    await page.goto(base + '/__seed__', { waitUntil: 'load' });
    await page.addScriptTag({ path: path.join(H.DIR, 'vocab-hs-data.js') });
    const info = await page.evaluate(seed);
    await page.goto(base + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.Stories && Stories.check(true));
    await page.waitForTimeout(800);
    await page.evaluate(() => { localStorage.setItem('hsv_kid_pref_plan_mute', '1'); Daily.renderCard(); });
    return { ctx, page, errors, info };
}
const stage = (page) => page.locator('#dl-stage').innerText();
const nbOf  = (page, w) => page.evaluate((x) => DB.loadNotebook().find(e => e.word === x), w);

srv.listen(0, async () => {
    const base    = 'http://localhost:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        sec('默写本页码');
        {
            const { ctx, page } = await fresh(browser, base, () => null);
            const pg = await page.evaluate(() => ({
                n: HSVLex.pageCount(), p1: HSVLex.pageOf(1), p32: HSVLex.pageOf(32), p33: HSVLex.pageOf(33),
                last: HSVLex.pageOf(3934), zero: HSVLex.pageOf(0), span1: HSVLex.pageSpan(1),
                s1: HSVLex.storySpan(Stories.byId('S0001'))
            }));
            ok(pg.n === 120 && pg.p1 === 1 && pg.p32 === 1 && pg.p33 === 2 && pg.last === 120 && pg.zero === 0,
               '序号换算页码: #1–#32 第 1 页, #33 第 2 页, 共 120 页', JSON.stringify(pg));
            ok(pg.s1 && pg.s1.n0 === 3 && pg.s1.n1 === 136 && pg.s1.p0 === 1 && pg.s1.p1 === 5,
               'S0001 覆盖 #3–#136 (第 1–5 页)', JSON.stringify(pg.s1));
            await page.click('.nav-tab[data-nav="lessons"]');
            await page.click('.ls-src-btn[data-src="ai"]');
            await page.waitForSelector('.ls-card-ai');
            ok(/第 1–5 页/.test(await page.locator('.ls-card[data-lesson="S0001"]').innerText()), '短文卡片标出页码');
            ok(/默写本第 1–\d+ 页/.test(await page.locator('.ls-group-head').first().innerText()), '分组标题标出页码');
            await page.fill('#ls-page-q', '3-5');
            await page.press('#ls-page-q', 'Enter');
            await page.waitForSelector('.ls-pq-note');
            const f = await page.evaluate(() => {
                const ids  = [...document.querySelectorAll('.ls-card-ai')].map(c => c.dataset.lesson);
                const hit  = (id) => Stories.byId(id).words.filter(w => { const p = HSVLex.pageOf(w.n3500); return p >= 3 && p <= 5; }).length;
                const all  = Stories.list().filter(s => hit(s.id) > 0).length;
                const hs   = ids.map(hit);
                return { n: ids.length, all, sorted: hs.every((v, i) => !i || v <= hs[i - 1]),
                         heads: document.querySelectorAll('.ls-group-head:not(.ls-pq-note)').length,
                         pref: DB.getPref('story_page_q', ''), badge: document.querySelector('.ls-badge-page')?.textContent || '' };
            });
            ok(f.n === f.all && f.n > 0 && f.sorted && f.heads === 0 && f.pref === '3-5' && /含本范围 \d+ 词/.test(f.badge),
               '按页找短文: 只列含这几页单词的篇目, 按含词数排序', JSON.stringify(f));
            await page.click('#ls-page-x');
            ok(await page.locator('.ls-card-ai').count() === 107 && !(await page.locator('.ls-pq-note').count()), '清除后恢复全部短文');
            await page.locator('.ls-card[data-lesson="S0001"]').click();
            ok(/#3–#136（第 1–5 页）/.test(await page.locator('.ls-head-sub').innerText()), '阅读页头标出序号与页码');
            await ctx.close();
        }

        sec('任务推导');
        {
            const { ctx, page, errors, info } = await fresh(browser, base, seedKid);
            const c = await page.evaluate(() => {
                const c = Daily.compute();
                return { rev: c.rev.map(w => w.word), neu: c.neu.map(w => w.word), dic: c.dic.length, min: c.leftMin,
                         page: c.page, cutNew: c.neu.some(w => DB.isCut(w)), pages: c.neu.map(w => HSVLex.pageOf((HSV_LEXICON.words.find(x => x[0] === w.word) || [])[1])) };
            });
            ok(c.rev.length === 20 && c.neu.length === 10 && c.dic === 0, '标准档: 复习 20、新词 10', JSON.stringify({ r: c.rev.length, n: c.neu.length }));
            ok(c.rev[0] === info.weak, '薄弱词排在复习最前', c.rev[0]);
            const due = await page.evaluate((w) => Daily._isDueWord(DB.loadNotebook().find(e => e.word === w)), info.eve);
            ok(due, '今晚 23 点到期的词现在就算到期 (晚自习后 21 点做也不漏)');
            ok(!c.cutNew && c.pages.every((p, i) => !i || p >= c.pages[i - 1]), '新词不含熟词, 按默写本顺序', c.pages.join(','));
            ok(c.min >= 5 && c.min <= 9, '估时 5–9 分钟', c.min);
            const card = await page.locator('#daily-card').innerText();
            ok(/今日任务/.test(card) && /复习\s*20/.test(card) && /新词\s*10/.test(card) && /默写本第/.test(card), '单词页顶部任务卡', card.replace(/\s+/g, ' '));
            await page.selectOption('#dl-size', 'light');
            const l = await page.evaluate(() => { const c = Daily.compute(); return [c.rev.length, c.neu.length]; });
            ok(l[0] === 15 && l[1] === 5, '轻量档: 复习 15、新词 5', l.join('/'));
            await page.selectOption('#dl-size', 'std');
            await page.fill('#dl-page', '10');
            await page.press('#dl-page', 'Enter');
            await page.waitForTimeout(100);
            const p10 = await page.evaluate(() => Daily.compute().neu.map(w => HSVLex.pageOf((HSV_LEXICON.words.find(x => x[0] === w.word) || [])[1])));
            ok(p10.length === 10 && p10.every(p => p >= 10), '设「从第 10 页起」后新词都在第 10 页以后', p10.join(','));
            await page.fill('#dl-page', '1');
            await page.press('#dl-page', 'Enter');
            ok(!errors.length, '无页面错误', errors.join(' | '));
            await ctx.close();
        }

        sec('一轮做完 (复习 → 新词 → 自测 → 默写)');
        {
            const { ctx, page, errors } = await fresh(browser, base, seedKid);
            const plan = await page.evaluate(() => { const c = Daily.compute(); return { rev: c.rev.map(w => w.word), neu: c.neu.map(w => w.word) }; });
            await page.click('#dl-start');
            ok(await stage(page) === '复习' && await page.locator('.dl-opt').count() === 4, '开始: 复习题四个选项');
            // 第一题答错
            const w0  = await page.locator('.dl-word').innerText();
            const b0  = await nbOf(page, plan.rev[0]);
            await page.click('.dl-opt[data-ok="0"]');
            await page.waitForSelector('#dl-next');
            const a0 = await nbOf(page, plan.rev[0]);
            ok(w0.indexOf(plan.rev[0]) === 0 && a0.srsLevel === 0 && a0.reviewCount === (b0.reviewCount || 0) + 1 && a0.wrongCount === 1
               && a0.focus.includes('weak'), '答错: SRS 归零、记一次错、打薄弱', JSON.stringify({ l: a0.srsLevel, rc: a0.reviewCount, wc: a0.wrongCount }));
            await page.click('#dl-next');
            // 其余答对, 直到「再考一次」
            let again = false;
            for (let k = 0; k < 30 && (await stage(page)) === '复习'; k++) {
                if (await page.locator('.dl-tag', { hasText: '再考一次' }).count()) again = true;
                await page.click('.dl-opt[data-ok="1"]');
                await page.waitForTimeout(700);
            }
            const a1 = await nbOf(page, plan.rev[0]);
            ok(again && a1.reviewCount === a0.reviewCount && a1.wrongCount === 1, '答错的词本轮最后再考一次, 不重复记账');
            const r1 = await nbOf(page, plan.rev[1]);
            ok(r1.srsLevel >= 2 && Date.now() - r1.lastReview < 60000, '答对: SRS 升级', JSON.stringify({ l: r1.srsLevel }));
            ok(await stage(page) === '新词' && /默写本 #\d+/.test(await page.locator('.dl-tag').innerText()), '进入新词卡片, 标出默写本序号');
            const ex = await page.locator('.dl-ex').count();
            ok(ex === 1, '新词卡带 AI 短文原句');
            // 第一个新词斩掉, 应补一个
            const firstNew = plan.neu[0];
            await page.click('#dl-cut');
            ok(await page.evaluate((w) => DB.isCut(DB.loadNotebook().find(e => e.word === w)), firstNew), '「太简单，斩」进熟词');
            let cards = 0;
            while (await page.locator('#dl-got').count()) { await page.click('#dl-got'); cards++; await page.waitForTimeout(40); }
            ok(cards === 10, '斩掉一个补一个: 还是 10 张卡', cards);
            ok(await stage(page) === '自测', '看完卡片进入自测');
            let n = 0;
            while ((await stage(page)) === '自测' && n < 20) {
                await page.click(n === 0 ? '.dl-opt[data-ok="0"]' : '.dl-opt[data-ok="1"]');
                if (n === 0) { await page.waitForSelector('#dl-next'); await page.click('#dl-next'); }
                else await page.waitForTimeout(700);
                n++;
            }
            const learned = await page.evaluate(() => DB.loadNotebook().filter(w => w.learnedAt && new Date(w.learnedAt).toDateString() === new Date().toDateString()));
            ok(learned.length === 10 && learned.every(w => w.nextReview > Date.now() + 20 * 3600000), '自测后 10 个新词记 learnedAt, 明天复习', learned.length);
            ok(learned.filter(w => w.srsLevel === 0).length === 1, '自测答错的新词 0 级, 其余 1 级');
            ok(await stage(page) === '默写', '进入默写');
            // 默写: 第一个写对, 第二个写错 → 照写一遍
            const dw = async () => page.evaluate(() => {
                const zh = document.querySelector('.dl-dic-zh').textContent;
                return (DB.loadNotebook().filter(w => w.learnedAt).find(w => w.meaning === zh) || {}).word;
            });
            const d1 = await dw();
            await page.fill('#dl-input', d1.toUpperCase() + ' ');
            await page.click('#dl-submit');
            await page.waitForTimeout(700);
            ok((await nbOf(page, d1)).spellAt > 0, '写对 (大小写、空格不计较) 记 spellAt', d1);
            const d2 = await dw();
            await page.fill('#dl-input', 'zzzz');
            await page.click('#dl-submit');
            await page.waitForSelector('.dl-answer');
            ok((await page.locator('.dl-answer').innerText()).trim() === d2 && (await nbOf(page, d2)).focus.includes('spelling'),
               '写错: 显示正确拼写, 打「拼写」标记');
            await page.fill('#dl-input', 'still wrong');
            await page.click('#dl-submit');
            ok(await page.locator('.dl-answer').count() === 1, '照写不对不能往下走');
            await page.fill('#dl-input', d2);
            await page.click('#dl-submit');
            await page.waitForTimeout(500);
            ok(await page.locator('.dl-answer').count() === 0, '照写对了才进下一个');
            // 中途关掉
            await page.click('#dl-close');
            const mid = await page.evaluate(() => { const c = Daily.compute(); return { rev: c.rev.length, neu: c.neu.length, dic: c.dic.length, card: document.getElementById('daily-card').innerText }; });
            ok(mid.rev === 0 && mid.neu === 0 && mid.dic === 8 && /还剩/.test(mid.card) && /继续/.test(mid.card),
               '中途关掉: 卡片显示还剩默写 8 个、「继续」', JSON.stringify(mid).slice(0, 160));
            await page.click('#dl-start');
            ok(await stage(page) === '默写', '继续: 直接从默写接着做');
            for (let k = 0; k < 12 && (await stage(page)) === '默写'; k++) {
                const w = await dw();
                await page.fill('#dl-input', w);
                await page.click('#dl-submit');
                await page.waitForTimeout(700);
            }
            ok(await stage(page) === '完成' && /今日任务完成/.test(await page.locator('.dl-done').innerText()), '做完: 今日任务完成');
            await page.click('#dl-finish');
            const fin = await page.evaluate(() => {
                const d   = new Date(), ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                const day = JSON.parse(localStorage.getItem('hsv_kid_day_' + ymd) || '{}');
                const lt  = JSON.parse(DB.getPref('lesson_time', '{}'))[ymd] || {};
                return { card: document.getElementById('daily-card').innerText, plan: day.plan, nw: day.newWords, rv: day.reviewed, t: lt.daily };
            });
            ok(/今日任务完成/.test(fin.card) && /再学 5 个/.test(fin.card), '卡片变成「已完成」, 可再学 5 个');
            ok(fin.plan && fin.plan.done === 1 && fin.plan.rev === 20 && fin.plan.neu === 10 && fin.plan.dic === 10,
               '当天完成情况写进 day_ 日志', JSON.stringify(fin.plan));
            ok(fin.nw === 10 && fin.rv === 20, '日志里新词 10、复习 20 (家长后台口径)', fin.nw + '/' + fin.rv);
            ok(fin.t && fin.t.q >= 40 && fin.t.e >= 1, '时长记到 daily 桶', JSON.stringify(fin.t));
            await page.click('#dl-more');
            ok(await stage(page) === '新词' && (await page.locator('#dl-count').innerText()) === '1/5', '再学 5 个: 直接开始 5 个新词');
            await page.click('#dl-close');
            ok(!errors.length, '无页面错误', errors.join(' | '));
            await ctx.close();
        }

        sec('默写一页 (含熟词)');
        {
            const { ctx, page } = await fresh(browser, base, seedKid);
            const pw = await page.evaluate(() => Daily.pageWords(1).map(w => ({ w: w.word, cut: DB.isCut(w) })));
            ok(pw.length === 32 && pw[0].w === 'a' && pw.some(x => x.cut), '第 1 页 32 个词, 含熟词', pw.length);
            await page.click('#dl-pagedic');
            ok(/默写第 1 页/.test(await stage(page)) && (await page.locator('#dl-count').innerText()) === '1/32', '整页听写 32 个');
            await page.fill('#dl-input', 'the');                  // 第一个是 a (熟词): 写错
            await page.click('#dl-submit');
            await page.waitForSelector('.dl-answer');
            const a = await nbOf(page, 'a');
            ok(!(await page.evaluate((w) => DB.isCut(w), a)) && a.focus.includes('spelling'), '写错的熟词取消斩、打拼写标记');
            await page.click('#dl-close');
            await ctx.close();
        }

        sec('拼写判定');
        {
            const { ctx, page } = await fresh(browser, base, () => null);
            const r = await page.evaluate(() => [
                Daily._spellOk('color', 'colour'), Daily._spellOk('program', 'programme'), Daily._spellOk('theater', 'theatre'),
                Daily._spellOk('Favorite', 'favourite'), Daily._spellOk('for', 'four'), Daily._spellOk('exercize', 'exercise'),
                Daily._spellOk('filed', 'filled'), Daily._spellOk(' Ability ', 'ability'), Daily._spellOk('T-shirt', 't-shirt')]);
            ok(r.join(',') === 'variant,variant,variant,variant,,,,exact,exact', '美式拼写算对, 形近错词不放过', r.join(','));
            await ctx.close();
        }

        sec('测试设备不记录');
        {
            const { ctx, page } = await fresh(browser, base, seedKid);
            await page.evaluate(() => DB.setTestDevice(true));
            const before = await page.evaluate(() => localStorage.getItem('hsv_kid_notebook'));
            await page.click('#dl-start');
            await page.keyboard.press('r');                       // 单词页的「R 删词」快捷键不能穿透弹层
            await page.keyboard.press('ArrowRight');
            const okIdx = await page.evaluate(() => [...document.querySelectorAll('#dl-body .dl-opt')].findIndex(b => b.dataset.ok === '1'));
            await page.keyboard.press(String(okIdx + 1));         // 数字键选对的那个选项
            await page.waitForTimeout(900);
            if (await page.locator('#dl-next').count()) await page.click('#dl-next');
            const after = await page.evaluate(() => localStorage.getItem('hsv_kid_notebook'));
            ok(before === after && (await page.locator('#dl-count').innerText()) === '2/20',
               '测试设备: 会话照走, 单词本不写; 快捷键不穿透到单词页', await page.locator('#dl-count').innerText());
            await page.click('#dl-close');
            await ctx.close();
        }

        sec('家长后台');
        {
            const ctx  = await browser.newContext();
            const dash = await ctx.newPage();
            await dash.goto(base + '/dashboard.html', { waitUntil: 'load' });
            const html = await dash.evaluate(() => {
                const d = new Date(), y = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                renderLessonTime({ lessonTime: { [y]: { daily: { r: 0, e: 400, q: 40, qs: 200 } } }, courseTitles: {},
                                   days: [{ date: y, plan: { rev: 20, neu: 10, dic: 10, done: 1 } }] });
                return document.getElementById('d-time').innerHTML + document.getElementById('d-time-lessons').innerHTML;
            });
            ok(/今日任务/.test(html) && /✓/.test(html) && /复 20 · 新 10 · 默 10/.test(html) && /今日任务（单词）/.test(html),
               '近 14 天表多一列今日任务, 课表里显示「今日任务（单词）」');
            await ctx.close();
        }
    } catch (e) {
        ok(false, '测试异常', e.stack || e.message);
    } finally {
        await browser.close();
        srv.close();
    }

    sec('同步: spellAt 随学习状态合并, learnedAt 不丢');
    {
        const clock  = H.makeClock('2026-10-25T13:00:00Z');
        const server = H.makeGistServer(clock);
        const env    = { clock, server };
        const A = H.makeDevice('A', env);
        await A.DB.initCourses();
        A.storage.setItem('hsv_sync_token', 'tok');
        A.storage.setItem('hsv_sync_v2_fix_applied', '1');
        A.DB.saveNotebook([{ word: 'bear', meaning: '熊', addedAt: 1 }]);
        await A.Sync.push(false);
        const gid = A.storage.getItem('hsv_sync_gist_id');
        await A.Sync.init(); await A.runTimers();
        clock.advance(60000);
        const B = H.makeDevice('B', env, { ua: 'Windows' });
        await B.DB.initCourses();
        B.storage.setItem('hsv_sync_token', 'tok');
        B.storage.setItem('hsv_sync_gist_id', gid);
        B.storage.setItem('hsv_sync_v2_fix_applied', '1');
        await B.Sync.init(); await B.runTimers();
        const step = async (d) => { clock.advance(60000); await d.Sync.pull(false); await d.runTimers(); };
        A.DB.planLearn('bear', true); await A.runTimers();
        clock.advance(1000);
        A.DB.planSpell('bear', true); await A.runTimers();
        await step(B);
        const b = JSON.parse(B.storage.getItem('hsv_kid_notebook'))[0];
        ok(b.learnedAt && b.spellAt && b.srsLevel === 1, 'A 学完默写 → B 收到 learnedAt / spellAt', JSON.stringify(b));
        clock.advance(60000);
        B.DB.planReview('bear', true); await B.runTimers();
        await step(A);
        const a = JSON.parse(A.storage.getItem('hsv_kid_notebook'))[0];
        ok(a.learnedAt && a.spellAt && a.srsLevel === 2 && a.lastReview > b.lastReview, 'B 复习 → A 收到新等级, 学习/默写时间不丢', JSON.stringify(a));
    }

    done('今日任务 + 默写本页码 (v150)');
});
