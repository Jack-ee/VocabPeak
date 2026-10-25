# S0082 — 科普说明文: The Radiation Around Us (3500 · ABC 窗口 8, 第 9 组)
# 事实: 我们每天都受到少量天然本底辐射, 来自岩石、土壤、空气、食物 (香蕉含微量放射性钾) 和宇宙射线
# (飞行员、常坐飞机的人受照略多); 多数地方本底水平远不足以致害; 镭 1898 年由居里夫妇发现, 20 世纪初曾风行一时,
# 被加进面霜、饮料和让表盘数字夜光的涂料; 镭极其稀有, 要从数吨原料中分离提炼; 后来接触镭的许多工人出现
# 严重健康问题, 人们才认识到危险; 现在放射性物质的使用受严格限制, 相关岗位人员须佩戴剂量计;
# 放射科工作人员在防护墙后操作或穿铅围裙 (不写给患者盖铅裙, 各国做法不一); 一次 X 光剂量很小, 剂量与危害相关; 紫外线可致严重晒伤、长期损伤皮肤。
# 不写具体剂量数字。居里生平已见 S0040, 本篇只用一句提及。
# 审读 (RSC "Chemistry in its element: radium"): 1898 年居里夫妇发现镭; 处理"许多吨"沥青铀矿才得到约 0.1 克镭;
# 镭被当作万能补药, 进入牙膏、药水等 (面霜如 20 世纪 30 年代法国的 Tho-Radia), 并用于钟表表盘的夜光涂料; 表盘女工出现严重疾病, 已核实。镭热主要在 20 世纪初
# 至 1930 年代, 原文"发现后就风靡"时间过紧, 改为 in the early twentieth century; 原文"极其稀有……Even so 人们仍高价购买"
# 逻辑颠倒 (稀有正是昂贵的原因), 改为"因此十分昂贵, 但含镭产品依然畅销"; 37 词长句拆成两句; for safety 改为常见搭配
# for safety reasons; 两句都以 Today 开头, 前一句改为 Looking back。
STORY = {
 'id': 'S0082', 'title': 'The Radiation Around Us', 'titleZh': '我们身边的辐射', 'genre': 'popular science',
 'paras': [
  [
   ("For many people, the word \"radiation\" suggests danger, but in reality we are surrounded by small amounts of it every day.",
    "对许多人来说，“辐射”这个词意味着危险，但实际上，我们每天都处在少量的辐射之中。", False),
   ("The word covers many kinds of energy, from sunlight and radio waves to the energy given off by radioactive substances such as uranium.",
    "这个词涵盖了多种能量，从阳光、无线电波，到铀等放射性物质释放出的能量。", True),
   ("Scientists refer to the low level of radiation that is always present as background radiation.",
    "科学家把始终存在的低水平辐射称为本底辐射。", False),
  ],
  [
   ("It comes from rocks, soil and the air we breathe, and even from food: bananas, for example, contain a tiny quantity of radioactive potassium.",
    "它来自岩石、土壤和我们呼吸的空气，甚至来自食物，比如香蕉里就含有极少量的放射性钾。", True),
   ("Some radiation also reaches us from space, which is why pilots and people who fly often receive a little more than others.",
    "还有一些辐射来自太空，所以飞行员和经常坐飞机的人受到的辐射比别人略多一些。", False),
   ("In most places, however, the level remains low and is no cause for worry.",
    "不过在大多数地方，这种辐射的水平一直很低，用不着担心。", False),
  ],
  [
   ("Radium was discovered by Marie and Pierre Curie in 1898, and in the early twentieth century it became very popular.",
    "镭是居里夫妇在 1898 年发现的；到了 20 世纪初，它风靡一时。", False),
   ("Companies added it to face creams, drinks and the paint that made the numbers on watches glow in the dark.",
    "商家把它加进面霜和饮料，还加进让手表上的数字在黑暗中发光的涂料里。", False),
   ("The metal was extremely rare, and its separation from tonnes of raw material was slow, hard work.",
    "这种金属极其稀有，要从数吨原料中把它分离出来，既费时又费力。", False),
   ("As a result, it was very expensive, but products containing it still sold well.",
    "因此镭非常昂贵，可含镭的产品照样卖得很好。", False),
   ("Looking back, it seems ridiculous that people once drank water containing radium because they believed it was good for their health.",
    "如今回头看，人们曾经因为相信含镭的水有益健康而去喝它，实在荒唐可笑。", True),
   ("Only later did people understand the risk, when many workers who handled radium every day became seriously ill.",
    "直到后来，许多每天接触镭的工人得了重病，人们才明白其中的危险。", False),
   ("Today there are strict restrictions on the use of radioactive materials, and people who work with them are required to wear small badges that measure how much radiation they receive.",
    "如今，放射性材料的使用受到严格限制，从事相关工作的人必须佩戴小小的徽章，用来测量自己受到的辐射量。", True),
  ],
  [
   ("Radiation also helps doctors: an X-ray can show a broken bone without a single cut.",
    "辐射也能帮助医生：不用开一刀，一张 X 光片就能看出骨头断没断。", False),
   ("What matters is the relation between the amount of radiation and the harm it may do, and a single X-ray gives only a very small amount.",
    "关键在于辐射剂量和可能造成的伤害之间的关系，而拍一次 X 光，受到的辐射量非常小。", True),
   ("For safety reasons, the hospital staff who take X-rays work behind a thick wall or wear heavy aprons.",
    "出于安全考虑，负责拍 X 光的医务人员会在厚墙后面操作，或者穿上厚重的防护围裙。", False),
  ],
  [
   ("In daily life, the radiation that most often harms people actually comes from the sun.",
    "在日常生活中，最常伤害人们的辐射其实来自太阳。", False),
   ("Too much of its ultraviolet light can cause severe sunburn and, over many years, damage the skin.",
    "过多的紫外线会造成严重的晒伤，日积月累还会损伤皮肤。", False),
   ("So it makes sense to reduce your time in the strong midday sun and to use sun cream, rather than to worry about bananas!",
    "所以，与其担心香蕉，不如少在正午的烈日下待着，并记得涂防晒霜！", False),
  ],
 ],
 'words': [
  ('radiation', 'radiation', 'n.', '辐射', 1, 'be exposed to radiation', '受到辐射'),
  ('reality', 'reality', 'n.', '现实，事实', 1, 'in reality', '事实上，实际上'),
  ('radioactive', 'radioactive', 'adj.', '放射性的', 2, 'radioactive substances', '放射性物质'),
  ('refer', 'refer', 'v.', '把……称为；提到', 3, 'refer to A as B', '把 A 称为 B'),
  ('quantity', 'quantity', 'n.', '量，数量', 4, 'a tiny quantity of sth', '极少量的某物'),
  ('reach', 'reaches', 'v.', '到达，抵达', 5, 'reach the ground', '到达地面'),
  ('remain', 'remains', 'v.', '保持，仍然是', 6, 'remain low', '保持在低水平'),
  ('radium', 'radium', 'n.', '镭', 7, 'discover radium', '发现镭'),
  ('rare', 'rare', 'adj.', '稀有的，罕见的', 9, 'a rare metal', '稀有金属'),
  ('separation', 'separation', 'n.', '分离，分开', 9, 'the separation of A from B', '把 A 从 B 中分离出来'),
  ('raw material', 'raw material', 'n.', '原料', 9, 'raw materials for industry', '工业原料'),
  ('ridiculous', 'ridiculous', 'adj.', '荒唐的，可笑的', 11, 'It seems ridiculous that ...', '……似乎很荒唐'),
  ('risk', 'risk', 'n.', '危险，风险', 12, 'understand the risk', '认识到风险'),
  ('restriction', 'restrictions', 'n.', '限制，约束', 13, 'strict restrictions on sth', '对……的严格限制'),
  ('require', 'required', 'v.', '要求，规定', 13, 'be required to do sth', '被要求做某事'),
  ('relation', 'relation', 'n.', '关系，联系', 15, 'the relation between A and B', 'A 与 B 之间的关系'),
  ('safety', 'safety', 'n.', '安全', 16, 'for safety reasons', '出于安全考虑'),
  ('severe', 'severe', 'adj.', '严重的', 18, 'severe sunburn', '严重晒伤'),
  ('sense', 'sense', 'n.', '道理；意义', 19, 'make sense', '有道理，合乎情理'),
  ('reduce', 'reduce', 'v.', '减少', 19, 'reduce the risk of sth', '降低……的风险'),
 ],
 'gloss': {'uranium': 'n. 铀', 'potassium': 'n. 钾', 'tonnes': 'n. 吨（tonne 的复数）', 'sunburn': 'n. 晒伤'},
}
