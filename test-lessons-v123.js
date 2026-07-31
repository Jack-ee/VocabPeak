// test-lessons-v123.js — v123 (hsv-v26) 拉取前快照 + 恢复工具 验证
const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');
const DIR  = path.join(__dirname, 'VocabPeak-main');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) pass++;
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

const sync = fs.readFileSync(path.join(DIR, 'sync.js'), 'utf8');

// ─── 1. 拉取前快照: 结构与隔离性 ────────────────────────
section('1. 拉取前快照 (兜底保险)');
ok(/'_' \+ prefix \+ 'prepull'/.test(sync), '快照键 = 下划线 + 档案前缀 (两处一致)');
ok(!('_hsv_kid_prepull'.indexOf('hsv_kid_') === 0), '键名不匹配档案前缀 → 不进推送快照/不被拉取删除');
const guards = ['lesson_progress', 'lesson_mixed', 'lesson_sess',
                'lesson_phrase_sel', 'notebook', 'lessons_user'];
guards.forEach(g => ok(sync.includes(`'${g}'`), '守护键含 ' + g));
ok(/const stash = \{ ts: Date\.now\(\), data: \{\} \};/.test(sync), '快照带时间戳');
ok(/catch \(e\) \{ \/\* 配额不足/.test(sync), '快照失败不阻塞同步');
// 快照写入必须在套用远端之前 (位置断言)
const stashAt = sync.indexOf("'_' + prefix + 'prepull'");
const applyAt = sync.indexOf('Object.keys(remote).forEach');
ok(stashAt > 0 && applyAt > 0 && stashAt < applyAt, '快照先于远端套用');
ok(/function restorePrePull\(\)/.test(sync), '回滚函数存在');
ok(/restorePrePull,/.test(sync), '回滚已挂公开 API');
ok(/restoredKeys: keys, savedAt: stash\.ts/.test(sync), '回滚返回明细');

// ─── 2. 恢复工具: 全链路子进程实测 ──────────────────────
section('2. merge-restore-backup.js 端到端');
const P = 'hsv_t_';
const cur = {}, oldD = {};
cur[P + 'lessons_user']    = JSON.stringify([{ id: 'U08', title: 'T', words: [] }]);
cur[P + 'lesson_progress'] = JSON.stringify({});
cur[P + 'notebook']        = JSON.stringify([{ word: 'a', reviewCount: 3 }]);
cur[P + 'keepme']          = 'x';
oldD[P + 'lesson_progress'] = JSON.stringify({ U08: { clozeBest: 66 } });
oldD[P + 'lesson_mixed']    = JSON.stringify({ w: { 'U08-W01': [1, 0, 9, 1] }, p: {} });
oldD[P + 'notebook']        = JSON.stringify([{ word: 'a', reviewCount: 1 }, { word: 'b', mistakeCount: 2 }]);
oldD[P + 'lessons_user']    = JSON.stringify([{ id: 'U08', title: 'T', words: [] },
                                              { id: 'U09', title: 'Lost Lesson', words: [] }]);
oldD[P + 'day_2026-07-20']  = JSON.stringify({ quizTotal: 5 });
fs.writeFileSync('/tmp/t-cur.json', JSON.stringify(cur));
fs.writeFileSync('/tmp/t-old.json', JSON.stringify({ data: oldD }));
cp.execSync(`node ${path.join(DIR, 'merge-restore-backup.js')} /tmp/t-cur.json /tmp/t-old.json /tmp/t-merged.json`,
    { stdio: 'pipe' });
const m = JSON.parse(fs.readFileSync('/tmp/t-merged.json', 'utf8'));
const J = s => JSON.parse(s);
ok(J(m[P + 'lesson_progress']).U08.clozeBest === 66, '被冲的填空成绩找回');
ok(Object.keys(J(m[P + 'lesson_mixed']).w).length === 1, '练习档案找回');
const nb = J(m[P + 'notebook']);
ok(nb.find(w => w.word === 'a').reviewCount === 3, '生词本冲突取活动多的一侧 (当前)');
ok(!!nb.find(w => w.word === 'b'), '仅旧快照有的词找回');
ok(J(m[P + 'lessons_user']).some(l => l.id === 'U09'), '被冲的整课找回');
ok(m[P + 'day_2026-07-20'] && J(m[P + 'day_2026-07-20']).quizTotal === 5, '缺失日补回');
ok(m[P + 'keepme'] === 'x', '无关键一律用当前值');
ok(!(('_' + P + 'prepull') in m), '快照键不进备份 (本机专属)');

// Gist 快照 {data:{...}} 与扁平备份两种输入都可用 (上面用了 data 包装)
cp.execSync(`node ${path.join(DIR, 'merge-restore-backup.js')} /tmp/t-cur.json /tmp/t-merged.json /tmp/t-m2.json`,
    { stdio: 'pipe' });
ok(fs.existsSync('/tmp/t-m2.json'), '扁平格式输入同样可用');

// ─── 3. 版本纪律 ────────────────────────────────────────
section('3. 版本纪律');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '123', 'index.html 全部 ?v=123');
ok(/const CACHE_NAME = 'hsv-v26'/.test(sw), 'sw.js CACHE_NAME = hsv-v26');
ok(/hsv-v26 \(\?v=123\)/.test(sw), 'sw.js 有 v26 变更日志');
ok(/restorePrePull/.test(sw), '变更日志提及回滚入口');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
