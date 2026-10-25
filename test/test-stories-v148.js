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
        const nBookCards = await page.locator('.ls-card').count();
        ok(nBookCards > 0, '默认显示教材课文', nBookCards);
        await page.evaluate(() => Stories.check(false));
        await page.click('.ls-src-btn[data-src="ai"]');
        const aiCards = await page.locator('.ls-card.ls-card-ai').count();
        ok(aiCards === MAN.stories.length, 'AI 短文列表 = 发布的篇数', aiCards + ' / ' + MAN.stories.length);
        ok(await page.locator('.ls-group-head').count() >= 1, '每 10 篇一个分组标题');
        ok(/全部 AI 短文/.test(await page.locator('.ls-home').innerText()) || !(await page.locator('.ls-mixed-card').count()),
           '综合练习标为「全部 AI 短文」');
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
        ok(await page.locator('#ls-lookup-add').count() === 0 && /基础词/.test(await page.locator('#ls-sheet').innerText()),
           '基础词只查不收');
        await page.click('#ls-sheet-close');
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
        ok(await page.locator('.ls-card').count() === nBookCards, '切回教材课文, 列表不受影响');
        storiesOffline = false;

        sec('载入 3500 新增词: 只追加, 不动原有学习记录');
        await page.click('.nav-tab[data-nav="my-words"]');
        await page.evaluate(() => document.getElementById('mw-import-modal').classList.add('open'));
        const label = await page.locator('#mw-load-3500').innerText();
        const want  = await page.evaluate(() => {
            const have = new Set(DB.loadNotebook().map(w => w.word.toLowerCase()));
            return HSV_LEXICON.words.filter(w => w[1] > 0 && (w[4] === 'E' || w[4] === 'J') && !have.has(w[0].toLowerCase())
                                               && w[0].toLowerCase() !== 'accent').length;
        });
        ok(label.indexOf('(' + want + ')') >= 0 && want > 600, '按钮显示待新增词数', label + ' / ' + want);
        const before = await page.evaluate(() => DB.loadNotebook().length);
        await page.click('#mw-load-3500');
        const after = await page.evaluate(() => {
            const nb = DB.loadNotebook();
            return { n: nb.length, ab: nb.find(w => w.word === 'abandon'), abi: nb.find(w => w.word === 'ability'),
                     acc: nb.find(w => w.word === 'achieve'), tomb: nb.some(w => w.word === 'accent'),
                     b: nb.some(w => w.word === 'apple') };
        });
        ok(after.n === before + want, '新增数量正确', before + ' → ' + after.n);
        ok(after.ab.srsLevel === 4 && after.ab.nextReview === 1790000000000 && after.ab.focus[0] === 'weak'
           && after.ab.mistakeCount === 3 && after.ab.learnAt === 5, '已有词条的 SRS / 焦点 / 错题记录原样保留', JSON.stringify(after.ab));
        ok(after.ab.phonetic && !after.ab.editedAt, '缺音标的已有词补上音标, 不打内容戳 (合并时靠空字段互补传播)', after.ab.phonetic);
        ok(!after.tomb, '删掉过的词 (accent) 不塞回来');
        ok(after.abi.phonetic === '/əˈbɪləti/' && !after.abi.editedAt, '已有音标不覆盖', JSON.stringify(after.abi));
        ok(after.acc && after.acc.phonetic && after.acc.meaning && !after.b, '新词带音标释义, 基础词 (apple) 不进生词本');
        ok(await page.locator('#mw-load-3500').isDisabled(), '载入后按钮置灰');

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
