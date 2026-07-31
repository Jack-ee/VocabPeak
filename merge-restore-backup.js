// merge-restore-backup.js — VocabPeak 学习记录恢复工具
//
// 场景: 学习记录被整档同步覆盖冲掉 (如平板首次联网仍在跑旧版代码,
//       拉取先于推送把本机记录覆盖)。若云端 Gist 的历史版本里存有
//       带记录的旧快照, 用本工具把旧记录并回当前数据。
//
// 取旧快照 (Gist 每次推送都会留一个历史版本):
//   1. 浏览器打开 gist.github.com → 登录 → 找到 VocabPeak 同步 Gist
//   2. 点 Revisions 页签, 按时间找孩子练习之后、被冲掉之前的版本
//   3. 点该版本的 Raw, 整页另存为 old-snapshot.json
//
// 用法:
//   1. 平板上 设置 → 数据 → 导出 当前备份 (current-backup.json)
//   2. node merge-restore-backup.js current-backup.json old-snapshot.json
//   3. 生成 merged-backup.json, 平板上 设置 → 数据 → 导入 即可
//   4. 导入后手动点一次同步, 把恢复后的数据推回云端
//
// 合并规则 (与应用内 sync.js v120 的字段级合并同源):
//   lesson_progress   听读/短语✓ 取或, 填空最佳/轮数取大
//   lesson_mixed      逐词条/短语取「最近练习时间」新的一侧
//   lesson_sess       逐课逐槽取时间戳新的一侧
//   lesson_phrase_sel 当前优先, 旧快照补缺
//   day_*             当前缺的天补齐; 同一天逐字段取大
//   notebook          按词并集; 冲突取复习/错题活动多的一侧
//   lessons_user      当前优先; 旧快照里当前没有的课整课补回
//   其余键            一律用当前值 (不复活旧配置)

const fs = require('fs');

const curFile = process.argv[2];
const oldFile = process.argv[3];
const outFile = process.argv[4] || 'merged-backup.json';
if (!curFile || !oldFile) {
    console.log('用法: node merge-restore-backup.js <当前备份.json> <旧快照.json> [输出文件]');
    process.exit(1);
}

// 兼容两种输入: 导出备份 (扁平键值) 与 Gist 快照 ({ data: {...} })
function loadFlat(file) {
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (obj && obj.data && typeof obj.data === 'object'
        && Object.keys(obj.data).some(k => /^hsv_/.test(k))) return obj.data;
    return obj;
}
const cur = loadFlat(curFile);
const old = loadFlat(oldFile);

const J = s => { try { return JSON.parse(s); } catch (e) { return null; } };

// ─── 合并规则 (镜像 sync.js) ────────────────────────────
function mergeProgress(a, b) {           // a=当前, b=旧
    const A = J(a) || {}, B = J(b) || {};
    const out = {};
    new Set(Object.keys(A).concat(Object.keys(B))).forEach(id => {
        const x = A[id] || {}, y = B[id] || {};
        const m = Object.assign({}, y, x);           // 未知字段当前优先
        if (x.listened  || y.listened)  m.listened  = true;
        if (x.matchDone || y.matchDone) m.matchDone = true;
        if (x.clozeBest != null || y.clozeBest != null) {
            m.clozeBest = Math.max(
                x.clozeBest != null ? x.clozeBest : -1,
                y.clozeBest != null ? y.clozeBest : -1);
        }
        if (x.clozeRuns || y.clozeRuns) m.clozeRuns = Math.max(x.clozeRuns || 0, y.clozeRuns || 0);
        out[id] = m;
    });
    return JSON.stringify(out);
}
function mergeMixed(a, b) {
    const A = J(a) || {}, B = J(b) || {};
    const out = { w: {}, p: {} };
    ['w', 'p'].forEach(part => {
        const am = A[part] || {}, bm = B[part] || {};
        new Set(Object.keys(am).concat(Object.keys(bm))).forEach(k => {
            const x = am[k], y = bm[k];
            out[part][k] = !x ? y : (!y ? x : (((x[2] || 0) >= (y[2] || 0)) ? x : y));
        });
    });
    return JSON.stringify(out);
}
function mergeSess(a, b) {
    const A = J(a) || {}, B = J(b) || {};
    const out = {};
    new Set(Object.keys(A).concat(Object.keys(B))).forEach(id => {
        const x = A[id] || {}, y = B[id] || {};
        const m = {};
        ['c', 'm'].forEach(slot => {
            const u = x[slot], v = y[slot];
            const w = !u ? v : (!v ? u : (((u.ts || 0) >= (v.ts || 0)) ? u : v));
            if (w) m[slot] = w;
        });
        if (Object.keys(m).length) out[id] = m;
    });
    return JSON.stringify(out);
}
function mergePhraseSel(a, b) {          // 当前优先, 旧补缺
    const A = J(a) || {}, B = J(b) || {};
    const out = Object.assign({}, B, A);
    return JSON.stringify(out);
}
function mergeDay(a, b) {                // 同一天逐字段取大 (保守不重复计)
    const A = J(a) || {}, B = J(b) || {};
    const out = Object.assign({}, B, A);
    new Set(Object.keys(A).concat(Object.keys(B))).forEach(f => {
        const x = A[f], y = B[f];
        if (typeof x === 'number' || typeof y === 'number') {
            out[f] = Math.max(Number(x) || 0, Number(y) || 0);
        }
    });
    return JSON.stringify(out);
}
function actScore(w) {
    return (w.reviewCount || 0) + (w.mistakeCount || 0) + (w.srsLevel || 0);
}
function mergeNotebook(a, b) {           // 按词并集, 冲突取活动多的
    const A = J(a) || [], B = J(b) || [];
    const byWord = {};
    const put = (w, fromCur) => {
        const k = String(w.word || '').toLowerCase();
        if (!k) return;
        const e = byWord[k];
        if (!e) { byWord[k] = { w: w, cur: fromCur }; return; }
        const sN = actScore(w), sO = actScore(e.w);
        if (sN > sO || (sN === sO && !e.cur && fromCur)) byWord[k] = { w: w, cur: fromCur };
    };
    A.forEach(w => put(w, true));
    B.forEach(w => put(w, false));
    return JSON.stringify(Object.keys(byWord).map(k => byWord[k].w));
}
function mergeUserLessons(a, b) {        // 当前优先, 旧快照补整课
    const A = J(a) || [], B = J(b) || [];
    const have = new Set(A.map(l => l.id));
    const out  = A.slice();
    const back = [];
    B.forEach(l => { if (l && l.id && !have.has(l.id)) { out.push(l); back.push(l.id); } });
    return { json: JSON.stringify(out), restored: back };
}

// ─── 逐档案前缀合并 ─────────────────────────────────────
const prefixes = new Set();
[cur, old].forEach(m => Object.keys(m).forEach(k => {
    const mt = k.match(/^(hsv_.+?_)(?:notebook|lesson_progress|lessons_user|day_|lesson_mixed|lesson_sess)/);
    if (mt) prefixes.add(mt[1]);
}));
if (!prefixes.size) { console.log('✗ 两份文件里都找不到 VocabPeak 档案键'); process.exit(1); }

const out = Object.assign({}, cur);      // 基底 = 当前备份 (其余键不动)
let report = [];

for (const P of prefixes) {
    const g = n => [cur[P + n], old[P + n]];
    const rules = [
        ['lesson_progress',   mergeProgress],
        ['lesson_mixed',      mergeMixed],
        ['lesson_sess',       mergeSess],
        ['lesson_phrase_sel', mergePhraseSel],
        ['notebook',          mergeNotebook]
    ];
    rules.forEach(([name, fn]) => {
        const [a, b] = g(name);
        if (a == null && b == null) return;
        const merged = fn(a, b);
        if (merged !== a) report.push(`${P}${name}: 已并入旧记录`);
        out[P + name] = merged;
    });
    // 用户课整课找回
    const [ua, ub] = g('lessons_user');
    if (ua != null || ub != null) {
        const r = mergeUserLessons(ua, ub);
        out[P + 'lessons_user'] = r.json;
        if (r.restored.length) report.push(`${P}lessons_user: 找回整课 ${r.restored.join(', ')}`);
    }
    // 日志: 旧快照独有的天补齐, 同天取大
    Object.keys(old).forEach(k => {
        if (k.indexOf(P + 'day_') !== 0) return;
        if (!(k in cur)) { out[k] = old[k]; report.push(k + ': 补回缺失日'); }
        else {
            const m = mergeDay(cur[k], old[k]);
            if (m !== cur[k]) { out[k] = m; report.push(k + ': 同日取大合并'); }
        }
    });
}

fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log('═'.repeat(56));
console.log('合并完成 → ' + outFile);
console.log('═'.repeat(56));
report.length
    ? report.forEach(r => console.log('  • ' + r))
    : console.log('  (旧快照没有提供任何当前缺少的记录)');
console.log('\n下一步: 平板 设置 → 数据 → 导入 ' + outFile + ', 然后手动同步一次推回云端。');
console.log('提示: 可先用 check-lesson-records.js 对 ' + outFile + ' 复核各课记录。');
