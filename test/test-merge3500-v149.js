// test-merge3500-v149.js — 3500 词整本并入单词本 + 斩 (v149)
//   • 单机迁移: 已有词条与学习记录不动、只补空音标; 缺词按级别补齐
//     (B 级直接记为已斩); 删过的词不塞回来; 默写本顺序; 幂等
//   • 两台设备各自迁移: 结果逐字相同, 合并后不来回互推
//   • 迁移后在一台设备上删的词, 不会被另一台设备的迁移带回来
//   • 斩 / 取消斩跨设备传播; 课文答错让斩失效
//   • 同步载荷体积
// 运行: node test/test-merge3500-v149.js
'use strict';
const H = require('./_harness');
const { ok, sec, done } = H.makeChecker();
const P    = 'hsv_kid_';
const MODS = ['config.js', 'lexicon-3500.js', 'vocab-hs-data.js', 'db.js', 'sync.js'];

async function pair(seed) {
    const clock  = H.makeClock('2026-10-25T01:00:00Z');
    const server = H.makeGistServer(clock);
    const env    = { clock, server };
    const A = H.makeDevice('A', env, { modules: MODS });
    await A.DB.initCourses();
    A.storage.setItem('hsv_sync_token', 'tok');
    A.storage.setItem('hsv_sync_v2_fix_applied', '1');
    A.DB.saveNotebook(seed);
    await A.Sync.push(false);
    const gid = A.storage.getItem('hsv_sync_gist_id');
    await A.Sync.init(); await A.runTimers();
    clock.advance(60000);
    const B = H.makeDevice('B', env, { modules: MODS, ua: 'Windows' });
    await B.DB.initCourses();
    B.storage.setItem('hsv_sync_token', 'tok');
    B.storage.setItem('hsv_sync_gist_id', gid);
    B.storage.setItem('hsv_sync_v2_fix_applied', '1');
    await B.Sync.init(); await B.runTimers();
    const step = async (d) => { clock.advance(60000); await d.Sync.pull(false); await d.runTimers(); };
    return { clock, server, A, B, gid, step };
}
const nb  = (d) => JSON.parse(d.storage.getItem(P + 'notebook') || '[]');
const key = (w) => String(w || '').trim().toLowerCase();

(async () => {
    sec('单机迁移');
    {
        const clock  = H.makeClock('2026-10-25T01:00:00Z');
        const env    = { clock, server: H.makeGistServer(clock) };
        const D      = H.makeDevice('D', env, { modules: MODS });
        const LEX    = D.ctx.HSV_LEXICON.words;
        const keys3500 = [];
        const seenK  = new Set();
        LEX.filter(w => w[1] > 0).sort((a, b) => a[1] - b[1]).forEach(w => {
            const k = key(w[0]);
            if (k && !seenK.has(k)) { seenK.add(k); keys3500.push(k); }
        });
        const lvOf = {};
        LEX.filter(w => w[1] > 0).forEach(w => { const k = key(w[0]); if (!lvOf[k]) lvOf[k] = w[4]; });
        D.DB.saveNotebook([
            { word: 'blockchain', meaning: '区块链', addedAt: 1, source: '点词入本' },          // 不在默写本
            { word: 'abandon', meaning: '放弃', phonetic: '', srsLevel: 4, nextReview: 1790000000000,
              focus: ['weak'], mistakeCount: 3, addedAt: 2, learnAt: 5 },
            { word: 'ability', meaning: '能力', phonetic: '/əˈbɪləti/', srsLevel: 2, addedAt: 3 },
            { word: 'accept', meaning: 'v. 接受; 同意; 认可', register: 'formal', collo: 'accept an apology',
              source: '家长整理', tags: ['重点'], srsLevel: 3, addedAt: 4, editedAt: 9 }
        ]);
        D.DB.setPref('nb_tomb', JSON.stringify({ accent: Date.UTC(2026, 8, 1) }));    // 9/1 删过 accent
        const res = D.DB.mergeLexicon3500(LEX);
        const out = nb(D);
        const at  = (w) => out.find(e => key(e.word) === w);
        const wantAdd = keys3500.filter(k => !['abandon', 'ability', 'accept', 'accent'].includes(k)).length;
        const wantCut = keys3500.filter(k => lvOf[k] === 'B' && k !== 'accent').length;
        ok(res.added === wantAdd, '缺的默写本词全部补齐 (删过的 accent 除外)', res.added + ' / ' + wantAdd);
        ok(res.cut === wantCut && wantCut > 1400, 'B 级 (非常简单) 词记为已斩', res.cut + ' / ' + wantCut);
        ok(out.length === keys3500.length - 1 + 1, '总数 = 默写本 − 删过的 + 本外词', out.length);
        ok(!at('accent'), '删过的词不塞回来');
        const ab = at('abandon');
        ok(ab.srsLevel === 4 && ab.nextReview === 1790000000000 && ab.focus[0] === 'weak' && ab.mistakeCount === 3
           && ab.learnAt === 5, '已有词条学习记录原样保留', JSON.stringify(ab));
        ok(ab.phonetic && !ab.editedAt && res.filled >= 1, '空音标补上, 不打内容戳');
        ok(at('ability').phonetic === '/əˈbɪləti/', '已有音标不覆盖');
        const acc = at('accept');
        ok(acc.meaning === 'v. 接受; 同意; 认可' && acc.register === 'formal' && acc.tags[0] === '重点' && acc.editedAt === 9,
           '家长整理过的内容不动');
        ok(out[out.length - 1].word === 'blockchain', '不在默写本的词排在最后');
        const idx = out.slice(0, out.length - 1).map(e => keys3500.indexOf(key(e.word)));
        ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])), '前面按默写本顺序排列');
        const isNew = (e) => /^默写本 #\d+$/.test(e.source || '');
        const j = out.find(e => isNew(e) && lvOf[key(e.word)] === 'J');
        const b = out.find(e => isNew(e) && lvOf[key(e.word)] === 'B');
        ok(j && !D.DB.isCut(j) && j.meaning && j.phonetic && j.level === '3500' && j.addedAt === D.DB.LEX_T0,
           'J 级新词正常学习, 带音标释义, 固定戳记', JSON.stringify(j));
        ok(b && D.DB.isCut(b) && !('cutAt' in b) && !('learnAt' in b) && b.addedAt === D.DB.LEX_T0 && b.level === '基础',
           'B 级新词已斩, 戳记固定, 不带学习戳记', JSON.stringify(b));
        ok(!('enDef' in j) && !('focus' in j) && !('register' in j) && !('context' in j), '新词条只存非空字段');
        const due = D.DB.getDueWords().map(e => key(e.word));
        ok(!due.includes(key(b.word)) && due.includes(key(j.word)), '已斩的词不进复习, J 级新词进复习');
        const st = D.DB.getReviewStats();
        ok(st.cut === wantCut && st.mastered === 0, '统计: 熟词单列, 不算「已掌握」', JSON.stringify(st));
        const raw = D.storage.getItem(P + 'notebook');
        const res2 = D.DB.mergeLexicon3500(LEX);
        ok(res2.added === 0 && !res2.moved && res2.filled === 0 && D.storage.getItem(P + 'notebook') === raw,
           '再跑一次: 幂等, 不写盘');
        const tombs = JSON.parse(D.DB.getPref('nb_tomb', '{}'));
        ok(Object.keys(tombs).length === 1, '重排不产生墓碑', JSON.stringify(tombs));
    }

    sec('斩 / 取消斩 / 答错失效');
    {
        const clock  = H.makeClock('2026-10-25T01:00:00Z');
        const env    = { clock, server: H.makeGistServer(clock) };
        const D      = H.makeDevice('D', env, { modules: MODS });
        D.DB.saveNotebook([{ word: 'bear', meaning: '熊', srsLevel: 2, nextReview: clock.t + 86400000, addedAt: 1 }]);
        const e1 = D.DB.setCut('Bear', true);
        ok(e1 && D.DB.isCut(e1) && e1.cutAt === clock.t && e1.learnAt === clock.t && e1.srsLevel === 2, '斩: 推远复习, 记 cutAt / learnAt, 不动等级');
        ok(D.DB.getDueWords().length === 0 && D.DB.getTrainerWords(99).length === 0, '斩后不进复习与特训');
        clock.advance(1000);
        const e2 = D.DB.setCut('bear', false);
        ok(!D.DB.isCut(e2) && e2.nextReview === null && !('cutAt' in e2), '取消斩: 立即到期, 去掉 cutAt');
        D.DB.setCut('bear', true);
        D.DB.recordWordResult('bear', false, 'lesson');
        ok(!D.DB.isCut(nb(D)[0]), '课文答错: 斩失效, 回到复习');
    }

    sec('两台设备各自迁移: 结果一致, 不互推');
    {
        const seed = [{ word: 'apple', meaning: '苹果', addedAt: 1 }, { word: 'bear', meaning: '熊', addedAt: 1 },
                      { word: 'abandon', meaning: '放弃', srsLevel: 3, lastReview: Date.UTC(2026, 9, 20), addedAt: 1 }];
        const { A, B, step, server } = await pair(seed);
        const LEX = A.ctx.HSV_LEXICON.words;
        A.DB.mergeLexicon3500(LEX); await A.runTimers();
        B.DB.mergeLexicon3500(LEX); await B.runTimers();
        await step(B); await step(A); await step(B);
        const a = A.storage.getItem(P + 'notebook'), b = B.storage.getItem(P + 'notebook');
        ok(a === b, '两台设备的单词本逐字相同', nb(A).length + ' / ' + nb(B).length);
        ok(nb(A).find(e => e.word === 'abandon').srsLevel === 3, '学习记录保留');
        ok(!A.DB.isCut(nb(A).find(e => e.word === 'apple')), '已有的基础词 (apple) 不被斩');
        const w0 = server.writes();
        await step(A); await step(B); await step(A);
        ok(server.writes() === w0, '对齐之后不再互推', (server.writes() - w0) + ' 次写入');
    }

    sec('迁移后删的词, 另一台设备的迁移不会带回来');
    {
        const seed = [{ word: 'bear', meaning: '熊', addedAt: 1 }];
        const { A, B, step, clock } = await pair(seed);
        const LEX = A.ctx.HSV_LEXICON.words;
        A.DB.mergeLexicon3500(LEX); await A.runTimers();
        clock.advance(3600000);
        A.DB.removeNotebookWord('lemonade');                 // 孩子在平板上删掉一个熟词
        await A.runTimers();
        ok(!nb(A).some(e => e.word === 'lemonade'), 'A 删掉 lemonade');
        clock.advance(5000);
        B.DB.mergeLexicon3500(LEX);                          // B 还没拉到删除就迁移, 本机又补上了
        ok(nb(B).some(e => e.word === 'lemonade'), 'B 本机迁移补上了 lemonade');
        await B.runTimers(); await step(B); await step(A); await step(B);
        ok(!nb(B).some(e => e.word === 'lemonade') && !nb(A).some(e => e.word === 'lemonade'),
           '同步后两边都没有 lemonade (墓碑晚于迁移戳记)');
    }

    sec('斩跨设备传播');
    {
        const seed = [{ word: 'bear', meaning: '熊', srsLevel: 1, nextReview: Date.UTC(2026, 9, 26), addedAt: 1 }];
        const { A, B, step, clock } = await pair(seed);
        A.DB.setCut('bear', true); await A.runTimers();
        await step(B);
        ok(B.DB.isCut(nb(B)[0]) && nb(B)[0].cutAt, 'A 斩 → B 也是熟词');
        clock.advance(60000);
        B.DB.setCut('bear', false); await B.runTimers();
        await step(A);
        ok(!A.DB.isCut(nb(A)[0]) && !('cutAt' in nb(A)[0]), 'B 取消斩 → A 也取消, cutAt 不残留', JSON.stringify(nb(A)[0]));
    }

    sec('同步载荷体积');
    {
        const clock = H.makeClock('2026-10-25T01:00:00Z');
        const env   = { clock, server: H.makeGistServer(clock) };
        const D     = H.makeDevice('D', env, { modules: MODS });
        // 模拟孩子平板: 内置核心词 1747 个, 带学习记录
        const hs = D.ctx.HS_VOCAB.slice(0, 1747).map((v, i) => ({
            word: v.word, meaning: v.meaning || '', enDef: '', collo: '', colloCn: '', register: 'neutral',
            context: '', focus: [], level: v.level || '', freq: v.freq ?? null, source: '高中核心词汇',
            addedAt: 1761000000000 + i, srsLevel: i % 3, nextReview: 1761000000000 + i * 1000, packIndex: i + 1 }));
        D.DB.saveNotebook(hs);
        const before = Buffer.byteLength(D.storage.getItem(P + 'notebook'));
        D.DB.mergeLexicon3500(D.ctx.HSV_LEXICON.words);
        const after  = Buffer.byteLength(D.storage.getItem(P + 'notebook'));
        console.log('  单词本 ' + nb(D).length + ' 词: ' + Math.round(before / 1024) + ' KB → ' + Math.round(after / 1024) + ' KB');
        ok(after - before < 450 * 1024, '新增 2000+ 词条只增加不到 450 KB (只存非空字段)', Math.round((after - before) / 1024) + ' KB');
    }

    done('3500 并入 + 斩 (v149)');
})().catch(e => { console.error(e); process.exitCode = 1; });
