# test_audio_pack.py — 音频包生成器 v148 端到端 (分片、瘦身、剪枝、坏片段重合成、短文朗读者)
# 运行: python3 test/test_audio_pack.py   (需要 ffmpeg; 不联网, 不需要 API key)
# 顶层脚本, 可在 Jupyter / VS Code 逐格运行。
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else 'test', '..'))
GEN  = os.path.join(ROOT, 'tools', 'generate_audio_pack.py')
ok, bad = 0, 0


def check(cond, msg, detail=None):
    global ok, bad
    if cond:
        ok += 1
        print('  ✓ ' + msg)
    else:
        bad += 1
        print('  ✗ ' + msg + ('' if detail is None else ' → ' + str(detail)))


if not shutil.which('ffmpeg'):
    print('跳过: 本机没有 ffmpeg')
    sys.exit(0)

# %% 夹具: 词表、短文、旧版整包 (含旧音色、已删词、静音坏片段)
tmp = tempfile.mkdtemp(prefix='vp-pack-')
wl  = os.path.join(tmp, 'wordlist.txt')
sto = os.path.join(tmp, 'stories')
prev = os.path.join(tmp, 'prev')
os.makedirs(sto)
os.makedirs(prev)

WORDLIST_1 = """# VocabPeak audio pack - word list
# voices: ash, nova
#@1 abandon
abandon
they had to abandon the car in the snow and walk home.
#@2 accept
accept
#@3 zeal
zeal
#@4 lesson-corpus
according to
the river runs quietly through the old town every morning.
"""
open(wl, 'w').write(WORDLIST_1)

story = {'id': 'S0001', 'narrator': 'coral', 'title': 'T', 'paras': [{'sentences': [
            {'text': 'Lin Yue accepted at once.'}, {'text': 'She   had never travelled alone.'}]}],
         'words': [{'lemma': 'accept', 'surface': 'accepted', 'phrases': [{'en': 'accept an offer'}]}]}
json.dump(story, open(os.path.join(sto, 'S0001.json'), 'w'))
json.dump({'stories': [{'id': 'S0001', 'file': 'S0001.json'}]}, open(os.path.join(sto, 'stories-manifest.json'), 'w'))


def tone(secs, silent=False):
    src = 'anullsrc=r=24000:cl=mono' if silent else 'sine=frequency=330:duration=%.2f' % secs
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', src]
    cmd += ['-t', '0.36'] if silent else ['-af', 'apad=pad_dur=1.5']
    cmd += ['-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1']
    return subprocess.run(cmd, capture_output=True, check=True).stdout


def legacy_pack(clips):
    payload, entries = bytearray(), []
    for (w, v, g), audio in clips:
        entries.append({'word': w, 'voice': v, 'gen': g, 'offset': len(payload), 'length': len(audio)})
        payload.extend(audio)
    m = json.dumps({'format': 'empack', 'version': 1, 'generation': 5, 'voices': ['ash', 'nova'],
                    'clipCount': len(entries), 'clips': entries}).encode()
    return b'EMPACK1\x00' + struct.pack('<I', len(m)) + m + bytes(payload)


old_abandon = tone(0.6)
open(os.path.join(prev, 'vocabpeak-audio-pack.empack'), 'wb').write(legacy_pack([
    (('abandon', 'ash', 1), old_abandon),
    (('abandon', 'onyx', 1), tone(0.6)),          # 已下线音色 → 剪掉
    (('removedword', 'ash', 2), tone(0.5)),       # 已从词表删除 → 剪掉
    (('accept', 'nova', 3), tone(0, silent=True)),  # 静音坏片段 → 丢弃并重合成
]))


def run(dist, prev_dir, extra=None, env_extra=None):
    env = dict(os.environ, PACK_WORDLIST=wl, PACK_STORIES_DIR=sto, PACK_DIST_DIR=dist,
               PACK_PREV_DIR=prev_dir, PACK_FAKE_TTS='1', GITHUB_REPOSITORY='', **(env_extra or {}))
    env.pop('OPENAI_API_KEY', None)
    r = subprocess.run([sys.executable, '-I', GEN] + (extra or []), env=env, capture_output=True, text=True)
    return r


def read_shards(dist):
    idx    = json.load(open(os.path.join(dist, 'vocabpeak-audio-pack.index.json')))
    clips  = {}
    for sh in idx['shards']:
        raw  = open(os.path.join(dist, sh['file']), 'rb').read()
        mlen = struct.unpack('<I', raw[8:12])[0]
        man  = json.loads(raw[12:12 + mlen])
        for c in man['clips']:
            clips[(c['word'], c['voice'])] = dict(c, shard=sh['id'],
                                                 size=c['length'])
    return idx, clips


def lines(dist, name):
    return [x for x in open(os.path.join(dist, name)).read().split('\n') if x]


# %% 第 1 次: 从旧版整包迁移
print('第 1 次构建: 旧整包迁移')
d1 = os.path.join(tmp, 'd1')
r  = run(d1, prev)
check(r.returncode == 0, '构建成功' + ('' if r.returncode == 0 else ': ' + r.stdout[-800:] + r.stderr[-800:]))
idx, clips = read_shards(d1)
check(idx['format'] == 'empack-index' and idx['version'] == 2, '写出 v2 索引')
check(('abandon', 'onyx') not in clips, '已下线音色 onyx 被剪掉')
check(('removedword', 'ash') not in clips, '已删除词条被剪掉')
check(clips.get(('abandon', 'ash'), {}).get('gen') == 1, '旧片段保留原代次 (未重合成)')
check(clips.get(('abandon', 'ash'), {}).get('size', 1e9) * 3 < len(old_abandon), '旧片段已瘦身 (≥3 倍)')
check(('accept', 'nova') in clips and clips[('accept', 'nova')]['gen'] == 6, '静音坏片段被丢弃并重新合成')
check(all(c['enc'] == 'mp3m48t35' for c in clips.values()), '所有片段带 enc 标记')
long_s = 'they had to abandon the car in the snow and walk home.'
check((long_s, 'ash') in clips and (long_s, 'nova') not in clips, '长句只合成 1 个音色')
check(clips.get(('lin yue accepted at once.', 'coral'), {}).get('shard') == 's-0001', '短文句子用朗读者 coral, 进 s-0001 分片')
check(('she had never travelled alone.', 'coral') in clips, '短文句子空白规范化')
check(('lin yue accepted at once.', 'ash') not in clips, '短文句子只用朗读者一个音色')
check(('accepted', 'coral') in clips and ('accepted', 'ash') not in clips, '短文里的词形只用朗读者音色')
check(('accept an offer', 'coral') in clips and ('accept an offer', 'nova') not in clips, '短文搭配只用朗读者音色')
check(clips.get(('accept', 'ash'), {}).get('shard') == 'w-a', '与词表重复的词归词表分片')
check(clips.get(('according to', 'ash'), {}).get('shard', '').startswith('l-'), '课文语料进 l-* 分片')
check('coral' in idx['voices'] and idx['voices'][:2] == ['ash', 'nova'], '索引音色含朗读者')
check(len(lines(d1, 'changed-shards.txt')) == len(idx['shards']), '迁移时全部分片记为变更')
check(not os.path.exists(os.path.join(d1, 'vocabpeak-audio-pack.empack')), '不再写旧版整包')

# %% 第 2 次: 什么都没变 → 字节不变, 不需要上传
print('第 2 次构建: 无变化')
d2 = os.path.join(tmp, 'd2')
r  = run(d2, d1)
check(r.returncode == 0, '构建成功')
idx2, clips2 = read_shards(d2)
check(lines(d2, 'changed-shards.txt') == [] and lines(d2, 'stale-shards.txt') == [], '没有变更分片')
check(idx2['generation'] == idx['generation'], '代次不动')
check([s['sha256'] for s in idx2['shards']] == [s['sha256'] for s in idx['shards']], '分片 sha256 稳定')
check('0 to synthesise' in r.stdout and '0 to convert' in r.stdout, '无需合成或转码')

# %% 第 3 次: 删掉 zeal、加一个新词 → w-z 下线, w-b 新增, 其余不动
print('第 3 次构建: 删一词、加一词')
open(wl, 'w').write(WORDLIST_1.replace('#@3 zeal\nzeal\n', '#@3 bacon\nbacon\n'))
d3 = os.path.join(tmp, 'd3')
r  = run(d3, d2)
check(r.returncode == 0, '构建成功')
idx3, clips3 = read_shards(d3)
ch3 = lines(d3, 'changed-shards.txt')
st3 = lines(d3, 'stale-shards.txt')
check(len(ch3) == 1 and ch3[0].startswith('vocabpeak-audio-pack.w-b.'), '只有 w-b 需要上传', ch3)
check(len(st3) == 1 and st3[0].startswith('vocabpeak-audio-pack.w-z.'), 'w-z 列为下线', st3)
check(all(re.match(r'vocabpeak-audio-pack\.[a-z]-[0-9a-z]+\.[0-9a-f]{12}\.empack$', s['file']) for s in idx3['shards'])
      and all(s['file'].split('.')[2] == s['sha256'][:12] for s in idx3['shards']), '分片文件名带内容哈希')
check(idx3['generation'] == idx2['generation'] + 1, '代次 +1')
check(('zeal', 'ash') not in clips3 and ('bacon', 'nova') in clips3, '词条增删生效')

# %% dry-run 不写文件; range 不剪别的块
print('dry-run 与 range')
d4 = os.path.join(tmp, 'd4')
r  = run(d4, d3, ['--dry-run'])
check(r.returncode == 0 and not os.path.exists(d4), 'dry-run 不写发布目录')
open(wl, 'w').write(WORDLIST_1.replace('#@3 zeal\nzeal\n', '#@3 bacon\nbacon\n') + '#@5 cable\ncable\n')
d5 = os.path.join(tmp, 'd5')
r  = run(d5, d3, ['--range', '1-2'])
idx5, clips5 = read_shards(d5)
check(('cable', 'ash') not in clips5 and ('bacon', 'ash') in clips5, 'range 外的新词不合成, 已有的不删')

# %% 坏状态: 索引丢了 → 从分片重建状态, 一个都不重合成
print('状态损坏保护')
open(wl, 'w').write(WORDLIST_1.replace('#@3 zeal\nzeal\n', '#@3 bacon\nbacon\n'))   # 与 d5 已建内容一致
d6 = os.path.join(tmp, 'd6')
shutil.copytree(d5, d6 + '-prev')
os.remove(os.path.join(d6 + '-prev', 'vocabpeak-audio-pack.index.json'))
r = run(d6, d6 + '-prev')
check(r.returncode == 0 and 'no index; rebuilding state' in r.stdout, '只有分片没有索引: 从分片重建', r.stdout[-600:])
check('0 to synthesise' in r.stdout, '不重新合成 (不重复花钱)')
idx6, clips6 = read_shards(d6)
check(set(clips6) == set(clips5), '重建后片段与原来一致')

# 索引列出的分片缺了一个 (手动误删) → 只补那一片的片段, 其余照用
wa = [s for s in idx5['shards'] if s['id'] == 'w-a'][0]
d7 = os.path.join(tmp, 'd7')
shutil.copytree(d5, d7 + '-prev')
os.remove(os.path.join(d7 + '-prev', wa['file']))
r = run(d7, d7 + '-prev')
n_wa = sum(1 for c in clips5.values() if c['shard'] == 'w-a')
check(r.returncode == 0 and 'rebuilding state from every shard file' in r.stdout, '缺分片: 从现存分片重建', r.stdout[-600:])
check(('%d to synthesise' % n_wa) in r.stdout, '只重合成缺失的 w-a (%d 个)' % n_wa)

# 旧版本的同名分片残留 (上次发布失败) 不影响: 取新的
d8 = os.path.join(tmp, 'd8')
shutil.copytree(d3, d8 + '-prev')
for f in os.listdir(d5):
    if f.endswith('.empack'):
        shutil.copy(os.path.join(d5, f), os.path.join(d8 + '-prev', f))
os.remove(os.path.join(d8 + '-prev', 'vocabpeak-audio-pack.index.json'))
r = run(d8, d8 + '-prev')
check(r.returncode == 0 and '0 to synthesise' in r.stdout, '新旧版本分片混在一起也能重建, 不重合成', r.stdout[-400:])

# %% 删减保护: 残缺的单词表不准悄悄删掉大量已付费音频
print('删减保护')
open(wl, 'w').write('# voices: ash, nova\n#@1 abandon\nabandon\n')
d9 = os.path.join(tmp, 'd9')
r = run(d9, d5, env_extra={'PACK_DROP_GUARD_MIN': '0'})
check(r.returncode != 0 and '[guard]' in (r.stdout + r.stderr) and not os.path.exists(os.path.join(d9, 'vocabpeak-audio-pack.index.json')),
      '一次删掉大半片段: 中止, 不写发布目录')
r = run(d9, d5, env_extra={'PACK_ALLOW_DROP': '1', 'PACK_DROP_GUARD_MIN': '0'})
check(r.returncode == 0, 'PACK_ALLOW_DROP=1 时允许')

shutil.rmtree(tmp, ignore_errors=True)
print('\n通过 %d 项, 失败 %d 项' % (ok, bad))
sys.exit(1 if bad else 0)
