# S0020 — 人物传记: Tu Youyou and the Ancient Recipe (3500 · ABC 窗口 2, 第 7 组)
# 事实核对: 屠呦呦 1930 年生于宁波, 名字取自《诗经·小雅·鹿鸣》"呦呦鹿鸣, 食野之苹/蒿";
# 诗中的"蒿"旧注多释为青蒿, 但古称青蒿与今药用青蒿 (黄花蒿) 的对应有争议, 正文只写
# 稳妥的"青蒿是蒿类植物的一种", 不写"诗里的植物就是/近似青蒿";
# 1955 年北京医学院药学系毕业后进入中医研究院; 1967 年启动的"523"项目为军民协作的保密项目,
# 1969 年她任课题组长; 课题组收集两千多个方药, 青蒿提取物效果时好时坏; 受东晋葛洪《肘后备急方》
# "青蒿一握, 以水二升渍, 绞取汁, 尽服之"启发改用低温提取; 1971 年样品对鼠疟抑制率 100%;
# 1972 年她和同事先在自己身上试药; 化学家随后测定青蒿素结构; 2015 年获诺贝尔生理学或医学奖,
# 是第一位获诺贝尔奖的中国女性。不写她现在的状况, 只用过去时叙事。
STORY = {
 'id': 'S0020', 'title': 'Tu Youyou and the Ancient Recipe', 'titleZh': '屠呦呦与一张古方', 'genre': 'biography',
 'paras': [
  [
   ("Many biographies of Tu Youyou begin with her name.",
    "许多屠呦呦的传记都是从她的名字讲起的。", False),
   ("Soon after her birth in 1930, her father chose it from a line in the Book of Songs, in which deer call \"you you\" as they eat wild plants.",
    "她1930年出生后不久，父亲就从《诗经》的一句诗里为她选了这个名字，诗中的鹿儿一边“呦呦”地叫，一边吃着野地里的草。", True),
   ("By a strange coincidence, one of those plants is hao, and qinghao, the plant that would one day make her famous, is a kind of hao.",
    "说来也巧，诗中的一种植物叫“蒿”，而后来让她闻名世界的青蒿，正是蒿的一种。", True),
  ],
  [
   ("She grew up in Ningbo, her birthplace on the east coast, and later went to Beijing to study at a medical college.",
    "她在出生地——东部沿海的宁波长大，后来到北京的一所医学院求学。", False),
   ("Her courses in botany taught her how to recognize the plants used in traditional Chinese medicine.",
    "植物学课程让她学会了辨认传统中药里用到的各种植物。", False),
   ("After graduating in 1955, she joined a research institute of traditional Chinese medicine, where she would later take on the most challenging task of her career.",
    "1955年毕业后，她进入了一家中医研究院，后来正是在那里，她接下了职业生涯中最具挑战性的任务。", True),
  ],
  [
   ("In those years, malaria was a heavy burden for many countries, and it was also common in parts of southern China.",
    "那些年，疟疾是许多国家的沉重负担，在中国南方的部分地区也很常见。", False),
   ("The disease is caused by a tiny parasite that attacks red blood cells.",
    "这种疾病是由一种攻击红细胞的微小寄生虫引起的。", False),
   ("Mosquitoes are its carriers: when they bite people, they pass the parasite on.",
    "蚊子是它的传播者：蚊子叮人时，就把寄生虫传给了人。", False),
   ("Older medicines no longer worked well, so in 1967 the government started a secret national project that brought together military and civilian scientists.",
    "原有的药物已经不太管用了，于是在1967年，国家启动了一个保密的全国性项目，把军队和地方的科研人员组织到了一起。", True),
  ],
  [
   ("From 1969, Tu led a team of colleagues who collected more than two thousand old recipes and tested many plants.",
    "从1969年起，屠呦呦带领一批同事，收集了两千多个古代药方，试验了许多种植物。", False),
   ("Even qinghao, however, worked only some of the time.",
    "然而，就连青蒿也是时灵时不灵。", False),
   ("Then she noticed a line in a book written in classical Chinese in the fourth century: put a handful of qinghao in water, squeeze out the juice and drink it all.",
    "后来，她注意到一部四世纪用文言文写成的医书里的一句话：取一把青蒿，用水浸泡，绞出汁液，全部喝下。", True),
   ("The book said nothing about boiling, and that gave her a brilliant idea: perhaps heat was destroying the very thing they were looking for.",
    "书里只字未提煎煮，这让她想到了一个绝妙的主意：也许正是高温破坏了他们苦苦寻找的东西。", False),
   ("In 1971, using a method that worked at a much lower temperature, her team made a sample from qinghao that cleared the parasite completely in mice.",
    "1971年，她的团队改用一种温度低得多的方法，从青蒿中提取出一份样品，它在老鼠身上把寄生虫完全清除了。", True),
   ("Before this breakthrough could be tested on patients, she and some of her colleagues made the brave decision to take it themselves.",
    "在这项突破性成果用于病人之前，她和几位同事做出了一个勇敢的决定：自己先服用。", False),
  ],
  [
   ("Later, chemists worked out the structure of the new medicine, artemisinin, and treatments based on it have since saved millions of lives.",
    "后来，化学家们弄清了这种新药——青蒿素——的结构，以它为基础的疗法至今已挽救了数百万人的生命。", False),
   ("In 2015, she became the first Chinese woman to win a Nobel Prize.",
    "2015年，她成为第一位获得诺贝尔奖的中国女性。", False),
   ("Her story has cast new light on traditional medicine, showing that an ancient text, read with a scientist's mind, can still help the modern world.",
    "她的故事让人们对传统医学有了新的认识：一部古老的典籍，如果用科学家的眼光去读，依然能造福现代世界。", True),
  ],
 ],
 # 目标词: (原型, 文中词形, 词性, 语境释义, 出现在第几句(全文序号, 从 1 起), 搭配英, 搭配中)
 'words': [
  ('biography', 'biographies', 'n.', '传记', 1, 'write a biography of sb', '为某人写传记'),
  ('birth', 'birth', 'n.', '出生', 2, 'date of birth', '出生日期'),
  ('coincidence', 'coincidence', 'n.', '巧合', 3, 'by coincidence', '巧合的是'),
  ('birthplace', 'birthplace', 'n.', '出生地，故乡', 4, "sb's birthplace", '某人的出生地'),
  ('botany', 'botany', 'n.', '植物学', 5, 'study botany', '学习植物学'),
  ('challenging', 'challenging', 'adj.', '具有挑战性的', 6, 'a challenging task', '一项有挑战性的任务'),
  ('burden', 'burden', 'n.', '重担，负担', 7, 'a heavy burden', '沉重的负担'),
  ('cause', 'caused', 'v.', '引起，导致', 8, 'be caused by', '由……引起'),
  ('cell', 'cells', 'n.', '细胞', 8, 'red blood cells', '红细胞'),
  ('carrier', 'carriers', 'n.', '（疾病的）携带者，传播者', 9, 'a carrier of disease', '疾病的传播者'),
  ('bite', 'bite', 'v.', '（蚊虫）叮，咬', 9, 'be bitten by a mosquito', '被蚊子叮咬'),
  ('civilian', 'civilian', 'adj.', '平民的；非军方的', 10, 'military and civilian', '军方和民间的'),
  ('colleague', 'colleagues', 'n.', '同事', 11, 'work with colleagues', '与同事合作'),
  ('classical', 'classical', 'adj.', '古典的', 13, 'classical Chinese', '文言文'),
  ('century', 'century', 'n.', '世纪', 13, 'in the fourth century', '在四世纪'),
  ('boil', 'boiling', 'v.', '煮，煎煮', 14, 'boil water', '烧开水'),
  ('brilliant', 'brilliant', 'adj.', '绝妙的，巧妙的', 14, 'a brilliant idea', '绝妙的主意'),
  ('breakthrough', 'breakthrough', 'n.', '突破，重大进展', 16, 'make a breakthrough', '取得突破'),
  ('brave', 'brave', 'adj.', '勇敢的', 16, 'a brave decision', '勇敢的决定'),
  ('chemist', 'chemists', 'n.', '化学家', 17, 'a research chemist', '从事研究的化学家'),
  ('cast', 'cast', 'v.', '投射（光等）', 19, 'cast (new) light on', '使人对……有新的认识'),
 ],
 # 词库与离线词典都没有的超纲词: 点词时显示这里的释义
 'gloss': {'qinghao': 'n. 青蒿', 'hao': 'n. 蒿（多种蒿类植物的统称）', 'malaria': 'n. 疟疾', 'parasite': 'n. 寄生虫', 'artemisinin': 'n. 青蒿素'},
}
