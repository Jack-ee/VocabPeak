// test-release.js — 发版纪律检查 (v147 起, 不钉死版本号, 每次发版都适用)
//   部署手册第八节: 任何被缓存的运行时文件有改动, 必须同时升 sw.js 的
//   CACHE_NAME 与 index.html 全部 ?v=N, 并在 sw.js 顶部写变更注释 ——
//   只推部分文件是「改动不生效」的头号原因。这里把纪律变成可执行检查。
//   对应关系: CACHE_NAME = hsv-v(N - 97), 例如 ?v=147 ↔ hsv-v50。
// 运行: node test/test-release.js
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./_harness');
const { ok, sec, done } = H.makeChecker();

const idx = H.src('index.html');
const sw  = H.src('sw.js');

sec('版本号配对');
const refs = [...idx.matchAll(/(?:src|href)="([^":?]+\.(?:js|css))(\?v=(\d+))?"/g)]
    .filter(m => !/^https?:/.test(m[1]));
const vs = refs.map(m => m[3]);
ok(refs.length > 0, 'index.html 有本地 js/css 引用', refs.length);
ok(vs.every(v => v), '每个本地 js/css 都带 ?v=', refs.filter(m => !m[3]).map(m => m[1]).join(','));
ok(new Set(vs).size === 1, 'index.html 全部 ?v= 相同', [...new Set(vs)].join(','));
const N = Number(vs[0]);
const cache = (sw.match(/const CACHE_NAME = 'hsv-v(\d+)'/) || [])[1];
ok(Number(cache) === N - 97, 'CACHE_NAME hsv-v' + cache + ' 与 ?v=' + N + ' 配对 (差 97)');
const first = (sw.match(/^\/\/ hsv-v(\d+) \(\?v=(\d+)\)/m) || []);
ok(first[1] === cache && Number(first[2]) === N, 'sw.js 顶部第一条变更注释就是本版', first[0]);
const note = (idx.match(/Current version: v=(\d+)/) || [])[1];
ok(!note || Number(note) === N, 'index.html 头部注释的版本号同步', note);

sec('预缓存清单');
const assets = [...sw.matchAll(/^\s*'\.\/([^']*)',?$/gm)].map(m => m[1]).filter(Boolean);
refs.forEach(m => ok(assets.includes(m[1]), m[1] + ' 在 sw.js 预缓存清单里 (离线可用)'));
assets.forEach(a => ok(fs.existsSync(path.join(H.DIR, a)), '预缓存文件存在: ' + a));

sec('仓库卫生');
ok(fs.existsSync(path.join(H.DIR, 'tools', 'make-course-release.js')), 'tools/make-course-release.js 在');
ok(!fs.existsSync(path.join(H.DIR, 'make-course-release.js')), '根目录没有重复的旧副本');
ok(/encryptLesson/.test(H.src('tools/make-course-release.js')), '发布工具带加密 (v140)');

done('发版纪律');
