// test-sync-reconnect-v147.js — 断同步 7 周后重连的整链路回放 (v147)
//   背景: v142~v146 sync.js 加载即崩, 孩子平板 9/5 之后的学习记录全部
//   积压在本机。修复上线后第一次同步若仍按整键后写覆盖, 哪台设备带着
//   旧生词本先推上去, 平板 7 周的复习进度就没了。
//   本测试加载真实 db.js + sync.js (整文件), 两台设备共用一个模拟 Gist,
//   分别按「家长设备先上线」与「平板先上线」两种顺序回放, 要求:
//     • 平板上每个词的复习进度、薄弱标记一个不丢
//     • 家长设备断档期间的少量复习也不丢 (逐词取新)
//     • 按天日志、连续天数、巩固短文完整到云
//     • 泄漏过的测试开关不再生效
//     • 两台设备最终一致, 且不再互相推送 (无乒乓)
// 运行: node test/test-sync-reconnect-v147.js
'use strict';
const H = require('./_harness');
const { ok, sec, done } = H.makeChecker();

const P = 'hsv_kid_';
const DAY = 86400000;
const WORDS = Array.from({ length: 60 }, (_, i) => 'w' + String(i).padStart(2, '0'));

// 构造 9/5 之前两台设备已对齐的状态, 再回放断档期
async function buildIncident() {
    const clock  = H.makeClock('2026-09-05T02:00:00Z');
    const server = H.makeGistServer(clock);
    const env    = { clock, server };

    // ① 9/5: 平板 T 推送, 家长设备 P 拉取 —— 双方对齐
    const T0 = H.makeDevice('T', env);
    await T0.DB.initCourses();
    T0.storage.setItem('hsv_sync_token', 'tok');
    T0.storage.setItem('hsv_sync_v2_fix_applied', '1');   // 真实设备早已跑过这条一次性迁移
    const nb = WORDS.map((w, i) => ({
        word: w, meaning: '义' + i, source: 'test', addedAt: Date.parse('2026-08-01T00:00:00Z'),
        srsLevel: i % 3, lastReview: Date.parse('2026-09-01T00:00:00Z'),
        nextReview: Date.parse('2026-09-04T00:00:00Z'), focus: []
    }));
    T0.DB.saveNotebook(nb);
    T0.DB.bumpDaily({ reviewed: 5 });
    await T0.Sync.push(false);
    const gistId = T0.storage.getItem('hsv_sync_gist_id');

    // 模拟旧版泄漏: 云端快照里带着家长机的测试开关 (旧键)
    const g = server.gists[gistId];
    const pl = JSON.parse(g.files['hsv-sync-kid.json']);
    pl.data[P + 'pref_device_test_mode'] = 'true';
    g.files['hsv-sync-kid.json'] = JSON.stringify(pl);

    clock.advance(60000);
    const P0 = H.makeDevice('P', env, { ua: 'Mozilla/5.0 (Windows NT 10.0)' });
    await P0.DB.initCourses();
    P0.storage.setItem('hsv_sync_token', 'tok');
    P0.storage.setItem('hsv_sync_gist_id', gistId);
    P0.storage.setItem('hsv_sync_v2_fix_applied', '1');
    await P0.Sync.init();
    await P0.runTimers();

    // ② 断档期 (9/6 ~ 10/24): 同步模块不在 (只加载 config + db)
    const T1 = H.makeDevice('T', env, { storage: T0.storage, modules: ['config.js', 'db.js'] });
    await T1.DB.initCourses();
    let dayN = 0;
    clock.set('2026-09-06T02:00:00Z');
    while (clock.t <= Date.parse('2026-10-24T12:00:00Z')) {
        // 每天复习 6 个词, 轮换覆盖全部 60 个
        for (let j = 0; j < 6; j++) {
            T1.DB.recordReview(WORDS[(dayN * 6 + j) % 60], 'good');
            clock.advance(60000);
        }
        // 每 5 天答错一个 → 薄弱
        if (dayN % 5 === 0) T1.DB.recordWordResult(WORDS[(dayN * 7) % 60], false, 'quiz');
        clock.days(1);
        dayN++;
    }
    clock.set('2026-10-20T03:00:00Z');
    T1.DB.setPref('cloze_all_9', '[{"title":"平板新生成的短文"}]');
    const tBlack = JSON.parse(T1.storage.getItem(P + 'notebook'));

    // 家长设备断档期: 9/10 复习了 w58、w59 两个词, 改了语速
    const P1 = H.makeDevice('P', env, { storage: P0.storage, modules: ['config.js', 'db.js'],
                                        ua: 'Mozilla/5.0 (Windows NT 10.0)' });
    await P1.DB.initCourses();
    clock.set('2026-09-10T12:00:00Z');
    P1.DB.recordReview('w58', 'easy');
    P1.DB.recordReview('w59', 'wrong');
    P1.DB.setPref('speech_speed', '1.1');
    const pBlack = JSON.parse(P1.storage.getItem(P + 'notebook'));

    clock.set('2026-10-25T01:00:00Z');                    // 修复版上线
    return { clock, server, env, gistId, Ts: T0.storage, Ps: P0.storage, tBlack, pBlack, dayN };
}

// 修复版首次启动 (等同 app.js boot 里与同步相关的几步)
async function bootNew(name, storage, env, ua) {
    const d = H.makeDevice(name, env, { storage, ua });
    await d.DB.initCourses();
    d.DB.migrateTestDeviceFlag();
    await d.Sync.init();
    await d.runTimers();
    return d;
}

const nbOf   = (st) => JSON.parse(st.getItem(P + 'notebook') || '[]');
const byWord = (arr) => Object.fromEntries(arr.map(e => [e.word, e]));
const stable = (v) => JSON.stringify(v, Object.keys(v).sort());

function expectedEntry(t, p) {        // 学习戳记新者胜 (戳记 = lastReview 等)
    const s = e => Math.max(e.lastReview || 0, e.lastResultAt || 0);
    return s(p) > s(t) ? p : t;
}

async function scenario(order) {
    sec('顺序 ' + order);
    const I = await buildIncident();
    const { server, env, gistId } = I;
    let T, Pd;
    if (order === '家长设备先上线') {
        Pd = await bootNew('P', I.Ps, env, 'Mozilla/5.0 (Windows NT 10.0)');
        I.clock.advance(3600000);
        T  = await bootNew('T', I.Ts, env);
    } else {
        T  = await bootNew('T', I.Ts, env);
        I.clock.advance(3600000);
        Pd = await bootNew('P', I.Ps, env, 'Mozilla/5.0 (Windows NT 10.0)');
    }
    // 再各拉一轮, 让两边收敛
    I.clock.advance(60000); await T.Sync.pull(false);  await T.runTimers();
    I.clock.advance(60000); await Pd.Sync.pull(false); await Pd.runTimers();
    I.clock.advance(60000); await T.Sync.pull(false);  await T.runTimers();

    const remote = server.payload(gistId);
    const rnb    = JSON.parse(remote.data[P + 'notebook']);
    const R = byWord(rnb), TB = byWord(I.tBlack), PB = byWord(I.pBlack);

    ok(rnb.length === 60, '云端生词本 60 词, 不丢不重', rnb.length);
    let lost = 0, wrongPick = [];
    WORDS.forEach(w => {
        const want = expectedEntry(TB[w], PB[w]);
        if (!R[w] || R[w].lastReview !== want.lastReview || R[w].srsLevel !== want.srsLevel ||
            R[w].reviewCount !== want.reviewCount) { lost++; wrongPick.push(w); }
    });
    ok(lost === 0, '每个词的复习进度都取到较新的一侧', wrongPick.slice(0, 8).join(','));
    ok(R.w59.lastReview === PB.w59.lastReview || R.w59.lastReview === TB.w59.lastReview,
       'w59 取两边较新的复习');
    const weakT = I.tBlack.filter(e => (e.focus || []).includes('weak')).map(e => e.word).sort();
    const weakR = rnb.filter(e => (e.focus || []).includes('weak')).map(e => e.word).sort();
    ok(weakT.length > 0 && weakT.every(w => weakR.includes(w)), '平板的薄弱标记全部到云',
       weakT.length + ' vs ' + weakR.length);

    const dayKeys = Object.keys(remote.data).filter(k => k.startsWith(P + 'day_'));
    ok(dayKeys.includes(P + 'day_2026-10-24'), '断档末日 (10/24) 的天记录到云');
    ok(dayKeys.length >= I.dayN, '断档期每天的记录都到云', dayKeys.length + ' / ' + I.dayN);
    const d0910 = JSON.parse(remote.data[P + 'day_2026-09-10']);
    ok(d0910.reviewed >= 6, '9/10 同日两台都有记录: 取活动量大的一条', JSON.stringify(d0910));
    const stats = JSON.parse(remote.data[P + 'stats']);
    ok(stats.lastActiveDate === '2026-10-24', '最近学习日 = 10/24 (平板)', stats.lastActiveDate);
    ok(stats.streakDays >= 40, '连续天数保住 (平板天天学)', stats.streakDays);
    ok(!!remote.data[P + 'pref_cloze_all_9'], '平板断档期生成的巩固短文到云 (没被旧快照删掉)');
    ok(remote.data[P + 'pref_speech_speed'] === '1.1', '家长设备改的语速保留');

    ok(!(P + 'pref_device_test_mode' in remote.data), '云端快照不再携带测试开关');
    ok(!T.DB.isTestDevice() && !Pd.DB.isTestDevice(), '两台设备都不是测试设备');

    const tn = nbOf(T.storage), pn = nbOf(Pd.storage);
    const eq = tn.length === pn.length && tn.every((e, i) => stable(e) === stable(pn[i]));
    ok(eq, '两台设备生词本完全一致 (含顺序)');
    const w0 = server.writes();
    I.clock.advance(60000); await T.Sync.pull(false);  await T.runTimers();
    I.clock.advance(60000); await Pd.Sync.pull(false); await Pd.runTimers();
    I.clock.advance(60000); await T.Sync.pull(false);  await T.runTimers();
    ok(server.writes() === w0, '收敛后不再互推 (无乒乓)', (server.writes() - w0) + ' 次多余写入');
}

(async () => {
    await scenario('家长设备先上线');
    await scenario('平板先上线');

    sec('修复版首启自动补推 (不等下一次学习动作)');
    {
        const I = await buildIncident();
        const before = I.server.writes();
        const T = await bootNew('T', I.Ts, I.env);
        ok(I.server.writes() > before, '启动即推送积压记录');
        const remote = I.server.payload(I.gistId);
        ok(!!remote.data[P + 'day_2026-10-24'], '无需任何操作, 10/24 记录已到云');
        ok(!T.Sync.hasPendingPush(), '推送后待上传标志清除');
    }

    done('断档重连');
})().catch(e => { console.error(e); process.exitCode = 1; });
