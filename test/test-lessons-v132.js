// test-lessons-v132.js — v132 (hsv-v35) 键名错位修复 (高危) + 学习时长
//   • mergeFns/contentKeys 键名带 pref_ 段, 保护真正路由到位 —— 用
//     "真实键快照跑 mergeSyncData" 的集成方式验证, 不再只测函数本身
//     (v123 的教训: 单元全绿、路由断线)
//   • mergeLessonTime 按字段 MAX; lessons.js 计时引擎; setPrefQuiet;
//     dashboard 课文学习区与 raw_url 无鉴权头
// 运行: node test-lessons-v132.js
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');

const sync    = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');
const dbSrc   = fs.readFileSync(path.join(DIR, 'db.js'), 'utf8');
const lessons = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
const dash    = fs.readFileSync(path.join(DIR, 'dashboard.html'), 'utf8');

// ─── 1. 键名路由 (集成验证, 本版核心) ───────────────────────
sec('1. mergeFns/contentKeys 键名路由');
ok(/mergeFns\[prefix \+ 'pref_lesson_progress'\]/.test(sync)
   && /mergeFns\[prefix \+ 'pref_lesson_mixed'\]/.test(sync)
   && /mergeFns\[prefix \+ 'pref_lesson_sess'\]/.test(sync)
   && /mergeFns\[prefix \+ 'pref_lesson_time'\]/.test(sync),
   'mergeFns 四键全部带 pref_ 段');
ok(/prefix \+ 'pref_lesson_phrase_sel'/.test(sync),
   'contentKeys 短语精选带 pref_ 段');
ok(!/mergeFns\[prefix \+ 'lesson_progress'\]/.test(sync),
   '旧的错位注册已移除');

// 集成: 提取 mergeSyncData 及其依赖, 用真实键名快照驱动
function extract(name, async_) {
    const tag = (async_ ? 'async ' : '') + 'function ' + name;
    const i = sync.indexOf(tag);
    if (i < 0) return null;
    let d = 0, st = false;
    for (let j = i; j < sync.length; j++) {
        if (sync[j] === '{') { d++; st = true; }
        else if (sync[j] === '}') { d--; if (st && d === 0) return sync.slice(i, j + 1); }
    }
}
const store = {};
global.localStorage = {
    getItem   : k => (k in store ? store[k] : null),
    setItem   : (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i] ?? null
};
global.window = { DB: { mergeUserLessons: () => false }, APP_CONFIG: {} };
// mergeSyncData 的依赖桩/提取
const APP_PREFIX = 'hsv_', APP_TAG = 'hsv';
const K_API_KEY = 'hsv_api_key';
const PREPULL_MAX_GENS = 3;
function profileId() { return 'kid'; }
function keyPrefix()  { return APP_PREFIX + profileId() + '_'; }
function isApiKeySyncEnabled() { return false; }
function isSecretPref(k) { return /_pref_(tts|ai)_key/.test(k); }
function setLastPull() {}
function readPrePullGens()  { return []; }
function writePrePullGens() {}
let hooksSuspended = false;
function suspendHooks(fn) { hooksSuspended = true; try { return fn(); } finally { hooksSuspended = false; } }
eval(extract('_safeParse'));
eval(extract('mergeLessonProgress'));
eval(extract('mergeLessonMixed'));
eval(extract('mergeLessonSess'));
eval(extract('mergeLessonTime'));
const msdSrc = extract('mergeSyncData');
ok(!!msdSrc, '成功提取 mergeSyncData');
eval(msdSrc);

const P = 'hsv_kid_';
function resetStore(obj) {
    Object.keys(store).forEach(k => delete store[k]);
    Object.assign(store, obj);
}

// 1a. 字段级合并真正生效: 本地/远端各答过不同题, 拉取后并集保留
resetStore({
    [P + 'pref_lesson_progress']: JSON.stringify({ U01: { listened: true } }),
    [P + 'pref_lesson_mixed']   : JSON.stringify({ w: { A: [3, 1, 100, 1] }, p: {} })
});
mergeSyncData({
    _profile: 'kid', _syncTime: 99,
    data: {
        [P + 'pref_lesson_progress']: JSON.stringify({ U01: { clozeBest: 80 } }),
        [P + 'pref_lesson_mixed']   : JSON.stringify({ w: { B: [1, 0, 200, 1] }, p: {} })
    }
});
let prog = JSON.parse(store[P + 'pref_lesson_progress']);
ok(prog.U01 && prog.U01.listened === true && prog.U01.clozeBest === 80,
   '进度字段级合并生效 (本地 listened + 远端 clozeBest 并存, 不再整键覆盖)');
let mixed = JSON.parse(store[P + 'pref_lesson_mixed']);
ok(mixed.w.A && mixed.w.B, '练习档案按词条并集 (双端记录都保留)');

// 1b. 缺键不删除: 远端快照没带这些键, 本地保留
resetStore({
    [P + 'pref_lesson_progress'] : JSON.stringify({ U02: { listened: true } }),
    [P + 'pref_lesson_time']     : JSON.stringify({ '2026-08-11': { U02: { r: 60, e: 0, q: 0, qs: 0 } } }),
    [P + 'pref_lesson_phrase_sel']: JSON.stringify({ U02: ['a|b'] })
});
mergeSyncData({ _profile: 'kid', _syncTime: 100, data: {} });
ok(store[P + 'pref_lesson_progress'] != null, '远端缺键: 进度保留 (不再被当删除意图)');
ok(store[P + 'pref_lesson_time'] != null, '远端缺键: 时长保留');
ok(store[P + 'pref_lesson_phrase_sel'] != null, '远端缺键: 短语精选保留 (contentKeys 接线)');

// ─── 2. mergeLessonTime ─────────────────────────────────────
sec('2. mergeLessonTime');
const mt = JSON.parse(mergeLessonTime(
    JSON.stringify({ '2026-08-10': { U01: { r: 300, e: 60, q: 5, qs: 40 } },
                     '2026-08-11': { U01: { r: 100, e: 0,  q: 0, qs: 0 } } }),
    JSON.stringify({ '2026-08-10': { U01: { r: 200, e: 90, q: 8, qs: 50 },
                                     mixed: { r: 0, e: 120, q: 10, qs: 30 } } })
));
ok(mt['2026-08-10'].U01.r === 300 && mt['2026-08-10'].U01.e === 90
   && mt['2026-08-10'].U01.q === 8, '同天同课按字段取 MAX');
ok(mt['2026-08-10'].mixed.e === 120, '远端独有活动保留');
ok(mt['2026-08-11'].U01.r === 100, '本地独有天保留');
ok(mergeLessonTime('{bad', JSON.stringify({ d: {} })) === JSON.stringify({ d: {} }),
   '坏 JSON 容错');

// ─── 3. 计时引擎与静默落盘 ──────────────────────────────────
sec('3. lessons.js 计时引擎');
ok(/const TIME_IDLE_MS\s*=\s*120000/.test(lessons) && /TIME_KEEP_DAYS\s*=\s*60/.test(lessons),
   '空闲阈值 120s / 保留 60 天');
ok(/if \(document\.hidden\) return;/.test(lessons)
   && /Date\.now\(\) - _tLastAct > TIME_IDLE_MS/.test(lessons),
   '心跳守卫: 页面不可见或挂机不计时');
ok(/curTab === 'read' \? 'r' : 'e'/.test(lessons), '精读/练习分桶');
ok(/\{ act: 'mixed', kind: 'e' \}/.test(lessons), '综合练习入 mixed 桶');
ok(/setPrefQuiet\('lesson_time'/.test(lessons), 'flush 走 setPrefQuiet (无推送风暴)');
ok(/if \(document\.hidden\) tFlush\(true\)/.test(lessons)
   && /pagehide[\s\S]{0,60}?tFlush\(true\)/.test(lessons),
   '切后台/关页面: 落盘并补推送');
ok(/tMarkActivity\(\);\s*\/\/ v132: 句子播放推进算活动/.test(lessons),
   '句子播放推进保活 (纯听读不判挂机)');
ok(/_tQShown = Date\.now\(\)/.test(lessons)
   && /_tNoteAnswer\(\(Date\.now\(\) - _tQShown\) \/ 1000\)/.test(lessons),
   '填空逐题计作答秒数');
ok(/Math\.min\(120, Math\.round\(sec\)\)/.test(lessons), '单题耗时上限 120s (防走神污染均值)');
ok(/setPrefQuiet: function/.test(dbSrc), 'db.js 提供 setPrefQuiet');

// ─── 4. 家长后台 ────────────────────────────────────────────
sec('4. dashboard.html 课文学习区');
ok(/pref_lesson_time/.test(dash), '解析学习时长键');
ok(/-courses-\$\{profile\}\.json/.test(dash), '课名映射读 Gist 课程文件');
ok(/id="d-time"/.test(dash) && /id="d-time-lessons"/.test(dash), '两张表容器就位');
ok(/⚠ 跳过精读/.test(dash) && /⚠ 作答过快/.test(dash), '专注信号规则实现');
ok(/agg\.e\|\|0\) >= 180 && \(agg\.r\|\|0\) < 120/.test(dash.replace(/\(/g, '('))
   || /\(agg\.e\|\|0\) >= 180/.test(dash), '跳过精读阈值 (练习≥3min 精读<2min)');
ok(/\(agg\.qs\|\|0\)\/\(agg\.q\|\|1\) < 3/.test(dash), '作答过快阈值 (<3 秒/题)');
const rawFetches = [...dash.matchAll(/fetch\((\w+)\.raw_url[^)]*\)/g)];
ok(rawFetches.length >= 2 && !/fetch\(\w+\.raw_url,\s*\{\s*headers/.test(dash),
   'raw_url 兜底不带 Authorization 头 (v127 同款坑已修)');

// ─── 5. 版本 ────────────────────────────────────────────────
// 注: v132 (键名修复+时长) 与 v133 (激励卡) 合并为同一次发版,
// 版本断言按实际上线版本 hsv-v36 / ?v=133 校验。
sec('5. 版本');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '133',
   'index.html 全部 ?v=133 (' + vs.length + ' 处)');
ok(vs.length === 25, '?v= 引用总数 25 处');
ok(/const CACHE_NAME = 'hsv-v36'/.test(sw), 'sw.js CACHE_NAME = hsv-v35');
ok(/hsv-v35 \(\?v=132\)/.test(sw), 'sw.js 有 v35 变更日志');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
