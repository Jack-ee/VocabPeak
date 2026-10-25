# S0092 — 采访: Crossing the Strait (3500 · ABC 窗口 9, 第 9 组)
# 学生记者为校报采访琼州海峡渡轮船长; 人物虚构。
# 事实: 琼州海峡隔开海南岛与广东雷州半岛, 渡轮往返海口与徐闻 (海安), 风平浪静时航程约一个半小时;
# 海峡水流较急, 近岸有浅水区, 船舶走固定航道; 货船、油轮往来; 台风来临时船舶进港避风、渡轮停航;
# 春季常有大雾导致停航, 春节前后曾多次出现车辆在港口长时间排队; 船员须接受海上求生等安全培训。
# 审读 (tropicalhainan.com 航线指南: 海口—徐闻约 90 分钟; 中新网 2026-01-23: 春节前后海峡多雾, 车辆旅客滞留):
# a stream of cars 指车流不断, 不能"排着等", 改为"源源不断开进港口, 有的等一整天"; 停航由主管部门宣布, 补 the authorities;
# 船长"两趟之间只睡几小时"与"安全第一"相抵触, 改为"匆匆吃顿饭"; smooth 与搭配统一为 smooth crossing。
STORY = {
 'id': 'S0092', 'title': 'Crossing the Strait: An Interview with Captain Wu', 'titleZh': '穿越海峡：专访吴船长', 'genre': 'interview',
 'paras': [
  [
   ("For our school newspaper, I talked to Captain Wu Min, who has worked for twenty years on the ferries that cross the Qiongzhou Strait between Hainan and Guangdong.",
    "为了给校报写稿，我采访了吴敏船长。二十年来，她一直在往返于海南与广东之间、穿越琼州海峡的渡轮上工作。", True),
  ],
  [
   ("I first asked her what an ordinary crossing is like.",
    "我先问她，平常的一趟航行是什么样的。", False),
   ("\"On a calm day it takes about an hour and a half, and most passengers enjoy a smooth crossing,\" she said.",
    "“风平浪静的时候，一趟大约一个半小时，大多数乘客一路都很平稳，”她说。", False),
   ("\"Cargo ships and tankers are a common sight, so we have to keep a careful watch at all times.\"",
    "“货船和油轮随处可见，所以我们必须时刻仔细瞭望。”", False),
   ("\"Near the shore the water is quite shallow in places, and the currents in the strait can be strong, so we always follow the same safe route.\"",
    "“靠近岸边的一些地方水很浅，海峡里的水流有时也很急，所以我们总是走同一条安全航线。”", True),
  ],
  [
   ("Next, I asked what happens in bad weather.",
    "接着，我问她遇到坏天气时怎么办。", False),
   ("\"Our rules are strict, and we never leave port if a storm is on its way,\" she replied.",
    "“我们的规定很严格，只要有风暴要来，我们绝不出港，”她回答。", False),
   ("\"When a typhoon comes, every ship in the area takes shelter in port, and the authorities announce a suspension of all ferry services until the typhoon has passed.\"",
    "“台风来的时候，这一带所有的船都要进港避风，有关部门会宣布渡轮全部停航，直到台风过去。”", True),
   ("\"In spring, a sudden fog can also stop us for hours, because it becomes too hard to see small fishing boats in time.\"",
    "“春天里，突如其来的大雾也可能让我们停航好几个小时，因为很难及时看清小渔船。”", False),
   ("\"If that happens around the Spring Festival, cars and lorries keep arriving at the port in a steady stream, and some have to wait there for a whole day.\"",
    "“要是赶上春节前后，小汽车和货车源源不断地开进港口，有的要在那里等上一整天。”", True),
   ("\"I have great sympathy for the families who have to wait, but safety must always come first.\"",
    "“我非常同情那些只能干等的家庭，但安全永远是第一位的。”", False),
  ],
  [
   ("When I asked about her crew, she said, \"Everyone is highly skilled, and we have all done survival training, so we know what to do in an emergency.\"",
    "我问到她的船员时，她说：“每个人都技术过硬，我们都接受过求生训练，所以遇到紧急情况都知道该怎么做。”", True),
   ("\"Our stewards are just as important, especially when the ship is full of travellers with heavy suitcases.\"",
    "“我们的乘务员同样重要，尤其是船上挤满了拖着沉重行李箱的旅客的时候。”", False),
   ("\"On rough days, they also look after passengers who suffer from motion sickness.\"",
    "“风浪大的时候，他们还要照顾晕船的乘客。”", False),
   ("\"In the busiest weeks of the year, we can only snatch a quick meal between crossings.\"",
    "“一年里最忙的那几周，我们只能在两趟航行之间抓紧时间匆匆吃顿饭。”", False),
  ],
  [
   ("Lastly, I asked what she loves most about her job.",
    "最后，我问她最喜欢这份工作的哪一点。", False),
   ("\"On the evening crossing, I like to watch the sun sink into the sea as the lights of Haikou appear ahead,\" she said with a smile.",
    "“傍晚那一趟，我喜欢看着太阳沉入大海，前方海口的灯火渐渐亮起，”她笑着说。", True),
   ("\"After twenty years, every trip still feels like bringing people home.\"",
    "“二十年了，每一趟航行，我依然觉得是在送大家回家。”", False),
  ],
 ],
 'words': [
  ('strait', 'Strait', 'n.', '海峡', 1, 'cross the strait', '横渡海峡'),
  ('smooth', 'smooth', 'adj.', '平稳的，顺利的', 3, 'a smooth crossing', '平稳的渡海航行'),
  ('tanker', 'tankers', 'n.', '油轮', 4, 'an oil tanker', '油轮'),
  ('sight', 'sight', 'n.', '景象，情景', 4, 'a common sight', '常见的景象'),
  ('shore', 'shore', 'n.', '岸，海滨', 5, 'near the shore', '在岸边附近'),
  ('shallow', 'shallow', 'adj.', '浅的', 5, 'shallow water', '浅水'),
  ('strict', 'strict', 'adj.', '严格的', 7, 'strict rules', '严格的规定'),
  ('storm', 'storm', 'n.', '风暴，暴风雨', 7, 'a storm is coming', '风暴要来了'),
  ('shelter', 'shelter', 'n.', '躲避，庇护', 8, 'take shelter', '躲避，避难'),
  ('suspension', 'suspension', 'n.', '暂停，中止', 8, 'the suspension of ferry services', '渡轮停航'),
  ('sudden', 'sudden', 'adj.', '突然的', 9, 'a sudden change', '突然的变化'),
  ('stream', 'stream', 'n.', '一连串，（人、车）流', 10, 'a steady stream of', '源源不断的……'),
  ('sympathy', 'sympathy', 'n.', '同情', 11, 'have sympathy for sb', '同情某人'),
  ('skilled', 'skilled', 'adj.', '熟练的，有技能的', 12, 'skilled workers', '熟练工人'),
  ('survival', 'survival', 'n.', '生存，幸存', 12, 'survival skills', '求生技能'),
  ('steward', 'stewards', 'n.', '（船、飞机上的）乘务员', 13, 'a ship\'s steward', '船上的乘务员'),
  ('suitcase', 'suitcases', 'n.', '手提箱，行李箱', 13, 'pack a suitcase', '收拾行李箱'),
  ('suffer', 'suffer', 'v.', '受（病痛）折磨，患（病）', 14, 'suffer from sth', '患有……；受……之苦'),
  ('sickness', 'sickness', 'n.', '（某种）病；恶心', 14, 'motion sickness', '晕动病（晕车、晕船等）'),
  ('snatch', 'snatch', 'v.', '抓紧时间做', 15, 'snatch a quick meal', '抓紧时间匆匆吃顿饭'),
  ('sink', 'sink', 'v.', '下沉，落下', 17, 'the sun sinks', '太阳落下'),
 ],
 'gloss': {'cargo': 'n. （船、飞机装载的）货物', 'currents': 'n. 水流，海流（current 的复数）'},
}
