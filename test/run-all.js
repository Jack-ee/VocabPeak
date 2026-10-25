// run-all.js — 一键跑全部测试: npm test (或 node test/run-all.js)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

// v148: 也跑 test_*.py (生成器端到端测试, 用 python3; 没有 python3 时跳过)
const hasPy = spawnSync('python3', ['--version']).status === 0;
const files = fs.readdirSync(__dirname)
    .filter(f => (/\.js$/.test(f) && !/^_|^run-all\.js$/.test(f)) || (hasPy && /^test_.*\.py$/.test(f)))
    .sort();
let failed = [];
files.forEach(f => {
    const py = /\.py$/.test(f);
    const r  = spawnSync(py ? 'python3' : process.execPath,
                         py ? ['-I', path.join(__dirname, f)] : [path.join(__dirname, f)],
                         { encoding: 'utf8' });
    const out  = (r.stdout || '') + (r.stderr || '');
    const line = (out.match(/通过 \d+ 项, 失败 \d+ 项/g) || []).pop() ||
                 (out.match(/跳过[^\n]*/) || [''])[0] || out.trim().split('\n').pop();
    const bad  = r.status !== 0;
    console.log((bad ? '✗ ' : '✓ ') + f.padEnd(34) + line);
    if (bad) { failed.push(f); console.log(out.split('\n').filter(l => /✗|Error/.test(l)).slice(0, 10).join('\n')); }
});
console.log('\n' + (failed.length ? '有 ' + failed.length + ' 个测试文件失败: ' + failed.join(', ')
                                  : '全部 ' + files.length + ' 个测试文件通过'));
process.exit(failed.length ? 1 : 0);
