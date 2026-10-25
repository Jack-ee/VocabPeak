#!/usr/bin/env python3
"""
build_lexicon.py - 生成统一词库 lexicon-3500.js (v148)

输入 (都在 tools/lexicon/):
  list3500-rows.json   PDF 提取的 序号/音标/中文 (extract_pdf.py)
  list3500-words.txt   每行 "序号 英文词头", 按音标+中文+字母序还原
  fixes.json           源文件错误修正: ipa / zh 按序号覆盖; forms 为变形→原形
  learnable.txt        新增 (非高中) 词里"值得学"的部分, 其余视为非常简单
仓库内其它来源:
  vocab-hs-data.js     内置高中词库 1828 词 (核心/拓展)
  dictionary.js        离线词典 (释义 + 常用搭配)

输出: lexicon-3500.js
  window.HSV_LEXICON = { v, built, count, levels, words: [[词, 序号, 音标, 释义, 级别, 搭配], ...] }
  级别: H 高中核心 / E 高中拓展 / J 初中·值得学 / B 非常简单 (不做目标词, 不进生词本)
        X 常用词·词表外 (extra-common.txt; 不做目标词, 校验不算超纲, 可手动入生词本)
  序号是纸质默写本上的编号 (重复条目取第一个), 不在 3500 表里的高中词为 0。

用法: python tools/lexicon/build_lexicon.py
"""
import json
import os
import re
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
rd = lambda *p: open(os.path.join(*p), encoding='utf-8').read()

rows  = {r['n']: r for r in json.loads(rd(HERE, 'list3500-rows.json'))}
fixes = json.loads(rd(HERE, 'fixes.json'))
learn = set(w.replace('_', ' ').lower() for w in rd(HERE, 'learnable.txt').split())
words = {}
for ln in rd(HERE, 'list3500-words.txt').splitlines():
    if ln.strip():
        n, w = ln.split(' ', 1)
        words[int(n)] = w.strip()

hs = {}
for m in re.finditer(r'\{"word": "([^"]+)", "meaning": "([^"]*)", "level": "([^"]+)"(?:, "freq": ([\d.]+))?',
                     rd(ROOT, 'vocab-hs-data.js')):
    hs[m.group(1).lower()] = {'w': m.group(1), 'zh': m.group(2), 'lv': m.group(3), 'freq': m.group(4)}
dic = {}
for w, mean, collo in re.findall(r'^\s*"([^"]+)":\s*\{\s*meaning:\s*"([^"]*)"(?:,\s*collo:\s*"([^"]*)")?',
                                 rd(ROOT, 'dictionary.js'), re.M):
    dic.setdefault(w.lower(), {'zh': mean, 'collo': collo or ''})


def clean_zh(s):
    """规范释义: 去星号与多余空白, 词性标记前加空格分隔 (a. ad. n. v. prep. ...)"""
    s = (s or '').replace('*', '').replace('　', ' ').strip()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'(?<=[一-鿿）)\]；;])\s*((?:adj|adv|ad|a|n|v|vt|vi|prep|conj|pron|int|num|art|aux|modal ?v)\.)',
               r' \1', s)
    return s.strip()


def clean_ipa(s):
    s = (s or '').strip()
    if not s or s == '//' or '#VALUE' in s:
        return ''
    s = s.replace('`', 'ˈ').replace("'", 'ˈ')
    s = re.sub(r'ˈməʊd\(ə\)l', '', s)            # 源文件给情态动词多抄了 "modal" 的读音
    s = re.sub(r';\s*\(US\).*$', '/', s)           # 只保留英式音标 (与应用其余部分一致)
    s = re.sub(r'/+$', '/', s)
    return s


entries = {}          # 小写词头 → 条目
order   = []
for n in sorted(words):
    raw  = words[n]
    head = fixes['forms'].get(raw.lower(), raw)
    key  = head.lower()
    r    = rows.get(n, {})
    ipa  = fixes['ipa'].get(str(n)) or clean_ipa(r.get('ipa'))
    zh   = clean_zh(fixes['zh'].get(str(n)) or r.get('zh'))
    if raw.lower() != key:               # 变形条目 (did/ate/chose…): 只并入原形, 不贡献音标释义
        ipa, zh = '', ''
    e = entries.get(key)
    if not e:
        e = entries[key] = {'w': head, 'n': n, 'ipa': ipa, 'zh': [], 'src': '3500'}
        order.append(key)
    if not e['ipa'] and ipa:
        e['ipa'] = ipa
    if zh and zh not in e['zh']:
        e['zh'].append(zh)

# 内置高中词但不在 3500 表里的 (66 个): 也收进词库, 序号 0
for key, h in hs.items():
    if key not in entries and '/' not in h['w']:
        entries[key] = {'w': h['w'], 'n': 0, 'ipa': '', 'zh': [clean_zh(h['zh'])], 'src': 'hs'}
        order.append(key)


# 常用词补充 (extra-common.txt): 词表外的常用词, 级别 X
extra = {}
for ln in rd(HERE, 'extra-common.txt').splitlines():
    if ln.strip() and not ln.startswith('#'):
        w, ipa, zh = (ln.split('\t') + ['', ''])[:3]
        k = w.strip().lower()
        if k and k not in entries:
            entries[k] = {'w': w.strip(), 'n': 0, 'ipa': ipa.strip(), 'zh': [zh.strip()], 'src': 'extra'}
            order.append(k)
            extra[k] = True


def level(key):
    if key in extra:
        return 'X'
    h = hs.get(key)
    if h:
        return 'H' if h['lv'] == '核心' else 'E'
    if key in learn:
        return 'J'
    return 'B'


def tidy_zh(head, parts):
    """源文件把 -ise/-ize 两种拼写各列一行, 合并后出现「(美realize) …；(美) …」这类
    自指与重复: 自指的「(美X)」改成英式拼写说明, 去掉「(美)」后与已有义项相同的重复项。"""
    out, cores = [], []
    for z in parts:
        m = re.match(r'^[（(]美\s*([A-Za-z ]+)[)）]\s*', z)
        if m and m.group(1).strip().lower() == head.lower():
            z = z[m.end():]
            if head.lower().endswith('ize'):
                z = '(英式拼写 %s) %s' % (head[:-3] + 'ise', z)
        core = re.sub(r'^\(英式拼写 [a-z]+\) |^[（(]美[)）]\s*', '', z)
        if core in cores:
            continue
        cores.append(core)
        out.append(z)
    return out


out = []
for key in sorted(order, key=lambda k: (entries[k]['n'] or 99999, k)):
    e = entries[key]
    zh = '；'.join(tidy_zh(e['w'], e['zh']))
    if not zh and key in dic:
        zh = dic[key]['zh']
    collo = dic.get(key, {}).get('collo', '')
    out.append([e['w'], e['n'], e['ipa'], zh, level(key), collo])

levels = {}
for x in out:
    levels[x[4]] = levels.get(x[4], 0) + 1
# 不规则变形表 (变形 → 原形), 供"点任意词查词"与短文超纲检查共用
irregular = {}
for ln in rd(HERE, 'irregular.txt').splitlines():
    ln = ln.strip()
    if not ln or ln.startswith('#'):
        continue
    parts = ln.split()
    for f in parts[1:]:
        irregular.setdefault(f.lower(), parts[0].lower())

payload = {
    'v'     : 1,
    'built' : time.strftime('%Y-%m-%d'),
    'source': '《英语·单词本》3500 词 (默写本, 英文词头按音标+中文还原) + 内置高中词库 + 离线词典搭配',
    'count' : len(out),
    'levels': levels,
    'words' : out,
    'irregular': irregular,
}
js = ('// lexicon-3500.js — 统一词库 (由 tools/lexicon/build_lexicon.py 生成, 勿手改)\n'
      '// 每项: [词, 默写本序号, 音标, 释义, 级别, 搭配]; 级别 H 高中核心 / E 高中拓展 /\n'
      '// J 初中·值得学 / B 非常简单 (不做短文目标词、不进生词本, 但文中可查) /\n'
      '// X 常用词·词表外 (不做目标词, 可查, 可手动入生词本)。\n'
      'window.HSV_LEXICON = ' + json.dumps(payload, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(os.path.join(ROOT, 'lexicon-3500.js'), 'w', encoding='utf-8').write(js)
print('词库', len(out), '词', levels, '大小 %.0f KB' % (len(js.encode('utf-8')) / 1024))
