# S0107 — 书信: A Letter from the North of England (3500 · 补充篇 2: 前期暂缓的 20 个词之另一半)
# 审读 (2026-10, 逐条联网核对): 重排段落, 让信按"寄宿家庭 → 周日酒馆午餐 → 公民课里的法律 → 英语课 → 朋友"推进,
# 不再像清单; 自行车被盗挪到介绍寄宿家庭之后, 与汤姆的自行车一事相连; 补"我喝苹果汁", 明确叙述者不饮酒;
# 人工流产只留一句中性陈述 (转述老师"各国法律差别很大"), 删去"医生和立法者至今仍在争论"及"这节课不告诉你该怎么想,
# 而是理解人们为何意见不一"(易被理解为课堂辩论这一话题); 连用三个 also 改掉; 2026 年《烟草与电子烟法》的代际禁售
# 已核实, 但 2027 年才生效且篇幅已近上限, 文中不写; "When it first appeared" 改为 "When the poem first appeared", 消除 it 指代歧义; 讲解 gay 的改为"英语老师", 与公民课
# 老师区分; homosexual 加引号; 离婚一句前补"交了好朋友索菲", 过渡自然; drunk 的搭配由 get drunk 改为与语境一致的
# a drunk driver。
# 事实 (morningadvertiser.co.uk 2026-04 "Children in pubs: What does the law actually say?"; ash.org.uk "Youth access";
# Wikipedia "Tobacco and Vapes Act 2026"; 《未成年人保护法》(2020 年修订第 59 条); gmw.cn 2024-03-01 (酒精阈值);
# john-gaunt.co.uk 2025-08 (英格兰酒驾限值拟下调); Wikipedia "Sex Discrimination Act 1975"; Wikipedia "I Wandered
# Lonely as a Cloud"; poetryloverspage.com / maggs.com "Poems in Two Volumes"; oxfordlearnersdictionaries.com "gay", "savage"):
# 英格兰许多酒馆 (pub) 允许儿童在成年人陪同下进入、用餐 (以酒为主的场所不满 16 岁须有成人陪同, 具体视执照条件而定);
# 英国向未满 18 岁者出售酒类违法; 英格兰与威尔士 2007 年 10 月 1 日起把烟草的法定购买年龄从 16 岁提到 18 岁 (苏格兰同年);
# 《烟草与电子烟法》2026 年 4 月 29 日获御准, 2027 年 1 月 1 日起禁止向 2009 年 1 月 1 日及以后出生者出售烟草制品;
# 中国《未成年人保护法》禁止向未成年人销售烟、酒; 英国酒驾按呼气/血液酒精含量认定 (英格兰与威尔士现为呼气 35μg/100ml,
# 苏格兰 22μg, 政府 2025 年提出下调英格兰限值), 中国血液酒精 20mg/100ml 起即属饮酒驾驶, 80mg 以上为醉驾:
# 两国都"不必喝醉就已违法" (文中不写具体数值); 英国 1975 年《性别歧视法》(适用于英格兰、威尔士、苏格兰) 禁止在就业、培训、
# 教育等方面基于性别的歧视 (2010 年由《平等法》取代); 各国有关人工流产的法律差别很大; 阿加莎·克里斯蒂以侦探推理小说著称,
# 笔下侦探有赫尔克里·波洛; 华兹华斯《我孤独地漫游, 像一朵云》写于 1804 年, 1807 年收入《两卷本诗集》发表, 灵感来自
# 1802 年 4 月 15 日他与妹妹多萝西在湖区阿尔斯沃特湖畔散步时看到的水仙; 诗集出版后评论界反应恶劣, 《爱丁堡评论》的杰弗里
# 抨击最烈 (称之为 "such trash as this"; 未单独点名此诗, 故文中写"抨击收录它的诗集"); 如今是英国最受欢迎的诗歌之一
# (1995 年 BBC Radio 4 评选第五); 诗中原句 "A poet could not but be gay" (1807 与 1815 版相同); gay 旧义为"快乐的、
# 无忧无虑的"(牛津高阶: old-fashioned, 例 gay laughter), 今义主要指同性恋。人物 (陈老师、泰勒一家、汤姆、索菲、李娜) 与情节为虚构。
# 写法: 叙述者未成年, 只喝果汁; 涉酒涉烟内容只讲保护性法律; 人工流产只作中性一句, 不涉细节; 离婚写得温和。拼写: 牛津式英式拼写。
STORY = {
 'id': 'S0107', 'title': 'A Letter from the North of England', 'titleZh': '来自英格兰北部的信', 'genre': 'letter',
 'minTargets': 10,
 'paras': [
  [
   ("Dear Ms Chen,", "亲爱的陈老师：", False),
  ],
  [
   ("As I promised, here is my report on my first two months in the north of England.",
    "按之前答应您的，我来汇报一下在英格兰北部头两个月的生活。", False),
   ("My host family, the Taylors, have been very kind to me, and my host brother, Tom, has shown me the best cycling routes in town.",
    "寄宿家庭泰勒一家待我很好，他们家的哥哥汤姆还带我认识了镇上最好的骑行路线。", False),
   ("Bicycle theft is a problem here, just as it is in China: last month Tom's new bike disappeared from outside the station, even though he had locked it.",
    "和在国内一样，自行车被盗在这里也是个问题：上个月，汤姆停在车站外的新自行车明明上了锁，还是不见了。", True),
  ],
  [
   ("Last Sunday the Taylors took me to their local pub for lunch, and to my surprise it was full of families with young children.",
    "上周日，泰勒一家带我去他们家附近的小酒馆吃午饭，没想到里面坐满了带着小孩的一家家人。", False),
   ("I had apple juice with my roast beef, and Mr Taylor drank only water because he was driving.",
    "我吃的是烤牛肉，喝的是苹果汁；泰勒先生因为要开车，只喝了水。", False),
   ("He told me that in Britain, as in China, a driver does not have to be drunk to break the law.",
    "他告诉我，英国和中国一样，司机就算没喝醉，也可能已经违法了。", False),
  ],
  [
   ("Our citizenship lessons have made me compare the laws here with those in China.",
    "上了公民课以后，我常常把这里的法律和国内的作比较。", False),
   ("Some laws that protect young people are just the same: shops may not sell alcohol, cigarettes or other tobacco products to anyone under eighteen.",
    "一些保护青少年的法律和我们的完全一样：商店不得向未满十八岁的人出售酒、香烟或其他烟草制品。", True),
   ("In one lesson we learnt that a British law of 1975 banned discrimination on the grounds of sex at work and in education.",
    "有一节课我们了解到，英国 1975 年的一部法律禁止在工作和教育中以性别为由歧视他人。", False),
   ("Our teacher reminded us, though, that laws are not the same everywhere: abortion laws, for example, differ greatly from country to country.",
    "不过老师也提醒我们，各地的法律并不相同：比如有关人工流产的法律，各国之间就差别很大。", True),
  ],
  [
   ("In English lessons, we are reading a murder mystery by Agatha Christie, and everyone is trying to guess who did it before her detective, Hercule Poirot, does.",
    "英语课上，我们正在读阿加莎·克里斯蒂的一部谋杀推理小说，大家都想赶在她笔下的侦探赫尔克里·波洛之前猜出凶手是谁。", True),
   ("We have also studied Wordsworth's famous poem about the daffodils he saw on a walk with his sister in the Lake District.",
    "我们还学了华兹华斯的名诗，写的是他和妹妹在湖区散步时看到的水仙花。", False),
   ("When the poem first appeared in 1807, a well-known critic wrote a savage attack on the book that contained it, yet today it is one of the best-loved poems in English.",
    "这首诗 1807 年首次发表时，一位知名评论家曾撰文猛烈抨击收录它的诗集；可如今，它已是最受喜爱的英语诗歌之一。", True),
   ("One line puzzled me: \"A poet could not but be gay.\"",
    "其中一行诗让我很困惑：“诗人怎能不满心欢喜。”", False),
   ("Our English teacher explained that in Wordsworth's time \"gay\" simply meant \"happy\", although today the word usually means \"homosexual\".",
    "英语老师解释说，在华兹华斯的时代，gay 只是“快乐”的意思，不过如今这个词通常指“同性恋的”。", False),
  ],
  [
   ("My best friend here is Sophie, who sits next to me in English.",
    "我在这里最好的朋友是索菲，英语课上她就坐在我旁边。", False),
   ("Her parents got divorced when she was six, but she told me with a smile that she simply has two homes full of people who love her.",
    "她六岁时父母离了婚，但她笑着告诉我，她不过是有两个家，两个家里都是爱她的人。", True),
   ("Please say hello to everyone in our class, and I will tell you all more when I come home in January.",
    "请代我向班上的同学们问好，等我一月份回国，再跟大家细说。", False),
  ],
  [
   ("Best wishes,", "祝好！", False),
   ("Li Na", "李娜", False),
  ],
 ],
 # 目标词: (原型, 文中词形, 词性, 语境释义, 出现在第几句(全文序号, 从 1 起), 搭配英, 搭配中)
 'words': [
  ('theft', 'theft', 'n.', '盗窃，偷窃', 4, 'bicycle theft', '自行车盗窃'),
  ('pub', 'pub', 'n.', '（英国的）小酒馆（常兼供餐食）', 5, 'the local pub', '附近的小酒馆'),
  ('drunk', 'drunk', 'adj.', '醉的，喝醉的', 7, 'a drunk driver', '醉酒的司机'),
  ('tobacco', 'tobacco', 'n.', '烟草', 9, 'tobacco products', '烟草制品'),
  ('sex', 'sex', 'n.', '性别', 10, 'discrimination on the grounds of sex', '以性别为由的歧视'),
  ('abortion', 'abortion', 'n.', '人工流产', 11, 'abortion laws', '有关人工流产的法律'),
  ('murder', 'murder', 'n.', '谋杀，凶杀', 12, 'a murder mystery', '谋杀推理小说'),
  ('savage', 'savage', 'adj.', '（批评）猛烈的，尖锐的', 14, 'a savage attack on sth', '对某事的猛烈抨击'),
  ('gay', 'gay', 'adj.', '快乐的，欢快的（旧义；今多指同性恋的）', 15, 'gay laughter', '欢快的笑声'),
  ('divorce', 'divorced', 'v.', '离婚', 18, 'get divorced', '离婚'),
 ],
 'gloss': {'daffodils': 'n. 水仙花（daffodil 的复数）', 'homosexual': 'adj. 同性恋的', 'li': '李（李娜，人名）'},
}
