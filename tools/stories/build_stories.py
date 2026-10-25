#!/usr/bin/env python3
"""
build_stories.py - AI 短文: 源稿 → 校验 → 发布目录 stories/ (v148)

源稿在 tools/stories/src/Sxxxx.py, 每篇一个 STORY 字典 (见现有文件)。
校验 (任何一项失败即非零退出, 不写发布目录):
  • 目标词数 >= MIN_TARGETS, 且每个目标词都能在指定句子里按词边界找到
  • 目标词的原型在统一词库 (lexicon-3500.js) 里, 且不是"非常简单"级
  • 同一系列里目标词不重复 (一个词只在一篇短文里当目标)
  • 每句都有中文译文; 篇幅在 MIN_WORDS..MAX_WORDS 之间
  • 超纲检查: 非目标词还原为原型后不在词库里的记为超纲; 超纲率 <= MAX_OOV
发布: stories/stories-manifest.json + stories/Sxxxx.json (结构与教材课文相同,
      多 kind/series/genre/targets/narrator 等字段), 内容不变则 _v 与 sha256 不变。
朗读者: 每篇固定一个音色 (narrator), 按篇号在 NARRATORS 里轮换, 源稿可用
      STORY['narrator'] 指定; 音频包生成器据此给整篇句子合成同一个声音。

用法: python tools/stories/build_stories.py [--report] [--only S0004-S0013]
      (顶层脚本, 也可在 Jupyter / VS Code 里逐格运行)
"""
import glob
import hashlib
import json
import os
import re
import sys
import time

HERE      = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.abspath('tools/stories')
ROOT      = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT       = os.path.join(ROOT, 'stories')
# 未知参数 (含 --help) 一律只打印用法退出 —— 绝不能因为认错参数就发布
_args = sys.argv[1:]
_bad  = [a for i, a in enumerate(_args)
         if a not in ('--report', '--only') and not (i > 0 and _args[i - 1] == '--only')]
if _bad or (_args and _args[-1] == '--only'):
    print(__doc__ if '__doc__' in globals() and __doc__ else '用法: build_stories.py [--report] [--only S0004-S0013]')
    sys.exit(2)
REPORT    = '--report' in sys.argv or '--only' in sys.argv
# --only S0004-S0013: 只校验这一段篇目 (并行编写时各自自查用, 隐含 --report)
_only     = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv[:-1] else ''
ONLY      = tuple(int(x) for x in re.findall(r'\d+', _only)[:2]) if _only else None
SERIES    = {'id': '3500-abc', 'title': '3500 词 · 字母顺序', 'desc': '按默写本顺序推进, 每篇 20 个以上目标词'}
NARRATORS = ['coral', 'fable', 'nova', 'ash', 'echo']
MIN_TARGETS, MIN_WORDS, MAX_WORDS, MAX_OOV = 20, 250, 420, 0.04

# %% 词库、不规则变形表、离线词典词头
lex_js = open(os.path.join(ROOT, 'lexicon-3500.js'), encoding='utf-8').read()
LEX    = json.loads(lex_js[lex_js.index('{'):lex_js.rindex('}') + 1])
WORDS  = {w[0].lower(): w for w in LEX['words']}
IRR    = LEX.get('irregular', {})

# 非目标词里允许出现、但词库没收的极基础功能词与缩写形式
EXTRA_OK = set('''a an the and or but if so as at by in on of to up for from with into onto than
o'clock mrs mr ms dr ok okay cannot n't 's 're 've 'd 'll 'm'''.split())
# 缩写: 先整体换成原词再查 (won't → will), 其余去掉后缀 (didn't → did → do)
CONTRACTIONS = {"won't": 'will', "can't": 'can', "shan't": 'shall', "ain't": 'be', "let's": 'let'}
CONTRACT_RE  = re.compile(r"(n't|'s|'re|'ve|'ll|'d|'m)$")

# 离线词典 (dictionary.js) 的词头: 超纲词若词典也没有, 源稿必须在 STORY['gloss'] 里给中文
_dic = open(os.path.join(ROOT, 'dictionary.js'), encoding='utf-8').read()
DICT = set(w.lower() for w in re.findall(r'^\s*"([^"]+)":\s*\{', _dic, re.M))


# %% 词形还原 (与应用里 HSVLex.lemmas 规则一致)
def candidates(tok):
    """词形 → 可能的原型"""
    t   = tok.lower().replace('’', "'").strip("'")
    out = [t]
    if t in CONTRACTIONS:
        out.append(CONTRACTIONS[t])
    elif CONTRACT_RE.search(t):
        t = CONTRACT_RE.sub('', t)
        out.append(t)
    if t in IRR:
        out.append(IRR[t])

    def add(x):
        if x and x not in out:
            out.append(x)
    # 与 stories.js 同一套守卫: 去尾后的词干须含元音 (shed 不拆成 she);
    # -ed/-ing 的「辅-元-辅」短词干先试补 e (caring→care)
    has_v = lambda x: re.search(r'[aeiouy]', x) is not None
    cvc   = lambda x: re.search(r'(^|[^aeiou])[aeiou][^aeiouwxy]$', x) is not None
    if t.endswith('s') and not t.endswith('ss'): add(t[:-1])
    if t.endswith('ies'):  add(t[:-3] + 'y')
    if t.endswith('es'):   add(t[:-2])
    if t.endswith('ied'):  add(t[:-3] + 'y')
    if t.endswith('ed') and has_v(t[:-2]):
        st = t[:-2]
        for x in ([st + 'e', st] if cvc(st) else [st, st + 'e']): add(x)
        if len(t) > 4 and t[-3] == t[-4]: add(t[:-3])
    if t.endswith('ing') and has_v(t[:-3]):
        st = t[:-3]
        for x in ([st + 'e', st] if cvc(st) else [st, st + 'e']): add(x)
        if len(t) > 5 and t[-4] == t[-5]: add(t[:-4])
    if t.endswith('ier'):  add(t[:-3] + 'y')
    if t.endswith('iest'): add(t[:-4] + 'y')
    if t.endswith('er') and len(t) > 4 and has_v(t[:-2]):   add(t[:-2]); add(t[:-1])
    if t.endswith('est') and len(t) > 5 and has_v(t[:-3]):  add(t[:-3]); add(t[:-2])
    if t.endswith('ily'):  add(t[:-3] + 'y')
    if t.endswith('ly'):   add(t[:-2])
    if t.endswith('ally'): add(t[:-4])
    for x in list(out):
        if x in IRR: add(IRR[x])
    return out


def candidates2(tok):
    """两级链式还原: drinkers → drinker → drink"""
    out = []
    for c in candidates(tok):
        for d in [c] + candidates(c):
            if d not in out:
                out.append(d)
    return out


def in_lexicon(tok):
    if tok.lower() in EXTRA_OK:
        return True
    return any(c in WORDS for c in candidates2(tok))


def find_word(text, surface):
    m = re.search(r'(?<![A-Za-z\-])' + re.escape(surface) + r'(?![A-Za-z\-])', text, re.I)
    return m.start() if m else -1


def load(path):
    env = {}
    exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), env)
    return env['STORY']


TOKEN_RE = re.compile(r"[A-Za-z]+(?:['’-][A-Za-z]+)*")


# %% 单篇校验与组装
def build(story):
    sid, errs, warns = story['id'], [], []
    paras, sents     = [], []
    for pi, p in enumerate(story['paras'], 1):
        ps = []
        for si, (text, zh, hard) in enumerate(p, 1):
            s = {'id': f'{sid}-P{pi}-S{si}', 'hard': bool(hard), 'text': text.strip(), 'zh': zh.strip()}
            if not s['zh']:
                errs.append(f'{s["id"]} 缺中文译文')
            ps.append(s)
            sents.append(s)
        paras.append({'id': f'{sid}-P{pi}', 'zh': ''.join(x['zh'] for x in ps), 'sentences': ps})
    words, lemmas = [], []
    for wi, (lemma, surface, pos, zh, sno, pen, pzh) in enumerate(story['words'], 1):
        if not (1 <= sno <= len(sents)):
            errs.append(f'{lemma}: 句序号 {sno} 越界')
            continue
        s = sents[sno - 1]
        if find_word(s['text'], surface) < 0:
            errs.append(f'{lemma}: 第 {sno} 句里找不到 "{surface}"')
        e = WORDS.get(lemma.lower())
        if not e:
            errs.append(f'{lemma}: 不在统一词库')
        elif e[4] == 'B':
            errs.append(f'{lemma}: 属于"非常简单"级, 不应做目标词')
        elif e[4] == 'X':
            errs.append(f'{lemma}: 是词表外常用词 (X 级), 不应做目标词')
        lemmas.append(lemma.lower())
        words.append({'id': f'{sid}-W{wi:02d}', 'lemma': lemma, 'surface': surface, 'pos': pos, 'zh': zh,
                      'sent': s['id'], 'n3500': e[1] if e else 0, 'level': e[4] if e else '',
                      'phrases': [{'en': pen, 'zh': pzh}] if pen else []})
    if len(set(lemmas)) != len(lemmas):
        errs.append('同篇目标词重复: ' + ', '.join(sorted({x for x in lemmas if lemmas.count(x) > 1})))
    # 补充篇 (STORY['minTargets']): 收尾时把散落的少数词集中成篇, 下限可放宽到 10
    min_t = max(10, int(story.get('minTargets') or MIN_TARGETS))
    if len(lemmas) < min_t:
        errs.append(f'目标词 {len(lemmas)} 个, 少于 {min_t}')
    # 超纲统计 (专名: 句中非句首的大写词)
    tokens, oov, names = 0, {}, set()
    for s in sents:
        toks = TOKEN_RE.findall(s['text'])
        for i, tk in enumerate(toks):
            if tk[0].isupper() and i > 0 and tk.lower() not in WORDS:
                names.add(tk)
                continue
            if '-' in tk and in_lexicon(tk):      # 词库收了整个连字符词 (ping-pong, get-together)
                tokens += 1
                continue
            for part in tk.split('-'):
                tokens += 1
                if not in_lexicon(part):
                    oov[part.lower()] = oov.get(part.lower(), 0) + 1
    wc   = sum(len(TOKEN_RE.findall(s['text'])) for s in sents)
    rate = sum(oov.values()) / max(1, tokens)
    if not (MIN_WORDS <= wc <= MAX_WORDS):
        errs.append(f'篇幅 {wc} 词, 不在 {MIN_WORDS}-{MAX_WORDS}')
    gloss = {k.lower(): v for k, v in (story.get('gloss') or {}).items()}
    need  = sorted(w for w in oov if w not in gloss and not any(c in DICT for c in candidates2(w)))
    if need:
        errs.append('超纲词词库与离线词典都查不到, 需在 gloss 里给中文: ' + ', '.join(need))
    unused = sorted(k for k in gloss if k not in oov)
    if unused:
        warns.append('gloss 里有正文没用到的词: ' + ', '.join(unused))
    if rate > MAX_OOV:
        errs.append(f'超纲率 {rate:.1%} 超过 {MAX_OOV:.0%}: ' + ', '.join(sorted(oov)))
    elif oov:
        warns.append('超纲词 (在允许范围内): ' + ', '.join(sorted(oov)))
    num      = int(re.sub(r'\D', '', sid) or 1)
    narrator = story.get('narrator') or NARRATORS[(num - 1) % len(NARRATORS)]
    out = {
        'id'      : sid,
        'kind'    : 'ai',
        'series'  : SERIES['id'],
        'genre'   : story.get('genre', ''),
        'title'   : story['title'],
        'titleZh' : story['titleZh'],
        'narrator': narrator,
        'paras'   : paras,
        'words'   : words,
        'targets' : len(words),
        'wordCount': wc,
        'gloss'   : gloss,
    }
    stats = {'targets': len(words), 'words': wc, 'sentences': len(sents), 'oov': rate,
             'oovWords': sorted(oov), 'names': sorted(names)}
    return out, errs, warns, stats


# %% 全部源稿: 校验 + 跨篇目标词去重
srcs                  = sorted(glob.glob(os.path.join(HERE, 'src', 'S*.py')))
if ONLY:
    lo, hi = ONLY[0], ONLY[-1]
    srcs   = [p for p in srcs if lo <= int(re.sub(r'\D', '', os.path.basename(p)) or 0) <= hi]
built, all_errs, seen = [], [], {}
for p in srcs:
    story, errs, warns, st = build(load(p))
    for w in story['words']:
        k = w['lemma'].lower()
        if k in seen and seen[k] != story['id']:
            errs.append(f'{k}: 已在 {seen[k]} 当过目标词')
        seen[k] = story['id']
    print(f"{story['id']}  {story['title'][:40]:40s}  目标词 {st['targets']:2d}  "
          f"{st['words']} 词 {st['sentences']} 句  超纲 {st['oov']:.1%}  朗读 {story['narrator']}"
          + (f"  专名 {', '.join(st['names'])}" if st['names'] else ''))
    for w in warns:
        print('   · ' + w)
    for e in errs:
        print('   ✗ ' + e)
    all_errs += errs
    built.append(story)

if all_errs:
    print(f'\n校验失败 {len(all_errs)} 项, 未写发布目录')
    sys.exit(1)

# %% 发布到 stories/ (内容不变的篇目保留原 _v, 客户端不会重复下载)
if REPORT:
    print('\n--report: 只校验, 不写发布目录')
else:
    os.makedirs(OUT, exist_ok=True)
    man_path = os.path.join(OUT, 'stories-manifest.json')
    prev     = {}
    if os.path.exists(man_path):
        for s in json.load(open(man_path, encoding='utf-8')).get('stories', []):
            prev[s['id']] = s
    now     = int(time.time() * 1000)
    entries = []
    for s in built:
        body = json.dumps(s, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        sha  = hashlib.sha256(body.encode('utf-8')).hexdigest()
        old  = prev.get(s['id'])
        v    = old['_v'] if old and old.get('bodySha') == sha else now
        text = json.dumps(dict(s, _v=v), ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        open(os.path.join(OUT, s['id'] + '.json'), 'w', encoding='utf-8').write(text)
        entries.append({
            'id'      : s['id'],
            '_v'      : v,
            'title'   : s['title'],
            'titleZh' : s['titleZh'],
            'genre'   : s['genre'],
            'series'  : s['series'],
            'narrator': s['narrator'],
            'file'    : s['id'] + '.json',
            'bodySha' : sha,
            'sha256'  : hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'size'    : len(text.encode('utf-8')),
            'targets' : s['targets'],
            'lemmas'  : [w['lemma'] for w in s['words']],
        })
    keep = {e['file'] for e in entries} | {'stories-manifest.json'}
    for f in os.listdir(OUT):
        if f.endswith('.json') and f not in keep:
            os.remove(os.path.join(OUT, f))
            print('清理陈旧文件', f)
    # generation 用 UTC, 且永不倒退: 应用只接受不比上次旧的清单 (离线时
    # 缓存里的旧清单会被忽略), 换台时区不同的电脑发布也不会被当成旧清单。
    prev_gen = ''
    if os.path.exists(man_path):
        prev_gen = str(json.load(open(man_path, encoding='utf-8')).get('generation', ''))
    gen = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())
    if prev_gen and gen <= prev_gen:      # 时钟落后于上次发布 (换了电脑/时区): 在上次基础上 +1 秒
        try:
            t0  = time.mktime(time.strptime(prev_gen, '%Y-%m-%dT%H:%M:%S'))
            gen = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(t0 + 1))
        except ValueError:
            gen = prev_gen
    json.dump({'format': 1, 'generation': gen, 'series': [SERIES],
               'count': len(entries), 'stories': entries},
              open(man_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n已发布 {len(entries)} 篇到 stories/')
