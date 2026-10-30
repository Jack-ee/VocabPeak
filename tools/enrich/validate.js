// validate.js — 检查补全条目 (格式见 SPEC.md)
//   命令行: node tools/enrich/validate.js <输出.jsonl> <输入.jsonl>   没有 ERROR 时最后一行打印 OK
//   模块:   require('./validate.js').checkEntry(r) → [{level:'error'|'warn', msg}]
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
let IRR = {};
try {
    const box = {};
    new Function('window', fs.readFileSync(path.join(ROOT, 'lexicon-3500.js'), 'utf8'))(box);
    IRR = (box.HSV_LEXICON && box.HSV_LEXICON.irregular) || {};
} catch (e) { /* 没有词库也能查, 只是不认不规则变化 */ }
const BASE2FORMS = {};
for (const [form, base] of Object.entries(IRR)) (BASE2FORMS[base] = BASE2FORMS[base] || []).push(form);
const EXTRA = { i: ['me', 'my', 'mine', 'myself'], we: ['us', 'our', 'ours', 'ourselves'], he: ['him', 'his', 'himself'],
                she: ['her', 'hers', 'herself'], they: ['them', 'their', 'theirs', 'themselves'], it: ['its', 'itself'],
                you: ['your', 'yours', 'yourself', 'yourselves'], an: ['a'], a: ['an'] };
// 内置词库里拼错的词头: 例句和提示用正确拼写 (检查时按正确拼写找)
const MISSPELT = { questionaire: 'questionnaire', relevent: 'relevant', beddings: 'bedding' };
const REGS = new Set(['formal', 'neutral', 'casual', 'academic', 'technical']);
const HAN  = /[一-鿿]/;

function forms(word) {
    const w   = word.toLowerCase().replace(/^the /, '');
    const out = new Set([w]);
    if (/\s/.test(w) || /\./.test(w)) return out;
    const add = (s) => out.add(s);
    ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly'].forEach(x => add(w + x));
    if (/e$/.test(w))         { add(w.slice(0, -1) + 'ing'); add(w.slice(0, -1) + 'er'); add(w.slice(0, -1) + 'ation'); }
    if (/[^aeiou]y$/.test(w)) { const s = w.slice(0, -1); ['ies', 'ied', 'ier', 'iest', 'ily'].forEach(x => add(s + x)); }
    if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) { const d = w + w.slice(-1); ['ed', 'ing', 'er', 'est'].forEach(x => add(d + x)); }
    if (/(f|fe)$/.test(w))    add(w.replace(/fe?$/, 'ves'));
    if (/le$/.test(w))        add(w.slice(0, -1) + 'y');
    if (/ic$/.test(w))        add(w + 'ally');
    (BASE2FORMS[w] || []).forEach(add);
    (EXTRA[w] || []).forEach(add);
    return out;
}
function hasForm(text, word) {
    const t = ' ' + text.toLowerCase().replace(/[^a-z0-9.'\- ]+/g, ' ') + ' ';
    const w = (MISSPELT[word.toLowerCase()] || word.toLowerCase()).replace(/^the /, '');
    if (/\s/.test(w) || /\./.test(w)) {
        return w.split(/\s+/).every(p => [...forms(p)].some(f => t.includes(f)));
    }
    return [...forms(w)].some(f => new RegExp('[ \\-]' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ .\\-]').test(t));
}

function checkEntry(r) {
    const out = [];
    const E = (m) => out.push({ level: 'error', msg: m });
    const W = (m) => out.push({ level: 'warn', msg: m });
    if (!r || typeof r.w !== 'string' || !r.w.trim()) { E('w missing'); return out; }
    const w    = r.w;
    const keys = Object.keys(r).sort().join(',');
    if (keys !== 'col,def,ex,exCn,note,reg,w') E('keys must be exactly w,def,reg,col,ex,exCn,note (got ' + keys + ')');
    if (typeof r.def !== 'string' || r.def.length < 8 || r.def.length > 170 || HAN.test(r.def)) E('def: English only, 8-170 chars');
    if (!REGS.has(r.reg)) E('reg must be one of ' + [...REGS].join('|'));
    if (!Array.isArray(r.col) || r.col.length < 2 || r.col.length > 3) E('col: 2-3 pairs');
    else r.col.forEach((p, j) => {
        if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') { E('col[' + j + '] must be ["english","中文"]'); return; }
        if (!p[0].trim() || HAN.test(p[0]) || /·/.test(p[0])) E('col[' + j + '][0] English phrase, no Chinese, no "·"');
        if (!HAN.test(p[1]) || /·/.test(p[1])) E('col[' + j + '][1] must be Chinese, no "·"');
        if (!hasForm(p[0], w)) W('collocation "' + p[0] + '" does not contain the headword');
    });
    if (typeof r.ex !== 'string' || HAN.test(r.ex)) E('ex: English sentence');
    else {
        const n = r.ex.trim().split(/\s+/).length;
        if (n < 6 || n > 26) E('ex: 6-26 words (got ' + n + ')');
        if (!/[.!?]["']?$/.test(r.ex.trim())) E('ex must end with . ! or ?');
        if (!hasForm(r.ex, w)) E('ex must contain the headword or an inflected form');
    }
    if (typeof r.exCn !== 'string' || !HAN.test(r.exCn) || /[a-z]{4,}/i.test(r.exCn.replace(/[A-Z][a-zA-Z]+/g, ''))) E('exCn: Chinese translation');
    if (typeof r.note !== 'string' || !HAN.test(r.note)) E('note: Chinese');
    else if (r.note.length < 8 || r.note.length > 90) E('note: 8-90 chars (got ' + r.note.length + ')');
    for (const k of ['def', 'ex', 'exCn', 'note']) if (/[<>]/.test(String(r[k]))) E(k + ' must not contain < or >');
    return out;
}

module.exports = { checkEntry, hasForm, forms, MISSPELT };

if (require.main === module) {
    const [outPath, inPath] = process.argv.slice(2);
    if (!outPath || !inPath) { console.log('用法: node tools/enrich/validate.js <输出.jsonl> <输入.jsonl>'); process.exit(1); }
    const want = new Map(fs.readFileSync(inPath, 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(r => [r.w, r]));
    let errors = 0, warns = 0;
    const seen = new Set();
    fs.readFileSync(outPath, 'utf8').split('\n').filter(l => l.trim()).forEach((l, i) => {
        let r;
        try { r = JSON.parse(l); } catch (e) { errors++; console.log('ERROR line ' + (i + 1) + ': not valid JSON'); return; }
        if (!want.has(r.w)) { errors++; console.log('ERROR ' + r.w + ': not in input batch (w must be copied exactly)'); return; }
        if (seen.has(r.w)) { errors++; console.log('ERROR ' + r.w + ': duplicate'); return; }
        seen.add(r.w);
        for (const x of checkEntry(r)) {
            if (x.level === 'error') errors++; else warns++;
            console.log((x.level === 'error' ? 'ERROR ' : 'warn  ') + r.w + ': ' + x.msg);
        }
    });
    for (const w of want.keys()) if (!seen.has(w)) { errors++; console.log('ERROR ' + w + ': missing from output'); }
    console.log(`${seen.size}/${want.size} entries, ${errors} errors, ${warns} warnings`);
    if (!errors) console.log('OK');
    process.exit(errors ? 1 : 0);
}
