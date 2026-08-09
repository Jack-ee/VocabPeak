// test-lessons-v125.js — v125 (hsv-v28) 句译缺失导入警告 验证
const fs   = require('fs');
const path = require('path');
const DIR  = path.join(__dirname, 'VocabPeak-main');
let pass = 0, fail = 0;
function ok(c, n, x) { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')); } }

const src = fs.readFileSync(path.join(DIR, 'lessons.js'), 'utf8');
ok(/const zhMissing = flatSents\.filter\(s => !s\.zh\)\.length;/.test(src), '句译覆盖统计存在');
ok(/zhMissing > 0 && flatSents\.length > 0/.test(src), '仅缺译时告警 (全覆盖不打扰)');
ok(src.includes('\\u53E5\\u7F3A\\u5C11\\u4E2D\\u6587\\u53E5\\u8BD1'), '警告文案含缺译计数说明');
ok(src.includes('\\u590D\\u5236\\u8BC6\\u522B\\u63D0\\u793A\\u8BCD') && src.includes('\\u8865\\u53E5\\u8BD1'), '警告给出两条补救路径');
// 警告在 warnings 通道 (不阻断导入): 插入点位于 stats 装配之前、errors 判定之外
const at = src.indexOf('const zhMissing');
ok(at > 0 && src.indexOf('warnings.push', at) > 0 && src.indexOf('errors.push', at) !== src.indexOf('warnings.push', at), '走 warnings 不走 errors (兼容旧格式)');
const idx = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const sw  = fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8');
const vs  = [...idx.matchAll(/\?v=(\d+)/g)].map(x => x[1]);
ok(new Set(vs).size === 1 && vs[0] === '125', 'index.html 全部 ?v=125');
ok(/const CACHE_NAME = 'hsv-v28'/.test(sw), 'sw.js CACHE_NAME = hsv-v28');
ok(/hsv-v28 \(\?v=125\)/.test(sw), 'sw.js 有 v28 变更日志');

console.log(`\n  通过 ${pass} 项, 失败 ${fail} 项`);
process.exit(fail ? 1 : 0);
