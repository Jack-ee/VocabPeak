# S0081 — 记叙文: The Seagull in the Fishing Line (3500 · ABC 窗口 8, 第 8 组)
# 事实: 冲上海滩的海藻是天然的, 腐烂分解时为沙蚤等小动物提供食物, 鸟类又以这些小动物为食, 所以净滩时
# 一般只清垃圾、不清海藻; 救助受困鸟类时用衣物盖住它能让它安静下来; 寄居蟹以空贝壳为家;
# 废旧渔网可回收再利用。人物林晓、黄爷爷和福建小镇为虚构, 数字只用于故事情节。
# 审读: "Every morning"(习惯) 之后直接写某天所见, 补"One Monday", 与"到星期五报名、星期六净滩"的时间线衔接;
# "class group"是"班级群"的直译, 改为 class group chat; 海藻—小动物—鸟的食物链说清楚; "put most of them back"
# 中 them 指代不清, 改为 the shells; 译文"筹钱设置了回收箱"与原文 raised money for 不符, 已改。
STORY = {
 'id': 'S0081', 'title': 'The Seagull in the Fishing Line', 'titleZh': '被渔线缠住的海鸥', 'genre': 'narrative',
 'paras': [
  [
   ("Every morning before school, Lin Xiao walked along the beach of her small seaside town in Fujian.",
    "每天早上上学前，林晓都会沿着福建海边小镇的沙滩走一走。", False),
   ("One Monday, after a week of rough weather, she found the sand covered with plastic bottles, broken fishing nets and piles of seaweed.",
    "一个星期一，在连着一周的风雨天之后，她发现沙滩上到处是塑料瓶、破渔网和一堆堆海藻。", False),
   ("Her neighbour Grandpa Huang, an old seaman who had spent thirty years at sea, was standing by the water with a look of deep sadness.",
    "她的邻居黄爷爷是个在海上漂了三十年的老海员，他正站在水边，脸上满是忧伤。", True),
   ("\"When I was a boy, this beach was clean enough to sleep on,\" he said quietly.",
    "“我小时候，这片沙滩干净得可以直接躺下睡觉。”他轻声说。", False),
  ],
  [
   ("That evening, Lin Xiao asked for volunteers in her class group chat, and by Friday more than forty people had registered online, ready to sacrifice their Saturday morning.",
    "当天晚上，林晓在班级群里招募志愿者，到星期五，已经有四十多人在网上报了名，愿意牺牲周六上午的休息时间。", True),
   ("On Saturday morning, Grandpa Huang divided the beach into sections and gave each team gloves and strong bags.",
    "星期六上午，黄爷爷把沙滩分成几段，给每个小组发了手套和结实的袋子。", False),
   ("He told them to remove every piece of plastic but to leave the seaweed, because as it slowly rots, it feeds tiny creatures, and birds in turn feed on them.",
    "他让大家把每一片塑料都清走，但海藻要留下，因为海藻慢慢腐烂时，能养活许多小动物，而鸟儿又以这些小动物为食。", True),
   ("The salty wind made their eyes water, but nobody wanted to stop.",
    "带着咸味的海风吹得大家直流眼泪，可谁也不想停下来。", False),
  ],
  [
   ("Around midday, someone shouted that a seagull was caught in a piece of fishing line.",
    "中午前后，有人喊道，一只海鸥被渔线缠住了。", False),
   ("Grandpa Huang covered the frightened bird with his jacket to keep it calm, and Lin Xiao held it still while he cut the line with his pocket knife.",
    "黄爷爷用外套盖住受惊的海鸥，让它安静下来；林晓轻轻按住它，黄爷爷用小折刀把渔线割断。", True),
   ("When they set it free, the seagull shook its feathers and flew out over the waves, and everyone cheered as if they had rescued a person.",
    "他们把海鸥放开后，它抖了抖羽毛，飞向了海浪上空；大家欢呼起来，就像救了一个人似的。", True),
  ],
  [
   ("By late afternoon, full bags lined the road, and the bottles were sent away to be recycled.",
    "到傍晚时分，路边摆满了装得鼓鼓的垃圾袋，塑料瓶也被运走回收了。", False),
   ("A woman who ran a small shop in town offered to reuse the old nets to make shopping bags.",
    "镇上一位开小店的阿姨主动提出，把旧渔网再利用起来做成购物袋。", False),
   ("Some younger children filled their pockets with seashells, but Grandpa Huang asked them to put most of the shells back, because hermit crabs use empty ones as homes.",
    "几个年纪小的孩子捡了满满一兜贝壳，黄爷爷却让他们把大部分放回去，因为寄居蟹要拿空贝壳当家。", True),
   ("\"The first settlers came to this coast for its fish, and the sea has fed us ever since,\" he told them.",
    "“最早来这片海岸落脚的人，就是冲着这里的鱼来的，从那以后，大海一直养活着我们。”他对孩子们说。", False),
   ("\"Now it is our responsibility to look after it.\"", "“现在，该轮到我们来守护它了。”", False),
  ],
  [
   ("But Lin Xiao knew that one Saturday would not get rid of the problem for good.",
    "可林晓知道，一个星期六的努力并不能彻底解决这个问题。", False),
   ("The following week, her class raised money for recycling bins on the beach and promised to use less plastic in their daily lives.",
    "第二周，她们班为沙滩上的回收箱筹了款，还约定在日常生活中少用塑料。", False),
  ],
 ],
 'words': [
  ('seaside', 'seaside', 'n.', '海边，海滨', 1, 'a seaside town', '海滨小镇'),
  ('rough', 'rough', 'adj.', '（天气）恶劣的；粗糙的', 2, 'rough weather', '恶劣天气'),
  ('seaweed', 'seaweed', 'n.', '海藻，海草', 2, 'a pile of seaweed', '一堆海藻'),
  ('seaman', 'seaman', 'n.', '海员，水手', 3, 'an old seaman', '老海员'),
  ('sadness', 'sadness', 'n.', '悲伤，忧伤', 3, 'a look of sadness', '忧伤的神情'),
  ('register', 'registered', 'v.', '登记，注册，报名', 5, 'register online', '网上报名'),
  ('sacrifice', 'sacrifice', 'v.', '牺牲，献出', 5, 'sacrifice one\'s weekend', '牺牲周末'),
  ('section', 'sections', 'n.', '部分，段', 6, 'divide sth into sections', '把某物分成几部分'),
  ('remove', 'remove', 'v.', '移走，清除', 7, 'remove rubbish', '清除垃圾'),
  ('rot', 'rots', 'v.', '腐烂', 7, 'leave sth to rot', '任某物腐烂'),
  ('salty', 'salty', 'adj.', '咸的，含盐的', 8, 'salty sea air', '带咸味的海风'),
  ('seagull', 'seagull', 'n.', '海鸥', 9, 'a flock of seagulls', '一群海鸥'),
  ('shake', 'shook', 'v.', '抖动，摇动', 11, 'shake its feathers', '抖动羽毛'),
  ('rescue', 'rescued', 'v.', '营救，救援', 11, 'rescue sb from sth', '把某人从……中救出'),
  ('recycle', 'recycled', 'v.', '回收利用', 12, 'recycle plastic bottles', '回收塑料瓶'),
  ('reuse', 'reuse', 'v.', '重新使用，再利用', 13, 'reuse old bags', '重复使用旧袋子'),
  ('seashell', 'seashells', 'n.', '贝壳', 14, 'collect seashells', '捡贝壳'),
  ('settler', 'settlers', 'n.', '移居者，开拓者', 15, 'early settlers', '早期移民'),
  ('responsibility', 'responsibility', 'n.', '责任', 16, 'It is our responsibility to do sth', '做某事是我们的责任'),
  ('rid', 'rid', 'v.', '使摆脱，除去', 17, 'get rid of sth', '摆脱/去除某物'),
  ('raise', 'raised', 'v.', '筹集（资金）', 18, 'raise money for sth', '为……筹款'),
 ],
 'gloss': {'hermit': 'n. 隐士（hermit crab 寄居蟹）', 'crabs': 'n. 蟹（crab 的复数）'},
}
