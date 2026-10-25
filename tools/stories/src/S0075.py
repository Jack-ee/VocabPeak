# S0075 — 采访: From Office to Kitchen (3500 · ABC 窗口 8, 第 2 组)
# 事实: 公务员在中国常被看作稳定的"铁饭碗"; 厨师有国家职业技能等级证书, 可经培训考取;
# 顾客在点评类 App 上给餐馆打分; 不少小饭馆米饭、汤自助; 脆皮烧肉、春卷是广府家常菜, 芒果布丁是粤港甜品。
# 人物陈佳、"阿婆厨房"为虚构, 不写具体价格与营业数字。
# 审读: 广府人称外婆为"阿婆", 与译文一致; "an old lane that serves"关系从句误挂在 lane 上, 已改;
# "raw ingredients"改为学习词典常见搭配 raw meat; 父母"拒绝"改为拒绝"支持这个计划", 逻辑更顺。
STORY = {
 'id': 'S0075', 'title': 'From Office to Kitchen', 'titleZh': '从办公室到厨房', 'genre': 'interview',
 'paras': [
  [
   ("Six years ago, Chen Jia was a civil servant in Guangzhou, with a steady job and a good salary.",
    "六年前，陈佳是广州的一名公务员，工作稳定，薪水也不错。", False),
   ("Today she runs Ah Po's Kitchen, a small restaurant in one of the city's old lanes, where she serves the dishes her grandmother used to cook.",
    "如今，她在城里的一条老巷子里经营着一家名叫“阿婆厨房”的小餐馆，供应的都是外婆当年常做的菜。", True),
   ("Our reporter visited her one quiet afternoon between lunch and dinner.",
    "一个安静的下午，在午市和晚市之间的空当，本报记者拜访了她。", False),
  ],
  [
   ("Why did you resign from a job that so many people want?", "这份工作很多人求之不得，你为什么要辞职呢？", False),
  ],
  [
   ("The work was fine, but I was only truly happy at weekends, when I cooked for my family using my grandmother's recipes.",
    "工作本身还不错，可只有到了周末，照着外婆的菜谱给家人做饭的时候，我才真正觉得快乐。", False),
   ("When I first asked my parents to support my plan, their answer was a firm refusal, because they thought a restaurant was far too big a risk.",
    "我第一次请父母支持我的计划时，他们一口回绝了，因为他们觉得开餐馆风险太大。", True),
   ("To show them I was serious, I took evening classes for a year and gained a chef's qualification before I left my job.",
    "为了让他们知道我是认真的，我上了一年夜校，考取了厨师资格证，然后才辞职。", False),
  ],
  [
   ("What makes your food special?", "你家的菜有什么特别之处？", False),
  ],
  [
   ("Quality comes first, so I go to the market at six every morning to choose the ingredients myself.",
    "质量第一，所以我每天早上六点去市场，亲自挑选食材。", False),
   ("Raw meat never stays in the refrigerator for more than a day, and our mango pudding is made only with fruit that has ripened naturally.",
    "生肉在冰箱里存放从不超过一天，我们的芒果布丁也只用自然成熟的芒果来做。", True),
   ("Our most popular dishes are roast pork with crispy skin and spring rolls, which customers dip into little saucers of sauce.",
    "我们最受欢迎的菜是脆皮烧肉和春卷，客人会蘸着小碟里的酱汁吃。", True),
   ("I still cut the meat with my grandmother's old knife, which is as sharp as a razor.",
    "我现在还用外婆那把旧菜刀切肉，它锋利得像剃刀一样。", False),
  ],
  [
   ("How did people find such a small place?", "这么小的店，大家是怎么找到的？", False),
  ],
  [
   ("At first hardly anyone came, and I kept every receipt in a shoebox so that I would know exactly how much money I was losing.",
    "一开始几乎没人来，我把每一张收据都收在一个鞋盒里，好清清楚楚地知道自己亏了多少钱。", True),
   ("Then a food reviewer wrote about us online, and soon customers were rating us highly on food apps.",
    "后来，一位美食评论人在网上写文章介绍了我们，很快顾客们就在美食 App 上给我们打出了高分。", False),
   ("Now we have lots of regular customers, and people often have to reserve a table several days in advance.",
    "现在我们有很多常客，大家常常得提前好几天订位。", False),
   ("Our prices are still low, partly because rice, soup and tea are all self-service.",
    "我们的价格依然实惠，部分原因是米饭、汤和茶都是自助的。", False),
   ("When an old man tells me that my roast pork tastes just like his mother's cooking, the satisfaction I feel is worth more than any salary.",
    "当一位老人告诉我，我做的烧肉跟他妈妈做的味道一模一样时，我心里的那份满足，比任何薪水都珍贵。", True),
   ("And my parents? They now eat here every Sunday.", "那我爸妈呢？他们现在每个星期天都来这儿吃饭。", False),
  ],
 ],
 'words': [
  ('servant', 'servant', 'n.', '（公职）人员；仆人', 1, 'a civil servant', '公务员'),
  ('salary', 'salary', 'n.', '薪水，工资', 1, 'a good salary', '不错的薪水'),
  ('serve', 'serves', 'v.', '供应（饭菜）；为……服务', 2, 'serve food', '供应饭菜'),
  ('reporter', 'reporter', 'n.', '记者', 3, 'a newspaper reporter', '报社记者'),
  ('resign', 'resign', 'v.', '辞职', 4, 'resign from a job', '辞去工作'),
  ('recipe', 'recipes', 'n.', '菜谱，烹饪法', 5, 'a recipe for sth', '……的做法'),
  ('refusal', 'refusal', 'n.', '拒绝', 6, 'a firm refusal', '断然拒绝'),
  ('qualification', 'qualification', 'n.', '资格证书；资格', 7, 'gain a qualification', '取得资格证书'),
  ('quality', 'Quality', 'n.', '质量，品质', 9, 'high quality', '高质量'),
  ('raw', 'Raw', 'adj.', '生的，未煮过的', 10, 'raw meat', '生肉'),
  ('refrigerator', 'refrigerator', 'n.', '冰箱', 10, 'keep sth in the refrigerator', '把某物放在冰箱里'),
  ('ripen', 'ripened', 'v.', '成熟', 10, 'ripen in the sun', '在阳光下成熟'),
  ('roast', 'roast', 'adj.', '烤的', 11, 'roast duck', '烤鸭'),
  ('roll', 'rolls', 'n.', '卷状物', 11, 'a spring roll', '春卷'),
  ('saucer', 'saucers', 'n.', '小碟子；茶托', 11, 'a saucer of milk', '一小碟牛奶'),
  ('razor', 'razor', 'n.', '剃刀，剃须刀', 12, 'as sharp as a razor', '像剃刀一样锋利'),
  ('receipt', 'receipt', 'n.', '收据，发票', 14, 'keep the receipt', '保留收据'),
  ('reviewer', 'reviewer', 'n.', '评论者，评论人', 15, 'a food reviewer', '美食评论人'),
  ('rate', 'rating', 'v.', '评价，评分', 15, 'rate sth highly', '给某物高度评价'),
  ('regular', 'regular', 'adj.', '经常的，常来的', 16, 'a regular customer', '常客'),
  ('reserve', 'reserve', 'v.', '预订，预约', 16, 'reserve a table', '订座'),
  ('self-service', 'self-service', 'adj.', '自助的', 17, 'a self-service restaurant', '自助餐厅'),
  ('satisfaction', 'satisfaction', 'n.', '满足，满意', 18, 'a sense of satisfaction', '满足感'),
 ],
 'gloss': {'crispy': 'adj. 脆的', 'mango': 'n. 芒果', 'pudding': 'n. 布丁', 'shoebox': 'n. 鞋盒'},
}
