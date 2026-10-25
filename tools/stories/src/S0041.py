# S0041 — 游记: A Day in the Forbidden City (3500 · ABC 窗口 4, 第 8 组)
# 事实: 紫禁城为明永乐年间所建 (1406 年起筹备, 1420 年建成, 通称约十四年); 1420–1912 年间明清两代
# 共 24 位皇帝居住; "禁"指平民不得擅入; 1925 年成为故宫博物院; 门票须实名网上预约 (不收当天预约),
# 本科及以下在校学生 20 元, 未成年人免费 (写 "a lower fee or nothing at all"); 除法定节假日等外周一闭馆
# (写 "most Mondays"); 游览路线南进北出: 午门入口, 神武门出口; 太和殿是故宫最大的殿, 举行最隆重的典礼,
# 现存建筑为康熙年间重建 (1697 年完工), 所以"历经多次地震"只写故宫整体 (over the centuries);
# 黄色琉璃瓦为皇家专用 (写"普通人不能用"); 木构架以榫卯连接, 基本不用钉子; 钟表、书画等珍贵文物中
# 易损的只短期展出; 御花园在北端近神武门; 故宫有不少"宫猫"; 神武门对面是景山公园, 山顶可俯瞰故宫全景。
# 修建动用大批工匠劳工, 不写具体人数。
STORY = {
 'id': 'S0041', 'title': 'A Day in the Forbidden City', 'titleZh': '故宫一日', 'genre': 'travel',
 'paras': [
  [
   ("If you visit Beijing for only one day, make sure you spend it in the Forbidden City, the former home of China's emperors.",
    "如果你在北京只待一天，那一定要把这一天留给紫禁城——中国古代皇帝曾经的家。", False),
   ("For almost five hundred years, twenty-four emperors of the Ming and Qing dynasties lived here, and ordinary people were forbidden to enter.",
    "将近五百年间，明清两朝共有二十四位皇帝在这里居住，普通百姓不得入内。", True),
   ("Today it is the Palace Museum, and it is so popular that you should book tickets online several days ahead, especially for weekends and holidays.",
    "如今这里是故宫博物院，它太受欢迎了，最好提前几天在网上预约门票，周末和节假日尤其如此。", True),
   ("Remember to bring your ID card: students pay a lower fee or nothing at all, and the museum is closed on most Mondays.",
    "记得带上身份证：学生门票更便宜，有的甚至免费；另外，故宫大多数星期一闭馆。", False),
  ],
  [
   ("The entrance is the huge Meridian Gate in the south, and from there you walk north through courtyards that seem almost endless.",
    "入口是南边高大的午门，从那里开始，你会一路向北，穿过一个又一个仿佛没有尽头的院落。", True),
   ("Soon you reach the Hall of Supreme Harmony, the largest hall in the palace, where the most important ceremonies were held.",
    "不久你就来到了太和殿，这是故宫里最大的宫殿，最隆重的典礼都在这里举行。", False),
   ("Its roof is covered in yellow tiles, a colour that ordinary people were not allowed to use.",
    "它的屋顶铺着黄色的琉璃瓦，这种颜色是普通百姓不能用的。", False),
   ("Like the other halls, it is held up by a wooden framework whose parts fit together with almost no nails, and over the centuries the palace has survived many earthquakes.",
    "和其他宫殿一样，它由木构架支撑，各部件几乎不用钉子就能严丝合缝地连在一起；几百年来，故宫经受住了多次地震。", True),
   ("Huge numbers of skilled workers were employed to build the palace, which was finished in 1420 after about fourteen years of work.",
    "修建故宫动用了大批能工巧匠，前后历时约十四年，于1420年建成。", False),
  ],
  [
   ("Many visitors find the red walls familiar from television dramas, but the real thing is far grander.",
    "许多游客在电视剧里早就看熟了这些红墙，但亲眼所见要宏伟得多。", False),
   ("Inside some halls you can see old clocks, paintings and other treasures, though the most fragile ones are only shown for short periods.",
    "有些殿里陈列着古老的钟表、书画等珍宝，不过最易损的那些只做短期展出。", True),
   ("It takes a whole day to explore the palace properly, so wear comfortable shoes.",
    "要好好游览整座故宫得花上一整天，所以记得穿一双舒服的鞋。", False),
   ("My favourite part was the Imperial Garden at the northern end of the palace, where elegant little buildings stand among very old trees.",
    "我最喜欢的是故宫北端的御花园，精巧典雅的亭台楼阁散落在古树之间。", False),
   ("I was also fortunate enough to meet one of the palace cats, which was sleeping in the sun.",
    "我还很幸运地遇到了一只故宫猫，它正躺在阳光下睡觉。", False),
  ],
  [
   ("When you leave through the north exit, cross the road and climb the hill in Jingshan Park.",
    "从北边的出口出来后，穿过马路，去爬景山公园里的小山。", False),
   ("At dusk the view from the top is wonderful: under a flaming red sky, the golden roofs of the palace stretch out below you.",
    "黄昏时分，山顶的景色美极了：火红的天空下，故宫金色的屋顶在你脚下铺展开来。", False),
   ("It is the perfect ending to a day in the heart of old Beijing.",
    "这是在老北京的中心度过一天的完美结尾。", False),
  ],
 ],
 'words': [
  ('former', 'former', 'adj.', '以前的，从前的', 1, 'the former home of sb', '某人的故居'),
  ('emperor', 'emperors', 'n.', '皇帝', 1, 'the last emperor', '末代皇帝'),
  ('dynasty', 'dynasties', 'n.', '朝代，王朝', 2, 'the Ming dynasty', '明朝'),
  ('forbid', 'forbidden', 'v.', '禁止，不许', 2, 'be forbidden to do sth', '被禁止做某事'),
  ('especially', 'especially', 'adv.', '尤其，特别', 3, 'especially at weekends', '尤其是在周末'),
  ('fee', 'fee', 'n.', '费用', 4, 'an entrance fee', '门票费，入场费'),
  ('entrance', 'entrance', 'n.', '入口，大门', 5, 'the main entrance', '正门，主入口'),
  ('endless', 'endless', 'adj.', '无尽的，没完没了的', 5, 'seemingly endless', '似乎没有尽头的'),
  ('framework', 'framework', 'n.', '（建筑物的）框架，构架', 8, 'a wooden framework', '木框架'),
  ('employ', 'employed', 'v.', '雇用；使用', 9, 'employ workers', '雇用工人'),
  ('familiar', 'familiar', 'adj.', '熟悉的', 10, 'look familiar', '看着眼熟'),
  ('fragile', 'fragile', 'adj.', '易碎的，易损的', 11, 'fragile objects', '易碎物品'),
  ('explore', 'explore', 'v.', '游览，探索', 12, 'explore the city', '游览这座城市'),
  ('favourite', 'favourite', 'adj.', '最喜爱的', 13, 'my favourite place', '我最喜欢的地方'),
  ('elegant', 'elegant', 'adj.', '典雅的，精美的', 13, 'an elegant building', '典雅的建筑'),
  ('fortunate', 'fortunate', 'adj.', '幸运的', 14, 'be fortunate enough to do sth', '有幸做某事'),
  ('exit', 'exit', 'n.', '出口', 15, 'an emergency exit', '紧急出口'),
  ('dusk', 'dusk', 'n.', '黄昏，傍晚', 16, 'at dusk', '黄昏时'),
  ('flaming', 'flaming', 'adj.', '火红的；燃烧的', 16, 'flaming red', '火红色'),
  ('ending', 'ending', 'n.', '结尾，结局', 17, 'a perfect ending to sth', '……的完美结尾'),
 ],
}
