# S0104 — 记叙文: A Lamb in the Snow (3500 · ABC 窗口 11, 第 1 组)
# 拼写: 牛津式英式拼写 (woollen, colour, realize), 与词库一致
# 事实: 内蒙古草原冬季气温常降到零下二十度以下; 如今牧民普遍骑摩托车放牧;
#   草场上普遍拉有铁丝围栏; 部分牧区冬季产羔 ("冬羔"); 酸奶是蒙古族的传统食品;
#   狼在内蒙古部分地区仍有分布, 但比几十年前少见得多;
#   牧区青壮年大量进城务工, 留在草原上的劳动力年龄偏大。
# 审读: 狼只写"夜里靠近羊群、家里人轮流守夜"; 小羊是冬季刚出生不久、能揣进怀里的小羊羔,
#   腿被铁丝网勒伤, 苏晴坐在摩托车后座上把它揣在外套里带回家。
STORY = {
 'id': 'S0104', 'title': 'A Lamb in the Snow', 'titleZh': '雪地里的小羊羔', 'genre': 'narrative',
 'paras': [
  [
   ("During the winter holiday, Su Qing went to stay with her grandparents, who keep sheep on the grassland in Inner Mongolia.",
    "寒假期间，苏晴去内蒙古草原上的爷爷奶奶家住，他们在那里养羊。", False),
   ("On her first morning, she got out of bed with a long yawn and learned that it was twenty degrees below zero outside.",
    "第一天早上，她打着长长的哈欠起了床，才知道外面已经是零下二十度了。", False),
   ("Over breakfast, Grandpa told her that in his youth, wolves sometimes came near the sheep at night, so the family took turns to stay up and guard them.",
    "吃早饭时，爷爷告诉她，在他年轻的时候，狼有时会在夜里靠近羊群，所以家里人要轮流守夜看羊。", True),
   ("Wolves were much rarer now, he said, and so were young people: most of them had left for jobs in the cities, and the local workforce was getting older every year.",
    "他说，如今狼少多了，年轻人也一样：大多数年轻人都进城打工去了，留在当地干活的人一年比一年老。", True),
  ],
  [
   ("Grandma had knitted several hats from the wool of their own sheep, and she told Su Qing to take whichever one she liked.",
    "奶奶用自家羊的羊毛织了好几顶帽子，她让苏晴喜欢哪顶就拿哪顶。", True),
   ("She chose a red one, pulled on her boots and a pair of woollen gloves, and zipped her coat up to her chin.",
    "苏晴挑了一顶红色的，穿上靴子，戴上一副毛线手套，又把外套的拉链一直拉到下巴。", False),
   ("Minutes later, she was on the back of Grandpa's old motorbike, and they zoomed across the snow to check on the sheep.",
    "几分钟后，她已经坐在爷爷那辆旧摩托车的后座上，两人在雪地上飞驰而过，去看看羊群怎么样了。", False),
  ],
  [
   ("At the far end of the field, a small lamb had got its back leg caught in the wire fence, and each time it struggled, the wire cut a little deeper.",
    "在草场的另一头，一只小羊羔的后腿卡在了铁丝围栏里，它每挣扎一下，铁丝就勒得更深一些。", True),
   ("\"Careful, or you'll frighten her,\" Grandpa whispered as he held the lamb still.",
    "“小心点，别吓着它。”爷爷一边按住小羊，一边低声说。", False),
   ("Pulling off her gloves, Su Qing wrestled with the frozen wire until, at last, the leg came free.",
    "苏晴摘下手套，跟冻得冰凉的铁丝较了半天劲，小羊的腿终于脱了出来。", False),
   ("The wounded lamb was too weak to stand, so she pulled down the zipper on her coat and held the lamb inside, against her chest, for the whole ride home.",
    "受伤的小羊虚弱得站不起来，她便拉下外套的拉链，把小羊揣进怀里贴着胸口，就这样坐着摩托车回了家。", True),
  ],
  [
   ("In the kitchen, Grandma wiped the wound clean with warm water and wrapped the leg in a piece of soft cloth.",
    "在厨房里，奶奶用温水把伤口擦干净，再用一块软布把小羊的腿包好。", False),
   ("Then she took Su Qing by the wrist and held her cold red fingers close to the stove.",
    "接着，她拉住苏晴的手腕，把她冻得通红的手指凑到炉子边烤一烤。", False),
   ("\"You did well,\" she said, and the wrinkles around her eyes grew deeper as she smiled.",
    "“你做得很好。”奶奶说着笑了起来，眼角的皱纹更深了。", False),
   ("As a reward, she brought out a bowl of her homemade yoghurt, thick and a little sour, with a spoonful of sugar on top.",
    "作为奖励，她端出一碗自己做的酸奶，稠稠的，带点儿酸味，上面撒着一勺糖。", False),
   ("\"Yummy!\" said Su Qing after her first taste, and by the stove the little lamb was already fast asleep.",
    "苏晴吃了第一口就说：“真好吃！”炉子旁边，小羊羔已经睡熟了。", False),
   ("That night she wrote in her diary: \"Today I finally understood why Grandpa and Grandma have never wanted to leave the grassland.\"",
    "那天晚上，她在日记里写道：“今天我终于明白了，爷爷奶奶为什么从来不想离开草原。”", False),
  ],
 ],
 # 目标词: (原型, 文中词形, 词性, 语境释义, 出现在第几句(全文序号, 从 1 起), 搭配英, 搭配中)
 'words': [
  ('yawn', 'yawn', 'n.', '哈欠', 2, 'with a yawn', '打着哈欠'),
  ('youth', 'youth', 'n.', '青年时期，青春', 3, 'in one\'s youth', '在某人年轻时'),
  ('wolf', 'wolves', 'n.', '狼（复数 wolves）', 3, 'a pack of wolves', '一群狼'),
  ('workforce', 'workforce', 'n.', '劳动力，劳动人口', 4, 'the local workforce', '当地的劳动力'),
  ('woollen', 'woollen', 'adj.', '羊毛的，毛线织的', 6, 'woollen gloves', '毛线手套'),
  ('wool', 'wool', 'n.', '羊毛', 5, 'sheep\'s wool', '羊毛'),
  ('whichever', 'whichever', 'pron.', '无论哪个，任何一个', 5, 'take whichever you like', '你喜欢哪个就拿哪个'),
  ('zip', 'zipped', 'v.', '拉上……的拉链', 6, 'zip up a coat', '拉上外套的拉链'),
  ('zoom', 'zoomed', 'v.', '飞驰，疾驰', 7, 'zoom across sth', '飞驰着穿过……'),
  ('wire', 'wire', 'n.', '铁丝，金属线', 8, 'a wire fence', '铁丝围栏'),
  ('whisper', 'whispered', 'v.', '低声说，耳语', 9, 'whisper softly', '轻声低语'),
  ('wrestle', 'wrestled', 'v.', '（跟某物）较劲，费力对付', 10, 'wrestle with sth', '跟某物较劲；费力对付某物'),
  ('wounded', 'wounded', 'adj.', '受伤的', 11, 'a wounded animal', '受伤的动物'),
  ('zipper', 'zipper', 'n.', '拉链', 11, 'pull down the zipper', '拉下拉链'),
  ('wipe', 'wiped', 'v.', '擦，擦净', 12, 'wipe sth clean', '把某物擦干净'),
  ('wound', 'wound', 'n.', '伤口，创伤', 12, 'clean a wound', '清洗伤口'),
  ('wrist', 'wrist', 'n.', '手腕', 13, 'take sb by the wrist', '拉住某人的手腕'),
  ('wrinkle', 'wrinkles', 'n.', '皱纹', 14, 'wrinkles around the eyes', '眼角的皱纹'),
  ('yoghurt', 'yoghurt', 'n.', '酸奶', 15, 'homemade yoghurt', '自制酸奶'),
  ('yummy', 'Yummy', 'adj.', '很好吃的，美味的', 16, 'look yummy', '看起来很好吃'),
 ],
 # 词库与离线词典都没有的超纲词: 点词时显示这里的释义
 'gloss': {'grassland': 'n. 草原；草地', 'homemade': 'adj. 自制的；家里做的'},
}
