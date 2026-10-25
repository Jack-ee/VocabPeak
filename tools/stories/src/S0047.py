# S0047 — 人物传记: Zhan Tianyou and the Railway Through the Mountains (3500 · ABC 窗口 5, 第 4 组)
# 事实 (审读核对 Wikipedia "Zhan Tianyou" / "Beijing–Zhangjiakou Railway" / "Qinglongqiao railway station";
# connecticuthistory.org "Yung Wing's Dream"; Scientific American 早年报道 "The Peking-Kalgan Railway"):
# 1872 年随首批 30 名留美幼童赴美, 初到时穿中式服装, 寄宿美国家庭学英语; 1881 年耶鲁毕业 (土木工程, 侧重铁路);
# 随即留学生全部被召回, 他被派往福州船政, 1888 年才开始从事铁路工作; 1905 年任京张铁路总工程师, 全部由中国人修建;
# 他亲自带两名中国铁路毕业生 (徐文洄、张鸿诰) 从柳村经南口、关沟、八达岭勘测到张家口; 为靠近最难的关沟段把办公室搬到南口;
# 八达岭隧道约 1.09 公里, 从山顶开两口竖井, 增加工作面; 青龙桥附近用"人"字形线路克服陡坡; 1905 年 10 月开工,
# 1909 年通车, 提前两年且未超预算; 1919 年在汉口去世; 墓和塑像在青龙桥车站; 京张高铁 2019 年底开通。
# 审读删去: "前后两个车头一拉一推" (只见于课文, 英文史料未见)、"风沙中攀登山坡""每个数据都要精确"
# (课文与通俗传记的说法)、"成千上万名工人" (未查到可靠数字)。
STORY = {
 'id': 'S0047', 'title': 'Zhan Tianyou and the Railway Through the Mountains', 'titleZh': '詹天佑与穿山而过的铁路', 'genre': 'biography',
 'paras': [
  [
   ("In 1872, thirty Chinese boys sailed across the Pacific to study in the United States, and among them was Zhan Tianyou from Guangdong.",
    "1872年，三十名中国男孩远渡太平洋赴美留学，其中就有来自广东的詹天佑。", False),
   ("The boys arrived in traditional Chinese garments, but they soon learned English and settled into American school life.",
    "这些孩子初到时穿着传统的中式衣衫，但他们很快学会了英语，适应了美国的校园生活。", False),
   ("Zhan proved to be a gifted student, and in 1881 he graduated from Yale University, where he had studied civil engineering with a special interest in railways.",
    "詹天佑是个很有天分的学生。1881年，他从耶鲁大学毕业，在那里主修土木工程，侧重铁路建设。", False),
  ],
  [
   ("Soon after his graduation, the students were called back to their homeland, and for years Zhan was given work that had nothing to do with railways.",
    "他毕业后不久，留学生们就被召回了祖国，此后多年，詹天佑被派去做的工作都与铁路毫不相干。", True),
   ("His great chance came in 1905, when the Qing government made him chief engineer of a new railway from Beijing to Zhangjiakou, a busy trading town on the northern frontier.",
    "1905年，他终于迎来了大显身手的机会：清政府任命他为一条新铁路的总工程师，这条铁路从北京通往张家口——北部边疆一座繁忙的商贸重镇。", True),
   ("It would be the first major railway built by Chinese engineers alone, independent of foreign experts.",
    "这将是第一条完全由中国工程师自己修建、不依靠外国专家的重要铁路。", False),
   ("Zhan himself led the initial survey with two Chinese assistants, working his way along the planned route from Beijing to Zhangjiakou.",
    "詹天佑亲自带着两名中国助手进行最初的勘测，沿着规划的线路从北京一路勘测到张家口。", False),
   ("The survey showed how difficult the task would be: north of Beijing, the line had to climb steep hillsides through a narrow mountain pass.",
    "勘测表明了这项任务有多艰巨：出了北京往北，铁路必须沿着陡峭的山坡，穿过一道狭窄的山口向上爬。", True),
  ],
  [
   ("To be closer to the hardest section, he moved his office to Nankou, at the foot of the mountains.",
    "为了离最艰难的路段近一些，他把办公室搬到了山脚下的南口。", False),
   ("From there he could inspect the building sites often and give clear instructions to engineers and labourers.",
    "在那里，他可以经常到工地检查，给工程师和工人们下达明确的指示。", False),
   ("To speed up work on the kilometre-long tunnel at Badaling, he had teams dig from both ends and from two shafts in the middle at the same time.",
    "为了加快八达岭那条一千多米长的隧道的进度，他让几支队伍同时从两端和中间的两口竖井开挖。", True),
   ("On the steepest section, near Qinglongqiao, he designed a zigzag line on which trains change direction as they climb, gaining height gradually.",
    "在最陡的青龙桥一段，他设计了“人”字形线路，列车在这里折返着往上爬，一点一点地升高。", True),
  ],
  [
   ("After four years of labour by Chinese workers and engineers, the railway opened in 1909, two years ahead of schedule and under budget.",
    "经过中国工人和工程师四年的辛勤劳动，这条铁路于1909年通车，比原计划提前了两年，而且没有超出预算。", False),
   ("The glory belonged not only to Zhan but to the whole country, which had shown what its own engineers could do.",
    "这份荣耀不只属于詹天佑，也属于整个国家——它证明了中国自己的工程师完全有能力做成大事。", False),
   ("Zhan died in 1919, and today he is honoured as the father of China's railways.",
    "詹天佑于1919年去世，如今人们尊他为“中国铁路之父”。", False),
   ("He is buried at Qinglongqiao Station, where his statue stands beside the zigzag line he designed.",
    "他就安葬在青龙桥车站，他的塑像矗立在他亲手设计的“人”字形线路旁。", False),
   ("In 2019, a high-speed railway between Beijing and Zhangjiakou opened, running near his old line.",
    "2019年，京张高铁开通，线路就在他当年修建的老铁路附近。", False),
   ("For generations, his story has inspired young Chinese engineers to believe that careful work can carry a railway over any mountain.",
    "一代又一代，他的故事激励着中国的年轻工程师，让他们相信：只要工作严谨细致，铁路就能翻越任何高山。", True),
  ],
 ],
 'words': [
  ('garment', 'garments', 'n.', '（一件）衣服，服装', 2, 'traditional garments', '传统服装'),
  ('gifted', 'gifted', 'adj.', '有天赋的', 3, 'a gifted student', '有天赋的学生'),
  ('graduate', 'graduated', 'v.', '毕业', 3, 'graduate from university', '大学毕业'),
  ('graduation', 'graduation', 'n.', '毕业', 4, 'after graduation', '毕业后'),
  ('homeland', 'homeland', 'n.', '祖国，故乡', 4, "return to one's homeland", '回到祖国'),
  ('government', 'government', 'n.', '政府', 5, 'the Qing government', '清政府'),
  ('frontier', 'frontier', 'n.', '边境，边疆', 5, 'the northern frontier', '北部边疆'),
  ('independent', 'independent', 'adj.', '不依赖他人的，独立的', 6, 'be independent of sb', '不依赖某人'),
  ('initial', 'initial', 'adj.', '最初的，开始的', 7, 'in the initial stages', '在最初阶段'),
  ('hillside', 'hillsides', 'n.', '山坡', 8, 'on the hillside', '在山坡上'),
  ('inspect', 'inspect', 'v.', '检查，视察', 10, 'inspect a building site', '检查工地'),
  ('labourer', 'labourers', 'n.', '体力劳动者，工人', 10, 'a building labourer', '建筑工人'),
  ('instruction', 'instructions', 'n.', '指示，命令', 10, 'give sb instructions', '给某人下达指示'),
  ('height', 'height', 'n.', '高度', 12, 'gain height', '升高，爬升'),
  ('gradually', 'gradually', 'adv.', '逐渐地', 12, 'rise gradually', '逐渐上升'),
  ('labour', 'labour', 'n.', '劳动', 13, 'manual labour', '体力劳动'),
  ('glory', 'glory', 'n.', '光荣，荣耀', 14, 'share the glory', '分享荣耀'),
  ('honour', 'honoured', 'v.', '尊敬；给以荣誉', 15, 'be honoured as', '被尊为'),
  ('generation', 'generations', 'n.', '代，一代人', 18, 'for generations', '世世代代'),
  ('inspire', 'inspired', 'v.', '鼓舞，激励', 18, 'inspire sb to do sth', '激励某人做某事'),
 ],
 'gloss': {'zhan': '詹（人名：Zhan Tianyou 詹天佑）'},
}
