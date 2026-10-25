# S0106 — 新闻特写: History Week: A Walk Through Time (3500 · 补充篇 1: 前期暂缓的 20 个词之一半)
# 审读 (2026-10, 逐条联网核对, 出处见下): 政治内容只陈述史实; 删去结尾周老师"人们为公平、自由与和平而奋斗"的价值评判,
# 改为中性的"看到年份背后的人"; 曼德拉 "fought against" → "campaigned against", 补"通过和平谈判"(Wikipedia: negotiate
# an end to apartheid); 种族隔离补"不公平地对待"; 罗本岛讲解员: 2017 年起博物馆改由青年讲解员带队 (tourismupdate.com),
# 现在时"有些讲解员曾被关押"改为"多年来由昔日的囚犯担任讲解员"; 美国 1865 年写明"通过宪法修正案"; 左右座次按 Wikipedia
# 写"议长右侧"; 补 1970 年 4 月第一颗人造卫星, 让"两弹一星"的"一星"有着落, 并把钱学森 (1955) 移到 1964 年之前, 按时间顺序;
# 一大开幕地与闭幕地照官方表述 (国家发改委党建页: 7 月 23–31 日); "青年思想家"→"学生和知识分子"。prison/prisoner 互换
# 句子, 搭配改为 spend years in prison / a former prisoner, 与文中用法一致。
# 事实 (Wikipedia "Left–right political spectrum"; Wikipedia "Slavery Abolition Act 1833", "Thirteenth Amendment";
# ndrc.gov.cn 2021-03 党建之窗 (中共一大); fordham.edu 1964-10-16 中国政府声明英译; Wikipedia "Qian Xuesen";
# Wikipedia "Dong Fang Hong 1"; Wikipedia "Nelson Mandela"; tourismupdate.com 2017-10-03; timeout.com "Robben Island Museum"):
# 1789 年法国社会动荡: 1788 年歉收, 面包价格高, 民众对赋税不满; 1789 年国民议会中支持旧制度 (国王) 的议员坐在议长右侧,
# 支持革命的坐在左侧, "左翼""右翼"由此而来; 英国 1833 年 8 月 28 日通过《废除奴隶制法》, 1834 年 8 月 1 日生效, 不适用于
# 东印度公司属地、锡兰、圣赫勒拿 (故写 "most of its empire"); 美国第十三修正案 1865 年 12 月 6 日批准, 在内战之后;
# 1919 年五四运动后, 共产主义思想在中国青年学生和知识分子中传播; 1921 年 7 月 23 日中共一大在上海法租界开幕, 30 日遭巡捕
# 搜查后, 最后一天转移到嘉兴南湖的游船上举行并闭幕 (闭幕日学界有 7 月 31 日、8 月初等说法, 文中不写具体日), 宣告中国共产党成立;
# 钱学森 1955 年 9 月离美, 10 月 8 日抵港回国, 1956 年任国防部第五研究院 (中国第一个导弹研究机构) 首任院长, 被誉为
# "中国导弹之父"; 1964 年 10 月 16 日中国第一颗原子弹试验成功 (罗布泊), 当天政府声明"中国在任何时候、任何情况下, 都不会
# 首先使用核武器"; 1970 年 4 月 24 日发射第一颗人造卫星东方红一号; 曼德拉 1962 年 8 月 5 日被捕, 共坐牢 27 年, 其中 18 年
# 在罗本岛 (1964–1982), 1990 年 2 月 11 日获释, 与德克勒克通过谈判结束种族隔离, 1994 年成为南非第一位黑人总统;
# 罗本岛 1997 年改为博物馆, 多年由昔日的政治犯带领参观监狱, 2017 年起逐步改由青年讲解员带队。
# "两弹"所指说法不一 (原子弹与氢弹 / 核弹与导弹), 文中只写名称, 不展开。学校、班级与周老师为虚构。
# 写法: 政治内容只陈述史实, 不作评价; 不写战争与伤亡细节。拼写: 牛津式英式拼写 (honoured, organized, programme)。
STORY = {
 'id': 'S0106', 'title': 'History Week: A Walk Through Time', 'titleZh': '历史周：穿越时光的长廊', 'genre': 'news feature',
 'minTargets': 10,
 'paras': [
  [
   ("Last week, the long corridor outside the Senior One classrooms at Xinhe High School was turned into a walk through modern history.",
    "上周，新河中学高一教室外的长廊变成了一条穿越近现代历史的“时光长廊”。", False),
   ("For the school's first History Week, each class prepared a display on one turning point, and visitors could cover over two hundred years in half an hour.",
    "在学校的首届历史周上，每个班都围绕历史上的一个转折点布置了一块展板，参观者花半个小时就能走过两百多年的历史。", True),
  ],
  [
   ("The first display took visitors back to France in 1789, a time of serious social unrest, when many people were hungry and angry about unfair taxes.",
    "第一块展板把参观者带回 1789 年的法国——那是一个社会严重动荡的年代，许多人吃不饱饭，对不公平的赋税十分不满。", True),
   ("In the new National Assembly, members who supported the king sat to the right of the chair, while supporters of the revolution sat to the left.",
    "在新成立的国民议会里，支持国王的议员坐在议长的右侧，支持革命的议员则坐在左侧。", True),
   ("As the students explained, this is why political parties in many countries are still described as left-wing or right-wing today.",
    "同学们解释说，正因为如此，如今许多国家的政党仍被称为“左翼”或“右翼”。", False),
  ],
  [
   ("The next display traced the long struggle to abolish slavery.",
    "下一块展板回顾了废除奴隶制的漫长斗争。", False),
   ("In 1833 Britain passed a law to end it in most of its empire, and in 1865, after the Civil War, the United States banned it through a change to its Constitution.",
    "1833 年，英国通过法律，在大英帝国的大部分地区废除了奴隶制；1865 年，美国在内战结束后通过宪法修正案，也废除了奴隶制。", True),
  ],
  [
   ("Class 3 turned to China, showing how the ideas of communism spread among Chinese students and thinkers after the May Fourth Movement of 1919.",
    "三班把目光转向中国，展示了 1919 年五四运动之后，共产主义思想是如何在中国的青年学生和知识分子中传播开来的。", False),
   ("In July 1921, the Communist Party of China was founded at its first national congress, which opened in Shanghai and ended on a boat on South Lake in Jiaxing.",
    "1921 年 7 月，中国共产党在第一次全国代表大会上宣告成立；这次大会在上海开幕，最后在嘉兴南湖的一条游船上闭幕。", True),
  ],
  [
   ("Class 5 chose the story of \"Two Bombs, One Satellite\".",
    "五班选择讲述“两弹一星”的故事。", False),
   ("Their display began with Qian Xuesen, who returned to China from the United States in 1955 and is often called the father of China's missile programme.",
    "他们的展板从钱学森讲起：他 1955 年从美国回到祖国，常被誉为“中国导弹之父”。", False),
   ("On 16 October 1964, China tested its first atomic bomb, and on the same day the government promised never to be the first to use nuclear weapons.",
    "1964 年 10 月 16 日，中国第一颗原子弹试验成功；就在同一天，中国政府承诺绝不首先使用核武器。", True),
   ("Then, in April 1970, the country launched its first satellite.",
    "1970 年 4 月，中国又成功发射了第一颗人造卫星。", False),
  ],
  [
   ("The last stop was about Nelson Mandela, who campaigned against apartheid, a system in South Africa that separated people by race and treated them unfairly.",
    "最后一站讲的是纳尔逊·曼德拉，他致力于反对种族隔离制度——南非曾实行的一种按种族把人们隔开、并不公平地对待他们的制度。", True),
   ("Arrested in 1962, he spent the next 27 years in prison, 18 of them on Robben Island.",
    "他于 1962 年被捕，此后在狱中度过了 27 年，其中 18 年是在罗本岛上。", False),
   ("After he was freed in 1990, he worked to end apartheid through peaceful talks, and in 1994 he became the country's first Black president.",
    "1990 年获释后，他致力于通过和平谈判结束种族隔离制度；1994 年，他成为南非第一位黑人总统。", False),
   ("Today the old prison on Robben Island is a museum, and for many years former prisoners worked there as guides.",
    "如今，罗本岛上的旧监狱已成为一座博物馆，多年来一直由昔日的囚犯在这里担任讲解员。", False),
  ],
  [
   ("\"History is not just a list of dates,\" said Ms Zhou, the history teacher who organized the week.",
    "“历史不只是一串年份，”组织这次活动的历史老师周老师说。", False),
   ("\"We wanted students to see the real people behind the dates, and how the past has shaped the world we live in today.\"",
    "“我们希望同学们看到这些年份背后真实的人，也看到过去如何塑造了我们今天生活的世界。”", False),
  ],
 ],
 # 目标词: (原型, 文中词形, 词性, 语境释义, 出现在第几句(全文序号, 从 1 起), 搭配英, 搭配中)
 'words': [
  ('unrest', 'unrest', 'n.', '（社会、政治的）动荡，动乱', 3, 'social unrest', '社会动荡'),
  ('left-wing', 'left-wing', 'adj.', '左翼的，左派的', 5, 'a left-wing party', '左翼政党'),
  ('slavery', 'slavery', 'n.', '奴隶制（度）', 6, 'abolish slavery', '废除奴隶制'),
  ('communism', 'communism', 'n.', '共产主义', 8, 'the ideas of communism', '共产主义思想'),
  ('communist', 'Communist', 'adj.', '共产党的；共产主义的', 9, 'the Communist Party of China', '中国共产党'),
  ('missile', 'missile', 'n.', '导弹', 11, 'a missile programme', '导弹研制计划'),
  ('bomb', 'bomb', 'n.', '炸弹', 12, 'an atomic bomb', '原子弹'),
  ('arrest', 'Arrested', 'v.', '逮捕，拘留', 15, 'be arrested', '被捕'),
  ('prison', 'prison', 'n.', '监狱', 15, 'spend years in prison', '在狱中度过多年'),
  ('prisoner', 'prisoners', 'n.', '囚犯，犯人', 17, 'a former prisoner', '昔日的囚犯'),
 ],
 'gloss': {'apartheid': 'n. （南非的）种族隔离制度', 'atomic': 'adj. 原子的；原子能的'},
}
