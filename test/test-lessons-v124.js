// test-lessons-v124.js — v124 (hsv-v27) 语音包分发密钥 验证
const fs   = require('fs');
const path = require('path');
const DIR  = path.join(__dirname, 'VocabPeak-main');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
    if (cond) pass++;
    else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n── ' + t + ' ──'); }

const worker = fs.readFileSync(path.join(DIR, 'vocabpeak-tts-proxy.js'), 'utf8');
const pack   = fs.readFileSync(path.join(DIR, 'tts-pack.js'), 'utf8');

function extract(src, name) {
    const i = src.indexOf('function ' + name);
    if (i < 0) throw new Error('未找到 ' + name);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; started = true; }
        else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error('未闭合 ' + name);
}

// ─── 1. Worker 密钥校验 (纯函数实测) ────────────────────
section('1. packKeyAllowed 密钥门');
eval(extract(worker, 'packKeyAllowed'));
ok(packKeyAllowed({}, '') === true,                    'PACK_KEYS 未设 → 不设防 (向后兼容)');
ok(packKeyAllowed({ PACK_KEYS: '' }, 'x') === true,    'PACK_KEYS 为空串 → 不设防');
ok(packKeyAllowed({ PACK_KEYS: 'a,b' }, 'a') === true, '清单内密钥放行');
ok(packKeyAllowed({ PACK_KEYS: 'a,b' }, 'c') === false,'清单外密钥拒绝');
ok(packKeyAllowed({ PACK_KEYS: 'a,b' }, '') === false, '启用后空密钥拒绝');
ok(packKeyAllowed({ PACK_KEYS: ' a , b ' }, 'b') === true, '清单空白容错');
ok(packKeyAllowed({ PACK_KEYS: 'a' }, ' a ') === true, '密钥两端空白容错');
ok(packKeyAllowed({ PACK_KEYS: 'family-2026' }, 'family') === false, '前缀不算匹配');

// ─── 2. Worker 结构 ─────────────────────────────────────
section('2. Worker 路由接线');
ok(/async fetch\(request, env\)/.test(worker), '入口签名接 env');
ok(/handlePackRequest\(request, origin, env\)/.test(worker), '包路由透传 env');
ok(/searchParams\.get\('key'\)/.test(worker), '包路由读 key 参数');
ok(/status: 403, headers: corsHeaders\(origin\)/.test(worker), '密钥无效返回 403');
ok(worker.includes("key.slice(0, 4) + '***'"), '日志只记 key 前缀 (不泄整钥)');
ok(/env\.GH_TOKEN/.test(worker) && /api\.github\.com\/repos\//.test(worker), '私有仓库路径 (GH_TOKEN 触发)');
ok(/application\/octet-stream/.test(worker), '私有资产按 octet-stream 拉取');
ok(/releases\/download\//.test(worker), '公开直链路径保留 (无 GH_TOKEN 时)');
ok((worker.match(/PACK_ASSET_RE\.test\(asset\)/g) || []).length === 1, '资产白名单校验保留');

// ─── 3. 客户端携带密钥 ──────────────────────────────────
section('3. tts-pack.js 密钥携带');
const prefs = {};
const window_ = { DB: { getPref: (k, d) => (k in prefs ? prefs[k] : d) } };
eval(`
var window = window_;
${extract(pack, 'packKey')}
${extract(pack, 'assetUrl')}
`);
ok(assetUrl('https://w.dev', 'a.empack') === 'https://w.dev?asset=a.empack', '无密钥时 URL 不变 (向后兼容)');
prefs['pack_key'] = ' family-2026 ';
ok(assetUrl('https://w.dev', 'a.empack') === 'https://w.dev?asset=a.empack&key=family-2026', '有密钥自动携带并去空白');
prefs['pack_key'] = 'k&e y';
ok(assetUrl('https://w.dev', 'a.empack').includes('key=k%26e%20y'), '密钥经 URL 编码');

// ─── 4. 设置接线 / 课程包隔离 / 版本 ────────────────────
section('4. 设置接线与版本');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
ok(/settings-pack-key/.test(idx), 'index.html 有密钥输入');
ok(/getPref\?\.\('pack_key', ''\)/.test(app), 'app.js 加载密钥');
ok(/setPref\('pack_key'/.test(app), 'app.js 保存密钥');
const mkpack = fs.readFileSync(path.join(DIR, 'make-course-pack.js'), 'utf8');
ok(/lessons_user|lesson_phrase_sel/.test(mkpack) && !/pack_key/.test(mkpack), '课程包白名单不含密钥 (不随包外泄)');
const sw = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && Number(vs[0]) >= 124, 'index.html ?v 全部一致且 >= 124');
const swV7 = (sw.match(/const CACHE_NAME = 'hsv-v(\d+)'/) || [])[1];
ok(swV7 && Number(swV7) >= 27, 'sw.js CACHE_NAME >= hsv-v27');
ok(/hsv-v27 \(\?v=124\)/.test(sw), 'sw.js 有 v27 变更日志');
ok(/'\.\/tts-pack\.js'/.test(sw), 'tts-pack.js 仍在预缓存');

console.log('\n' + '═'.repeat(46));
console.log(`  通过 ${pass} 项, 失败 ${fail} 项`);
console.log('═'.repeat(46));
process.exit(fail ? 1 : 0);
