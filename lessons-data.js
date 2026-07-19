/* ============================================================
 * VocabPeak 课文精读模块 语料数据
 * lessons-data.js  (v1 样例, 待确认结构后纳入 SW 预缓存)
 *
 * 结构说明:
 *   - 每课 = { id, title, titleZh, paras, words }
 *   - paras: 段落数组, 每段含句子数组; hard: true 表示教材标注的难句
 *   - words: 蓝色标注词; lemma 为原型(词条主键), surface 为课文中的形式
 *   - sent:  词条所属句子 ID, 用于生成原文例句和填空题
 *   - 音频 clip ID 约定: 句子用 sentence ID (如 L01-P1-S1),
 *     单词用 'w_' + lemma (与主词库音频包共用, 避免重复合成)
 * ============================================================ */

window.HSV_LESSONS = [

  /* ---------- 第一课: 跑步延年益寿 ---------- */
  {
    id      : 'L01',
    title   : 'Running Adds Years to Your Life',
    titleZh : '跑步让你更长寿',
    paras   : [
      {
        id       : 'L01-P1',
        sentences: [
          { id: 'L01-P1-S1', hard: true,
            text: 'According to a review of evidence in a medical journal, runners live three years longer than non-runners.' },
          { id: 'L01-P1-S2', hard: false,
            text: "You don't have to run fast or for long to see the benefit." },
          { id: 'L01-P1-S3', hard: false,
            text: 'You may drink, smoke, be overweight and still reduce your risk of dying early by running.' }
        ]
      },
      {
        id       : 'L01-P2',
        sentences: [
          { id: 'L01-P2-S1', hard: false,
            text: "While running regularly can't make you live forever, the review says it is more effective at lengthening life than walking, cycling or swimming." },
          { id: 'L01-P2-S2', hard: true,
            text: 'Two of the authors of the review also made a study published in 2014 that showed a mere five to 10 minutes a day of running reduced the risk of heart disease and early deaths from all causes.' }
        ]
      }
    ],
    words: [
      { id: 'L01-W01', lemma: 'according to', surface: 'According to', pos: 'prep.',
        zh: '根据; 按照', sent: 'L01-P1-S1',
        phrases: [
          { en: 'according to the report', zh: '根据报道' },
          { en: 'according to plan',       zh: '按照计划' }
        ] },
      { id: 'L01-W02', lemma: 'review', surface: 'review', pos: 'n. / v.',
        zh: 'n. 综述; 回顾; 评论  v. 复习; 审查', sent: 'L01-P1-S1',
        phrases: [
          { en: 'a review of evidence', zh: '一项证据综述' },
          { en: 'book review',          zh: '书评' },
          { en: 'under review',         zh: '在审查中' }
        ] },
      { id: 'L01-W03', lemma: 'evidence', surface: 'evidence', pos: 'n.',
        zh: '证据; 依据', sent: 'L01-P1-S1',
        phrases: [
          { en: 'evidence of / for', zh: '……的证据' },
          { en: 'solid evidence',    zh: '确凿的证据' }
        ] },
      { id: 'L01-W04', lemma: 'medical', surface: 'medical', pos: 'adj.',
        zh: '医学的; 医疗的', sent: 'L01-P1-S1',
        phrases: [
          { en: 'medical journal', zh: '医学期刊' },
          { en: 'medical care',    zh: '医疗护理' }
        ] },
      { id: 'L01-W05', lemma: 'journal', surface: 'journal', pos: 'n.',
        zh: '期刊; 杂志; 日志', sent: 'L01-P1-S1',
        phrases: [
          { en: 'an academic journal', zh: '学术期刊' },
          { en: 'keep a journal',      zh: '写日志' }
        ] },
      { id: 'L01-W06', lemma: 'benefit', surface: 'benefit', pos: 'n. / v.',
        zh: 'n. 益处; 好处  v. 使受益', sent: 'L01-P1-S2',
        phrases: [
          { en: 'benefit from',      zh: '从……中受益' },
          { en: 'be of benefit to',  zh: '对……有益' },
          { en: 'for the benefit of', zh: '为了……的利益' }
        ] },
      { id: 'L01-W07', lemma: 'overweight', surface: 'overweight', pos: 'adj.',
        zh: '超重的; 过胖的', sent: 'L01-P1-S3',
        phrases: [
          { en: 'be overweight', zh: '超重' }
        ] },
      { id: 'L01-W08', lemma: 'reduce', surface: 'reduce', pos: 'v.',
        zh: '减少; 降低', sent: 'L01-P1-S3',
        phrases: [
          { en: 'reduce the risk of', zh: '降低……的风险' },
          { en: 'reduce ... to ...',  zh: '把……减少到……' }
        ] },
      { id: 'L01-W09', lemma: 'risk', surface: 'risk', pos: 'n. / v.',
        zh: 'n. 风险; 危险  v. 冒……的危险', sent: 'L01-P1-S3',
        phrases: [
          { en: 'at risk',         zh: '处于危险中' },
          { en: 'take a risk',     zh: '冒险' },
          { en: 'risk doing sth.', zh: '冒险做某事' }
        ] },
      { id: 'L01-W10', lemma: 'regularly', surface: 'regularly', pos: 'adv.',
        zh: '定期地; 经常地', sent: 'L01-P2-S1',
        phrases: [
          { en: 'exercise regularly', zh: '定期锻炼' }
        ] },
      { id: 'L01-W11', lemma: 'effective', surface: 'effective', pos: 'adj.',
        zh: '有效的', sent: 'L01-P2-S1',
        phrases: [
          { en: 'be effective at / in doing sth.', zh: '在做某事方面有效' },
          { en: 'take effective measures',         zh: '采取有效措施' }
        ] },
      { id: 'L01-W12', lemma: 'lengthen', surface: 'lengthening', pos: 'v.',
        zh: '延长; 加长', sent: 'L01-P2-S1',
        phrases: [
          { en: 'lengthen life', zh: '延长寿命' }
        ] },
      { id: 'L01-W13', lemma: 'cycle', surface: 'cycling', pos: 'v. / n.',
        zh: 'v. 骑自行车  n. 循环; 自行车', sent: 'L01-P2-S1',
        phrases: [
          { en: 'go cycling', zh: '去骑自行车' }
        ] },
      { id: 'L01-W14', lemma: 'author', surface: 'authors', pos: 'n.',
        zh: '作者; 作家', sent: 'L01-P2-S2',
        phrases: [
          { en: 'the author of the book', zh: '这本书的作者' }
        ] },
      { id: 'L01-W15', lemma: 'publish', surface: 'published', pos: 'v.',
        zh: '出版; 发表', sent: 'L01-P2-S2',
        phrases: [
          { en: 'be published in', zh: '发表于' }
        ] },
      { id: 'L01-W16', lemma: 'cause', surface: 'causes', pos: 'n. / v.',
        zh: 'n. 原因; 事业  v. 导致; 引起', sent: 'L01-P2-S2',
        phrases: [
          { en: 'the cause of',     zh: '……的原因' },
          { en: 'cause and effect', zh: '因果' }
        ] }
    ]
  },

  /* ---------- 第二课: 竞走 ---------- */
  {
    id      : 'L02',
    title   : 'Race Walking: A Serious Workout',
    titleZh : '竞走: 一项认真的锻炼',
    paras   : [
      {
        id       : 'L02-P1',
        sentences: [
          { id: 'L02-P1-S1', hard: false,
            text: 'Race walking shares many fitness benefits with running, research shows, while most likely contributing to fewer injuries.' },
          { id: 'L02-P1-S2', hard: false,
            text: 'It does, however, have its own problem.' }
        ]
      },
      {
        id       : 'L02-P2',
        sentences: [
          { id: 'L02-P2-S1', hard: false,
            text: 'Race walkers are conditioned athletes.' },
          { id: 'L02-P2-S2', hard: true,
            text: 'The longest track and field event at the Summer Olympics is the 50-kilometer race walk, which is about five miles longer than the marathon.' },
          { id: 'L02-P2-S3', hard: false,
            text: "But the sport's rules require that a race walker's knees stay straight through most of the leg swing and one foot remain in contact with the ground at all times." },
          { id: 'L02-P2-S4', hard: true,
            text: "It's this strange form that makes race walking such an attractive activity, however, says Jaclyn Norberg, an assistant professor of exercise science at Salem State University in Salem, Mass." }
        ]
      },
      {
        id       : 'L02-P3',
        sentences: [
          { id: 'L02-P3-S1', hard: false,
            text: 'Like running, race walking is physically demanding, she says.' },
          { id: 'L02-P3-S2', hard: true,
            text: 'According to most calculations, race walkers moving at a pace of six miles per hour would burn about 800 calories per hour, which is approximately twice as many as they would burn walking, although fewer than running, which would probably burn about 1,000 or more calories per hour.' }
        ]
      },
      {
        id       : 'L02-P4',
        sentences: [
          { id: 'L02-P4-S1', hard: false,
            text: 'However, race walking does not pound the body as much as running does, Dr. Norberg says.' },
          { id: 'L02-P4-S2', hard: true,
            text: 'According to her research, runners hit the ground with as much as four times their body weight per step, while race walkers, who do not leave the ground, create only about 1.4 times their body weight with each step.' }
        ]
      },
      {
        id       : 'L02-P5',
        sentences: [
          { id: 'L02-P5-S1', hard: false,
            text: "As a result, she says, some of the injuries associated with running, such as runner's knee, are uncommon among race walkers." },
          { id: 'L02-P5-S2', hard: true,
            text: "But the sport's strange form does place considerable stress on the ankles and hips, so people with a history of such injuries might want to be cautious in adopting the sport." },
          { id: 'L02-P5-S3', hard: false,
            text: 'In fact, anyone wishing to try race walking should probably first consult a coach or experienced racer to learn proper technique, she says.' },
          { id: 'L02-P5-S4', hard: false,
            text: 'It takes some practice.' }
        ]
      }
    ],
    words: [
      { id: 'L02-W01', lemma: 'race', surface: 'Race', pos: 'n. / v.',
        zh: 'n. 比赛; 竞赛; 种族  v. 参加比赛; 疾行', sent: 'L02-P1-S1',
        phrases: [
          { en: 'race walking',   zh: '竞走' },
          { en: 'a relay race',   zh: '接力赛' }
        ] },
      { id: 'L02-W02', lemma: 'fitness', surface: 'fitness', pos: 'n.',
        zh: '健康; 健壮', sent: 'L02-P1-S1',
        phrases: [
          { en: 'physical fitness',  zh: '身体健康' },
          { en: 'fitness benefits',  zh: '健身益处' }
        ] },
      { id: 'L02-W03', lemma: 'benefit', surface: 'benefits', pos: 'n.',
        zh: '益处; 好处', sent: 'L02-P1-S1',
        phrases: [
          { en: 'share benefits with', zh: '与……有相同的益处' },
          { en: 'benefit from',        zh: '从……中受益' }
        ] },
      { id: 'L02-W04', lemma: 'contribute to', surface: 'contributing to', pos: 'phr. v.',
        zh: '促成; 有助于; 是……的原因之一', sent: 'L02-P1-S1',
        phrases: [
          { en: 'contribute to fewer injuries', zh: '有助于减少受伤' },
          { en: 'contribute ... to ...',        zh: '把……贡献给……' }
        ] },
      { id: 'L02-W05', lemma: 'injury', surface: 'injuries', pos: 'n.',
        zh: '受伤; 伤害', sent: 'L02-P1-S1',
        phrases: [
          { en: 'suffer an injury', zh: '受伤' },
          { en: 'a knee injury',    zh: '膝伤' }
        ] },
      { id: 'L02-W06', lemma: 'conditioned', surface: 'conditioned', pos: 'adj.',
        zh: '受过训练的; 身体状态良好的', sent: 'L02-P2-S1',
        phrases: [
          { en: 'well-conditioned athletes', zh: '训练有素的运动员' }
        ] },
      { id: 'L02-W07', lemma: 'athlete', surface: 'athletes', pos: 'n.',
        zh: '运动员', sent: 'L02-P2-S1',
        phrases: [
          { en: 'a professional athlete', zh: '职业运动员' }
        ] },
      { id: 'L02-W08', lemma: 'track', surface: 'track', pos: 'n.',
        zh: '跑道; 轨道; 小路', sent: 'L02-P2-S2',
        phrases: [
          { en: 'track and field', zh: '田径' },
          { en: 'keep track of',   zh: '记录; 了解……的动态' }
        ] },
      { id: 'L02-W09', lemma: 'rule', surface: 'rules', pos: 'n. / v.',
        zh: 'n. 规则; 规定  v. 统治', sent: 'L02-P2-S3',
        phrases: [
          { en: 'obey / break the rules', zh: '遵守/违反规则' },
          { en: 'as a rule',              zh: '通常; 一般来说' }
        ] },
      { id: 'L02-W10', lemma: 'require', surface: 'require', pos: 'v.',
        zh: '要求; 需要', sent: 'L02-P2-S3',
        phrases: [
          { en: 'require that sb. (should) do', zh: '要求某人做(虚拟语气)' },
          { en: 'meet the requirements',        zh: '满足要求' }
        ] },
      { id: 'L02-W11', lemma: 'knee', surface: 'knees', pos: 'n.',
        zh: '膝盖', sent: 'L02-P2-S3',
        phrases: [
          { en: "runner's knee", zh: '跑步膝(髌骨疼痛)' },
          { en: 'on one\u2019s knees', zh: '跪着' }
        ] },
      { id: 'L02-W12', lemma: 'straight', surface: 'straight', pos: 'adj. / adv.',
        zh: 'adj. 直的; 笔直的  adv. 直接地', sent: 'L02-P2-S3',
        phrases: [
          { en: 'stay straight',      zh: '保持伸直' },
          { en: 'go straight ahead',  zh: '径直向前走' }
        ] },
      { id: 'L02-W13', lemma: 'swing', surface: 'swing', pos: 'n. / v.',
        zh: 'n. 摆动; 秋千  v. 摆动; 摇摆', sent: 'L02-P2-S3',
        phrases: [
          { en: 'the leg swing', zh: '腿部摆动' }
        ] },
      { id: 'L02-W14', lemma: 'remain', surface: 'remain', pos: 'v.',
        zh: '保持; 仍然是; 留下', sent: 'L02-P2-S3',
        phrases: [
          { en: 'remain in contact with', zh: '与……保持接触' },
          { en: 'remain silent',          zh: '保持沉默' }
        ] },
      { id: 'L02-W15', lemma: 'contact', surface: 'contact', pos: 'n. / v.',
        zh: 'n. 接触; 联系  v. 联系', sent: 'L02-P2-S3',
        phrases: [
          { en: 'in contact with',      zh: '与……接触/联系' },
          { en: 'keep in contact with', zh: '与……保持联系' }
        ] },
      { id: 'L02-W16', lemma: 'at all times', surface: 'at all times', pos: 'phr.',
        zh: '始终; 随时; 无论何时', sent: 'L02-P2-S3',
        phrases: [
          { en: 'stay alert at all times', zh: '时刻保持警惕' }
        ] },
      { id: 'L02-W17', lemma: 'attractive', surface: 'attractive', pos: 'adj.',
        zh: '有吸引力的; 迷人的', sent: 'L02-P2-S4',
        phrases: [
          { en: 'be attractive to', zh: '对……有吸引力' }
        ] },
      { id: 'L02-W18', lemma: 'activity', surface: 'activity', pos: 'n.',
        zh: '活动', sent: 'L02-P2-S4',
        phrases: [
          { en: 'outdoor activities',   zh: '户外活动' },
          { en: 'take part in an activity', zh: '参加活动' }
        ] },
      { id: 'L02-W19', lemma: 'assistant', surface: 'assistant', pos: 'adj. / n.',
        zh: 'adj. 助理的; 副的  n. 助手; 助理', sent: 'L02-P2-S4',
        phrases: [
          { en: 'an assistant professor', zh: '助理教授' },
          { en: 'a shop assistant',       zh: '店员' }
        ] },
      { id: 'L02-W20', lemma: 'professor', surface: 'professor', pos: 'n.',
        zh: '教授', sent: 'L02-P2-S4',
        phrases: [
          { en: 'a professor of exercise science', zh: '运动科学教授' }
        ] },
      { id: 'L02-W21', lemma: 'physically', surface: 'physically', pos: 'adv.',
        zh: '身体上; 体力上', sent: 'L02-P3-S1',
        phrases: [
          { en: 'physically demanding',  zh: '对体力要求高的' },
          { en: 'physically and mentally', zh: '身心上' }
        ] },
      { id: 'L02-W22', lemma: 'demanding', surface: 'demanding', pos: 'adj.',
        zh: '要求高的; 费力的', sent: 'L02-P3-S1',
        phrases: [
          { en: 'a demanding job', zh: '一份高要求的工作' }
        ] },
      { id: 'L02-W23', lemma: 'calculation', surface: 'calculations', pos: 'n.',
        zh: '计算', sent: 'L02-P3-S2',
        phrases: [
          { en: 'according to most calculations', zh: '根据大多数计算' },
          { en: 'do a calculation',               zh: '进行计算' }
        ] },
      { id: 'L02-W24', lemma: 'pace', surface: 'pace', pos: 'n.',
        zh: '速度; 步伐; 节奏', sent: 'L02-P3-S2',
        phrases: [
          { en: 'at a pace of',    zh: '以……的速度' },
          { en: 'keep pace with',  zh: '与……并驾齐驱' }
        ] },
      { id: 'L02-W25', lemma: 'burn', surface: 'burn', pos: 'v.',
        zh: '消耗(热量); 燃烧', sent: 'L02-P3-S2',
        phrases: [
          { en: 'burn calories', zh: '消耗卡路里' }
        ] },
      { id: 'L02-W26', lemma: 'calorie', surface: 'calories', pos: 'n.',
        zh: '卡路里(热量单位)', sent: 'L02-P3-S2',
        phrases: [
          { en: 'be high / low in calories', zh: '热量高/低' }
        ] },
      { id: 'L02-W27', lemma: 'approximately', surface: 'approximately', pos: 'adv.',
        zh: '大约; 近似地', sent: 'L02-P3-S2',
        phrases: [
          { en: 'approximately twice as many as', zh: '大约是……的两倍' }
        ] },
      { id: 'L02-W28', lemma: 'pound', surface: 'pound', pos: 'v. / n.',
        zh: 'v. 连续重击; 捶打  n. 磅; 英镑', sent: 'L02-P4-S1',
        phrases: [
          { en: 'pound the body', zh: '冲击身体' }
        ] },
      { id: 'L02-W29', lemma: 'hit', surface: 'hit', pos: 'v.',
        zh: '击打; 撞击', sent: 'L02-P4-S2',
        phrases: [
          { en: 'hit the ground', zh: '撞击地面' }
        ] },
      { id: 'L02-W30', lemma: 'step', surface: 'step', pos: 'n. / v.',
        zh: 'n. 脚步; 步骤; 台阶  v. 迈步', sent: 'L02-P4-S2',
        phrases: [
          { en: 'step by step',       zh: '一步一步地' },
          { en: 'take steps to do',   zh: '采取措施做' }
        ] },
      { id: 'L02-W31', lemma: 'create', surface: 'create', pos: 'v.',
        zh: '产生; 创造', sent: 'L02-P4-S2',
        phrases: [
          { en: 'create pressure', zh: '产生压力' }
        ] },
      { id: 'L02-W32', lemma: 'as a result', surface: 'As a result', pos: 'phr.',
        zh: '因此; 结果', sent: 'L02-P5-S1',
        phrases: [
          { en: 'as a result of', zh: '由于; 作为……的结果' }
        ] },
      { id: 'L02-W33', lemma: 'associate', surface: 'associated', pos: 'v.',
        zh: '联系; 联想; 交往', sent: 'L02-P5-S1',
        phrases: [
          { en: 'be associated with', zh: '与……相关' },
          { en: 'associate ... with ...', zh: '把……和……联系起来' }
        ] },
      { id: 'L02-W34', lemma: 'uncommon', surface: 'uncommon', pos: 'adj.',
        zh: '不常见的; 罕见的', sent: 'L02-P5-S1',
        phrases: [
          { en: 'It is not uncommon for sb. to do', zh: '某人做某事并不罕见' }
        ] },
      { id: 'L02-W35', lemma: 'strange', surface: 'strange', pos: 'adj.',
        zh: '奇怪的; 陌生的', sent: 'L02-P5-S2',
        phrases: [
          { en: 'a strange form', zh: '奇怪的姿势' }
        ] },
      { id: 'L02-W36', lemma: 'form', surface: 'form', pos: 'n. / v.',
        zh: 'n. 姿势; 形式; 表格  v. 形成', sent: 'L02-P5-S2',
        phrases: [
          { en: 'in the form of',  zh: '以……的形式' },
          { en: 'fill in a form',  zh: '填表' }
        ] },
      { id: 'L02-W37', lemma: 'considerable', surface: 'considerable', pos: 'adj.',
        zh: '相当大的; 可观的', sent: 'L02-P5-S2',
        phrases: [
          { en: 'considerable stress', zh: '相当大的压力' }
        ] },
      { id: 'L02-W38', lemma: 'stress', surface: 'stress', pos: 'n. / v.',
        zh: 'n. 压力; 重音  v. 强调', sent: 'L02-P5-S2',
        phrases: [
          { en: 'place / put stress on', zh: '给……施加压力; 强调' },
          { en: 'under stress',          zh: '在压力下' }
        ] },
      { id: 'L02-W39', lemma: 'ankle', surface: 'ankles', pos: 'n.',
        zh: '脚踝', sent: 'L02-P5-S2',
        phrases: [
          { en: 'twist one\u2019s ankle', zh: '扭伤脚踝' }
        ] },
      { id: 'L02-W40', lemma: 'hip', surface: 'hips', pos: 'n.',
        zh: '髋部; 臀部', sent: 'L02-P5-S2',
        phrases: [] },
      { id: 'L02-W41', lemma: 'cautious', surface: 'cautious', pos: 'adj.',
        zh: '谨慎的; 小心的', sent: 'L02-P5-S2',
        phrases: [
          { en: 'be cautious about / in', zh: '对……谨慎' }
        ] },
      { id: 'L02-W42', lemma: 'adopt', surface: 'adopting', pos: 'v.',
        zh: '采用; 采纳; 收养', sent: 'L02-P5-S2',
        phrases: [
          { en: 'adopt a method',    zh: '采用一种方法' },
          { en: 'adopt a suggestion', zh: '采纳建议' }
        ] },
      { id: 'L02-W43', lemma: 'consult', surface: 'consult', pos: 'v.',
        zh: '咨询; 请教; 查阅', sent: 'L02-P5-S3',
        phrases: [
          { en: 'consult sb. about sth.', zh: '就某事咨询某人' },
          { en: 'consult a dictionary',   zh: '查词典' }
        ] },
      { id: 'L02-W44', lemma: 'coach', surface: 'coach', pos: 'n. / v.',
        zh: 'n. 教练; 长途客车  v. 指导; 训练', sent: 'L02-P5-S3',
        phrases: [
          { en: 'a head coach', zh: '主教练' }
        ] },
      { id: 'L02-W45', lemma: 'experienced', surface: 'experienced', pos: 'adj.',
        zh: '有经验的; 熟练的', sent: 'L02-P5-S3',
        phrases: [
          { en: 'be experienced in', zh: '在……方面有经验' }
        ] },
      { id: 'L02-W46', lemma: 'proper', surface: 'proper', pos: 'adj.',
        zh: '恰当的; 正确的; 合适的', sent: 'L02-P5-S3',
        phrases: [
          { en: 'proper technique', zh: '正确的技术动作' }
        ] },
      { id: 'L02-W47', lemma: 'technique', surface: 'technique', pos: 'n.',
        zh: '技巧; 技术; 手法', sent: 'L02-P5-S3',
        phrases: [
          { en: 'learn proper technique', zh: '学习正确的技巧' }
        ] }
    ]
  }
];
