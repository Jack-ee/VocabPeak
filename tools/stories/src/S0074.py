# S0074 — 新闻特写: Rocket Nights in Longlou (3500 · ABC 窗口 8, 第 1 组)
# 事实: 文昌航天发射场在海南岛东北部沿海, 是中国纬度最低的发射场, 低纬度发射可借助地球自转、
# 运载能力更大; 龙楼镇紧邻发射场, 近年成为观看发射的热门地点, 发射日酒店紧张; 公众观看点
# 距发射台数公里; 远处观看先见火光、数秒后才听到轰鸣 (声速远小于光速); 中华人民共和国 1970 年
# 发射第一颗人造卫星 (东方红一号)。"上周四"那次发射、王璐、店主说法均为虚构情境, 不写具体型号与数字。
# 审读 (Wikipedia "Wenchang Space Launch Site"; China Daily 2022-05; 第一财经 2025 龙楼屋顶观景台报道; 人民日报 2024-02-22):
# 文昌约北纬 19°, 低于酒泉、太原、西昌, 已核实; 龙楼民宿和民房屋顶有收费观景位 (约 100–400 元, 距发射场约 3 公里),
# 发射前酒店常被订满, 已核实; "公众必须待在几公里外"改为事实陈述"最近的观看区也在几公里外"; 约 3 公里处光声相差约 9 秒,
# "几秒钟后"成立; "At such times"指代过远, 改为"Before a launch"; 倒计时结束才举手机不合常理, 改为"最后几秒"。
STORY = {
 'id': 'S0074', 'title': 'Rocket Nights in Longlou', 'titleZh': '龙楼的火箭之夜', 'genre': 'news feature',
 'paras': [
  [
   ("For most of the year, Longlou is a quiet town on the north-east coast of Hainan, but on launch days it fills with visitors.",
    "一年中的大部分时间，龙楼都是海南岛东北海岸上一个安静的小镇，可一到发射日，这里就挤满了游客。", False),
   ("The town lies next to the Wenchang Space Launch Site, and in recent years watching a rocket take off here has become a popular holiday activity.",
    "小镇紧挨着文昌航天发射场，近年来，到这里看火箭升空成了一项热门的假日活动。", True),
   ("Because Wenchang is closer to the equator than China's other launch sites, rockets launched here get an extra push from the Earth's spin and can carry heavier loads.",
    "由于文昌比中国其他发射场更靠近赤道，从这里发射的火箭能借助地球自转获得额外的推力，因而可以运送更重的载荷。", True),
   ("Before a launch, hotels are usually full, and some local families even rent out space on their roofs to visitors who want a clear view.",
    "每逢发射前，酒店通常都会客满，一些当地人家甚至把自家屋顶上的位置租给想看得更清楚的游客。", False),
  ],
  [
   ("Last Thursday, a Long March rocket carrying a new satellite was scheduled to lift off at a quarter past nine in the evening.",
    "上周四，一枚搭载新卫星的长征火箭定于晚上九点一刻发射升空。", False),
   ("By six o'clock, the roads into town were so crowded that cars could hardly move at the roundabout near the beach.",
    "到六点钟，进镇的道路已经拥挤不堪，海滩附近环岛处的车辆几乎动弹不得。", False),
   ("Families who had arrived early sought out the best spots on the sand, while others had their tickets scanned at the gate of a viewing area by the sea.",
    "早到的人家在沙滩上找好了最佳位置，其他人则在海边一处观看区的入口扫票入场。", True),
   ("Even the nearest viewing areas were a few kilometres from the rocket, and security staff checked bags at every entrance.",
    "即使是最近的观看区，离火箭也有几公里远；安保人员在每个入口都检查了背包。", False),
  ],
  [
   ("In the last seconds of the countdown, thousands of phones were held up to record the moment.",
    "倒计时的最后几秒，成千上万部手机被高高举起，准备记录下这一刻。", False),
   ("First came a bright flash as the rocket began to rise, and several seconds later the sound arrived: a deep roar that seemed to make the ground quake beneath people's feet.",
    "先是一道耀眼的闪光，火箭开始升起；几秒钟后声音才传过来，那是一阵低沉的轰鸣，仿佛让人们脚下的大地都震动起来。", True),
   ("Children screamed with delight, while many adults simply stood in silence, taking in the scene.",
    "孩子们高兴得尖叫起来，许多大人则默默站着，把眼前的景象尽收眼底。", False),
   ("After a rapid climb, the rocket became a tiny star over the sea, and minutes later it was gone.",
    "经过一段飞快的爬升，火箭变成了海面上空的一颗小星星，几分钟后就不见了踪影。", False),
  ],
  [
   ("How do people react when they see a rocket go up for the first time?",
    "人们第一次亲眼看到火箭升空时，会有什么反应呢？", False),
   ("\"I've seen this on TV many times, but being here is completely different,\" remarked Wang Lu, a fifteen-year-old visitor from Hangzhou.",
    "“这种场面我在电视上看过很多次，可亲临现场完全是另一回事。”从杭州来的十五岁游客王璐感慨道。", True),
   ("Then came the rush to get home, and some families spent longer leaving the car park than watching the rocket.",
    "接下来便是争相回家的人潮，有些人家开出停车场所花的时间，比看火箭升空还要长。", False),
   ("Local shop owners report that these are now the busiest days of their year.",
    "当地店主们说，这些日子如今是他们一年中生意最忙的时候。", False),
   ("More than half a century after the People's Republic of China sent its first satellite into space in 1970, rockets have become part of daily life in this small town.",
    "从中华人民共和国 1970 年把第一颗人造卫星送上太空算起，半个多世纪过去了，火箭已经成为这座小镇日常生活的一部分。", True),
  ],
 ],
 'words': [
  ('recent', 'recent', 'adj.', '最近的，近来的', 2, 'in recent years', '近年来'),
  ('rocket', 'rocket', 'n.', '火箭', 2, 'launch a rocket', '发射火箭'),
  ('rent', 'rent', 'v.', '出租；租用', 4, 'rent sth out to sb', '把某物租给某人'),
  ('roof', 'roofs', 'n.', '屋顶', 4, 'on the roof', '在屋顶上'),
  ('satellite', 'satellite', 'n.', '人造卫星', 5, 'launch a satellite', '发射卫星'),
  ('schedule', 'scheduled', 'v.', '安排，预定（时间）', 5, 'be scheduled to do sth', '定于做某事'),
  ('roundabout', 'roundabout', 'n.', '环岛，环形交叉路口', 6, 'at the roundabout', '在环岛处'),
  ('seek', 'sought', 'v.', '寻找，寻求', 7, 'seek out sb/sth', '（费心）找到，物色'),
  ('scan', 'scanned', 'v.', '扫描', 7, 'scan a ticket', '扫描门票'),
  ('security', 'security', 'n.', '安保，安全措施', 8, 'security staff', '安保人员'),
  ('record', 'record', 'v.', '记录；录制', 9, 'record sth on video', '把某事录成视频'),
  ('quake', 'quake', 'v.', '震动，颤动', 10, 'the ground quakes', '大地震动'),
  ('scream', 'screamed', 'v.', '尖叫', 11, 'scream with delight', '高兴得尖叫'),
  ('scene', 'scene', 'n.', '景象，场面', 11, 'take in the scene', '把眼前的景象尽收眼底'),
  ('rapid', 'rapid', 'adj.', '快速的，迅速的', 12, 'a rapid rise', '快速上升'),
  ('react', 'react', 'v.', '作出反应', 13, 'react to sth', '对某事作出反应'),
  ('remark', 'remarked', 'v.', '评论，谈论', 14, 'remark that ...', '评论说……'),
  ('rush', 'rush', 'n.', '匆忙；争抢', 15, 'a rush to do sth', '争先恐后地做某事'),
  ('report', 'report', 'v.', '报告；（据）称', 16, 'report that ...', '报告说……'),
  ('republic', 'Republic', 'n.', '共和国', 17, "the People's Republic of China", '中华人民共和国'),
 ],
 'gloss': {'equator': 'n. 赤道', 'countdown': 'n. 倒计时'},
}
