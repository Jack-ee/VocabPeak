// sw.js — VocabPeak Service Worker

// hsv-v36 (?v=133) — 孩子端学习时长激励卡:
//   • 课文列表页头部新增激励卡: "今天已学 X 分钟 · 本周共 Y 分钟"。
//     数据取 v132 的 lesson_time (已落盘 + 未落盘累积都算, 实时不
//     滞后); 分钟向上取整, 起步 30 秒也显示 1 分钟, 开始学就有正
//     反馈; 完全没学过不显示空卡片。
//   • 设计边界: 孩子端只有正向数字, 监督性的信号 (跳过精读/作答
//     过快) 只在家长后台 —— 明着看时长塑造习惯, 判断留给家长。
//   • 卡片随 renderHome 重渲染自动更新 (进列表页/云端数据到达)。

// hsv-v35 (?v=132) — 同步键名错位修复 (高危) + 学习时长与家长监督:
//   • 键名错位 (高危): lesson_progress / lesson_mixed / lesson_sess /
//     lesson_phrase_sel 全部经 DB.setPref 存储, 真实键带 pref_ 段
//     (hsv_kid_pref_lesson_progress), 而 v123/v126 在 mergeFns 与
//     contentKeys 注册时漏了 pref_ —— 字段级合并与"缺键不删除"保护
//     从未路由到这几个键: 实际一直整键覆盖, 且远端快照缺键时本地会
//     被直接删除 (与历史"练习记录被冲"事故同形; 之后未复发只是因为
//     各设备键集恰好齐了)。v123 测试只测了合并函数本身没测键路由,
//     所以一直全绿。本版补上 pref_ 段, 保护真正接线。
//   • 学习时长采集 (lessons.js): 5 秒心跳, 页面可见且 120 秒内有活动
//     (点击/键盘/触摸/句子播放推进) 才计数, 挂机不算; 精读页计 r,
//     练习计 e, 综合练习入 mixed 桶; 填空逐题计作答秒数 (上限 120s)。
//     数据存 pref 'lesson_time' { 天: { 课ID|mixed: {r,e,q,qs} } },
//     只留 60 天; flush 走新的 DB.setPrefQuiet 直落本地 (不触发推送
//     钩子, 无推送风暴), 上云搭答题 bumpDaily 的便车, 纯听读在切后台
//     /关页面时补推。同步侧新增 mergeLessonTime 按字段 MAX 合并。
//   • 家长后台 (dashboard.html) 新增"课文学习"区: 近 14 天 精读/练习
//     分钟 + 答题数 + 平均秒/题, 按课累计 (课名读自 Gist 里的课程
//     文件); 专注信号 —— 练习≥3 分钟而精读<2 分钟 → "⚠ 跳过精读",
//     答题≥10 且均速<3 秒 → "⚠ 作答过快"。回答的正是"表面完成任务、
//     实际没认真学"的监督问题。
//   • 顺手修 dashboard 的 raw_url 兜底带 Authorization 头的问题
//     (v127 同款 CORS 预检坑, 大载荷时会拦)。

// hsv-v34 (?v=131) — 课程分发第二阶段 (A 通道: 仓库目录直出):
//   • 发布侧: tools/make-course-release.js 从备份提取出厂态课程,
//     生成 courses/courses-manifest.json (id/_v/sha256/文件名) + 每课
//     一个 <id>.json, 提交仓库由 GitHub Pages 直接服务; 目录里不在
//     清单内的旧课程文件自动清理。_v 原样保留 —— 它是增量分发的
//     版本锚, 发布时刷新会让订阅端全量重下。
//   • 订阅侧 (新模块 course-feed.js): 默认订阅同源 courses/ 目录
//     (零配置, 分享本站地址即分享全部课程); 启动后延时自动检查 +
//     设置 → 数据 → 课程订阅手动检查。只下载 manifest 里 _v 比本机
//     新或本机没有的课, 逐文件 sha256 校验, 合并走 mergeUserLessons
//     (只增不删、本机更新过的课不被旧版覆盖), 合并后派发
//     hsv:datachanged 刷新课文列表并 triggerSave 让新课随快照上 Gist。
//   • manifest 与课程文件一律 no-store + 时间戳 (既定原则); 课程
//     缓存未就绪时拒绝合并 (与 v130 的 sync 守卫同一原则)。
//   • B 通道 (私有化) 预留零改动切换: 订阅源填 Worker URL 时自动改
//     用 ?asset=<名>&key=<密钥> 请求形态 (密钥 pref course_feed_key);
//     产物格式两通道一致, 将来只需把 courses/ 三类文件发到私有仓库
//     Release + Worker 配 GH_TOKEN + 换源 URL。
//   • Prefs (随快照同步): course_feed_url (空=同源 courses/),
//     course_feed_auto (默认开), course_feed_key。

// hsv-v33 (?v=130) — bug 巡检修复批 (同步可靠性 + 课程链路补漏):
//   • 戳记回滚 (高): v129 的 updated_at 短路把戳记写在内容取回之前 ——
//     raw_url 拉取失败 / JSON 解析失败 / 课程合并失败后, 后台轮询一直
//     判 UNCHANGED, 这次远端更新被永久跳过 (直到远端再次变化)。VPN
//     抖动下是常态场景。现在所有失败路径都回滚戳记, 下一轮如实重读。
//   • 课程拉取就绪守卫 (高): SyncManager.init (DOMContentLoaded+500ms)
//     与 boot 的 await initCourses() 存在竞态 —— 缓存未灌满时合并等于
//     把「远端集合」当全量整表写回 IndexedDB, 本机未推送的课会被抹掉
//     (与「课程被冲」事故同根)。pullCourses 与 DB.mergeUserLessons 双层
//     守卫, 未就绪即跳过并清戳记, 30 秒后重试。
//   • 课程导入后不推送 (中): saveUserLessons 此前无任何同步触发, 导入
//     完课直接关页面, 课程永远到不了云端。hookSaves 补钩 saveUserLessons
//     与 importAll。
//   • 课文页不刷新 (中): v128 派发的 hsv:datachanged{courses:true} 在
//     lessons.js 没有监听者 —— 另一台设备导入的课同步下来后列表不更新。
//     补监听: 仅在课程列表页且无进行中状态 (课内/填空/匹配/综合/导入
//     弹层) 时静默重渲染; shouldApply=false 分支课程有变化也补派发。
//   • 旧键回灌 (中): 旧版设备的快照仍带 lessons_user 整键 (~700 KB),
//     入站时不再写回 localStorage, 改喂 mergeUserLessons (无 _v 不覆盖
//     本机); initCourses 顺带清理已回灌的残留键, 收回配额。
//   • 语音包 manifest 缓存 (中): Worker 对 .json 资产改发 no-store
//     (需单独 Cloudflare 部署!), 客户端 manifest 拉取加 no-store + 时间
//     戳 —— 否则新包发布后的缓存窗口内「检查更新」误报已最新。
//   • 拉后记账 (低): 拉完课程与远端一致时记 K_COURSES_HASH, 否则下次
//     任何推送都会把几百 KB 相同的课程文件再传一遍; 本机是并集时主动
//     安排回推, 本机独有课程不再等无关推送才顺路上云。
//   • 体积预警按 UTF-8 真实字节算 (中文下 length 低估一半以上);
//     factoryReset 补清拉取前快照 (隐私残留)、Gist 戳记、API key 同步
//     开关。

// hsv-v32 (?v=129) — 拉取流量: Gist 未变则一个字节都不下载:
//   • 现象: v128 后主载荷降到 602 KB, 但 API 仍标记 truncated, 于是
//     每次后台轮询 (30 秒一轮) 都走 raw_url 全量下载 602 KB ——
//     每小时白下几十 MB, 手机流量下尤其不可接受。
//   • 修复: readGist(force) 先看 Gist 元信息的 updated_at, 任何文件
//     变动都会推进它 —— 后台轮询发现与本机戳记相同即返回 UNCHANGED,
//     不读任何内容; 手动同步 (点云图标) 强制读取。推送后清掉本机
//     戳记, 让下一轮如实读一次 (期间别的设备可能也推过)。
//   • 顺带修正截断警告文案: 原来写死 "> 1MB" 与实际字节数自相矛盾,
//     改为 "payload truncated by API (N bytes)"。

// hsv-v31 (?v=128) — 架构分层: 课程是内容, 不再是用户状态:
//   • 动机: 课程 (36 门, 697 KB) 原本躺在 localStorage 并随用户快照
//     整份同步, 一口气引发三类问题 —— localStorage 配额吃紧 (与同源
//     EMPro 共享, 实测 3.81 MB, 三代拉取前快照只装下一代)、同步载荷
//     越过 1 MB 被 API 截断、课程落入整档 LWW 覆盖区 (被冲事故)。
//   • 存储: 课程搬到 IndexedDB (库 hsv_content / 表 courses, 一课一
//     条带版本 _v), 配额几百 MB。对外仍是同步 API (loadUserLessons /
//     saveUserLessons 读写内存缓存), 调用点零改动; 启动时 boot() 先
//     await DB.initCourses() 灌缓存, 并把 localStorage 旧课程迁移过来
//     (写入核对成功才删旧键, 迁移途中出错一律保留)。
//   • 同步: 课程改走独立 Gist 文件 hsv-courses-{pid}.json, 按内容
//     哈希增量 —— 没变一个字节都不传 (PATCH 不提该文件即原样保留);
//     拉取侧先比哈希再决定是否下载, 合并按 id 取版本新的一侧且永不
//     删除 (同 v126 原则)。主载荷回到 ~400 KB, Gist 网页上恢复可读。
//     课程更新与用户数据判定解耦: 只有课程变了也会拉取并刷新界面。
//   • 拉取前快照去掉课程键: 每代省 700 KB, 三代保护第一次真正生效。
//   • 备份文件格式不变 (仍以 lessons_user 键导出/导入), 现有工具
//     make-course-pack.js / merge-restore-backup.js 全部照旧可用;
//     导入侧把课程写进 IndexedDB (replace 覆盖 / 否则按版本合并),
//     全部重置一并清空课程库。

// hsv-v30 (?v=127) — 同步: 越过 1 MB 后拉取静默失效的修复:
//   • 症状: 课程攒到 23 门左右, 同步载荷超过 1 MB, GitHub API 只返回
//     截断内容并标记 truncated; readGist 直接 JSON.parse 必然抛错, 被
//     catch 吞掉返回 null, 界面只说 "No remote data yet." —— 推送正常
//     (数据不丢), 但跨设备拉取从此形同失效, 且提示语误导。
//   • 修复: truncated 时改从 file.raw_url 取全文。关键细节: 该请求
//     不能带 Authorization 头 —— 会触发 CORS 预检, 而
//     gist.githubusercontent.com 不接受预检; raw 链接自带不可猜测的
//     sha, 本身无需鉴权。解析失败改为打印错误而非静默吞掉。
//   • 推送侧加体积预警 (>950 KB 打印 KB 数): 课程语料在长大, 这是该
//     看见的架构信号 —— 后续可考虑按文件分片或压缩课程数据。

// hsv-v29 (?v=126) — 同步: 导入课被冲的根因修复 + 快照可用性:
//   • 根因: 拉取时「远端快照没有某个键」被一律当成删除执行。内容型
//     键 (lessons_user / lesson_phrase_sel / notebook) 承载攒起来的
//     东西, 远端缺键只说明对面是旧快照 —— 一台带旧数据的设备绑进来
//     就把另一端的导入课整键抹掉 (已实际发生)。现在这三个键与 day_
//     日志同等豁免: 缺键即保留并计入回推。真删课会写出更短的数组,
//     那时键存在, 正常覆盖照旧生效。
//   • restorePrePull 修 ReferenceError: 函数体漏了 prefix = keyPrefix(),
//     v125 上一调用就抛 "prefix is not defined", 兜底保险形同虚设。
//   • 快照改留最近 3 代 (PREPULL_GENS): 单代会被下一次拉取覆盖, 等
//     发现数据不对时好快照往往已经没了; 同数据不重复入栈, 无变化的
//     轮询不会把好快照挤出去; 配额不足时逐代降级保住最新一代。
//   • 用法: SyncManager.restorePrePull() 只列各代 (时间/课程/生词本数),
//     restorePrePull(true) 回滚最新代, restorePrePull(true, 1) 指定代。
//     回滚后刷新页面并立即手动同步一次, 把正确状态推回云端。

// hsv-v28 (?v=125) — 导入校验: 句译缺失显式警告 (不再静默回退):
//   • 导入预览对缺句译的课给 ⚠ 警告 (n/N 句缺译), 并直接给两条
//     补救路: 重新复制识别提示词让 AI 重出 / 导入后「补句译」补全。
//   • 背景: 新导入课点「中文」只见词义 —— 代码路径无误, 是识别时
//     用了更新前的旧提示词, 句子没带 zh 字段; 导入器兼容旧格式
//     静默放行, 用户误以为整句译文功能没生效。兼容保留, 静默取消。
//   • 判别标志: 填空中文行标签「译文」= 句译在, 「释义」= 回退词义。

// hsv-v27 (?v=124) — 语音包共享: 分发密钥门 (由所有者控制开关):
//   • Worker (vocabpeak-tts-proxy.js 需重新部署): 环境变量 PACK_KEYS
//     填逗号分隔密钥清单即启用 —— 包下载必须带 &key=清单内密钥;
//     删密钥再 Deploy 即撤销该人资格; 清空即回到不设防。每次下载
//     记 key 前缀日志 (wrangler tail 可追溯)。403 文案中文直说原因。
//   • 私有仓库彻底封直链 (真收费闸的前提): 公开仓库的 Release 直链
//     绕得开密钥门; 把音频包发到私有仓库并给 Worker 配 GH_TOKEN
//     (fine-grained, 仅该仓库 contents:read), Worker 自动改走 GitHub
//     API 拉私有资产, 成为唯一下载通道。
//   • 客户端: 设置 → 语音 新增「语音包密钥」输入 (pref pack_key,
//     device 内随快照同步, 不进课程包); tts-pack.js 下载请求自动携带。
//     已下载到设备的语音不受密钥停用影响 (IndexedDB 本地永存)。
//   • TTS 实时合成不设门: 各设备用自己的 OpenAI key, Worker 只是
//     CORS 中转, 分享不产生所有者成本。

// hsv-v26 (?v=123) — 同步安全: 拉取前快照兜底 (记录误冲可回滚):
//   • 案例复盘: 平板离线练习 (The Power of Patience), 联网首启仍在
//     跑缓存里的旧版代码 —— init 先静默拉取、旧逻辑整档覆盖, 本机
//     记录在 v23 合并保护送达前就被冲掉 (修复代码永远晚到一个会话
//     的竞态)。day_ 日志因旧版已有豁免而幸存。
//   • 兜底保险: 每次套用远端快照前, 把 lesson_progress / lesson_mixed
//     / lesson_sess / lesson_phrase_sel / notebook / lessons_user 六键
//     现值存入本机「拉取前快照」(键名下划线开头, 不进推送快照、不被
//     拉取删除, 只留最近一代)。误冲后控制台 SyncManager.restorePrePull()
//     一键回滚, 再手动同步推回云端。
//   • 配套工具 (仓库根目录, Node 运行):
//     merge-restore-backup.js — 从 Gist 历史版本/旧备份找回记录,
//     按 v120 同源合并规则拼成可导入备份 (含生词本按词并集、用户课
//     整课找回、日志补天); check-lesson-records.js 可复核合并结果。

// hsv-v25 (?v=122) — 单课填空: 智能选题 (四五十题不必每轮全刷):
//   • 词条是课文核心词汇, 不做删减 —— 与短语精选思路相反, 解法是
//     让重复轮次自动变轻: 设置页新增「🎯 智能选题」开关, 勾上后
//     每次只抽一组 (每组题量), 与综合练习同一套优先级: 做错的 →
//     没练过的 → 最久没练的; 越练越熟, 每轮实际要练的越少。
//   • 默认规则: 本课练过 (档案有记录) 默认勾选; 第一次接触默认
//     整卷分组, 先完整过一遍。设置页显示本课档案 (练过 x/N ·
//     待强化 y) 供判断。
//   • 智能一组是子集成绩, 不刷新「历史最佳」(整卷才计, 保持可比);
//     每题作答照常进日志/练习档案/错词强化。结果页给本课进度脚注,
//     「再练一轮」按原模式重抽。
//   • 会话存档带 smart 标记 (sm), 断点恢复后完卷不会误刷历史最佳。

// hsv-v24 (?v=121) — 课文精读: 短语精选 (一课 80+ 对压到 40 以内):
//   • 精选是「标记」不是删除: pref lesson_phrase_sel 存各课保留的
//     短语 key; 匹配练习与综合短语只出精选, 浏览页保留全部 (扩展
//     条目淡显), 每行星标可手动微调, 「恢复全部」随时可逆。
//   • ✨ 本地智能精选 (不联网), 三层取齐到 40 (PHRASE_CAP 常量):
//     ① 课文原文出现的搭配全保 ② 未覆盖词条各补该词最优 1 条
//     ③ 余额按分补齐 (分值 = 原文 +3, 词内第 1/2/3 条 +2/+1/+0)。
//   • 🤖 AI 精选 (可选, 配了 Key 时显示): 按高考价值挑, 返回序号。
//   • 匹配可选「练全部」含扩展短语; 主页卡片短语分母改按精选口径;
//     恢复旧会话按全量池还原, 旧存档含未入选短语不失效。
//   • 识别提示词源头限流: 默认每词 1 条、重点词最多 2 条、全课
//     不超过 40 条, 自检清单同步 (内嵌常量与 md 两处)。

// hsv-v23 (?v=120) — 学习记录: 显示不说谎 + 同步不覆盖:
//   • 主页课程卡与课内头部显示部分进度: 徽标只认「完整完成」三
//     里程碑, 但练一半的痕迹都在练习档案/会话存档里 —— 现在显示
//     「填空练过 12/47」「短语续做 8/53」(虚线徽标), 只有真正无
//     痕迹的课才显示「未开始」。
//   • 同步合并策略 (sync.js): lesson_progress / lesson_mixed /
//     lesson_sess 从整键后写覆盖改为字段级合并 —— 进度取或/取大,
//     档案与会话逐条取时间新的一侧; 远端旧快照没有这些键时本地
//     保留不删; 并集超出远端即安排回推 (同 day_ 键机制)。离线
//     练习记录从此不会被另一台设备的快照抹掉。
//   • 背景: 平板离线练过的课显示「未开始」—— 旧版部分完成不留
//     痕迹 + 整档覆盖双重原因, 本版两头堵住。

// hsv-v22 (?v=119) — 课文精读: 会话续做 + 组间跳转 + 补句译 + 图标:
//   • 填空/短语匹配会话按课持久化 (pref lesson_sess): 关掉应用再
//     回来, 设置页出「继续上次」+ 各组进度芯片, 可整体续做也可点
//     组直跳; 整卷/全部配平自动清档, 重新开始覆盖旧档。
//   • 组间自由切换: 题目页与匹配页顶部加组号芯片 (含各组已答数),
//     填空组首按 ← 可回上一组末题; 匹配已配平的对跳组后不重做,
//     最后一组配平但前面有欠账时自动带回未完成组。
//   • 新增「补句译」(听读页, 仅缺句译的导入课显示): 配了 AI Key
//     (DeepSeek/豆包国内直连) 一键在线翻译; 没配则复制提示词发给
//     任意 AI 再把 JSON 粘回, 译文并入用户课并随快照同步。
//   • 导航/返回按钮换 2.6px 粗描边 SVG 图标 (字符箭头太细);
//     返回按钮 40px 主色描边; 选项按钮加粗并与页面同宽对齐。
//   • 匹配错过数按组统计 (原为全程累计误标本组)。

// hsv-v21 (?v=118) — 课文精读: 分组练习 + 综合练习 + 答错自动强化:
//   • 「中文」开关改显示整句译文 (词义在作答反馈里已给出); 两篇
//     内置课 19 句全部补齐句译, 导入 schema 与识别提示词改为逐句
//     zh, 段译由句译自动拼接; 旧课无句译时回退显示词义。
//   • 选对 1 秒后自动进下一题 (令牌+位置双校验, 手动切题即作废);
//     选错自动静默入生词本并把该词拉回「到期」(DB.flagQuizMistake),
//     此后按遗忘曲线 1/3/7/14/30/60 天强化复习。
//   • 填空/短语匹配按「每组题量」分组 (设置 → 学习, 默认 30, 可选
//     不分组), 每组小结可休息可续做; 每题作答即刻落日志与档案,
//     中途停不白做, 历史最佳仍需整卷答完才刷新。
//   • 新增跨全部课程的综合练习 (主页卡片): 智能选题 —— 上次做错的
//     → 没练过的 → 最久没练的; 练习档案存 pref lesson_mixed,
//     单课与综合共写, 删除导入课时按课 ID 前缀清理。
//   • 上下题导航按钮加大加色 (52x40 主色描边, 下一题实心填充)。
//   • Bug: 词边界匹配 (findWordStart) 取代裸 indexOf —— 修复 "run"
//     命中 "runners"、撇号转义破坏定位导致的挖空/高亮错位; 快捷键
//     门控改按 clozeState 判定 (综合练习页原先完全失效)。

// hsv-v20 (?v=117) — 语音: 语速滑块贯通音频包与神经语音:
//   • TTSPack.playWord 新增可选 rate 参数; 包 clip 与神经语音的
//     Audio 均应用 playbackRate + preservesPitch (变速不变调),
//     范围钳制 0.5-2。clip 仍按自然语速生成, 慢速跟读由播放端
//     实现 —— 不生成慢速版包 (省包体/合成费, 速度连续可调)。
//   • app.js speak() 将有效语速传入包播放; 三级引擎语速口径统一。

// hsv-v19 (?v=116) — 课文精读: 导入校验放行撇号:
//   • 词条 surface/lemma 的特殊字符校验从 [&<>"'] 收窄为 [&<>"]:
//     撇号是合法英文 (teenagers' / runner's / don't), 全链路 esc()
//     转义后无注入风险, 原规则误杀所有格与缩写形式。
//   • 提示词无需改动 —— 让 AI 去掉撇号反而会污染语料。

// hsv-v18 (?v=115) — 课文精读: 课程列表紧凑布局:
//   • 卡片改行式: 内边距/字号收紧, 中文标题+词数+进度徽标合并
//     一行, 长标题省略号截断; 列表间距 12->8。
//   • 桌面端 (>=769px) 列表改两列网格 (max-width 860), 四课高度
//     约为原布局三分之一; 移动端保持单列。

// hsv-v17 (?v=114) — 课文精读: 段级中文译文:
//   • 段落数据新增可选 zh 字段, 两篇内置课 7 段译文全部就位。
//   • 课文页每段「译」按钮切换该段译文显隐, 工具栏「译文」全局
//     开关一键全显/全隐; 默认隐藏 (先读英文, 卡住再看译)。
//   • 导入 schema 兼容扩展: 段落对象可带 zh; 识别提示词 (内嵌
//     常量与 docs 文档) 同步要求 AI 产出整段翻译。

// hsv-v16 (?v=113) — 课文精读: 修复「复制识别提示词」:
//   • 提示词全文内嵌 lessons.js 常量, 关键路径不再 fetch 线上
//     docs 文件 (未部署即 404), 也不再受 await 后用户手势过期影响。
//   • 复制改为同步 execCommand 优先 + clipboard API 兜底; 双路
//     失败时弹层内展示全文并自动全选, 手动 Ctrl+C。
//   • docs/lesson-import-prompt.md 移出预缓存 (仅作仓库文档)。

// hsv-v15 (?v=112) — 课文精读: 课内切换课文:
//   • 课内页标题变为下拉入口 (标题+▾): 展开全部课程菜单, 点选
//     直接切课并保持当前学习步骤 (课文/填空/短语); 当前课高亮。
//   • 点菜单外收起, Esc 收起; 返回按钮加「全部课文」提示。

// hsv-v14 (?v=111) — 课文精读: 键盘快捷键 + 匹配乱序修正:
//   • 填空题目页快捷键 (桌面): ←/→ 切换题目、1-4 选择选项 (选项带
//     序号角标)、回车下一题、Esc 关闭弹层; 拼写输入框聚焦时不拦截。
//   • 短语匹配中文列改用 Sattolo 错位排列 (零不动点) —— 原普通洗牌
//     平均留 1 个位置对齐, 首行 20% 概率直接命中, 观感如未打乱;
//     收尾轮只剩 1 对时并入上一轮, 消除必然对齐。

// hsv-v13 (?v=110) — 课文精读: 应用内导入课文 (Windows 端粘贴):
//   • 课程列表新增「导入课文」: 复制识别提示词 → 粘贴 AI 输出的
//     JSON → 规范化(全角标点/弯引号/围栏剥离) → 校验报告 → 预览
//     确认入库。词-句关联与全部 ID 由导入器自动生成。
//   • 导入课存 hsv_{pid}_lessons_user, 随整档快照同步到平板;
//     内置课只读, 导入课卡片可删除(进度记录一并清除)。
//   • docs/lesson-import-prompt.md 入预缓存, 供应用内一键复制。

// hsv-v12 (?v=109) — 课文精读: 填空页体验改进 (实测反馈):
//   • 填空支持上一题/下一题自由导航, 可跳过可回看; 已答题回显
//     选项着色与反馈; 「交卷」出结果, 未答完不刷新最佳成绩且可
//     一键回到未作答题继续。
//   • 「中文」开关控制释义提示 (两种模式统一), 偏好持久化。
//   • 填空句可整句朗读 (未答时即听力填空练法); 课文页每段新增
//     整段播放按钮。

// hsv-v11 (?v=108) — 课文精读模块 (Lessons):
//   • 新增 lessons-data.js (两课语料: 短文按句切分 + 63 个蓝色词条
//     含原型/词形/释义/短语)、lessons.js (听读/点词/填空/短语四步)、
//     lessons.css，三者全部纳入预缓存。
//   • 导航新增「课文」tab；app.js 启动时初始化 Lessons，切 tab 停播。
//   • wordlist 导出与覆盖率统计追加课文语料条目（含整句），配合
//     音频包在无英文系统语音的平板上离线整篇朗读。

// v12 — fixes PWA install on mobile:
//   • v11: removed phantom files (dictionary.js, vocab.js, stories.js,
//     i18n.js) that were breaking cache.addAll().
//   • v12: added maskable icon entries for proper Android webapk build.
//     The previous icons were JPEG-in-PNG files (wrong MIME and wrong
//     dimensions), which made Android silently fail the install-to-
//     launcher step after reporting "installed successfully".
//   • Resilient install: individual cache.put calls so any single missing
//     file is logged as a warning, not a fatal error.
//   • Network-first for local assets (picks up deploys without a hard reload).
// v15 — cache-busting version strings on asset URLs:
//   • index.html now references style.css?v=15, app.js?v=15, etc.
//   • Offline fallback uses { ignoreSearch: true } so a versioned request
//     like style.css?v=15 still matches the plain style.css entry cached
//     at install time. This keeps the app working offline across deploys.

// v94 — audio pack: diagnostic logging on the playback path
//   (tagged "[pack]", visible in the debug panel Log tab).

// v93 — audio pack playback:
//   • speak() now plays English words from the downloaded pack when a
//     clip exists — no key, proxy, or network for covered words —
//     falling back to the neural and then the device voice otherwise.
//   • each play picks a random voice from the chosen set, so a word
//     sounds different on repeat during autoplay.
//   • removing a notebook word also deletes its pack audio.

// v92 — audio pack: word limit and a more compact Voice panel:
//   • a "Words/build" field caps how many words each cloud build
//     generates; it is written into the exported word list and the
//     generator reads it from a "# limit:" header.
//   • Settings → Voice is tightened: two-column auto-pronounce, side
//     by side pack buttons, shorter help text.

// v91 — audio pack: voice picker, coverage, word-list export:
//   • Settings → Voice gains voice checkboxes, a coverage line
//     (how many words still lack pronunciation), and an Export word
//     list button that writes wordlist.txt with the chosen voices.
//   • the pack generator reads voices from a "# voices:" header in
//     the word list, so voices are chosen in the app, not source.

// v90 — pre-generated pronunciation pack:
//   • new module tts-pack.js: downloads a bundled pack of word audio
//     into a dedicated, never-evicted IndexedDB store ('hsv-tts-pack').
//   • the pack is fetched through the existing Cloudflare Worker,
//     which now also relays the GitHub Release asset (Release assets
//     send no CORS header, so a direct browser fetch is blocked).
//   • Settings → Voice gains a "Download audio pack" button.

// v89 — stop syncing the OpenAI key:
//   • the OpenAI TTS key is a credential and is now excluded
//     from the Gist sync payload (like the AI provider key), so
//     it is never written to GitHub. Removes a key-exposure path.

// v88 — honest neural voice test:
//   • the Test button now uses a unique sentence each run so
//     the proxy edge cache can't serve a stale clip — a passing
//     test now genuinely means the OpenAI key works.

// v87 — OpenAI key sanitization:
//   • strip non-ASCII characters (zero-width spaces, smart
//     quotes, full-width letters) from the key before it is put
//     in the Authorization header — fixes the fetch() error
//     'String contains non ISO-8859-1 code point'.

// v86 — bilingual voice routing:
//   • Chinese text always uses the device's native Chinese
//     voice; the OpenAI neural voice is reserved for English.

// v85 — neural TTS via CORS proxy:
//   • OpenAI blocks direct browser calls; TTS requests now go
//     through a user-supplied proxy URL (a Cloudflare Worker).
//   • new 'TTS proxy URL' field in Settings → Voice.

// v84 — neural TTS debug output:
//   • [tts] console logs for voice resolution, HTTP status, and
//     byte size (auto-captured by the debug panel log).
//   • Test button shows a visible status line: voice + KB size.

// v83 — neural TTS diagnostics:
//   • 'Test neural voice' now reports the real outcome (works,
//     or the specific error) instead of silently downgrading.
//   • a neural failure during playback shows a one-time toast so
//     a silent fallback no longer looks like 'the switch does nothing'.

// v82 — neural TTS reliability:
//   • synthesised clips persist in IndexedDB — each text is
//     fetched from OpenAI at most once per device, then reused
//     across reloads and offline.
//   • transient failures (429 / network) retried with backoff
//     before falling back, fixing the mixed-voice autoplay.

// v81 — settings redesign:
//   • Settings split into 5 tabs (General / Voice / AI / Sync /
//     Data) so it no longer scrolls as one long page.

// v80 — multi-user:
//   • per-install PROFILE_ID (no data / Gist collision between
//     users); first run asks for a display name.
//   • non-owner installs see only a demo subset of Expressions;
//     the Ref tab stays shared in full.

// v79 — neural TTS:
//   • optional OpenAI gpt-4o-mini-tts voice engine for far less
//     robotic sentence playback; device voice remains the offline
//     fallback. Settings → Voice → Voice engine.

// v78 — batch paste-back fix:
//   • enriched entries now carry an INPUT field echoing the original
//     word, so an inflected word ('squeezed') updates its own row
//     instead of leaving an orphan when the AI returns the lemma.
//   • wider irregular-verb / Latin-plural lemma table.

// v95 — fix \"app stuck on an old version\":
//   • the network-first fetch handler now passes { cache: 'no-cache' }
//     so a request really goes to the server instead of being satisfied
//     by the browser / CDN HTTP cache. GitHub Pages sends a max-age, so
//     plain fetch(e.request) could return a stale document that still
//     referenced the previous ?v= assets — the app then loaded an old
//     build even though a new one was deployed.
//   • index.html registers the SW with updateViaCache:'none' so the
//     worker script itself is never served stale either.

// v96 — redeploy of the audio-pack Range UI (app.js / index.html / db.js)
//        after an older copy was accidentally republished; cache bumped so
//        the corrected files refresh cleanly on every device.

// v107 — batch-2 fixes:
//   • sync: local-only day logs are no longer deleted by whole-snapshot
//     pulls (day_ keys are add-only in the merge; the union is pushed
//     back after a pull that preserved any);
//   • unbiased Fisher-Yates shuffles for quiz/drill options (was the
//     biased sort(random) pattern in my-words + vocab-drill);
//   • data-changed event renamed emp:datachanged → hsv:datachanged;
//   • import button reduced to a single listener; backup filename is
//     now vocabpeak-backup-*.json.

// v106 — batch-1 fixes (see repo notes):
//   • enrichment merge no longer wipes SRS state / builtin metadata;
//   • AI paste-back orphans no longer inflate the daily new-word count;
//   • REGISTER whitelisted at import and render (HTML-injection fix);
//   • cloze result colors follow the light/dark theme variables;
//   • group-size default unified at 50; SRS review refreshes the counter;
//   • EMPro cross-app residue removed (expr_ bare-key migration,
//     sync-test.html emp_sync_* keys retargeted to hsv_sync_*).

// 缓存名与 EMPro 隔离：Cache Storage 也是按 origin 共享的，两个应用
// 的 CACHE_NAME 必须不同，否则会互相删除对方的缓存。
const CACHE_NAME = 'hsv-v36';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './style.css',
    './expressions-coach.css',
    './config.js',
    './dictionary.js',
    './vocab-hs-data.js',
    './lessons-data.js',
    './lessons.js',
    './lessons.css',
    './db.js',
    './ai-engine.js',
    './my-words.js',
    './cloze.js',
    './writing-lab.js',
    './vocab-drill.js',
    './reader.js',
    './speaking-coach.js',
    './expressions-data.js',
    './expressions-coach.js',
    './sentence.js',
    './sentence-drill.js',
    './sync.js',
    './tts-pack.js',
    './course-feed.js',
    './app.js',
    './debug-panel.js',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-192.png',
    './icon-maskable-512.png'
];

// Install — cache assets individually so a single failure doesn't kill install.
// This is essential for PWA installability: if install fails, the SW never
// activates, and Chrome on Android won't offer the "Install" prompt.
self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(ASSETS.map(async (url) => {
            try {
                const resp = await fetch(url, { cache: 'reload' });
                if (resp && resp.ok) {
                    await cache.put(url, resp);
                } else {
                    console.warn('[SW] Skipped (bad response):', url, resp && resp.status);
                }
            } catch (err) {
                console.warn('[SW] Skipped (fetch failed):', url, err && err.message);
            }
        }));
    })());
    self.skipWaiting();
});

// Activate — clean old caches, take control immediately
self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// Fetch — network-first for local GETs, fall back to cache when offline.
// Cross-origin requests (API providers, GitHub Gist, Google Fonts, Google TTS)
// pass straight through — never cached, never intercepted.
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Cross-origin: pass through untouched
    if (url.hostname !== location.hostname) {
        return;  // let browser handle it
    }

    // Any non-GET (or sync file): never cache
    if (e.request.method !== 'GET' || url.pathname.includes('hsv-sync')) {
        e.respondWith(fetch(e.request));
        return;
    }

    // Local GETs: network-first, fall back to cache when offline.
    // { cache: 'no-cache' } forces the browser to revalidate with the
    // server instead of returning a stale HTTP-cached copy. This is the
    // fix for \"a new deploy never shows up\": without it, network-first
    // could still hand back an old document from the CDN/browser cache.
    e.respondWith((async () => {
        try {
            const fresh = await fetch(e.request, { cache: 'no-cache' });
            if (fresh && fresh.ok && fresh.type !== 'opaque') {
                const cache = await caches.open(CACHE_NAME);
                cache.put(e.request, fresh.clone()).catch(() => {});
            }
            return fresh;
        } catch {
            // Offline fallback: ignore ?v=N query strings so a request for
            // style.css?v=15 still matches the plain style.css entry cached
            // at install time. Without ignoreSearch we'd miss every asset
            // after the first cache-bust and break offline mode.
            const cached = await caches.match(e.request, { ignoreSearch: true });
            if (cached) return cached;
            if (e.request.destination === 'document') {
                return (await caches.match('./index.html')) || new Response('Offline', { status: 504 });
            }
            return new Response('Offline', { status: 504 });
        }
    })());
});

// Support a manual "activate new SW" message from the page
self.addEventListener('message', (e) => {
    if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
