# S0037 — 采访: Behind the Weather Forecast (3500 · ABC 窗口 4, 第 4 组)
# 情境: 校报学生编辑采访市气象台预报科的预报员方静 (人物、城市为虚构)。
# 事实: 预报员综合卫星、地面气象站、探空气球资料, 并评估多个数值预报模式的结果, 气象台有人昼夜值班;
# 大气是动态系统, 初始数据的微小误差会随时间放大, 所以一两天内的预报较可靠, 一周后的把握小得多;
# 雾形成和消散都可能很快, 浓雾使能见度降低、航班延误; 台风主要影响我国东部和南部沿海;
# 气象灾害预警信号分蓝、黄、橙、红四级; 各地气象部门会与其他部门开展应急演练。不写具体百分比。
# 说话人标签用 Reporter / Ms Fang (同 S0022), 避免句首专名计入超纲; 同一轮回答的后续句不加引号 (同 S0022)。
STORY = {
 'id': 'S0037', 'title': 'Behind the Weather Forecast', 'titleZh': '天气预报的幕后', 'genre': 'interview',
 'paras': [
  [
   ("As the student editor of our school newspaper, I wanted this term's edition to answer a question that many of our readers had asked.",
    "作为校报的学生编辑，我希望本学期这一期校报能回答一个许多读者都问过的问题。", True),
   ("To find out how a weather forecast is made, I visited Fang Jing, who works in the forecasting division of our city's weather centre.",
    "为了弄清天气预报是怎么做出来的，我拜访了在市气象台预报科工作的方静。", True),
  ],
  [
   ("Reporter: What does a normal working day look like for you?",
    "记者：您平常一天的工作是什么样的？", False),
   ("Ms Fang: We study information from satellites, weather stations and weather balloons, and then we evaluate what several computer models tell us.",
    "方静：我们研究来自卫星、气象站和探空气球的资料，然后评估几种计算机预报模式给出的结果。", True),
   ("The models are powerful, but an expert still has to judge them, and someone is always on duty, even at night.",
    "这些模式功能很强，但还是得由专业人员来判断；而且台里随时都有人值班，夜里也不例外。", False),
  ],
  [
   ("Reporter: Why are forecasts sometimes wrong?",
    "记者：为什么天气预报有时会不准？", False),
   ("Ms Fang: The air around the Earth is a dynamic system that changes all the time, and a tiny error in today's data can grow larger every day.",
    "方静：地球周围的大气是一个时刻在变的动态系统，今天数据里一个微小的误差，一天天下去就可能越变越大。", True),
   ("So there is an important distinction between a forecast for tomorrow, which is fairly reliable, and one for next week, which is much less certain.",
    "所以，明天的预报和下周的预报有一个重要的区别：前者相当可靠，后者就没那么有把握了。", True),
   ("We can say that it will rain tomorrow afternoon, but we cannot promise the exact minute it will start.",
    "我们能说明天下午会下雨，却没法保证雨具体在哪一分钟开始下。", False),
  ],
  [
   ("Reporter: What kind of weather is hardest to forecast?",
    "记者：哪种天气最难预报？", False),
   ("Ms Fang: Fog is surprisingly difficult, because it can form quickly and disappear just as quickly.",
    "方静：雾出奇地难预报，因为它可能很快形成，又同样很快消散。", False),
   ("When it is thick, flights are often delayed due to poor visibility, so airports depend on our warnings.",
    "雾浓的时候，航班常常因为能见度低而延误，所以机场很依赖我们的预警。", False),
   ("In summer we also have to watch out for extreme weather.",
    "夏天我们还要密切关注极端天气。", False),
   ("Typhoons sometimes reach our part of eastern China, and heavy rain can cause floods.",
    "台风有时会影响到我们华东这一带，暴雨还可能引发洪水。", False),
   ("Our warnings use four colours, from blue to red, and every year we take part in emergency drills with other city departments.",
    "我们的预警信号分蓝、黄、橙、红四种颜色；每年我们还会和市里其他部门一起参加应急演练。", False),
   ("Sometimes nothing serious happens and people call it a false alarm, but I would rather be safe than sorry.",
    "有时候并没有出什么大事，大家就说是虚惊一场，可我宁可小心一点，也不愿事后后悔。", False),
  ],
  [
   ("Reporter: Finally, do you ever find the job dull?",
    "记者：最后一个问题，您会觉得这份工作枯燥吗？", False),
   ("Ms Fang: No doubt some people think so, but the sky is different every day, so you have to stay flexible and keep learning.",
    "方静：肯定有人会这么想，可天空每天都不一样，所以你得随机应变，不断学习。", False),
  ],
 ],
 'words': [
  ('editor', 'editor', 'n.', '编辑', 1, 'the editor of a newspaper', '报纸的编辑'),
  ('edition', 'edition', 'n.', '（报刊的）一期；版本', 1, 'the latest edition of a newspaper', '报纸的最新一期'),
  ('forecast', 'forecast', 'n.', '预报，预测', 2, 'a weather forecast', '天气预报'),
  ('division', 'division', 'n.', '（机构中的）部门，科', 2, 'the sales division', '销售部'),
  ('evaluate', 'evaluate', 'v.', '评估，评价', 4, 'evaluate the results', '评估结果'),
  ('expert', 'expert', 'n.', '专家，内行', 5, 'an expert in sth', '……方面的专家'),
  ('duty', 'duty', 'n.', '值班；职责', 5, 'be on duty', '值班'),
  ('dynamic', 'dynamic', 'adj.', '不断变化的，动态的', 7, 'a dynamic system', '动态系统'),
  ('error', 'error', 'n.', '误差；错误', 7, 'a small error', '小误差'),
  ('distinction', 'distinction', 'n.', '区别，差别', 8, 'a distinction between A and B', 'A 与 B 之间的区别'),
  ('fairly', 'fairly', 'adv.', '相当，颇', 8, 'fairly good', '相当好'),
  ('exact', 'exact', 'adj.', '确切的，精确的', 9, 'the exact time', '确切的时间'),
  ('fog', 'Fog', 'n.', '雾', 11, 'thick fog', '浓雾'),
  ('flight', 'flights', 'n.', '航班', 12, 'a delayed flight', '延误的航班'),
  ('due', 'due', 'adj.', '由于（due to）；预期的', 12, 'due to', '由于，因为'),
  ('extreme', 'extreme', 'adj.', '极端的，极度的', 13, 'extreme weather', '极端天气'),
  ('eastern', 'eastern', 'adj.', '东部的，东方的', 14, 'eastern China', '中国东部'),
  ('flood', 'floods', 'n.', '洪水', 14, 'cause floods', '引发洪水'),
  ('drill', 'drills', 'n.', '演习，演练', 15, 'a fire drill', '消防演习'),
  ('false', 'false', 'adj.', '假的，不真实的', 16, 'a false alarm', '虚惊一场；假警报'),
  ('dull', 'dull', 'adj.', '枯燥的，乏味的', 17, 'a dull job', '枯燥的工作'),
  ('doubt', 'doubt', 'n.', '怀疑，疑惑', 18, 'no doubt', '无疑，肯定'),
  ('flexible', 'flexible', 'adj.', '灵活的，能变通的', 18, 'be flexible about sth', '对某事灵活变通'),
 ],
}
