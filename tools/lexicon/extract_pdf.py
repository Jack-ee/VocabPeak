#!/usr/bin/env python3
"""
extract_pdf.py - 从《英语·单词本》默写本 PDF 提取 序号/音标/中文 表格。

该 PDF 的"英文"列是空的 (默写用), 所以这里只取另外三列; 英文词头由
list3500-words.txt 提供 (按音标+中文+字母序逐条还原, 见 build_lexicon.py)。

用法: python tools/lexicon/extract_pdf.py <单词本.pdf> [输出.json]
依赖: pdfplumber
"""
import json
import re
import sys

import pdfplumber

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'tools/lexicon/list3500-rows.json'
rows = []
with pdfplumber.open(src) as pdf:
    for pi, page in enumerate(pdf.pages[1:], start=2):          # 第 1 页是封面
        for t in page.extract_tables():
            for r in t:
                if not r or not r[0] or not re.match(r'^\d+$', str(r[0]).strip()):
                    continue
                rows.append({
                    'n'   : int(r[0].strip()),
                    'en'  : (r[1] or '').replace('\n', ' ').strip() if len(r) > 1 else '',
                    'ipa' : (r[2] or '').replace('\n', '').strip() if len(r) > 2 else '',
                    'zh'  : (r[3] or '').replace('\n', '').strip() if len(r) > 3 else '',
                    'page': pi,
                })
ns = [r['n'] for r in rows]
print('rows', len(rows), 'max', max(ns), 'missing', sorted(set(range(1, max(ns) + 1)) - set(ns)))
json.dump(rows, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
