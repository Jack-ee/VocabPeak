// build_enrich.js — 把补全批次 (JSONL) 并进 enrich-3500.js
//
// 用法: node tools/enrich/build_enrich.js <批次.jsonl 或目录> [...]
//   • 每行 {"w","def","reg","col":[[en,cn],...],"ex","exCn","note"} (格式见 SPEC.md)
//   • 已有的词被新批次覆盖, 其余保留; 不在词库 (lexicon-3500.js) 里的词也收 (自己加的词)
//   • 写出前逐条检查, 有问题的条目不收并列出来
'use strict';
const fs   = require('fs');
const path = require('path');
const { checkEntry } = require('./validate.js');

const ROOT = path.resolve(__dirname, '../..');
const OUT  = path.join(ROOT, 'enrich-3500.js');

function readExisting() {
    if (!fs.existsSync(OUT)) return {};
    const sandbox = { window: {} };
    new Function('window', fs.readFileSync(OUT, 'utf8'))(sandbox.window);
    return (sandbox.window.HSV_ENRICH && sandbox.window.HSV_ENRICH.words) || {};
}
function inputs(args) {
    const files = [];
    for (const a of args) {
        const st = fs.statSync(a);
        if (st.isDirectory()) fs.readdirSync(a).filter(f => f.endsWith('.jsonl')).sort().forEach(f => files.push(path.join(a, f)));
        else files.push(a);
    }
    return files;
}

const args = process.argv.slice(2);
if (!args.length) { console.log('用法: node tools/enrich/build_enrich.js <批次.jsonl 或目录> [...]'); process.exit(1); }

const words = readExisting();
const before = Object.keys(words).length;
let added = 0, replaced = 0, rejected = 0;
for (const f of inputs(args)) {
    fs.readFileSync(f, 'utf8').split('\n').filter(l => l.trim()).forEach((l, i) => {
        let r;
        try { r = JSON.parse(l); } catch (e) { rejected++; console.log(`✗ ${path.basename(f)}:${i + 1} 不是合法 JSON`); return; }
        const errs = checkEntry(r).filter(x => x.level === 'error');
        if (errs.length) { rejected++; console.log(`✗ ${r.w}: ` + errs.map(x => x.msg).join('; ')); return; }
        if (words[r.w]) replaced++; else added++;
        words[r.w] = [r.def.trim(), r.reg, r.col.map(p => p[0].trim()).join(' · '), r.col.map(p => p[1].trim()).join(' · '),
                      r.ex.trim(), r.exCn.trim(), r.note.trim()];
    });
}

const keys = Object.keys(words).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));
const body = keys.map(k => JSON.stringify(k) + ':' + JSON.stringify(words[k])).join(',\n');
const head = `// enrich-3500.js — 单词卡详细信息 (由 tools/enrich/build_enrich.js 生成; 可直接改某一行, 一行一个词)
// 每项: 词: [英文释义, 语域, 搭配 (· 分隔), 搭配中文 (同序), 例句, 例句中文, 用法提示]
// 应用只拿它补单词本里空着的字段, 不写回单词本 (见 enrich.js)。
window.HSV_ENRICH = {"v":1,"built":"${new Date().toISOString().slice(0, 10)}","count":${keys.length},"words":{
`;
fs.writeFileSync(OUT, head + body + '\n}};\n');
console.log(`enrich-3500.js: ${keys.length} 词 (原 ${before}, 新增 ${added}, 覆盖 ${replaced}, 拒收 ${rejected}), ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
process.exit(rejected ? 2 : 0);
