// test-sync-merge-v147.js — 同步合并规则与本机键隔离 (v147)
//   • 本机键 (测试开关/单词页位置/打乱/调试面板) 不收集、不套用、不删除
//     —— v141 的测试只检查了黑名单里有没有这个字符串, 没测路由, 所以
//     泄漏一直是绿的。这里走真实的推送与拉取。
//   • 逐词合并: 学习状态 / 焦点标记 / 内容字段三组各自取新, 空字段互补
//   • 删除墓碑: 删除能传播, 删后重加能复活, 不来回互推
//   • 新设备首次绑定: 自动载入的内置词不会把孩子删掉的词带回来
// 运行: node test/test-sync-merge-v147.js
'use strict';
const H = require('./_harness');
const { ok, sec, done } = H.makeChecker();
const P = 'hsv_kid_';

async function pair() {
    const clock  = H.makeClock('2026-10-25T01:00:00Z');
    const server = H.makeGistServer(clock);
    const env    = { clock, server };
    const A = H.makeDevice('A', env);
    await A.DB.initCourses();
    A.storage.setItem('hsv_sync_token', 'tok');
    A.storage.setItem('hsv_sync_v2_fix_applied', '1');
    A.DB.saveNotebook([{ word: 'apple', meaning: '苹果', addedAt: 1 }, { word: 'bear', meaning: '熊', addedAt: 1 }]);
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
    return { clock, server, A, B, gid, step };
}
const nb = (d) => JSON.parse(d.storage.getItem(P + 'notebook') || '[]');
const words = (d) => nb(d).map(e => e.word);

(async () => {
    sec('模块整文件加载 (v142 事故: 加载即崩却无人知晓)');
    {
        const env = { clock: H.makeClock('2026-10-25T01:00:00Z') };
        env.server = H.makeGistServer(env.clock);
        let err = null, d = null;
        try { d = H.makeDevice('X', env); } catch (e) { err = e; }
        ok(!err, 'config + db + sync 整文件加载不抛错', err && err.message);
        ok(d && typeof d.Sync.init === 'function', 'SyncManager.init 是函数 (不是浏览器自带的同名接口)');
        ok(d && typeof d.Sync.push === 'function' && typeof d.Sync.pull === 'function', 'push / pull 就位');
    }

    sec('本机键: 不收集 / 不套用 / 不删除');
    {
        const { A, B, step, server, gid, clock } = await pair();
        A.DB.setTestDevice(true);
        A.DB.setPref('mw_pos_all', '17');
        A.DB.setPref('mw_shuffle', '1');
        A.DB.setPref('debug_panel_enabled', 'true');
        A.DB.setPref('speech_speed', '1.2');                 // 普通设置: 应该同步
        await A.Sync.push(false);
        const data = server.payload(gid).data;
        ok(!Object.keys(data).some(k => /device_test_mode/.test(k)), '测试开关不进快照 (新旧键都没有)');
        ok(!(P + 'pref_mw_pos_all' in data), '单词页位置不进快照');
        ok(!(P + 'pref_mw_shuffle' in data), '打乱状态不进快照');
        ok(!(P + 'pref_debug_panel_enabled' in data), '调试面板开关不进快照');
        ok(data[P + 'pref_speech_speed'] === '1.2', '普通设置照常同步');

        // 模拟旧版设备推上来的快照: 带着旧测试开关与别人的位置
        const g = server.gists[gid];
        const pl = JSON.parse(g.files['hsv-sync-kid.json']);
        pl.data[P + 'pref_device_test_mode'] = 'true';
        pl.data[P + 'pref_mw_pos_all'] = '99';
        pl._syncTime = clock.t + 1;
        g.files['hsv-sync-kid.json'] = JSON.stringify(pl);
        g.updated_at += 'x';
        B.DB.setPref('mw_pos_all', '3');
        await step(B);
        ok(!B.DB.isTestDevice(), '旧快照里的测试开关不会被套用');
        ok(B.storage.getItem(P + 'pref_device_test_mode') == null, '旧键不写入本机');
        ok(B.DB.getPref('mw_pos_all') === '3', '本机位置不被别人的覆盖', B.DB.getPref('mw_pos_all'));
        ok(B.DB.getPref('speech_speed') === '1.2', '普通设置照常拉下来');
    }

    sec('测试开关迁移');
    {
        const env = { clock: H.makeClock('2026-10-25T01:00:00Z') };
        env.server = H.makeGistServer(env.clock);
        const st = H.makeStorage({ [P + 'pref_device_test_mode']: 'true' });
        const d = H.makeDevice('M', env, { storage: st });
        ok(d.DB.isTestDevice() === false, '新开关不认旧键 (默认关)');
        ok(d.DB.migrateTestDeviceFlag() === true, '迁移报告旧开关曾经开着 (用于提示)');
        ok(st.getItem(P + 'pref_device_test_mode') == null, '旧键已清除');
        ok(d.DB.migrateTestDeviceFlag() === false, '再跑一次无事发生 (幂等)');
        d.DB.setTestDevice(true);
        ok(st.getItem('hsv_device_test_mode') === 'true' && d.DB.isTestDevice(), '新键生效');
        ok(d.DB.bumpDaily({ reviewed: 1 }) === undefined, '测试设备照旧不记天记录');
    }

    sec('逐词合并: 三组字段各自取新');
    {
        const { A, B, step, clock } = await pair();
        // A: 复习 apple (学习戳记新); B: 给 apple 补全例句 + 手动标「发音」
        A.DB.recordReview('apple', 'good');
        await A.runTimers();
        clock.advance(1000);
        B.DB.upsertNotebookWord({ word: 'apple', meaning: '苹果', context: 'An apple a day.' }, { countNew: false });
        B.DB.toggleFocus('apple', 'pronunciation');
        await B.runTimers();
        await step(A); await step(B); await step(A);
        const a = nb(A).find(e => e.word === 'apple');
        const b = nb(B).find(e => e.word === 'apple');
        ok(a.reviewCount === 1 && a.srsLevel === 1, 'A 的复习进度保留', JSON.stringify([a.reviewCount, a.srsLevel]));
        ok(a.context === 'An apple a day.', 'B 的补全内容保留');
        ok((a.focus || []).includes('pronunciation'), 'B 的手动标记保留');
        ok(JSON.stringify(a) === JSON.stringify(b), '两边结果一致');
        // 内容编辑冲突: B 改释义 (editedAt 新) → B 胜
        B.DB.upsertNotebookWord({ word: 'bear', meaning: '熊; 忍受' }, { countNew: false });
        await B.runTimers(); await step(A);
        ok(nb(A).find(e => e.word === 'bear').meaning === '熊; 忍受', '编辑过的释义胜出');
    }

    sec('删除墓碑');
    {
        const { A, B, step, server } = await pair();
        A.DB.removeNotebookWord('bear');
        await A.runTimers(); await step(B);
        ok(!words(B).includes('bear'), 'A 删掉的词在 B 也消失');
        ok(!!JSON.parse(B.storage.getItem(P + 'pref_nb_tomb') || '{}').bear, 'B 收到墓碑');
        // B 重新加入 bear → 复活
        B.DB.upsertNotebookWord({ word: 'bear', meaning: '熊' });
        await B.runTimers(); await step(A);
        ok(words(A).includes('bear'), '删后重加的词在 A 复活');
        const w0 = server.writes();
        await step(A); await step(B); await step(A); await step(B);
        ok(server.writes() === w0, '墓碑与复活不会来回互推', server.writes() - w0);
        // 清空单词 = 全部墓碑 → 另一台也清空
        A.DB.saveNotebook([]);
        await A.runTimers(); await step(B);
        ok(nb(B).length === 0, '清空单词传播到另一台', nb(B).length);
    }

    sec('本机独有的词 (离线新增) 不被拉取抹掉');
    {
        const { A, B, step } = await pair();
        A.DB.upsertNotebookWord({ word: 'cat', meaning: '猫' });          // A 新增, 还没推
        B.DB.upsertNotebookWord({ word: 'dog', meaning: '狗' });
        await B.runTimers();                                              // B 先推
        await step(A); await A.runTimers(); await step(B); await step(A);
        ok(words(A).includes('cat') && words(A).includes('dog'), 'A 同时有 cat 与 dog');
        ok(JSON.stringify(words(A)) === JSON.stringify(words(B)), '两边词序一致 (远端为基、独有追加)',
           words(A).join(',') + ' | ' + words(B).join(','));
    }

    sec('新设备首次绑定: 自动载入的内置词不带回已删的词');
    {
        const { A, server, clock } = await pair();
        // 孩子早删掉了 zebra (那时还没有墓碑机制, 云端只是没有这个词)
        const N = H.makeDevice('N', { clock, server });
        await N.DB.initCourses();
        N.storage.setItem('hsv_sync_v2_fix_applied', '1');
        N.DB.saveNotebook([
            { word: 'apple', meaning: 'n. 苹果', source: '高中核心词汇', addedAt: Date.now(), focus: [] },
            { word: 'zebra', meaning: 'n. 斑马', source: '高中核心词汇', addedAt: Date.now(), focus: [] },
            { word: 'mine',  meaning: '我自己导入的', source: '', addedAt: Date.now() }
        ]);
        N.storage.setItem('hsv_sync_token', 'tok');
        await N.Sync.setupSync(); await N.runTimers();
        const w = words(N);
        ok(!w.includes('zebra'), '没动过的内置词 zebra 不追加 (以云端为准)', w.join(','));
        ok(w.includes('mine'), '用户自己导入的词保留');
        ok(nb(N).find(e => e.word === 'apple').meaning === '苹果', '同名词以云端内容为准');
    }

    sec('统计与天记录合并函数');
    {
        const env = { clock: H.makeClock('2026-10-25T01:00:00Z') };
        env.server = H.makeGistServer(env.clock);
        const d = H.makeDevice('S', env);
        d.DB.saveStats({ streakDays: 40, lastActiveDate: '2026-10-24', totalSessions: 3, modeUsage: { a: 2 } });
        d.storage.setItem(P + 'day_2026-10-24', JSON.stringify({ date: '2026-10-24', newWords: 0, reviewed: 30, quizTotal: 0, quizCorrect: 0, updatedAt: 5 }));
        d.storage.setItem('hsv_sync_token', 'tok');
        d.storage.setItem('hsv_sync_gist_id', env.server.create({
            'hsv-sync-kid.json': JSON.stringify({ _version: 2, _syncTime: Date.now(), _profile: 'kid', data: {
                [P + 'stats']: JSON.stringify({ streakDays: 1, lastActiveDate: '2026-09-05', totalSessions: 5, modeUsage: { a: 1, b: 4 } }),
                [P + 'day_2026-10-24']: JSON.stringify({ date: '2026-10-24', newWords: 0, reviewed: 4, quizTotal: 0, quizCorrect: 0, updatedAt: 9 }),
                [P + 'notebook']: '[]'
            } })
        }));
        d.storage.setItem('hsv_sync_v2_fix_applied', '1');
        await d.Sync.init(); await d.runTimers();
        const s = d.DB.loadStats();
        ok(s.lastActiveDate === '2026-10-24' && s.streakDays === 40, '最近学习日晚的一侧胜', JSON.stringify(s));
        ok(s.totalSessions === 5 && s.modeUsage.a === 2 && s.modeUsage.b === 4, '累计计数取大');
        ok(d.DB.loadDay('2026-10-24').reviewed === 30, '同日天记录取活动量大的一条');
    }

    done('同步合并');
})().catch(e => { console.error(e); process.exitCode = 1; });
