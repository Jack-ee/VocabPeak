# S0102 — 人物传记: Zheng He and the Treasure Ships (3500 · ABC 窗口 10, 第 9 组)
# 事实 (核对 Wikipedia "Timeline of the Ming treasure voyages" / "China National Maritime Day"):
# 郑和 1371 年生于云南昆阳, 本姓马, 出身穆斯林家庭; 少年时入燕王朱棣府中, 朱棣即位为永乐帝后
# 于 1404 年赐姓郑; 1405 年 7 月 11 日首次从南京出发, 至 1433 年共七下西洋, 到过东南亚、印度、
# 阿拉伯半岛和东非; 宝船尺寸至今有争议 (写"still uncertain"); 船队携带丝绸、瓷器等, 带回宝石、
# 香料 (胡椒等; 乳香、没药不单列) 和长颈鹿等; 所到国家和地区通常称"三十多个"; 船队借季风冬去夏归;
# 马六甲在这一时期发展成富庶港口 (不写因果); 前六次由永乐帝下令, 第七次由其孙宣德帝于 1430 年下令, 也是最后一次;
# 郑和约于 1433 年去世, 葬地不详, 南京牛首山有郑和墓 (一般认为是衣冠冢); 2005 年起 7 月 11 日为中国航海日;
# 肯尼亚蒙布瑞等东非沿海出土过明代早期瓷片 (北大秦大树团队; 与郑和的联系尚无定论, 文中不写);
# 印尼、马来西亚、泰国等地有以"三宝"命名、纪念郑和的庙宇 (如三宝垄的三宝洞), 写"in parts of Southeast Asia"。
# 审读删去"与后来的欧洲船队不同, 不占别国土地"的对比 (郑和船队有过战事, 对比易引争议)。不写宝船具体尺寸与人数, 不涉及战事。
STORY = {
 'id': 'S0102', 'title': 'Zheng He and the Treasure Ships', 'titleZh': '郑和与宝船', 'genre': 'biography',
 'paras': [
  [
   ("On 11 July 1405, a huge fleet left Nanjing and sailed down the Yangtze River towards the open sea.",
    "1405 年 7 月 11 日，一支庞大的船队从南京出发，沿长江而下，驶向大海。", False),
   ("It was the first of seven great voyages led by Zheng He, almost ninety years before Columbus crossed the Atlantic.",
    "这是郑和率领的七次远航中的第一次，比哥伦布横渡大西洋早了将近九十年。", False),
  ],
  [
   ("Born in Yunnan in 1371 into a Muslim family, Zheng He originally had the family name Ma.",
    "郑和 1371 年出生在云南一个穆斯林家庭，本来姓马。", False),
   ("As a boy he was sent to serve Zhu Di, who later became the Yongle Emperor and gave him the new family name Zheng.",
    "少年时，他被送进燕王朱棣的府中当差；朱棣后来当上了永乐皇帝，并赐他姓郑。", True),
  ],
  [
   ("His largest ships, known as treasure ships, were huge for their day, though their exact size is still uncertain.",
    "他船队中最大的船叫作“宝船”，在当时堪称庞然大物，不过它们的确切尺寸至今仍无定论。", True),
   ("Building them required techniques that were highly advanced at the time.",
    "建造这样的船，需要在那个年代非常先进的造船技术。", False),
   ("In total, the fleet visited more than thirty countries and regions, from Southeast Asia and India to the Arabian Peninsula and East Africa.",
    "船队先后到访了三十多个国家和地区，从东南亚、印度，一直到阿拉伯半岛和东非。", False),
  ],
  [
   ("The ships transported silk, porcelain and other valuable goods to foreign rulers and merchants.",
    "船队把丝绸、瓷器等贵重货物运给海外的君主和商人。", False),
   ("Chinese vases and bowls were especially popular, and pieces of early Ming porcelain have been found along the coast of East Africa.",
    "中国的瓷瓶和瓷碗尤其受欢迎，东非沿海就出土过明代早期的瓷器碎片。", True),
   ("In return, the ships brought home various goods, such as precious stones, spices and even a giraffe, which amazed the emperor's court.",
    "作为回报，船队带回了各种各样的物品，比如宝石、香料，甚至还有一头长颈鹿，让朝廷上下惊叹不已。", True),
   ("The voyages showed the wealth and power of Ming China and encouraged trade across the Indian Ocean.",
    "这些远航展示了明朝的财富与实力，也促进了印度洋沿岸的贸易。", False),
   ("The port of Malacca, where the fleet often stopped, grew into a wealthy trading centre during this period.", "船队常常停靠的马六甲，也在这一时期发展成了一个富庶的贸易中心。", False),
  ],
  [
   ("The ships depended upon winds that change direction with the seasons, usually leaving China in winter and returning in summer.",
    "船队依靠随季节变换风向的季风航行，通常冬季离开中国，夏季返航。", True),
   ("On the way, sailors had to be ready for typhoons, which could strike with terrible violence.",
    "一路上，水手们还得随时防备台风，台风来时往往极其猛烈。", False),
  ],
  [
   ("Unlike the first six voyages, which were ordered by the Yongle Emperor, the seventh and last was ordered by his grandson in 1430.",
    "与前六次由永乐皇帝下令不同，第七次、也是最后一次远航，是永乐皇帝的孙子在 1430 年下令的。", True),
   ("Zheng He died around 1433, and nobody knows for sure where he was buried.",
    "郑和大约在 1433 年去世，至今没有人确切知道他葬在哪里。", False),
   ("A tomb in his memory stands on a hillside south of Nanjing.", "南京城南的一处山坡上有一座纪念他的墓。", False),
   ("In parts of Southeast Asia, he is still remembered in traditional stories, and some temples there are even named after him.",
    "在东南亚的一些地方，人们至今仍在传统故事里讲述他，有些寺庙甚至以他的名字命名。", False),
   ("Today students throughout China read about his voyages in their history textbooks, and since 2005, 11 July has been celebrated as China's Maritime Day.",
    "如今，全国各地的学生都会在历史课本里读到郑和下西洋的故事；从 2005 年起，7 月 11 日被定为中国航海日。", True),
   ("Thus a boy from Yunnan became one of the best-known sailors in history.",
    "就这样，一个来自云南的少年，成了航海史上最知名的航海家之一。", False),
  ],
 ],
 'words': [
  ('voyage', 'voyages', 'n.', '航行，远航', 2, 'a long voyage', '长途航行'),
  ('uncertain', 'uncertain', 'adj.', '不确定的，无定论的', 5, 'remain uncertain', '仍不确定'),
  ('technique', 'techniques', 'n.', '技术，技艺', 6, 'advanced techniques', '先进的技术'),
  ('total', 'total', 'n.', '总数，合计', 7, 'in total', '总共'),
  ('transport', 'transported', 'v.', '运输，运送', 8, 'transport goods', '运送货物'),
  ('valuable', 'valuable', 'adj.', '贵重的，值钱的', 8, 'valuable goods', '贵重物品'),
  ('vase', 'vases', 'n.', '花瓶，瓶', 9, 'a porcelain vase', '瓷瓶'),
  ('various', 'various', 'adj.', '各种各样的', 10, 'various kinds of', '各种各样的'),
  ('wealth', 'wealth', 'n.', '财富', 11, 'wealth and power', '财富与实力'),
  ('trade', 'trade', 'n.', '贸易', 11, 'encourage trade', '促进贸易'),
  ('wealthy', 'wealthy', 'adj.', '富有的，富庶的', 12, 'a wealthy city', '富庶的城市'),
  ('upon', 'upon', 'prep.', '（depend upon）依靠', 13, 'depend upon sth', '依靠某物'),
  ('typhoon', 'typhoons', 'n.', '台风', 14, 'a typhoon warning', '台风预警'),
  ('violence', 'violence', 'n.', '猛烈，狂暴（自然力量的）', 14, 'the violence of the storm', '暴风雨的猛烈'),
  ('unlike', 'Unlike', 'prep.', '和……不同', 15, 'unlike sb/sth', '和……不同'),
  ('tomb', 'tomb', 'n.', '坟墓，墓', 17, 'an ancient tomb', '古墓'),
  ('traditional', 'traditional', 'adj.', '传统的', 18, 'traditional stories', '传统故事'),
  ('throughout', 'throughout', 'prep.', '遍及，在……各处', 19, 'throughout the country', '全国各地'),
  ('textbook', 'textbooks', 'n.', '课本，教科书', 19, 'a history textbook', '历史课本'),
  ('thus', 'Thus', 'adv.', '就这样；因此', 20, 'and thus', '因而，就这样'),
 ],
 'gloss': {'fleet': 'n. 船队', 'porcelain': 'n. 瓷器', 'zheng': '郑（郑和，人名）'},
}
