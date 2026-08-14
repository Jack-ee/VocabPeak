// test-lessons-v140.js — v140 (hsv-v43) 课程发布加密 (版权防护)
//   • 端到端往返: Node 工具加密 → WebCrypto 订阅端解密 (真实闭环)
//   • 确定性加密: 内容不变密文逐字节不变 (增量零重下的根基)
//   • 口令错认证失败 / 明文向后兼容 / manifest 去课名
// 运行: node test-lessons-v140.js
const fs = require('fs'), path = require('path'), os = require('os');
const crypto = require('crypto');
const DIR = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } };
const sec = t => console.log('\n── ' + t + ' ──');
const tool    = require(path.join(DIR, 'tools', 'make-course-release.js'));
const feedSrc = fs.readFileSync(path.join(DIR, 'course-feed.js'), 'utf8');

(async () => {
    // ─── 1. 发布工具加密与确定性 ────────────────────────────
    sec('1. 发布工具');
    const fixture = [{ id: 'U01', _v: 100, title: '课一', words: [{ id: 'U01-W1', lemma: 'ancient' }] },
                     { id: 'U02', _v: 200, title: '课二', words: [] }];
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp140-'));
    const inF = path.join(tmp, 'b.json');
    fs.writeFileSync(inF, JSON.stringify({ lessons: fixture }));
    const outA = path.join(tmp, 'a'), outB = path.join(tmp, 'b'), outP = path.join(tmp, 'p');

    const rA = tool.build(inF, outA, 'family-2026');
    ok(rA.encrypted && rA.manifest._enc === 1 && rA.manifest._encSalt, '加密发布: manifest 带 _enc/_encSalt');
    ok(rA.manifest.courses.every(c => c.title === undefined), '加密时 manifest 不带课名 (课名也是内容)');
    const envText = fs.readFileSync(path.join(outA, 'U01.json'), 'utf8');
    const env = JSON.parse(envText);
    ok(env.enc === 1 && env.iv && env.ct, '分课文件是密文信封 {enc,iv,ct}');
    ok(!/ancient|课一/.test(envText), '信封里没有任何明文内容泄漏');
    ok(crypto.createHash('sha256').update(envText, 'utf8').digest('hex')
       === rA.manifest.courses.find(c => c.id === 'U01').sha256, 'sha256 校验的是密文本身');

    // 确定性: 同口令同内容再发布, 密文逐字节相同 (订阅端零重下)
    const rB = tool.build(inF, outB, 'family-2026');
    ok(fs.readFileSync(path.join(outB, 'U01.json'), 'utf8') === envText,
       '确定性加密: 内容不变密文逐字节不变');
    ok(rB.manifest.courses.find(c => c.id === 'U01').sha256
       === rA.manifest.courses.find(c => c.id === 'U01').sha256, 'sha256 跨次发布稳定');

    // 明码路径向后兼容 + 内容变则密文变
    const rP = tool.build(inF, outP);
    ok(!rP.encrypted && rP.manifest.courses[0].title === '课一', '不给口令 = 明码发布 (向后兼容, 带课名)');
    const fixture2 = JSON.parse(JSON.stringify(fixture)); fixture2[0].words.push({ id: 'U01-W2', lemma: 'x' });
    fs.writeFileSync(inF, JSON.stringify({ lessons: fixture2 }));
    const rC = tool.build(inF, path.join(tmp, 'c'), 'family-2026');
    const envC = JSON.parse(fs.readFileSync(path.join(tmp, 'c', 'U01.json'), 'utf8'));
    ok(envC.iv !== env.iv, '内容变化 → iv 随之变 (无 GCM 同 iv 异明文风险)');

    // ─── 2. 订阅端解密 (真实 WebCrypto 闭环) ────────────────
    sec('2. 订阅端往返');
    function makeEnv(localLessons) {
        const env2 = { merged: null, fetches: [], ready: true };
        env2.window = {
            DB: { coursesReady: () => true,
                  getPref: (n, fb) => n === 'course_feed_pass' ? env2.pass ?? fb : fb,
                  loadUserLessons: () => localLessons.slice(),
                  mergeUserLessons: a => { env2.merged = a; return true; } },
            SyncManager: { triggerSave() {} },
            dispatchEvent() {}, App: { showToast() {} }
        };
        return env2;
    }
    function runFeed(env2, dir) {
        global.window = env2.window;
        global.document = { getElementById: () => null };
        global.CustomEvent = function (t, o) { this.type = t; this.detail = o && o.detail; };
        global.fetch = async (url) => {
            const u = String(url);
            const name = fs.readdirSync(dir).find(n => u.includes(n));
            env2.fetches.push(name || u);
            if (!name) return { ok: false, status: 404 };
            const text = fs.readFileSync(path.join(dir, name), 'utf8');
            return { ok: true, json: async () => JSON.parse(text), text: async () => text };
        };
        (new Function('window', 'document', 'fetch', 'CustomEvent', 'console', feedSrc))
            (global.window, global.document, global.fetch, global.CustomEvent,
             { log() {}, warn() {}, error() {} });
        return env2.window.CourseFeed;
    }

    // 2a. 正确口令: 全量接收且解密内容完整
    let e2 = makeEnv([]); e2.pass = 'family-2026';
    let r = await runFeed(e2, outA).check(false);
    ok(r && r.added === 2 && r.failed === 0, '正确口令全量接收', JSON.stringify(r));
    const u01 = e2.merged.find(l => l.id === 'U01');
    ok(u01 && u01.title === '课一' && u01.words[0].lemma === 'ancient',
       '解密后课程内容完整 (Node 加密 ↔ WebCrypto 解密闭环)');

    // 2b. 没配口令: 明确指引, 不下载
    e2 = makeEnv([]); e2.pass = '';
    r = await runFeed(e2, outA).check(false);
    ok(r && r.error === 'need pass' && e2.merged === null, '缺口令时给指引不硬下载');

    // 2c. 口令错: AES-GCM 认证失败, 计入失败不合并
    e2 = makeEnv([]); e2.pass = 'wrong-pass';
    r = await runFeed(e2, outA).check(false);
    ok(r && r.failed === 2 && e2.merged === null, '口令错 → 全部认证失败, 零合并');

    // 2d. 明文清单向后兼容
    e2 = makeEnv([]); e2.pass = '';
    r = await runFeed(e2, outP).check(false);
    ok(r && r.added === 2 && r.failed === 0, '明文清单不需口令照常工作 (部署次序安全)');

    // ─── 3. 接线与版本 ──────────────────────────────────────
    sec('3. 接线与版本');
    ok(/course_feed_pass/.test(feedSrc) && /deriveKey\(pass, manifest\._encSalt/.test(feedSrc),
       '订阅端从 pref 取口令并按 manifest salt 派生密钥');
    ok(/iterations: 100000/.test(feedSrc), 'PBKDF2 十万轮 (与发布侧一致)');
    const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
    ok(/id="feed-pass-input"/.test(idx) && /type="password"/.test(idx), '设置页有密码框');
    ok(/course_feed_pass/.test(app), 'app.js 接线保存口令');
    const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
    const vs = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
    ok(new Set(vs).size === 1 && vs[0] === '141', 'index.html 全部 ?v=141 (' + vs.length + ' 处)');
    ok(vs.length === 25, '?v= 引用总数 25 处');
    ok(/const CACHE_NAME = 'hsv-v44'/.test(sw), 'sw.js CACHE_NAME = hsv-v43');
    ok(/hsv-v43 \(\?v=140\)/.test(sw), 'sw.js 有 v43 变更日志');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('\n' + '═'.repeat(46));
    console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
    console.log('═'.repeat(46));
    process.exit(fail ? 1 : 0);
})();
