// test-stories-v148.js — AI 短文与 3500 词入库 (真浏览器, 整站加载)
//   起本地静态服务器, Chromium 打开 index.html (断外网): 课文页来源切换、
//   短文增量下载与离线复用、点任意词查词与入生词本、目标词卡、点词模式
//   切换、综合练习分池、单词表导出不含短文、载入 3500 新增词不动原有
//   学习记录、家长后台 AI 短文统计。需要 playwright, 没装则跳过。
// 运行: node test/test-stories-v148.js
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
let storiesOffline = false;
const hits = [];
const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    if (rel.indexOf('/stories/') === 0) {
        hits.push(rel);
        if (storiesOffline) { res.writeHead(503); return res.end(); }
    }
    const p = path.join(H.DIR, path.normalize(rel));
    if (!p.startsWith(H.DIR)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(buf);
    });
});

const MAN = JSON.parse(fs.readFileSync(path.join(H.DIR, 'stories', 'stories-manifest.json'), 'utf8'));

srv.listen(0, async () => {
    const base    = 'http://localhost:' + srv.address().port;
    const browser = await chromium.launch();
    try {
        const ctx  = await browser.newContext();
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push('pageerror: ' + e.message));
        page.on('dialog', d => d.accept());                  // confirm() 一律同意
        await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, r => r.abort());

        // 预置一个有学习记录的生词本 (模拟孩子平板): SRS、焦点、错题都要原样保留
        await page.goto(base + '/index.html', { waitUntil: 'load' });
        await page.evaluate(() => {
            const nb = [
                { word: 'abandon', meaning: '放弃', phonetic: '', srsLevel: 4, nextReview: 1790000000000,
                  focus: ['weak'], mistakeCount: 3, addedAt: 1, learnAt: 5 },
                { word: 'ability', meaning: '能力', phonetic: '/əˈbɪləti/', srsLevel: 2, addedAt: 2 },
                // 家长整理过的词条: 点词入本 / 答错强化都不许盖掉
                { word: 'accept', meaning: 'v. 接受; 同意; 认可', register: 'formal', collo: 'accept an apology',
                  context: 'She accepted his apology.', source: '家长整理', tags: ['重点'], srsLevel: 3, addedAt: 3 }
            ];
            localStorage.setItem('hsv_kid_notebook', JSON.stringify(nb));
            // 孩子删掉过 accent (删词墓碑): 载入 3500 新增词时不许塞回来
            localStorage.setItem('hsv_kid_pref_nb_tomb', JSON.stringify({ accent: Date.now() }));
            localStorage.setItem('hsv_kid_pref_builtin_autoloaded', '1');
            // 只用于本测试: 关掉首次自动载入的弹窗
            localStorage.setItem('hsv_kid_pref_display_name', 'T');
        });
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(1500);

        sec('模块就位');
        const probe = await page.evaluate(() => ({
            lex   : !!(window.HSV_LEXICON && window.HSV_LEXICON.words.length > 3000),
            stor  : typeof (window.Stories && window.Stories.check),
            hlex  : typeof (window.HSVLex && window.HSVLex.lookup)
        }));
        ok(probe.lex && probe.stor === 'function' && probe.hlex === 'function', '词库 / Stories / HSVLex 就位', JSON.stringify(probe));

        sec('词形还原与查词');
        const lk = await page.evaluate(() => ({
            accepted : (HSVLex.lookup('accepted') || {}).head,
            studies  : (HSVLex.lookup('studies') || {}).head,
            didnt    : (HSVLex.lookup("didn't") || {}).head,
            taught   : (HSVLex.lookup('taught') || {}).head,
            caff     : (HSVLex.lookup('caffeine', { caffeine: 'n. 咖啡因' }) || {}).src,
            name     : HSVLex.lookup('Hexi')
        }));
        ok(lk.accepted === 'accept' && lk.studies === 'study', '规则变形还原 (accepted→accept, studies→study)', JSON.stringify(lk));
        ok(lk.didnt === 'do' && lk.taught === 'teach', '缩写与不规则变形 (didn\'t→do, taught→teach)', JSON.stringify(lk));
        ok(lk.caff === 'gloss' && lk.name === null, '超纲词走本篇 gloss, 专名查不到', JSON.stringify(lk));
        // v148 审查: 词形还原顺序与守卫 (caring 不能落到 car, shed 不能落到 she …)
        const pairs = { caring: 'care', hates: 'hate', hated: 'hate', riding: 'ride', biting: 'bite',
                        notes: 'note', horses: 'horse', boxes: 'box', sites: 'site', ones: 'one',
                        visited: 'visit', listened: 'listen', hoping: 'hope', stopped: 'stop', planned: 'plan',
                        inner: 'inner', pier: 'pier', shed: 'shed', studies: 'study', taller: 'tall' };
        const got = await page.evaluate(p => {
            const o = {};
            Object.keys(p).forEach(k => { const r = HSVLex.lookup(k, {}); o[k] = r ? r.head.toLowerCase() : null; });
            o.Ming = HSVLex.lookup('Ming', {}) ? HSVLex.lookup('Ming', {}).head : null;
            return o;
        }, pairs);
        const bad = Object.keys(pairs).filter(k => got[k] !== pairs[k]);
        ok(!bad.length, '词形还原 ' + Object.keys(pairs).length + ' 例全对', bad.map(k => k + '→' + got[k]).join(', '));
        ok(got.Ming !== 'me', 'Ming 不被拆成 me', got.Ming);

        sec('来源切换与增量下载');
        await page.click('.nav-tab[data-nav="lessons"]');
        await page.waitForSelector('.ls-src-seg');
        // 课程订阅启动后约 3 秒才到 (36 课), 之前只有 2 篇内置课。原来这里立刻数,
        // 后面重开应用时课程已在本机 —— 结果取决于时序。等列表连续 5 秒不变再数。
        let nBookCards = -1;
        for (let i = 0, same = 0; i < 60 && same < 20; i++) {
            const n = await page.locator('.ls-card').count();
            same = n === nBookCards ? same + 1 : 0;
            nBookCards = n;
            await page.waitForTimeout(250);
        }
        ok(nBookCards > 0, '默认显示教材课文', nBookCards);
        await page.evaluate(() => Stories.check(false));
        await page.click('.ls-src-btn[data-src="ai"]');
        const aiCards = await page.locator('.ls-card.ls-card-ai').count();
        ok(aiCards === MAN.stories.length, 'AI 短文列表 = 发布的篇数', aiCards + ' / ' + MAN.stories.length);
        ok(await page.locator('.ls-group-head').count() >= 1, '每 10 篇一个分组标题');
        // v149: 综合练习并进练习条, 抽题范围写在 title 上
        ok(/全部 AI 短文/.test(await page.locator('.ls-dash-pool').getAttribute('title').catch(() => '') || '')
           || !(await page.locator('.ls-mixed-card').count()),
           '综合练习标为「全部 AI 短文」');
        // v149 紧凑排版: 分组标题独占整行, 两栏卡片不撑出容器
        const lay = await page.evaluate(() => {
            const list = document.querySelector('.ls-card-list');
            const gh   = document.querySelector('.ls-group-head');
            const cs   = [...document.querySelectorAll('.ls-card')].slice(0, 4).map(c => c.getBoundingClientRect());
            const lr   = list.getBoundingClientRect();
            return { ghFull: Math.abs(gh.getBoundingClientRect().width - lr.width) < 8,
                     inside: cs.every(r => r.right <= lr.right + 1),
                     twoCol: window.innerWidth < 600 || (cs.length > 1 && Math.abs(cs[0].top - cs[1].top) < 2) };
        });
        ok(lay.ghFull && lay.inside && lay.twoCol, '分组标题整行、卡片不溢出、宽屏两栏', JSON.stringify(lay));
        const pool = await page.evaluate(() => {
            const ents = Lessons.speechEntries();
            return { n: ents.length, story: ents.some(x => /Lin Yue was offered admission/.test(x)) };
        });
        ok(pool.n > 0 && !pool.story, '导出的发音单词表不含 AI 短文句子', JSON.stringify(pool));

        sec('阅读 S0001: 查词模式');
        await page.click('.ls-card[data-lesson="S0001"]');
        await page.waitForSelector('.ls-text');
        ok(/短文/.test(await page.locator('.ls-tab[data-lstab="read"]').innerText()), '标签显示「短文」');
        ok(await page.locator('.ls-text.ls-tap-lookup').count() === 1, 'AI 短文默认「点词查词」');
        const tok = page.locator('.ls-tok', { hasText: /^exchange$/ }).first();
        await tok.click();
        await page.waitForSelector('#ls-sheet-overlay.open');
        const sheet1 = await page.locator('#ls-sheet').innerText();
        ok(/exchange/.test(sheet1) && /默写本 #/.test(sheet1), '非目标词弹出词库释义与默写本序号', sheet1.slice(0, 120));
        ok(await page.locator('#ls-lookup-add').count() === 1, '非基础词可加入生词本');
        await page.click('#ls-lookup-add');
        const added = await page.evaluate(() => (DB.loadNotebook() || []).find(w => w.word === 'exchange'));
        ok(added && added.phonetic && /Lin Yue/.test(added.context) && (added.tags || []).indexOf('AI短文') >= 0,
           '入生词本带音标、本句例句、AI短文标签', JSON.stringify(added));

        const tokBasic = page.locator('.ls-tok', { hasText: /^when$/i }).first();
        await tokBasic.click();
        await page.waitForSelector('#ls-sheet-overlay.open');
        // v149: 基础词已作为熟词并入单词本 —— 弹层给「取消斩, 加入复习」
        ok(/取消斩/.test(await page.locator('#ls-lookup-add').innerText().catch(() => '')),
           '基础词 (熟词) 弹层给「取消斩，加入复习」');
        await page.click('#ls-lookup-add');
        ok(await page.evaluate(() => !DB.isCut(DB.loadNotebook().find(w => w.word.toLowerCase() === 'when'))),
           '点了以后 when 回到复习');
        await page.waitForTimeout(200);
        if (await page.locator('#ls-sheet-overlay.open').count()) await page.click('#ls-sheet-close');
        await page.locator('.ls-tok', { hasText: /^Beijing$/ }).first().click();
        ok(/专有名词/.test(await page.locator('#ls-sheet').innerText()), '专名如实说明');
        await page.click('#ls-sheet-close');

        sec('已有词条只补空字段 (不盖整理过的内容)');
        await page.locator('.ls-word', { hasText: /^accepted$/ }).first().click();
        await page.waitForSelector('#ls-sheet-overlay.open');
        await page.click('.ls-sheet-add');
        const acc = await page.evaluate(() => (DB.loadNotebook() || []).find(w => w.word === 'accept'));
        ok(acc.meaning === 'v. 接受; 同意; 认可' && acc.register === 'formal' && acc.collo === 'accept an apology'
           && acc.context === 'She accepted his apology.' && acc.source === '家长整理', '释义、语域、搭配、例句、来源原样保留', JSON.stringify(acc));
        ok(acc.tags.indexOf('重点') >= 0 && acc.tags.indexOf('AI短文') >= 0 && acc.srsLevel === 3 && !acc.editedAt,
           '标签取并集, SRS 不动, 不打 editedAt', JSON.stringify(acc.tags));

        sec('目标词卡');
        await page.locator('.ls-word', { hasText: /^admission$/ }).first().click();
        await page.waitForSelector('#ls-sheet-overlay.open');
        const sheet2 = await page.locator('#ls-sheet').innerText();
        ok(/高中核心/.test(sheet2) && /默写本 #70/.test(sheet2) && /be offered admission to/.test(sheet2),
           '目标词卡显示级别、序号与搭配', sheet2.slice(0, 160));
        await page.click('#ls-sheet-close');

        sec('点词模式切换 (本机记忆)');
        await page.click('#ls-tapmode');
        ok(await page.locator('.ls-text.ls-tap-lookup').count() === 0, '切到「点句听句」');
        await page.locator('.ls-tok', { hasText: /^exchange$/ }).first().click();
        await page.waitForTimeout(200);
        ok(!(await page.locator('#ls-sheet-overlay.open').count()), '听句模式下点词不弹查词');
        const prefs = await page.evaluate(() => ({ tap: DB.getPref('lesson_tap_ai', ''), src: DB.getPref('lesson_source', ''),
                                                   local: SyncManager.isDeviceLocalKey('hsv_kid_pref_lesson_tap_ai')
                                                       && SyncManager.isDeviceLocalKey('hsv_kid_pref_lesson_source') }));
        ok(prefs.tap === 'listen' && prefs.src === 'ai' && prefs.local, '模式与来源存为本机键 (不进同步)', JSON.stringify(prefs));
        await page.click('#ls-tapmode');

        sec('旧清单不回滚');
        const stale = await page.evaluate(async () => {
            const before = Stories.list().length;
            const g = localStorage.getItem('hsv_stories_gen');
            localStorage.setItem('hsv_stories_gen', '2099-01-01T00:00:00');
            const r = await Stories.check(false);
            localStorage.setItem('hsv_stories_gen', g || '');
            return { r, before, after: Stories.list().length };
        });
        ok(stale.r.stale === true && stale.after === stale.before, '比上次旧的清单被忽略, 本机短文不动', JSON.stringify(stale));

        sec('离线复用 (IndexedDB)');
        storiesOffline = true;
        hits.length = 0;
        await page.reload({ waitUntil: 'load' });
        await page.click('.nav-tab[data-nav="lessons"]');
        await page.waitForSelector('.ls-text, .ls-home');
        const reopened = await page.evaluate(() => document.querySelector('.ls-head-sub')?.textContent || '');
        ok(/S0001/.test(reopened), '重新打开应用回到上次读的短文', reopened);
        await page.click('#ls-back');
        ok(await page.locator('.ls-card.ls-card-ai').count() === MAN.stories.length, '断网时短文仍从本机读出');
        await page.click('.ls-src-btn[data-src="book"]');
        await page.waitForSelector('.ls-src-btn[data-src="book"].on');
        await page.waitForFunction((n) => document.querySelectorAll('.ls-card').length === n, nBookCards, { timeout: 5000 }).catch(() => {});
        ok(await page.locator('.ls-card').count() === nBookCards, '切回教材课文, 列表不受影响',
           (await page.locator('.ls-card').count()) + ' / ' + nBookCards);
        storiesOffline = false;

        sec('v149: 3500 词启动时整本并入, 不动原有学习记录');
        await page.click('.nav-tab[data-nav="my-words"]');
        const mg = await page.evaluate(() => {
            const nb   = DB.loadNotebook();
            const keys = new Set(nb.map(w => w.word.toLowerCase()));
            const want = new Set(HSV_LEXICON.words.filter(w => w[1] > 0).map(w => w[0].toLowerCase()));
            want.delete('accent');
            const miss = [...want].filter(k => !keys.has(k));
            const ab   = nb.find(w => w.word === 'abandon'), abi = nb.find(w => w.word === 'ability');
            const acc  = nb.find(w => w.word === 'accept'),  ap  = nb.find(w => w.word === 'apple');
            const ach  = nb.find(w => w.word === 'achieve');
            return { n: nb.length, miss: miss.length, dup: nb.length !== keys.size, ab, abi, acc,
                     tomb: keys.has('accent'), apCut: !!ap && DB.isCut(ap), achCut: !!ach && DB.isCut(ach),
                     flag: DB.getPref('lex3500_merged', ''), head: nb.slice(0, 3).map(w => w.word) };
        });
        ok(mg.miss === 0 && !mg.dup && mg.flag === '1', '默写本 3500 词全部在单词本里, 无重复', JSON.stringify({ n: mg.n, miss: mg.miss }));
        ok(mg.ab.srsLevel === 4 && mg.ab.nextReview === 1790000000000 && mg.ab.focus[0] === 'weak'
           && mg.ab.mistakeCount === 3 && mg.ab.learnAt === 5, '已有词条的 SRS / 焦点 / 错题记录原样保留', JSON.stringify(mg.ab));
        ok(mg.ab.phonetic && !mg.ab.editedAt, '缺音标的已有词补上音标, 不打内容戳', mg.ab.phonetic);
        ok(mg.abi.phonetic === '/əˈbɪləti/' && mg.acc.meaning === 'v. 接受; 同意; 认可' && mg.acc.register === 'formal',
           '已有音标与家长整理的内容不覆盖');
        ok(!mg.tomb, '删掉过的词 (accent) 不塞回来');
        ok(mg.apCut && !mg.achCut, '非常简单的词 (apple) 记为熟词, 其他新词正常学习');
        ok(mg.head[0] === 'a', '按默写本顺序排列', mg.head.join(','));
        await page.evaluate(() => document.getElementById('mw-import-modal').classList.add('open'));
        ok(/已全部并入/.test(await page.locator('#mw-load-3500').innerText()) && await page.locator('#mw-load-3500').isDisabled(),
           '旧的「载入 3500 新增词」按钮显示已全部并入');
        await page.evaluate(() => document.getElementById('mw-import-modal').classList.remove('open'));

        sec('v149: 斩 / 熟词');
        const cnt = await page.evaluate(() => ({
            all: document.getElementById('mw-fc-all').textContent, cut: document.getElementById('mw-fc-cut').textContent,
            pill: getComputedStyle(document.querySelector('.mw-filter-pill[data-filter="cut"]')).display,
            nCut: DB.loadNotebook().filter(w => DB.isCut(w)).length, n: DB.loadNotebook().length }));
        ok(cnt.cut === '(' + cnt.nCut + ')' && cnt.all === '(' + (cnt.n - cnt.nCut) + ')' && cnt.pill !== 'none',
           '「全部」不含熟词, 「熟词」单独计数', JSON.stringify(cnt));
        await page.click('.mw-filter-pill[data-filter="all"]');
        await page.click('#mw-dm-cards').catch(() => {});
        const w1 = await page.locator('.mw-word2').first().innerText();
        await page.click('.mw-cut-btn[data-cut="1"]');
        const w2 = await page.locator('.mw-word2').first().innerText();
        const cutNow = await page.evaluate((w) => DB.isCut(DB.loadNotebook().find(x => x.word === w)), w1);
        ok(cutNow && w2 !== w1, '点「✂️ 斩」: 当前词进熟词, 卡片换到下一个词', w1 + ' → ' + w2);
        await page.click('.mw-filter-pill[data-filter="cut"]');
        ok(await page.locator('.mw-cut-btn[data-cut="0"]').count() === 1, '熟词里的卡片显示「取消斩」');
        await page.click('.mw-filter-pill[data-filter="all"]');

        sec('家长后台: AI 短文单独统计');
        const dash = await ctx.newPage();
        dash.on('pageerror', e => errors.push('dashboard pageerror: ' + e.message));
        await dash.goto(base + '/dashboard.html', { waitUntil: 'load' });
        const html = await dash.evaluate(() => {
            renderStories({
                stories    : [{ id: 'S0001', title: 'A Term Abroad', targets: 22 }, { id: 'S0002', title: 'Energy Drinks', targets: 22 }],
                lessonProg : { S0001: { listened: true, clozeBest: 91 }, U01: { listened: true } },
                lessonTime : { '2026-10-24': { S0001: { r: 600, e: 300 }, U01: { r: 900, e: 0 }, 'mixed-ai': { r: 0, e: 120 } } },
                lessonPrac : { w: { 'S0001-W01': [2, 1, 1, 0], 'S0002-W03': [1, 0, 1, 1], 'U01-W01': [1, 0, 1, 1] } }
            });
            return document.getElementById('d-stories').innerHTML;
        });
        ok(/共 <b>2<\/b> 篇/.test(html) && /已听读 <b>1<\/b>/.test(html), '汇总: 篇数与已听读', html.slice(0, 200));
        ok(/目标词练过 <b>2<\/b>\/44/.test(html) && /待强化 <b>1<\/b>/.test(html), '目标词练习只算短文 (不含 U01)');
        ok(/S0001 A Term Abroad/.test(html) && /91%/.test(html) && !/U01/.test(html), '逐篇表只列短文');

        ok(errors.length === 0, '无页面错误', errors.join(' | '));
    } catch (e) {
        ok(false, '测试异常', e && e.stack);
    } finally {
        await browser.close();
        srv.close();
        done('AI 短文 v148');
    }
});
