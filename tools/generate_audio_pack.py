#!/usr/bin/env python3
"""
generate_audio_pack.py - VocabPeak pre-generated pronunciation pack builder.

Reads the word list (tools/wordlist.txt, exported from the app) and the AI
passages (stories/*.json), synthesises every entry with OpenAI TTS, slims
each clip with ffmpeg, and publishes the result as a set of small SHARDS
plus one index. Built to run as a GitHub Action so the OpenAI key lives only
in an encrypted Action secret and never reaches the app.

Generation is incremental. The previous index and shards are downloaded from
the GitHub Release and reused as the state store, so each run synthesises
only the (text, voice) pairs that are not already present. Adding a voice
makes every existing word missing that voice, so the next run backfills it.
Removing a voice, or a word, PRUNES its clips, so the pack never carries
audio nobody can play. (v148: the pack had grown to 1.6 GB, more than half
of it six voices dropped long ago.)

The voices come from a "# voices: ..." header line in the word list when one
is present, otherwise from the VOICES default below. The app writes that
header when it exports a word list, so voices are chosen in the app UI.

AI PASSAGES (v148)
------------------
Every sentence of every passage in stories/ is synthesised in ONE voice, the
passage's "narrator" (set by tools/stories/build_stories.py), with narration
instructions, so a whole passage sounds like one reader telling a story. The
passage's target words, their text forms and phrases are synthesised like
word-list entries (every voice for a short entry). Passages need no export
from the app: committing stories/ is enough.

SLIMMING (v148)
---------------
OpenAI returns 128 kbps MP3 with about 1.5 s of trailing silence on a single
word. Each clip is re-encoded to mono MP3 at ENC_BITRATE with trailing
silence capped at ENC_TAIL_SILENCE seconds (sentences keep a natural pause,
words lose the dead air), which makes a word clip about 5x smaller. The same
ffmpeg pass measures loudness: a clip that is silent or implausibly short
for its text is REJECTED and re-synthesised (the August pack held 233 silent
clips, mostly in the echo voice). Clips carry an "enc" tag, so old clips are
converted once and never again. ffmpeg is required in CI
(PACK_REQUIRE_FFMPEG=1); a local run without it keeps clips as they are.

PACK FORMAT (.empack shard, version 2)
--------------------------------------
Each shard is a single binary file. No base64, no zip, no client library.

  bytes  0..7    ASCII magic, exactly  b"EMPACK1\\x00"
  bytes  8..11   uint32 little-endian  = manifest length M, in bytes
  bytes 12..12+M UTF-8 JSON manifest (see below)
  bytes 12+M..   raw audio payload; every clip's MP3 bytes concatenated

  {
    "format": "empack", "version": 2, "shard": "w-a", "generation": 7,
    "model": "gpt-4o-mini-tts", "enc": "mp3m48t35", "voices": [...],
    "clipCount": 812,
    "clips": [ { "word": "abandon", "voice": "ash", "gen": 1,
                 "enc": "mp3m48t35", "offset": 0, "length": 6912 }, ... ]
  }

A shard manifest has no timestamp and lists clips in sorted order, so an
unchanged shard is byte-identical from run to run: its sha256 does not move,
the workflow does not re-upload it and the app does not re-download it.
"word" is always lowercased and whitespace-collapsed; the app keys its
IndexedDB store by voice + "|" + word.

Shards:  w-a .. w-z, w-0   word-list blocks by the block's head word
         l-0 .. l-7        the lesson corpus, by a stable hash of the text
         s-0001, s-0011..  AI passages, ten passages per shard

INDEX (vocabpeak-audio-pack.index.json)
---------------------------------------
  { "format": "empack-index", "version": 2, "generation": 7,
    "createdAt": "...", "model": "...", "enc": "...", "voices": [...],
    "clipCount": 31000, "size": 190000000,
    "shards": [ { "id": "w-a", "file": "vocabpeak-audio-pack.w-a.3f9c0a1b2d4e.empack",
                  "sha256": "...", "size": 6100000, "clipCount": 812,
                  "gen": 7 }, ... ] }

The app fetches the index, downloads only shards whose sha256 changed,
verifies each, and prunes clips that no shard lists any more.

Shard file names carry the first 12 hex digits of their sha256, so a new
version is a NEW asset: the workflow uploads new shards, then the index,
then deletes shards the index no longer names. If any upload fails, the
old index and every file it points at are still in place. If the index
itself is lost, the next run rebuilds its state from the shard files
instead of starting over (which would re-bill the whole pack).

OUTPUT FILES (written to tools/dist/)
-------------------------------------
  vocabpeak-audio-pack.<shard>.<sha12>.empack   every shard
  vocabpeak-audio-pack.index.json               the index
  changed-shards.txt     shard files the previous index did not have (upload)
  stale-shards.txt       shard files the previous index had and this one drops

The legacy single-file pack (vocabpeak-audio-pack.empack, its manifest and
delta) is no longer written. A first v2 run migrates from it automatically;
the old assets can be deleted from the release once the app shows the new
pack installed.

USAGE
-----
  python tools/generate_audio_pack.py            real run (needs OPENAI_API_KEY)
  python tools/generate_audio_pack.py --dry-run  list missing clips, no API calls
  python tools/generate_audio_pack.py --selftest format, slimming and shard
                                                 checks; no network, no key
  python tools/generate_audio_pack.py --limit 20 cap words synthesised this run
  python tools/generate_audio_pack.py --range 51-100  build only word indices
                                                 51..100 of the word list (a
                                                 "# range:" header does the
                                                 same; the flag overrides it).
                                                 Passages are always built.
  python tools/generate_audio_pack.py --extract  unpack the built shards into
                                                 individual MP3 files to listen

ENVIRONMENT VARIABLES
---------------------
  OPENAI_API_KEY       required for a real run
  OPENAI_TTS_MODEL     optional, default "gpt-4o-mini-tts"
  GITHUB_TOKEN         optional, used to download the previous release state
  GITHUB_REPOSITORY    "owner/repo", supplied automatically by GitHub Actions
  PACK_RELEASE_TAG     optional, default "audio-pack"
  PACK_REQUIRE_FFMPEG  "1" in CI: fail instead of skipping the slimming step
  PACK_ALLOW_DROP      "1" to allow a run that deletes more than 10% of the
                       existing clips (see DROP_GUARD)
  TIME_BUDGET_MINUTES  in-band stop-and-save budget (see below)
  Test hooks: PACK_WORDLIST, PACK_STORIES_DIR, PACK_DIST_DIR (paths),
  PACK_PREV_DIR (read previous state from a folder instead of the release),
  PACK_FAKE_TTS=1 (synthesise test tones with ffmpeg instead of calling
  OpenAI; a text containing "~silent~" yields silence).
"""

import concurrent.futures
import datetime
import glob
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import zlib

# --- Configuration -------------------------------------------------------

# Voices synthesised for every word. Edit this list to add or drop voices;
# the incremental logic backfills a newly added voice on the next run and
# prunes a dropped one. Valid gpt-4o-mini-tts voices: alloy ash ballad coral
# echo fable nova onyx sage shimmer verse.
VOICES       = ["ash", "coral", "echo", "fable", "nova"]
VALID_VOICES = {"alloy", "ash", "ballad", "coral", "echo", "fable", "nova",
                "onyx", "sage", "shimmer", "verse"}

# Per-entry voice policy. A word-list entry no longer than
# SHORT_ENTRY_MAX_CHARS (a word or a short collocation) is synthesised in
# EVERY voice, so My Words autoplay can vary the voice on repeat. A longer
# entry (an example sentence or a definition) is synthesised in only
# LONG_ENTRY_VOICES voice(s): voice variety across a whole sentence is
# barely noticeable, so paying 5x the bytes for it is not worth it.
SHORT_ENTRY_MAX_CHARS = 40
LONG_ENTRY_VOICES     = 1

# Delivery guidance passed to gpt-4o-mini-tts.
TTS_INSTRUCTIONS = (
    "Read the following English text clearly and at a natural, unhurried "
    "pace, as a model for an English learner. Use a standard accent."
)
# Passage sentences: one narrator per passage, read as connected prose.
STORY_INSTRUCTIONS = (
    "You are narrating a short English passage for Chinese high-school "
    "students. Read this sentence as part of the continuous passage, in a "
    "warm, natural storytelling voice with a clear standard accent, natural "
    "sentence intonation and a relaxed, unhurried pace. Do not over-"
    "articulate single words; for a line of dialogue, sound like the "
    "speaker without acting it out."
)

# Slimming. ENC_TAG names the encoding recipe; changing any of the three
# settings must change the tag, so the next run converts every clip again.
ENC_BITRATE      = "48k"
ENC_TAIL_SILENCE = 0.35                  # seconds of trailing silence kept
ENC_TAG          = "mp3m48t35"
SILENT_MAX_DB    = -35.0                 # a clip peaking below this is silent
MIN_SECONDS_PER_CHAR = 1.0 / 40          # far below any real speaking rate
SYNTH_ATTEMPTS   = 3                     # a rejected clip is re-synthesised

MAGIC          = b"EMPACK1\x00"           # 8 bytes, fixed
PACK_VERSION   = 2
OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech"
DEFAULT_MODEL  = "gpt-4o-mini-tts"

# Paths are resolved next to this script; the test hooks override them.
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() \
              else os.path.abspath("tools")
ROOT_DIR    = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
WORDLIST    = os.environ.get("PACK_WORDLIST") or os.path.join(SCRIPT_DIR, "wordlist.txt")
STORIES_DIR = os.environ.get("PACK_STORIES_DIR") or os.path.join(ROOT_DIR, "stories")
DIST_DIR    = os.environ.get("PACK_DIST_DIR") or os.path.join(SCRIPT_DIR, "dist")
PREV_DIR    = os.environ.get("PACK_PREV_DIR", "").strip()
FAKE_TTS    = os.environ.get("PACK_FAKE_TTS", "") == "1"

ASSET_PREFIX  = "vocabpeak-audio-pack."
INDEX_NAME    = "vocabpeak-audio-pack.index.json"
LEGACY_FULL   = "vocabpeak-audio-pack.empack"
LEGACY_DELTA  = "vocabpeak-audio-pack.delta.empack"
LEGACY_MANIFEST = "vocabpeak-audio-pack.manifest.json"
LESSON_LABEL  = "lesson-corpus"          # the app's lesson-corpus block
LESSON_BUCKETS = 8
STORIES_PER_SHARD = 10

MAX_WORKERS       = 4                    # gentle concurrency for the API
TRANSCODE_WORKERS = max(2, os.cpu_count() or 2)
HTTP_TIMEOUT      = 60                   # seconds per request
MAX_RETRIES       = 5                    # for 429 / 5xx / network errors
ABORT_AFTER_FAILS = 12                   # consecutive failures => stop early

# Wall-clock budget in minutes, from the workflow env TIME_BUDGET_MINUTES.
# When > 0, synthesis stops GRACEFULLY once the budget is spent: the loop
# breaks through the same abort path as a quota wall, the partial pack is
# written and published, and the next run resumes from it. This is the
# defence against the GitHub job timeout, which kills the process cold so
# nothing gets written (it happened: a 2h run timed out and published
# nothing). In-band stopping turns "timeout" into "checkpoint".
try:
    TIME_BUDGET_MIN = float(os.environ.get("TIME_BUDGET_MINUTES", "0") or 0)
except ValueError:
    TIME_BUDGET_MIN = 0.0

# The budget clock starts with the process, not with synthesis: the state
# download and the one-off bulk conversion also eat into the step timeout.
_T0 = time.monotonic()

# A run that would delete more than DROP_GUARD of the previous clips stops
# unless PACK_ALLOW_DROP=1 (workflow_dispatch input "allow_drop"). The usual
# cause is a word list exported from a device whose notebook or courses had
# not synced yet; without the guard the release, and then every device,
# would silently lose paid audio.
DROP_GUARD  = 0.10
DROP_MIN    = int(os.environ.get("PACK_DROP_GUARD_MIN", "50") or 50)   # test hook
ALLOW_DROP  = os.environ.get("PACK_ALLOW_DROP", "") == "1"

FFMPEG = shutil.which("ffmpeg")
if os.environ.get("PACK_REQUIRE_FFMPEG", "") == "1" and not FFMPEG:
    raise SystemExit("ffmpeg is required (PACK_REQUIRE_FFMPEG=1) but was not "
                     "found on PATH; install it before the build step.")


# --- Word list -----------------------------------------------------------

def _norm_entry(s):
    """Lowercase, trim, and collapse internal whitespace."""
    return " ".join(str(s).strip().lower().split())


def read_wordlist(path):
    """Parse the word list into indexed blocks.

    A line  '#@N label'  starts block number N; every non-comment,
    non-blank line after it (until the next marker) is an entry for that
    block. Other '#' lines are comments. Blank lines are ignored. A file
    with no '#@' markers is read as one entry per block, numbered 1..n in
    file order, so a range still works on a hand-written list.

    Returns a list of dicts {"index", "label", "entries"}. Entries are
    normalised and de-duplicated across the whole list; the first
    occurrence wins. A .json file (an array of strings, or notebook
    objects with a "word" field) is also accepted, one entry per block.
    """
    if not os.path.exists(path):
        raise SystemExit("word list not found: " + path)

    raw      = open(path, "r", encoding="utf-8").read()
    stripped = raw.strip()
    seen     = set()

    if path.endswith(".json") or stripped.startswith("[") \
            or stripped.startswith("{"):
        parsed = json.loads(stripped)
        items  = parsed if isinstance(parsed, list) \
                 else parsed.get("notebook", [])
        blocks = []
        for it in items:
            w = it if isinstance(it, str) \
                else (it.get("word") if isinstance(it, dict) else "")
            n = _norm_entry(w)
            if n and n not in seen:
                seen.add(n)
                blocks.append({"index": len(blocks) + 1, "label": n,
                               "entries": [n]})
        return blocks

    lines      = raw.splitlines()
    has_marker = any(ln.lstrip().startswith("#@") for ln in lines)
    blocks     = []
    current    = None

    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s.startswith("#@"):
            # Block marker: digits after '@' are the index, the rest the label.
            m     = re.match(r"#@\s*(\d*)\s*(.*)$", s)
            idx   = int(m.group(1)) if m and m.group(1) else (len(blocks) + 1)
            label = _norm_entry(m.group(2)) if m else ""
            current = {"index": idx, "label": label, "entries": []}
            blocks.append(current)
            continue
        if s.startswith("#"):
            continue                        # config / comment line
        n = _norm_entry(s)
        if not n or n in seen:
            continue
        seen.add(n)
        if has_marker:
            if current is None:
                # Stray entry before the first marker - give it a block.
                current = {"index": len(blocks) + 1, "label": n, "entries": []}
                blocks.append(current)
            current["entries"].append(n)
        else:
            blocks.append({"index": len(blocks) + 1, "label": n, "entries": [n]})
    return blocks


def read_pack_config(path):
    """Parse "# key: value" header lines from a plain-text word list.

    Recognised keys:
      voices  comma- or space-separated voice names
      limit   max words to synthesise per run (0 or absent = no cap)
      range   word-index range to build this run, e.g. "1-50"
    Returns a dict holding only the keys that were actually present.
    """
    cfg = {}
    if not os.path.exists(path) or path.endswith(".json"):
        return cfg
    for line in open(path, "r", encoding="utf-8"):
        body = line.strip()
        if not body.startswith("#") or body.startswith("#@"):
            continue
        body = body[1:].strip()
        low  = body.lower()
        if low.startswith("voices:"):
            spec   = body.split(":", 1)[1].replace(",", " ")
            voices = [t.lower() for t in spec.split() if t.lower() in VALID_VOICES]
            if voices:
                cfg["voices"] = voices
        elif low.startswith("limit:"):
            try:
                n = int(body.split(":", 1)[1].strip())
                if n > 0:
                    cfg["limit"] = n
            except ValueError:
                pass
        elif low.startswith("range:"):
            spec  = body.split(":", 1)[1]
            found = []
            for tok in spec.replace("..", " ").replace("-", " ") \
                           .replace(",", " ").split():
                if tok.isdigit():
                    found.append(int(tok))
                if len(found) >= 2:        # only the two bounds matter
                    break
            if len(found) >= 2:
                lo, hi = found[0], found[1]
                if lo > hi:
                    lo, hi = hi, lo
                cfg["range"] = (max(1, lo), hi)
    return cfg


# --- AI passages -----------------------------------------------------------

def read_stories(stories_dir):
    """Load the published AI passages (stories/stories-manifest.json).

    Returns a list of {"id", "narrator", "sentences", "lemmas", "extras"}:
    sentences are read by the narrator; target lemmas are vocabulary, so
    they get every voice like a word-list entry; extras (the form used in
    the text and the phrases) are heard once, in the narrator's voice.
    """
    man_path = os.path.join(stories_dir, "stories-manifest.json")
    if not os.path.exists(man_path):
        return []
    man = json.load(open(man_path, encoding="utf-8"))
    out = []
    for e in man.get("stories", []):
        path = os.path.join(stories_dir, e.get("file") or (e["id"] + ".json"))
        if not os.path.exists(path):
            print("[stories] ! %s listed but %s is missing; skipped" % (e["id"], path))
            continue
        s         = json.load(open(path, encoding="utf-8"))
        sentences = [_norm_entry(x["text"]) for p in s.get("paras", [])
                     for x in p.get("sentences", []) if x.get("text")]
        lemmas, extras = [], []
        for w in s.get("words", []):
            lemmas.append(w.get("lemma", ""))
            extras.append(w.get("surface", ""))
            for ph in w.get("phrases", []) or []:
                extras.append(ph.get("en", ""))
        narrator = str(s.get("narrator") or e.get("narrator") or "").lower()
        out.append({"id": s.get("id") or e["id"], "narrator": narrator,
                    "sentences": [x for x in sentences if x],
                    "lemmas": [_norm_entry(x) for x in lemmas if _norm_entry(x)],
                    "extras": [_norm_entry(x) for x in extras if _norm_entry(x)]})
    return out


# --- Shard assignment ------------------------------------------------------

def shard_for_block(label, entry):
    """Shard id for a word-list entry: by the block's head word, or by a
    stable text hash inside the lesson corpus."""
    if label == LESSON_LABEL:
        return "l-%d" % (zlib.crc32(entry.encode("utf-8")) % LESSON_BUCKETS)
    c = (label or entry)[:1]
    return "w-" + (c if "a" <= c <= "z" else "0")


def shard_for_story(story_id):
    """Ten passages per shard: S0001-S0010 -> s-0001, S0011-S0020 -> s-0011."""
    digits = re.sub(r"\D", "", str(story_id)) or "1"
    n      = max(1, int(digits))
    return "s-%04d" % ((n - 1) // STORIES_PER_SHARD * STORIES_PER_SHARD + 1)


def shard_file(shard_id, sha):
    """Shard asset name. The content hash is part of the name, so a new
    version never overwrites the file the current index points at: a
    publish that fails half-way leaves the old index fully valid."""
    return "%s%s.%s.empack" % (ASSET_PREFIX, shard_id, sha[:12])


def is_shard_asset(name):
    return name.startswith(ASSET_PREFIX) and name.endswith(".empack") \
        and name not in (LEGACY_FULL, LEGACY_DELTA)


def voices_for(entry, voices):
    """Voices to synthesise for one word-list entry (see the policy above)."""
    if len(entry) <= SHORT_ENTRY_MAX_CHARS:
        return voices
    return voices[:max(1, LONG_ENTRY_VOICES)]


def plan_clips(blocks, stories, voices):
    """Every clip the pack should hold.

    Returns {(text, voice): {"shard", "kind", "block"}} in a stable order.
    "kind" picks the TTS instructions ("word" or "story"); "block" is the
    word-list index (None for passages), which --range filters on. A text
    claimed twice keeps its first assignment: word list before passages.
    """
    plan = {}
    for b in blocks:
        for e in b["entries"]:
            for v in voices_for(e, voices):
                plan.setdefault((e, v), {"shard": shard_for_block(b["label"], e),
                                         "kind" : "word", "block": b["index"]})
    for s in stories:
        narrator = s["narrator"] if s["narrator"] in VALID_VOICES else voices[0]
        shard    = shard_for_story(s["id"])
        for t in s["sentences"]:
            plan.setdefault((t, narrator), {"shard": shard, "kind": "story", "block": None})
        for t in s.get("lemmas", []):
            for v in (voices if len(t) <= SHORT_ENTRY_MAX_CHARS else [narrator]):
                plan.setdefault((t, v), {"shard": shard, "kind": "word", "block": None})
        for t in s["extras"]:
            # Already planned in some voice (a word-list entry, or the lemma
            # itself)? Then the app finds it; one narrator clip is enough.
            if any((t, v) in plan for v in voices + [narrator]):
                continue
            plan.setdefault((t, narrator), {"shard": shard, "kind": "word", "block": None})
    return plan


# --- Pack format ---------------------------------------------------------

def build_pack(clips, voices, generation, model, shard=None):
    """Build a .empack byte string from a list of clip dicts.

    Each clip dict carries word, voice, gen, enc, audio (bytes). Clips are
    written in sorted order and the manifest has no timestamp, so the same
    clips always give the same bytes. Returns (pack_bytes, manifest_dict).
    """
    payload = bytearray()
    entries = []
    for c in sorted(clips, key=lambda c: (c["word"], c["voice"])):
        offset = len(payload)
        payload.extend(c["audio"])
        entries.append({
            "word"  : c["word"],
            "voice" : c["voice"],
            "gen"   : c["gen"],
            "enc"   : c.get("enc", ""),
            "offset": offset,
            "length": len(c["audio"]),
        })

    manifest = {
        "format"    : "empack",
        "version"   : PACK_VERSION,
        "shard"     : shard,
        "generation": generation,
        "model"     : model,
        "enc"       : ENC_TAG,
        "voices"    : list(voices),
        "clipCount" : len(entries),
        "clips"     : entries,
    }
    mjson = json.dumps(manifest, ensure_ascii=False, sort_keys=True,
                       separators=(",", ":")).encode("utf-8")

    out = bytearray()
    out.extend(MAGIC)
    out.extend(struct.pack("<I", len(mjson)))
    out.extend(mjson)
    out.extend(payload)
    return bytes(out), manifest


def parse_pack(raw, keep=None, skipped=None):
    """Parse a .empack byte string. Returns (manifest, clips_by_key).

    clips_by_key maps (word, voice) -> {"audio", "gen", "enc"}. When `keep`
    is given, only clips with keep(word, voice) true are copied out, so a
    large legacy pack can be filtered without doubling memory. Raises
    ValueError if the magic or structure is wrong.
    """
    if len(raw) < 12 or bytes(raw[:8]) != MAGIC:
        raise ValueError("not an EMPACK1 file (bad magic)")

    mv         = memoryview(raw)
    mlen       = struct.unpack("<I", bytes(mv[8:12]))[0]
    manifest   = json.loads(bytes(mv[12:12 + mlen]).decode("utf-8"))
    data_start = 12 + mlen

    clips = {}
    for e in manifest.get("clips", []):
        word, voice = _norm_entry(e["word"]), e["voice"]
        if keep is not None and not keep(word, voice):
            if skipped is not None:
                skipped.append((word, voice))
            continue
        start = data_start + e["offset"]
        clips[(word, voice)] = {
            "audio": bytes(mv[start:start + e["length"]]),
            "gen"  : e.get("gen", manifest.get("generation", 1)),
            "enc"  : e.get("enc", ""),
        }
    return manifest, clips


# --- Slimming (ffmpeg) -------------------------------------------------------

_AF = ("areverse,silenceremove=start_periods=1:start_duration=0:"
       "start_threshold=-50dB:start_silence=%.2f,areverse,volumedetect"
       % ENC_TAIL_SILENCE)
_MAXVOL_RE = re.compile(r"max_volume:\s*(-?[\d.]+|-inf)\s*dB")


def slim_clip(audio, text):
    """Re-encode one MP3 clip and judge it. Returns (bytes, verdict, note).

    verdict "ok": bytes is the slimmed clip, tagged ENC_TAG.
    verdict "bad": the clip is silent or far too short for its text (note
    says which); the caller drops it so it is synthesised again.
    verdict "raw": ffmpeg is unavailable; bytes is the input unchanged.
    """
    if not FFMPEG:
        # Without ffmpeg, flag only the obvious failure: a raw 128 kbps
        # OpenAI clip always ends in ~1 s of silence, so under 0.5 s of
        # audio (8000 bytes) means it came back empty.
        if len(audio) < 8000:
            return audio, "bad", "under 0.5 s before slimming"
        return audio, "raw", ""
    try:
        p = subprocess.run(
            [FFMPEG, "-hide_banner", "-nostdin", "-loglevel", "info",
             "-f", "mp3", "-i", "pipe:0", "-af", _AF,
             "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", ENC_BITRATE,
             "-map_metadata", "-1", "-write_xing", "0", "-id3v2_version", "0",
             "-f", "mp3", "pipe:1"],
            input=audio, capture_output=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as e:
        return audio, "bad", "ffmpeg failed: %s" % e
    out = p.stdout or b""
    err = (p.stderr or b"").decode("utf-8", "replace")
    m   = _MAXVOL_RE.search(err)
    if p.returncode != 0 or not out or not m:
        return audio, "bad", "silent (nothing left after trimming)"
    peak = float("-inf") if m.group(1) == "-inf" else float(m.group(1))
    if peak < SILENT_MAX_DB:
        return audio, "bad", "silent (peak %.1f dB)" % peak
    seconds = len(out) * 8.0 / (int(ENC_BITRATE.rstrip("k")) * 1000)
    if seconds < max(0.15, len(text) * MIN_SECONDS_PER_CHAR):
        return audio, "bad", "too short (%.2f s for %d chars)" % (seconds, len(text))
    return out, "ok", ""


# --- Previous state (incremental) -------------------------------------------

def _api_get(url, token, accept):
    req = urllib.request.Request(url, headers={
        "Accept"              : accept,
        "User-Agent"          : "vocabpeak-audio-pack-builder",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=600) as resp:
        return resp.read()


def _sha256(b):
    return hashlib.sha256(b).hexdigest()


def load_previous(repo, tag, token, keep, skipped=None):
    """Load the previous pack state: the v2 index and its shards, or the
    legacy single-file pack on the first v2 run.

    Returns (prev_index_or_None, clips_by_key, source). Only a release that
    does not exist counts as a first run; any other failure ABORTS the
    build, because silently starting from nothing would re-synthesise (and
    re-bill) the whole pack.
    """
    skipped = skipped if skipped is not None else []
    if PREV_DIR:
        def fetch(name):
            p = os.path.join(PREV_DIR, name)
            return open(p, "rb").read() if os.path.exists(p) else None
        names = set(os.listdir(PREV_DIR)) if os.path.isdir(PREV_DIR) else set()
        where = "folder " + PREV_DIR
    else:
        if not repo:
            print("[prev] no GITHUB_REPOSITORY set; treating this as a first run")
            return None, {}, "none"
        try:
            rel = json.loads(_api_get(
                "https://api.github.com/repos/%s/releases/tags/%s" % (repo, tag),
                token, "application/vnd.github+json"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                print("[prev] no '%s' release yet; first run" % tag)
                return None, {}, "none"
            raise SystemExit("[prev] GitHub API error %d reading release '%s'; "
                             "stopping rather than rebuilding from scratch" % (e.code, tag))
        except urllib.error.URLError as e:
            raise SystemExit("[prev] could not reach the GitHub API (%s); stopping "
                             "rather than rebuilding from scratch" % e)
        urls  = {a["name"]: a["url"] for a in rel.get("assets", [])}
        names = set(urls)
        where = "release '%s'" % tag

        def fetch(name):
            if name not in urls:
                return None
            return _api_get(urls[name], token, "application/octet-stream")

    shard_names = sorted(n for n in names if is_shard_asset(n))

    if INDEX_NAME in names:
        index = json.loads(fetch(INDEX_NAME).decode("utf-8"))
        clips, bad = {}, []
        for sh in index.get("shards", []):
            raw = fetch(sh["file"])
            if raw is None or (sh.get("sha256") and _sha256(raw) != sh["sha256"]):
                bad.append(sh["file"])
                continue
            _, part = parse_pack(raw, keep, skipped)
            clips.update(part)
        if not bad:
            print("[prev] loaded %d clip(s) from %d shard(s), generation %d (%s)"
                  % (len(clips), len(index.get("shards", [])),
                     index.get("generation", 0), where))
            return index, clips, "index"
        print("[prev] ! index lists %d shard(s) that are missing or do not match "
              "their sha256 (%s); rebuilding state from every shard file in %s"
              % (len(bad), ", ".join(bad[:5]), where))
        skipped[:] = []
        return rebuild_from_shards(shard_names, fetch, keep, skipped, where)

    if shard_names:
        # Shards without an index: the index upload failed, or someone
        # deleted it. Never treat this as a first run - that would re-bill
        # the whole pack - but rebuild the state from the shards themselves.
        print("[prev] ! %s has %d shard file(s) but no index; rebuilding state "
              "from the shards" % (where, len(shard_names)))
        return rebuild_from_shards(shard_names, fetch, keep, skipped, where)

    if LEGACY_FULL in names:
        print("[prev] no index yet; migrating from the legacy single-file pack "
              "in %s (one-off, large download) ..." % where)
        raw = fetch(LEGACY_FULL)
        manifest, clips = parse_pack(raw, keep, skipped)
        total = manifest.get("clipCount", len(manifest.get("clips", [])))
        del raw
        print("[prev] legacy pack generation %d: %d clip(s), %d kept for the "
              "current voices and entries" % (manifest.get("generation", 1), total, len(clips)))
        return {"generation": manifest.get("generation", 1), "shards": []}, clips, "legacy"

    print("[prev] %s has no pack yet; first run" % where)
    return None, {}, "none"


def rebuild_from_shards(shard_names, fetch, keep, skipped, where):
    """State from whatever shard files exist. A file whose bytes do not
    match the hash in its name, or that does not parse, is ignored. Clips
    from every valid version are merged (the newer generation wins per
    clip), so nothing paid for is lost; the index that comes back lists the
    newest version of each shard, so the next publish replaces them."""
    best, clips, gens = {}, {}, {}
    for name in shard_names:
        raw = fetch(name)
        if raw is None:
            continue
        sha = _sha256(raw)
        m   = re.match(re.escape(ASSET_PREFIX) + r"(.+?)\.([0-9a-f]{12})\.empack$", name)
        if m and m.group(2) != sha[:12]:
            print("[prev]   skip %s: bytes do not match its name" % name)
            continue
        try:
            man, part = parse_pack(raw, keep, skipped)
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            print("[prev]   skip %s: %s" % (name, e))
            continue
        sid = man.get("shard") or (m.group(1) if m else name)
        gen = int(man.get("generation", 0) or 0)
        for k, c in part.items():
            if k not in clips or c["gen"] >= clips[k]["gen"]:
                clips[k] = c
        if sid not in best or gen >= gens[sid]:
            best[sid], gens[sid] = {"id": sid, "file": name, "sha256": sha}, gen
    if not best:
        raise SystemExit("[prev] none of the shard files in %s could be read; stopping "
                         "rather than rebuilding (and re-billing) the whole pack" % where)
    print("[prev] rebuilt state: %d clip(s) from %d shard id(s)" % (len(clips), len(best)))
    return ({"generation": max(gens.values()), "shards": sorted(best.values(), key=lambda x: x["id"])},
            clips, "shards")


# --- OpenAI TTS ----------------------------------------------------------

# A fatal, account-level problem (a bad or blocked key, or - most often -
# the OpenAI usage / billing limit being reached) sets this event. Worker
# threads check it and return quickly, and run_build stops submitting new
# work. The worker NEVER raises out: a SystemExit raised inside a thread
# used to skip the pack write entirely, which is how an earlier run lost
# thousands of already-synthesised clips.
_abort        = threading.Event()
_abort_reason = [""]


def _signal_abort(reason):
    """Record the first fatal reason and raise the shared abort flag."""
    if not _abort.is_set():
        _abort_reason[0] = reason
        _abort.set()


def _retry_after(http_error):
    """Seconds to wait from a Retry-After header, clamped; 0 if absent."""
    try:
        val = http_error.headers.get("Retry-After")
        if val:
            return max(1, min(60, int(float(val))))
    except (ValueError, TypeError, AttributeError):
        pass
    return 0


def _is_quota_error(detail):
    """True when an OpenAI error body shows a billing / quota limit rather
    than a transient rate limit; a quota error never clears by retrying."""
    low = (detail or "").lower()
    return ("insufficient_quota" in low
            or "exceeded your current quota" in low
            or ("billing" in low and "limit" in low))


def _fake_tts(text):
    """Test tone standing in for OpenAI: a beep that scales with the text,
    then 1.5 s of silence (like the real thing); "~silent~" gives silence."""
    secs = 0.0 if "~silent~" in text else min(8.0, 0.3 + 0.06 * len(text))
    src  = ("sine=frequency=440:duration=%.2f" % secs) if secs else "anullsrc=r=24000:cl=mono"
    cmd  = [FFMPEG, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", src]
    if secs:
        cmd += ["-af", "apad=pad_dur=1.5"]
    else:
        cmd += ["-t", "0.36"]
    cmd += ["-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"]
    return subprocess.run(cmd, capture_output=True, check=True).stdout


def synthesize(text, voice, api_key, model, instructions):
    """Synthesise one text in one voice. Returns MP3 bytes, or None.

    Transient errors (a rate-limit 429, 5xx, or a network error) are retried
    with exponential backoff, honouring Retry-After. A 400 skips just that
    clip. A 401/403, or a 429 whose body shows a quota / billing limit, is
    FATAL: it sets the shared abort signal and returns None, so the run
    stops soon and saves what it has. It never raises out of the thread.
    """
    if _abort.is_set():
        return None
    if FAKE_TTS:
        return _fake_tts(text)

    body = json.dumps({
        "model"          : model,
        "voice"          : voice,
        "input"          : text,
        "response_format": "mp3",
        "instructions"   : instructions,
    }).encode("utf-8")

    for attempt in range(MAX_RETRIES):
        if _abort.is_set():
            return None
        req = urllib.request.Request(OPENAI_TTS_URL, data=body, method="POST")
        req.add_header("Authorization", "Bearer " + api_key)
        req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                audio = resp.read()
                if not audio:
                    raise urllib.error.URLError("empty audio body")
                return audio
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:300]
            if e.code in (401, 403):
                _signal_abort("OpenAI rejected the request (HTTP %d) - a bad "
                              "or blocked key, or the account/billing limit "
                              "was reached: %s" % (e.code, detail))
                return None
            if e.code == 429 and _is_quota_error(detail):
                _signal_abort("OpenAI quota / billing limit reached "
                              "(HTTP 429): %s" % detail)
                return None
            if e.code == 400:
                print("  ! skipped '%s' [%s]: HTTP 400 %s" % (text[:60], voice, detail))
                return None
            wait = _retry_after(e) or (2 ** attempt)
            print("  . retry '%s' [%s] in %ds (HTTP %d)" % (text[:60], voice, wait, e.code))
            time.sleep(wait)
        except urllib.error.URLError as e:
            wait = 2 ** attempt
            print("  . retry '%s' [%s] in %ds (%s)" % (text[:60], voice, wait, e))
            time.sleep(wait)

    print("  ! gave up on '%s' [%s] after %d attempts" % (text[:60], voice, MAX_RETRIES))
    return None


def synth_clip(text, voice, api_key, model, kind):
    """Synthesise, slim and check one clip; re-synthesise a rejected one.

    The last attempt for a bare word adds a full stop, which nudges the
    model into a complete citation reading. Returns (bytes, enc) or None.
    """
    instructions = STORY_INSTRUCTIONS if kind == "story" else TTS_INSTRUCTIONS
    for attempt in range(SYNTH_ATTEMPTS):
        say = text
        if attempt == SYNTH_ATTEMPTS - 1 and not re.search(r"[.!?\"')]$", text):
            say = text + "."
        audio = synthesize(say, voice, api_key, model, instructions)
        if audio is None:
            return None
        out, verdict, note = slim_clip(audio, text)
        if verdict != "bad":
            return out, (ENC_TAG if verdict == "ok" else "")
        print("  ~ rejected '%s' [%s]: %s; synthesising again" % (text[:60], voice, note))
    print("  ! no usable audio for '%s' [%s] after %d tries" % (text[:60], voice, SYNTH_ATTEMPTS))
    return None


# --- Build orchestration -------------------------------------------------

def slim_existing(kept):
    """Convert clips that predate the current ENC_TAG, in parallel, and drop
    clips found silent. Returns (converted, dropped_keys)."""
    todo = [k for k, c in kept.items() if c.get("enc") != ENC_TAG]
    if not todo or not FFMPEG:
        if todo:
            print("[slim] ffmpeg not found; %d clip(s) left unconverted" % len(todo))
        return 0, []
    print("[slim] converting %d older clip(s) to %s with %d worker(s) ..."
          % (len(todo), ENC_TAG, TRANSCODE_WORKERS))
    before    = sum(len(kept[k]["audio"]) for k in todo)
    dropped   = []
    converted = 0
    with concurrent.futures.ThreadPoolExecutor(TRANSCODE_WORKERS) as pool:
        futs = {pool.submit(slim_clip, kept[k]["audio"], k[0]): k for k in todo}
        for n, fut in enumerate(concurrent.futures.as_completed(futs), 1):
            k = futs[fut]
            out, verdict, note = fut.result()
            if verdict == "bad":
                dropped.append(k)
                print("  ~ dropping '%s' [%s]: %s" % (k[0][:60], k[1], note))
            elif verdict == "ok":
                kept[k]["audio"] = out
                kept[k]["enc"]   = ENC_TAG
                converted += 1
            if n % 2000 == 0:
                print("  slim progress %d/%d" % (n, len(todo)))
    for k in dropped:
        del kept[k]
    after = sum(len(kept[k]["audio"]) for k in todo if k in kept)
    print("[slim] %d clip(s) converted, %.1f MB -> %.1f MB; %d silent or "
          "truncated clip(s) dropped for re-synthesis"
          % (converted, before / 1048576.0, after / 1048576.0, len(dropped)))
    return converted, dropped


def write_outputs(all_clips, plan, voices, generation, model, prev_index, prev_gen=0):
    """Write every shard plus the index; list changed and stale shards.

    The index generation moves only when some shard changed or went away,
    so a run that changes nothing republishes the same generation."""
    os.makedirs(DIST_DIR, exist_ok=True)
    for f in glob.glob(os.path.join(DIST_DIR, ASSET_PREFIX + "*")):
        os.remove(f)                         # no stale shard or legacy file
    by_shard = {}
    for c in all_clips:
        by_shard.setdefault(plan[(c["word"], c["voice"])]["shard"], []).append(c)

    prev_files = {s["file"] for s in (prev_index or {}).get("shards", []) if s.get("file")}
    shards, changed = [], []
    for sid in sorted(by_shard):
        clips = by_shard[sid]
        gen   = max(c["gen"] for c in clips)
        # The shard lists only its own voices, so adding a narrator voice
        # elsewhere does not change (and re-upload) every shard.
        mine  = [v for v in voices if any(c["voice"] == v for c in clips)]
        data, _ = build_pack(clips, mine, gen, model, shard=sid)
        sha   = _sha256(data)
        name  = shard_file(sid, sha)
        open(os.path.join(DIST_DIR, name), "wb").write(data)
        shards.append({"id": sid, "file": name, "sha256": sha, "size": len(data),
                       "clipCount": len(clips), "gen": gen})
        if name not in prev_files:
            changed.append(name)
    new_files = {x["file"] for x in shards}
    stale = sorted(f for f in prev_files if f not in new_files)

    index = {
        "format"    : "empack-index",
        "version"   : PACK_VERSION,
        "generation": generation if (changed or stale or not prev_index) else prev_gen,
        "createdAt" : datetime.datetime.now(datetime.timezone.utc)
                              .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model"     : model,
        "enc"       : ENC_TAG,
        "voices"    : list(voices),
        "clipCount" : len(all_clips),
        "size"      : sum(s["size"] for s in shards),
        "shards"    : shards,
    }
    open(os.path.join(DIST_DIR, INDEX_NAME), "w", encoding="utf-8").write(
        json.dumps(index, ensure_ascii=False, indent=1))
    open(os.path.join(DIST_DIR, "changed-shards.txt"), "w").write(
        "".join(n + "\n" for n in changed))
    open(os.path.join(DIST_DIR, "stale-shards.txt"), "w").write(
        "".join(n + "\n" for n in stale))
    return index, changed, stale


def check_drop_guard(dropped, kept, plan, source, dry_run):
    """Refuse a run that would delete a large share of the existing audio.

    Normal runs: more than DROP_GUARD of the clips. Legacy migration: voices
    dropped long ago are expected, so only removed TEXTS count there."""
    dropped = list(dict.fromkeys(dropped))
    if not dropped:
        return
    texts_in_plan = {w for w, _ in plan}
    gone_texts    = sorted({w for w, _ in dropped if w not in texts_in_plan})
    total_clips   = len(dropped) + len(kept)
    total_texts   = len({w for w, _ in dropped} | {w for w, _ in kept})
    voice_drops   = sum(1 for w, _ in dropped if w in texts_in_plan)
    print("[prune] %d clip(s) dropped: %d for %d text(s) no longer listed, %d for "
          "voices no longer selected" % (len(dropped), len(dropped) - voice_drops,
                                          len(gone_texts), voice_drops))
    if source == "legacy":
        too_many = len(gone_texts) > max(DROP_MIN, DROP_GUARD * total_texts)
    else:
        too_many = len(dropped) > max(DROP_MIN, DROP_GUARD * total_clips)
    if not too_many:
        return
    msg = ("[guard] this run would delete %d of %d clip(s) (%d text(s) no longer "
           "listed, e.g. %s).\n  That usually means tools/wordlist.txt was exported "
           "from a device whose notebook or courses had not synced, or that the "
           "voices header changed by mistake.\n  Check the word list; if the "
           "deletion is intended, re-run with PACK_ALLOW_DROP=1 (workflow input "
           "allow_drop)." % (len(dropped), total_clips, len(gone_texts),
                             ", ".join(repr(t[:40]) for t in gone_texts[:5]) or "-"))
    if ALLOW_DROP:
        print(msg.replace("[guard]", "[guard] PACK_ALLOW_DROP=1 -", 1))
    elif dry_run:
        print(msg)
    else:
        raise SystemExit(msg)


def run_build(dry_run=False, limit=0, cli_range=None):
    """Full build pipeline: plan, load state, prune, slim, synthesise, write."""
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    model   = os.environ.get("OPENAI_TTS_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    repo    = os.environ.get("GITHUB_REPOSITORY", "").strip()
    token   = os.environ.get("GITHUB_TOKEN", "").strip()
    tag     = os.environ.get("PACK_RELEASE_TAG", "audio-pack").strip() or "audio-pack"

    blocks  = read_wordlist(WORDLIST)
    cfg     = read_pack_config(WORDLIST)
    voices  = cfg.get("voices") or VOICES
    stories = read_stories(STORIES_DIR)
    plan    = plan_clips(blocks, stories, voices)
    # The index lists every voice a clip can be in, narrators included, so
    # the app's per-word voice lookup finds passage audio too.
    all_voices = list(voices) + sorted({v for _, v in plan} - set(voices))

    idx_lo = min((b["index"] for b in blocks), default=0)
    idx_hi = max((b["index"] for b in blocks), default=0)
    print("[words] %d block(s), index %d..%d, %d entr(ies) in %s"
          % (len(blocks), idx_lo, idx_hi, sum(len(b["entries"]) for b in blocks), WORDLIST))
    print("[stories] %d passage(s), %d sentence(s) in %s"
          % (len(stories), sum(len(s["sentences"]) for s in stories), STORIES_DIR))
    print("[voices] %s  (%s)" % (", ".join(voices),
          "from word list" if cfg.get("voices") else "default"))
    print("[plan] %d clip(s) wanted in %d shard(s)"
          % (len(plan), len({p["shard"] for p in plan.values()})))

    # Range: only word-list blocks inside it are SYNTHESISED; pruning always
    # uses the whole plan, so a range build never deletes other audio.
    sel_range = cli_range or cfg.get("range")
    if sel_range:
        lo, hi = sel_range
        print("[range] building word index %d..%d (passages are always built)" % (lo, hi))

    def in_build(info):
        return info["block"] is None or not sel_range \
            or sel_range[0] <= info["block"] <= sel_range[1]

    dropped = []
    prev_index, existing, source = load_previous(repo, tag, token,
                                                 keep=lambda w, v: (w, v) in plan, skipped=dropped)
    check_drop_guard(dropped, existing, plan, source, dry_run)
    prev_gen = (prev_index or {}).get("generation", 0)
    # parse_pack already skipped clips outside the plan (dropped voices and
    # removed entries), so `existing` is the kept set.
    kept = existing

    missing = [k for k, info in plan.items() if k not in kept and in_build(info)]

    # The --limit / "# limit:" cap counts whole texts, never splitting a
    # text's voices across runs; ignored when a range is in effect.
    eff_limit = 0 if sel_range else (limit or cfg.get("limit", 0))
    if eff_limit:
        seen_w, capped = set(), []
        for w, v in missing:
            if w not in seen_w:
                if len(seen_w) >= eff_limit:
                    break
                seen_w.add(w)
            capped.append((w, v))
        if len(capped) < len(missing):
            print("[plan] limit %d text(s) applied; %d clip(s) deferred to a later run"
                  % (eff_limit, len(missing) - len(capped)))
            missing = capped

    stale_enc = sum(1 for c in kept.values() if c.get("enc") != ENC_TAG)
    print("[plan] %d clip(s) kept, %d to convert, %d to synthesise"
          % (len(kept), stale_enc, len(missing)))

    if dry_run:
        for w, v in missing:
            print("  would synthesise  %-28s [%s]" % (w[:60], v))
        chars = sum(len(w) for w, _ in missing)
        print("[dry-run] %d clip(s), %d input character(s) (about $%.2f); "
              "no API calls made" % (len(missing), chars, chars / 1000.0 * 0.015))
        return

    if missing and not api_key and not FAKE_TTS:
        raise SystemExit("OPENAI_API_KEY is not set; cannot synthesise. "
                         "Use --dry-run to preview without it.")

    converted, dropped = slim_existing(kept)
    for k in dropped:                        # re-synthesise what was silent
        if in_build(plan[k]) and k not in missing:
            missing.append(k)

    new_gen     = prev_gen + 1             # stamped on clips made this run
    new_clips   = {}
    aborted     = False
    if missing:
        print("[synth] generating %d clip(s) at generation %d ..." % (len(missing), new_gen))
        done             = 0
        consecutive_fail = 0
        deadline = (_T0 + TIME_BUDGET_MIN * 60.0) if TIME_BUDGET_MIN > 0 else None
        if deadline:
            print("[plan] time budget: %.0f minutes - will stop, save and "
                  "publish when it runs out" % TIME_BUDGET_MIN)
        pool    = concurrent.futures.ThreadPoolExecutor(MAX_WORKERS)
        futures = {pool.submit(synth_clip, w, v, api_key, model, plan[(w, v)]["kind"]): (w, v)
                   for w, v in missing}
        try:
            for fut in concurrent.futures.as_completed(futures):
                w, v = futures[fut]
                try:
                    res = fut.result()
                except Exception as exc:        # never let one clip kill the run
                    res = None
                    print("  ! error on '%s' [%s]: %s" % (w[:60], v, exc))
                done += 1
                if res:
                    new_clips[(w, v)] = res
                    consecutive_fail  = 0
                else:
                    consecutive_fail += 1
                    if consecutive_fail >= ABORT_AFTER_FAILS:
                        _signal_abort("%d clip(s) failed in a row - the API "
                                      "is rejecting requests (rate-limit or "
                                      "quota/billing limit)" % consecutive_fail)
                if done % 25 == 0 or done == len(missing):
                    print("  progress %d/%d  (%d ok)" % (done, len(missing), len(new_clips)))
                if deadline and time.monotonic() >= deadline:
                    _signal_abort("time budget of %.0f minutes reached - "
                                  "stopping to save and publish; re-run to "
                                  "continue from here" % TIME_BUDGET_MIN)
                if _abort.is_set():
                    aborted = True
                    print("  ! stopping early - %s" % _abort_reason[0])
                    break
        finally:
            # cancel_futures drops not-yet-started work, so an aborted run
            # ends in seconds instead of grinding through doomed retries.
            pool.shutdown(wait=True, cancel_futures=True)
        print("[synth] %d clip(s) synthesised, %d not done this run"
              % (len(new_clips), len(missing) - len(new_clips)))

    all_clips = [{"word": w, "voice": v, "gen": c["gen"], "enc": c.get("enc", ""),
                  "audio": c["audio"]} for (w, v), c in kept.items()]
    all_clips += [{"word": w, "voice": v, "gen": new_gen, "enc": enc, "audio": audio}
                  for (w, v), (audio, enc) in new_clips.items()]
    if not all_clips:
        raise SystemExit("no clips to write; word list and stories may be empty")

    index, changed, stale = write_outputs(all_clips, plan, all_voices, new_gen, model,
                                          prev_index, prev_gen)
    print("[write] %d shard(s), %d clip(s), %.1f MB, generation %d"
          % (len(index["shards"]), index["clipCount"], index["size"] / 1048576.0,
             index["generation"]))
    print("[write] %d shard(s) changed, %d stale; index %s"
          % (len(changed), len(stale), INDEX_NAME))
    print("[done]  pack ready in %s" % DIST_DIR)

    if aborted:
        # The shards holding everything synthesised SO FAR were written
        # above and will be published, so no work from this run is lost.
        # Exit non-zero so the run is marked failed; the next run resumes.
        if "time budget" in _abort_reason[0]:
            hint = ("  This is the planned time-budget checkpoint, not an error.\n"
                    "  Just re-run the workflow: it continues from the %d saved clip(s)."
                    % index["clipCount"])
        else:
            hint = ("  Most likely cause: the OpenAI account hit its usage / billing limit.\n"
                    "  Check platform.openai.com -> Settings -> Limits, add credit or raise\n"
                    "  the limit, then re-run. The next run continues from the %d saved\n"
                    "  clip(s) and only synthesises what is still missing." % index["clipCount"])
        raise SystemExit(
            "\n[INCOMPLETE] synthesis stopped early:\n  %s\n\n"
            "  The partial pack (generation %d, %d clip(s)) was still written and\n"
            "  will be published, so nothing already generated is lost.\n\n%s"
            % (_abort_reason[0], new_gen, index["clipCount"], hint))


# --- Self-test -----------------------------------------------------------

def run_selftest():
    """Format round trip, deterministic shards, shard assignment and (when
    ffmpeg is present) the slimming verdicts. No network, no key."""
    import random
    random.seed(1)

    fake  = []
    words = ["ubiquitous", "ephemeral", "salient", "nuance", "pivotal"]
    for gen, w in enumerate(words, start=1):
        for v in VOICES[:2]:
            n = random.randint(2000, 9000)
            fake.append({"word": w, "voice": v, "gen": gen, "enc": ENC_TAG,
                         "audio": bytes(random.getrandbits(8) for _ in range(n))})

    pack, manifest = build_pack(fake, VOICES, generation=3, model="test-model", shard="w-u")
    assert pack[:8] == MAGIC, "magic header mismatch"
    again, _ = build_pack(list(reversed(fake)), VOICES, 3, "test-model", shard="w-u")
    assert again == pack, "shard bytes depend on input order"

    parsed_manifest, parsed = parse_pack(pack)
    assert parsed_manifest["clipCount"] == len(fake), "clip count mismatch"
    for c in fake:
        got = parsed[(c["word"], c["voice"])]
        assert got["audio"] == c["audio"], "audio bytes differ for %s" % c["word"]
        assert got["gen"] == c["gen"] and got["enc"] == ENC_TAG, "gen/enc differ"
    _, some = parse_pack(pack, keep=lambda w, v: v == VOICES[0])
    assert len(some) == len(words), "keep filter failed"

    assert shard_for_block("abandon", "they had to abandon the car") == "w-a"
    assert shard_for_block("3d", "3d") == "w-0"
    assert shard_for_block(LESSON_LABEL, "according to").startswith("l-")
    assert shard_for_story("S0001") == "s-0001" and shard_for_story("S0010") == "s-0001"
    assert shard_for_story("S0011") == "s-0011"
    plan = plan_clips([{"index": 1, "label": "abandon",
                        "entries": ["abandon", "they had to abandon the car in the snow and walk home."]}],
                      [{"id": "S0001", "narrator": "coral",
                        "sentences": ["she accepted at once."], "lemmas": ["abandon", "accept"],
                        "extras": ["accepted", "accept an offer"]}],
                      ["ash", "nova"])
    assert ("abandon", "ash") in plan and ("abandon", "nova") in plan
    assert plan[("abandon", "ash")]["shard"] == "w-a", "word list must win over passages"
    assert ("they had to abandon the car in the snow and walk home.", "nova") not in plan
    assert plan[("she accepted at once.", "coral")] == {"shard": "s-0001", "kind": "story", "block": None}
    assert ("accept", "nova") in plan and plan[("accept", "nova")]["kind"] == "word"
    assert ("accepted", "coral") in plan and ("accepted", "ash") not in plan, "forms: narrator only"
    assert ("accept an offer", "coral") in plan and ("accept an offer", "nova") not in plan
    msg = "format, determinism, shards and plan"

    if FFMPEG:
        word = _fake_tts("abandon")
        slim, verdict, _ = slim_clip(word, "abandon")
        assert verdict == "ok", "a normal word clip was rejected"
        assert len(slim) * 3 < len(word), "slimming saved too little (%d -> %d)" % (len(word), len(slim))
        _, verdict, note = slim_clip(_fake_tts("~silent~"), "abandon")
        assert verdict == "bad" and "silent" in note, "a silent clip was accepted"
        _, verdict, note = slim_clip(word, "x" * 400)
        assert verdict == "bad" and "short" in note, "a truncated sentence was accepted"
        msg += ", slimming %d -> %d bytes, silent and truncated clips rejected" % (len(word), len(slim))
    else:
        msg += " (ffmpeg not found: slimming checks skipped)"
    print("[selftest] OK - " + msg)


# --- Extract (listen to clips) -------------------------------------------

def run_extract():
    """Unpack every built shard into MP3 files, one folder per shard, named
    word__voice.mp3, so the clips can be played and checked."""
    shards = sorted(glob.glob(os.path.join(DIST_DIR, ASSET_PREFIX + "*.empack")))
    if not shards:
        raise SystemExit("no shards in %s; run a build first" % DIST_DIR)
    total = 0
    for path in shards:
        _, clips = parse_pack(open(path, "rb").read())
        sid      = os.path.basename(path)[len(ASSET_PREFIX):-len(".empack")]
        out_dir  = os.path.join(DIST_DIR, "clips", sid)
        os.makedirs(out_dir, exist_ok=True)
        for (word, voice), info in sorted(clips.items()):
            safe = "".join(ch if ch.isalnum() else "_" for ch in word)[:80]
            open(os.path.join(out_dir, "%s__%s.mp3" % (safe, voice)), "wb").write(info["audio"])
        total += len(clips)
    print("[extract] wrote %d MP3 file(s) under %s" % (total, os.path.join(DIST_DIR, "clips")))


# --- Entry point ---------------------------------------------------------

_args = sys.argv[1:]


def _opt_value(flag):
    """Value following a CLI flag, or None if the flag is absent/last."""
    if flag in _args:
        i = _args.index(flag)
        if i + 1 < len(_args):
            return _args[i + 1]
    return None


def _parse_range_arg(spec):
    """Parse a --range value like '51-100' (or '51 100', '51..100')."""
    if not spec:
        return None
    nums = [int(t) for t in str(spec).replace("..", " ").replace("-", " ")
                                     .replace(",", " ").split() if t.isdigit()]
    if len(nums) < 2:
        return None
    lo, hi = sorted(nums[:2])
    return (max(1, lo), hi)


if "--selftest" in _args:
    run_selftest()
elif "--extract" in _args:
    run_extract()
else:
    _limit = int(_opt_value("--limit") or 0)
    _range = _parse_range_arg(_opt_value("--range"))
    run_build(dry_run=("--dry-run" in _args), limit=_limit, cli_range=_range)
