# S0019 — 游记: A Day in Macao (3500 · ABC 窗口 2, 第 6 组)
# 事实核对: 16 世纪中叶葡萄牙商人定居澳门; 议事亭前地黑白波浪纹石子路; 大三巴为
# 17 世纪初所建天主之母教堂的前壁, 教堂 1835 年毁于大火, 前壁刻有西式图案和汉字;
# 澳门天主教教区设立于 1576 年; 利玛窦 1582 年抵澳门学汉语, 1610 年卒于北京, 万历帝赐地安葬;
# 圣诞节、佛诞节均为澳门公众假期 (第 60/2000 号法令, 见 gov.mo 公众假期表, 审读已核);
# 氹仔经大桥与澳门半岛相连; 澳门有开往香港的渡轮。
STORY = {
 'id': 'S0019', 'title': 'A Day in Macao', 'titleZh': '澳门一日', 'genre': 'travel',
 'paras': [
  [
   ("Early on a Saturday morning, my parents and I walked across the border from Zhuhai into Macao, a small city on the south coast of China.",
    "一个星期六的清晨，我和爸爸妈妈从珠海步行过关，来到中国南部沿海的小城澳门。", False),
   ("At an information booth, a smiling woman gave us a free brochure with a map of the old town.",
    "在一个咨询亭，一位面带微笑的女士给了我们一本免费的宣传册，里面附有老城区的地图。", False),
   ("Traders from Portugal arrived here in the sixteenth century, and ever since then, Chinese and Western civilizations have met and mixed in these narrow streets.",
    "十六世纪，葡萄牙商人来到这里；从那以后，中西方文明就在这些狭窄的街巷里相遇、交融。", True),
  ],
  [
   ("We started in Senado Square, where the ground is covered with black and white stones laid in a wave pattern.",
    "我们从议事亭前地出发，那里的地面铺着黑白两色的石子，拼成波浪状的图案。", False),
   ("A short walk up the hill brought us to the most famous sight in Macao: the stone front wall of a church built about four hundred years ago.",
    "沿着山坡走一小段路，我们就来到了澳门最著名的景点：一座约四百年前建成的教堂的石砌前壁。", True),
   ("The rest of the church burned down in 1835, but this wall survived, carved with both Western designs and Chinese characters.",
    "教堂的其余部分在1835年毁于大火，但这面墙保存了下来，上面既雕有西式图案，也刻着汉字。", True),
   ("A bride and bridegroom were having their wedding photos taken on the steps below it.",
    "一对新人正在墙下的台阶上拍婚纱照。", False),
  ],
  [
   ("Not far away stands the cathedral, the heart of Catholic life in the city.",
    "不远处矗立着主教座堂，那里是这座城市天主教活动的中心。", False),
   ("The city has had its own bishop since the sixteenth century.",
    "从十六世纪起，澳门就有了自己的主教。", False),
   ("Inside, a few visitors were quietly lighting candles.",
    "教堂里，几位参观者正静静地点着蜡烛。", False),
   ("It was in Macao that the Italian scholar Matteo Ricci began to learn Chinese in 1582.",
    "1582年，意大利学者利玛窦正是在澳门开始学习汉语的。", False),
   ("When he died in Beijing many years later, the emperor granted land for his burial, a rare honour for a foreigner.",
    "多年后他在北京去世时，皇帝赐地安葬了他，这对一个外国人来说是罕见的殊荣。", True),
   ("A few streets away from the churches, families burn incense in Chinese temples, where Buddhism and older local beliefs exist side by side.",
    "离教堂几条街的地方，一家家人在中式庙宇里烧香，佛教和更古老的本地信仰在那里并存。", True),
   ("Although only a small number of people in Macao are Christians, Christmas is a public holiday here, and so is the Buddha's Birthday.",
    "虽然澳门只有少数人是基督徒，但圣诞节在这里是公众假期，佛诞节也是。", False),
  ],
  [
   ("By late morning we were hungry, so we took a cab to Taipa, an island joined to the old city by bridges.",
    "快到中午时我们饿了，于是打车去了氹仔，那是一个靠几座大桥与老城区相连的岛。", False),
   ("We had brunch at a tiny cafe, where I tried a pork chop bun, a local favourite, and a warm egg tart.",
    "我们在一家小咖啡馆吃了早午餐，我尝了当地人最爱的猪扒包，还有一个热乎乎的蛋挞。", False),
   ("That evening we boarded a ferry bound for Hong Kong, the next stop on our trip.",
    "那天傍晚，我们登上了开往香港的渡轮，前往旅程的下一站。", False),
   ("As the lights of Macao faded behind us, I realized that this small city had shown me something I had only read about in books.",
    "澳门的灯火在身后渐渐远去，我意识到，这座小城让我亲眼看到了以前只在书里读到过的东西。", True),
   ("Different cultures really can share one place in peace.",
    "不同的文化真的可以在同一片土地上和平共处。", False),
  ],
 ],
 # 目标词: (原型, 文中词形, 词性, 语境释义, 出现在第几句(全文序号, 从 1 起), 搭配英, 搭配中)
 'words': [
  ('border', 'border', 'n.', '边界，边境', 1, 'cross the border', '过境'),
  ('coast', 'coast', 'n.', '海岸，沿海地区', 1, 'on the south coast', '在南部沿海'),
  ('booth', 'booth', 'n.', '（有专门用途的）亭，小隔间', 2, 'an information booth', '咨询亭'),
  ('brochure', 'brochure', 'n.', '（介绍或宣传用的）小册子', 2, 'a travel brochure', '旅游宣传册'),
  ('civilization', 'civilizations', 'n.', '文明', 3, 'Western civilization', '西方文明'),
  ('carve', 'carved', 'v.', '雕刻', 6, 'be carved with', '刻有……'),
  ('bride', 'bride', 'n.', '新娘', 7, 'a bride-to-be', '准新娘'),
  ('bridegroom', 'bridegroom', 'n.', '新郎', 7, 'the bride and bridegroom', '新娘和新郎'),
  ('cathedral', 'cathedral', 'n.', '主教座堂，大教堂', 8, 'visit a cathedral', '参观大教堂'),
  ('Catholic', 'Catholic', 'adj.', '天主教的', 8, 'the Catholic Church', '天主教会'),
  ('bishop', 'bishop', 'n.', '主教', 9, 'the Bishop of Macao', '澳门主教'),
  ('candle', 'candles', 'n.', '蜡烛', 10, 'light a candle', '点蜡烛'),
  ('burial', 'burial', 'n.', '埋葬，安葬', 12, 'burial place', '安葬地'),
  ('Buddhism', 'Buddhism', 'n.', '佛教', 13, 'practise Buddhism', '信奉佛教'),
  ('Christian', 'Christians', 'n.', '基督徒', 14, 'Christians and Buddhists', '基督徒和佛教徒'),
  ('cab', 'cab', 'n.', '出租车', 15, 'take a cab', '打车'),
  ('brunch', 'brunch', 'n.', '早午餐', 16, 'have brunch', '吃早午餐'),
  ('cafe', 'cafe', 'n.', '咖啡馆；小餐馆', 16, 'a street cafe', '街边咖啡馆'),
  ('bun', 'bun', 'n.', '小圆面包', 16, 'a steamed bun', '馒头；包子'),
  ('board', 'boarded', 'v.', '登上（船、火车、飞机等）', 17, 'board a ferry', '登上渡轮'),
  ('bound', 'bound', 'adj.', '开往……的', 17, 'be bound for', '开往，前往'),
 ],
 # 词库与离线词典都没有的超纲词: 点词时显示这里的释义
 'gloss': {'incense': 'n. 香（祭拜时点燃的）', 'tart': 'n. 挞；果馅饼'},
}
