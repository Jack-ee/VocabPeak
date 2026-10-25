// test-pack-shards-v148.js — 发音包分片客户端 (tts-pack.js) 真浏览器测试
//   用生成器 (假 TTS) 现场造一套分片, 起一个模拟 Worker 的本地服务器,
//   在 Chromium 里跑 TTSPack: 旧整包迁移 → 只下变了的分片 → sha 校验 →
//   全部对齐后才剪枝 → 自动小更新。需要 playwright 与 ffmpeg, 缺一跳过。
// 运行: node test/test-pack-shards-v148.js
'use strict';
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const H    = require('./_harness');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.log('跳过: 未安装 playwright'); process.exit(0); }
if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('跳过: 本机没有 ffmpeg'); process.exit(0); }

const { ok, sec, done } = H.makeChecker();
const TMP  = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-shards-'));
const GEN  = path.join(H.DIR, 'tools', 'generate_audio_pack.py');
const STO  = path.join(TMP, 'stories');
const WL   = path.join(TMP, 'wordlist.txt');
fs.mkdirSync(STO);

const WORDS = '# voices: ash, nova\n#@1 abandon\nabandon\n#@2 bacon\nbacon\n#@3 cable\ncable\n';
fs.writeFileSync(WL, WORDS);
fs.writeFileSync(path.join(STO, 'S0001.json'), JSON.stringify({
    id: 'S0001', narrator: 'coral',
    paras: [{ sentences: [{ text: 'Lin Yue accepted at once.' }] }], words: [] }));
fs.writeFileSync(path.join(STO, 'stories-manifest.json'),
    JSON.stringify({ stories: [{ id: 'S0001', file: 'S0001.json' }] }));

function build(dist, prev, extra) {
    const env = Object.assign({}, process.env, {
        PACK_WORDLIST: WL, PACK_STORIES_DIR: STO, PACK_DIST_DIR: dist,
        PACK_PREV_DIR: prev || path.join(TMP, 'none'), PACK_FAKE_TTS: '1', GITHUB_REPOSITORY: '' }, extra || {});
    const r = spawnSync('python3', ['-I', GEN], { env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error('generator failed: ' + r.stdout + r.stderr);
    return JSON.parse(fs.readFileSync(path.join(dist, 'vocabpeak-audio-pack.index.json'), 'utf8'));
}

const D1 = path.join(TMP, 'd1');
const idx1 = build(D1);

// 模拟 Worker: /w?asset=NAME → 当前发布目录里的文件; 记录每个资产被取了几次
let serveDir = D1;
let corrupt  = '';
const hits   = {};
const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/page.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<!doctype html><meta charset=utf-8><script>window.DB={getPref:(k,d)=>k==="tts_proxy_url"?location.origin+"/w":(d||"")};</script><script src="/tts-pack.js"></script>');
    }
    if (u.pathname === '/tts-pack.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        return res.end(fs.readFileSync(path.join(H.DIR, 'tts-pack.js')));
    }
    if (u.pathname === '/w') {
        const name = u.searchParams.get('asset') || '';
        hits[name] = (hits[name] || 0) + 1;
        const p = path.join(serveDir, name);
        if (!/^vocabpeak-audio-pack[A-Za-z0-9._-]*$/.test(name) || !fs.existsSync(p)) {
            res.writeHead(404); return res.end('Asset not in release: ' + name);
        }
        let buf = fs.readFileSync(p);
        if (name === corrupt) { buf = Buffer.from(buf); buf[buf.length - 1] ^= 0xff; }
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length });
        return res.end(buf);
    }
    res.writeHead(404); res.end();
});

const resetHits = () => Object.keys(hits).forEach(k => delete hits[k]);
const shardHits = () => Object.keys(hits).filter(k => /\.empack$/.test(k)).sort();

srv.listen(0, async () => {
    const port    = srv.address().port;
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('http://localhost:' + port + '/page.html');

        sec('旧版整包迁移');
        // 预置 v147 设备状态: 旧 meta + 已下线音色 + 已删除的词 + 一个大块旧片段
        await page.evaluate(() => new Promise((resolve, reject) => {
            const rq = indexedDB.open('hsv-tts-pack', 1);
            rq.onupgradeneeded = () => rq.result.createObjectStore('clips', { keyPath: 'k' });
            rq.onsuccess = () => {
                const tx = rq.result.transaction('clips', 'readwrite');
                const st = tx.objectStore('clips');
                const big = new Blob([new Uint8Array(40000)], { type: 'audio/mpeg' });
                st.put({ k: '__meta__', generation: 5, voices: ['alloy', 'ash', 'nova', 'onyx'], clipCount: 4 });
                st.put({ k: 'ash|abandon', blob: big });
                st.put({ k: 'onyx|abandon', blob: big });
                st.put({ k: 'alloy|removedword', blob: big });
                tx.oncomplete = () => { rq.result.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
        }));
        await page.reload();
        let st0 = await page.evaluate(() => TTSPack.status());
        ok(st0 && st0.format === 1, '迁移前是旧版整包', JSON.stringify(st0));
        const pending = await page.evaluate(() => TTSPack.checkForUpdates({ force: true }));
        ok(pending && pending.todo === idx1.shards.length && !pending.synced,
           '检查更新: 全部分片待下载 (超过自动上限不下)', JSON.stringify(pending));

        resetHits();
        const r1 = await page.evaluate(() => TTSPack.download(() => {}));
        ok(r1.shardsUpdated === idx1.shards.length && r1.failed.length === 0, '下载全部分片', JSON.stringify(r1));
        ok(r1.pruned === 2, '剪掉旧音色与已删词 2 个', r1.pruned);
        const keys1 = await page.evaluate(() => new Promise(res => {
            const rq = indexedDB.open('hsv-tts-pack', 1);
            rq.onsuccess = () => {
                const g = rq.result.transaction('clips').objectStore('clips').getAllKeys();
                g.onsuccess = () => res(g.result);
            };
        }));
        ok(!keys1.includes('onyx|abandon') && !keys1.includes('alloy|removedword'), '旧片段已删除');
        ok(keys1.includes('coral|lin yue accepted at once.'), '短文句子按朗读者入库');
        const sz = await page.evaluate(() => TTSPack.getClip('abandon', 'ash').then(b => b.size));
        ok(sz > 0 && sz < 40000, '旧大片段被瘦身版覆盖', sz);
        const st1 = await page.evaluate(() => TTSPack.status());
        ok(st1.format === 2 && st1.generation === idx1.generation && !st1.partial, '状态: v2 分片包', JSON.stringify(st1));
        const vs = await page.evaluate(() => TTSPack.getCachedVoices('Lin Yue accepted at once.'));
        ok(vs.length === 1 && vs[0] === 'coral', '短文句子只有朗读者音色', vs);

        sec('无变化: 只取索引');
        resetHits();
        const msgs = [];
        await page.exposeFunction('logMsg', m => msgs.push(m));
        const r2 = await page.evaluate(() => TTSPack.download(m => window.logMsg(m)));
        ok(shardHits().length === 0 && hits['vocabpeak-audio-pack.index.json'] === 1, '没有下载任何分片', JSON.stringify(hits));
        ok(r2.shardsUpdated === 0 && /已是最新/.test(msgs[msgs.length - 1] || ''), '提示已是最新', msgs.slice(-1));

        sec('增量: 加一个 a 开头的词');
        fs.writeFileSync(WL, WORDS + '#@4 accept\naccept\n');
        const D2 = path.join(TMP, 'd2');
        const idx2 = build(D2, D1);
        serveDir = D2;
        resetHits();
        const r3 = await page.evaluate(() => TTSPack.download(() => {}));
        ok(shardHits().length === 1 && /^vocabpeak-audio-pack\.w-a\.[0-9a-f]{12}\.empack$/.test(shardHits()[0]),
           '只下载 w-a 一个分片', shardHits());
        ok(await page.evaluate(() => TTSPack.getClip('accept', 'nova').then(b => !!b)), '新词可播');

        sec('sha 不符: 跳过, 不剪枝');
        fs.writeFileSync(WL, WORDS.replace('#@3 cable\ncable\n', '') + '#@4 accept\naccept\n#@5 cabin\ncabin\n');
        const D3 = path.join(TMP, 'd3');
        const idx3 = build(D3, D2);
        serveDir = D3;
        corrupt  = idx3.shards.find(x => x.id === 'w-c').file;
        const r4 = await page.evaluate(() => TTSPack.download(() => {}));
        ok(r4.failed.length === 1 && r4.failed[0] === 'w-c', '损坏的分片被拒收', JSON.stringify(r4));
        ok(await page.evaluate(() => TTSPack.getClip('cable', 'ash').then(b => !!b)), '有分片没对齐时不剪枝 (cable 还在)');
        ok((await page.evaluate(() => TTSPack.status())).partial === true, '状态标记部分完成');
        corrupt = '';
        const r5 = await page.evaluate(() => TTSPack.download(() => {}));
        ok(r5.failed.length === 0 && r5.shardsUpdated === 1, '重试后补齐', JSON.stringify(r5));
        ok(await page.evaluate(() => TTSPack.getClip('cable', 'ash').then(b => !b)), '对齐后剪掉已删的 cable');
        ok(await page.evaluate(() => TTSPack.getClip('cabin', 'ash').then(b => !!b)), 'cabin 可播');

        sec('启动时自动小更新');
        fs.writeFileSync(path.join(STO, 'S0002.json'), JSON.stringify({
            id: 'S0002', narrator: 'fable',
            paras: [{ sentences: [{ text: 'The farm grew quickly.' }] }], words: [] }));
        fs.writeFileSync(path.join(STO, 'stories-manifest.json'), JSON.stringify({ stories: [
            { id: 'S0001', file: 'S0001.json' }, { id: 'S0002', file: 'S0002.json' }] }));
        const D4 = path.join(TMP, 'd4');
        build(D4, D3);
        serveDir = D4;
        const none = await page.evaluate(() => TTSPack.checkForUpdates({ autoMaxBytes: 1 << 24 }));
        ok(none === null, '12 小时内不重复检查');
        const auto = await page.evaluate(() => TTSPack.checkForUpdates({ force: true, autoMaxBytes: 1 << 24 }));
        ok(auto && auto.todo === 1 && auto.synced, '小更新自动下载', JSON.stringify(auto));
        const v2 = await page.evaluate(() => TTSPack.getCachedVoices('The farm grew quickly.'));
        ok(v2.length === 1 && v2[0] === 'fable', '新短文句子可播 (fable)', v2);

        sec('并发同步: 自动更新与手动下载同时触发');
        fs.writeFileSync(WL, fs.readFileSync(WL, 'utf8') + '#@6 cactus\ncactus\n');
        const D5 = path.join(TMP, 'd5');
        build(D5, D4);
        serveDir = D5;
        const both = await page.evaluate(() => Promise.all([
            TTSPack.checkForUpdates({ force: true, autoMaxBytes: 1 << 24 }),
            TTSPack.download(() => {})]));
        const st5 = await page.evaluate(() => TTSPack.status());
        ok(both[0] && both[1] && !both[1].failed.length && !st5.partial, '两路同步串行完成, 无失败', JSON.stringify(both));
        ok(await page.evaluate(() => TTSPack.getClip('cactus', 'ash').then(b => !!b)), '新词到位');

        sec('删词不删分片包音频');
        await page.evaluate(() => TTSPack.deleteWord('abandon'));
        ok(await page.evaluate(() => TTSPack.getClip('abandon', 'ash').then(b => !!b)),
           '分片包由发布侧管理, 删词后片段保留 (否则分片没变就回不来)');

        sec('剪枝保险: 一次删太多则暂缓');
        fs.writeFileSync(WL, '# voices: ash, nova\n#@1 abandon\nabandon\n');
        const D6 = path.join(TMP, 'd6');
        build(D6, D5, { PACK_ALLOW_DROP: '1', PACK_DROP_GUARD_MIN: '0' });
        serveDir = D6;
        const r7 = await page.evaluate(() => { TTSPack._setPruneMin(0); return TTSPack.download(() => {}); });
        ok(r7.held > 0 && r7.pruned === 0, '超过 20% 的剪枝被暂缓', JSON.stringify(r7));
        ok(await page.evaluate(() => TTSPack.getClip('bacon', 'ash').then(b => !!b)), '片段仍在, 照常可播');
        ok((await page.evaluate(() => TTSPack.status())).pruneHeld > 0, '状态里记下暂缓数量');

        sec('分片包设备: 索引暂时 404 时不回退旧整包');
        serveDir = path.join(TMP, 'legacy');
        fs.mkdirSync(serveDir);
        fs.writeFileSync(path.join(serveDir, 'vocabpeak-audio-pack.manifest.json'), '{"generation":5}');
        resetHits();
        const r6 = await page.evaluate(() => TTSPack.download(() => {}).then(r => 'ok', e => String(e.message)));
        ok(/暂时取不到/.test(r6) && !hits['vocabpeak-audio-pack.empack'] && !hits['vocabpeak-audio-pack.manifest.json'],
           '报「稍后再试」, 不去下 1.6 GB 旧整包', r6 + ' ' + JSON.stringify(hits));

        sec('从没装过分片包的设备: 无索引时仍走旧整包');
        const page2 = await (await browser.newContext()).newPage();
        await page2.goto('http://localhost:' + port + '/page.html');
        resetHits();
        const r8 = await page2.evaluate(() => TTSPack.download(() => {}).then(r => 'ok', e => String(e.message)));
        ok(/HTTP 404/.test(r8) && hits['vocabpeak-audio-pack.empack'] === 1, '旧发布兼容 (此处旧包不存在 → 404)', r8);

        ok(errors.length === 0, '无页面错误', errors.join(' | '));
    } catch (e) {
        ok(false, '测试异常', e && e.stack);
    } finally {
        await browser.close();
        srv.close();
        fs.rmSync(TMP, { recursive: true, force: true });
        done('发音包分片 v148');
    }
});
