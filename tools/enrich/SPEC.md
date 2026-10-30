# Word-card enrichment spec

You are writing word-card content for a vocabulary app used by a Chinese senior-high-school (高一) student
preparing for the Gaokao. Each input line is one headword from the official 3500-word list:

    {"w": "abandon", "cn": "v.抛弃，舍弃，放弃", "lv": "H", "col": "abandon hope"}

- `w`   the headword (copy it EXACTLY into the output, same spelling and case)
- `cn`  the Chinese meaning printed in the student's word book (the senses you must cover)
- `lv`  level: H core high-school, E extended, J junior-high / worth learning, B very simple, X common but off-list
- `col` an existing collocation (may be empty)

## Output

One JSON object per line (JSONL), same order as the input, exactly these 7 keys:

    {"w":"abandon","def":"to leave someone or something and never come back; to stop doing or having something completely","reg":"neutral","col":[["abandon hope","放弃希望"],["abandon a plan","放弃计划"],["be abandoned by sb","被某人抛弃"]],"ex":"The farmers had to abandon their land after three years of drought.","exCn":"连续三年干旱之后，农民们不得不离开自己的土地。","note":"语气比 give up 重，指彻底放弃；名词 abandonment。abandon oneself to 表示沉溺于。"}
    {"w":"able","def":"having the skill, power or chance to do something","reg":"neutral","col":[["be able to do","能够做"],["an able student","能干的学生"]],"ex":"After a month of practice, she was able to swim across the pool.","exCn":"练了一个月后，她能游过整个泳池了。","note":"be able to 可用于各种时态，can 只有现在和过去式；反义词 unable，名词 ability。"}
    {"w":"affect","def":"to produce a change in someone or something","reg":"neutral","col":[["affect sb's health","影响某人的健康"],["be deeply affected by","深受……影响"],["affect the result","影响结果"]],"ex":"Lack of sleep can seriously affect your performance in exams.","exCn":"睡眠不足会严重影响你的考试发挥。","note":"affect 是动词，effect 多作名词：have an effect on = affect。"}

Field rules:

- `def`  simple English definition in learner's-dictionary style (Oxford Learner's / COBUILD), at most about
  20 words, covering the sense(s) in `cn`. If `cn` lists several parts of speech, cover the main one or two,
  separated by "; ". English only.
- `reg`  one of formal | neutral | casual | academic | technical. Most words are neutral.
- `col`  2 or 3 high-frequency, natural collocations or chunks that are useful for Gaokao reading and writing,
  each as ["english", "中文"]. Put the given `col` first if it is natural. Use sb / sth for placeholders.
  Never use the "·" character.
- `ex`   ONE natural example sentence, 8 to 20 words, at a high-school level, that uses the headword (or an
  inflected form) in the sense given in `cn`. Topics: school, family, daily life, nature, science, sport,
  culture, travel. No real people, brands, politics, violence or romance. For sensitive headwords (for example
  abortion, gun, drug, murder) write a neutral, factual, non-graphic sentence. Must end with . ! or ?
- `exCn` a natural, faithful Chinese translation of `ex` (Chinese punctuation ，。！？).
- `note` Chinese, 15 to 50 characters: the ONE or TWO most useful things a Chinese student should know, such as
  a key pattern (be used to doing), a confusable word (affect / effect), irregular forms, word family,
  countable vs uncountable, British vs American spelling, or a typical mistake. Do not restate the meaning and
  do not write filler such as "这是一个常用词".

Phrases and names (for example "the Arctic", "bus stop", "Hong Kong", "a.m.") follow the same rules; the
example must contain the phrase.

Use your own knowledge only (no web lookups). Accuracy matters: the student will learn from this.

## Process

1. Read your input batch.
2. Write the output file with the Write tool (you may write it in two halves if you prefer, but the final file
   must contain every word exactly once).
3. Run `node tools/enrich/validate.js <output> <input>` and fix every ERROR line, then run it again until it prints OK.
   Warnings about a collocation not containing the headword are acceptable only when the collocation is
   genuinely natural (for example a phrasal pattern); otherwise fix them too.
4. Reply with one line: the batch name, the number of entries, and the validator's final line.
