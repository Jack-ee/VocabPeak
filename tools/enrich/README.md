# 单词卡详细信息 (enrich-3500.js)

单词卡上的英文释义、搭配及中文、例句及翻译、用法提示, 3500 词 + 内置高中词一次做好, 随软件发布。
应用 (enrich.js) 只拿它补单词本里空着的字段, 不写回单词本, 所以同步数据和本机存储都不变大;
自己用 AI 补过或改过的内容始终优先。

## 文件

| 文件 | 作用 |
| --- | --- |
| enrich-3500.js (仓库根目录) | 数据, 一行一个词, 可以直接改某一行 |
| tools/enrich/SPEC.md | 生成规格 (给写内容的 AI 看) |
| tools/enrich/validate.js | 逐条检查: 释义英文、2–3 个搭配配中文、例句含该词、提示中文等 |
| tools/enrich/build_enrich.js | 把新批次 (JSONL) 并进 enrich-3500.js, 已有的词被覆盖 |

## 以后加词

1. 把要补的词写成输入批次, 一行一个: `{"w":"词","cn":"中文释义","lv":"H","col":""}`
2. 按 SPEC.md 生成输出批次 (JSONL), `node tools/enrich/validate.js 输出.jsonl 输入.jsonl` 直到 OK
3. `node tools/enrich/build_enrich.js 输出.jsonl` 并进数据, 跑 `npm test`, 发版 (?v / CACHE_NAME 照常加一)
