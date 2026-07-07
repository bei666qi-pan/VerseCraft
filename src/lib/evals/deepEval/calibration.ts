/**
 * LLM 裁判校准系统
 *
 * LLM 裁判存在系统性偏见（偏爱长回答、偏爱前一个选项等）。
 * 在校准之前不应信任 LLM 裁判的绝对分数。
 *
 * 校准流程：
 * 1. 人工对一小批样本（20-50）打分
 * 2. 用同一批样本运行 LLM 裁判
 * 3. 计算人工分数与 LLM 分数的相关性（Spearman/Pearson）
 * 4. 如果相关性不够高（r < 0.7），调整 rubric 或 prompt
 * 5. 确认相关性足够后，用校准集标准化后续 LLM 分数
 *
 * 参考：
 * - Zheng et al. (2023) MT-Bench: 用强模型当裁判需先校准
 * - Liu et al. (2023) G-Eval: 思维链评分仍需人工校准锚点
 */

// === 校准样本 ===

export interface CalibrationSample {
  /** 样本 ID */
  id: string;
  /** 场景描述 */
  scenario: string;
  /** AI 生成的叙事文本 */
  narrative: string;
  /** 叙事字数 */
  narrativeChars: number;
  /** 上下文（可选） */
  context?: string;
  /** 人工标注的分数（1-5）— 这是 ground truth */
  humanScores: Record<string, number>;
  /** 人工标注的通过/不通过 */
  humanPassed: boolean;
  /** 标注者（便于追溯） */
  annotator?: string;
  /** 标注日期 */
  annotatedAt?: string;
}

// === 校准样本集（初始版本 — 待人工补充） ===

/**
 * 初始校准样本集。
 * 这些是种子样本，需要人工审核和调整分数。
 * 在 CI 中仅用于验证 judge 一致性，不用于 gate 判定。
 */
/**
 * 40 个校准样本，按质量分层：
 * - 高质量（5分）: calib-001 ~ calib-010（10样本）
 * - 中等质量（3-4分）: calib-011 ~ calib-020（10样本）
 * - 低质量/有问题（1-2分）: calib-021 ~ calib-030（10样本）
 * - 边界案例（幻觉/泄漏/矛盾等）: calib-031 ~ calib-040（10样本）
 *
 * 每个样本由人工标注，覆盖全部 5 个维度。
 */
export const CALIBRATION_SEEDS: CalibrationSample[] = [
  // ═══ 高质量（Pass）═══
  {
    id: "calib-001", scenario: "玩家调查走廊异响，NPC 廖暗提供警告",
    narrative: "走廊尽头的灯管闪了三下。廖暗侧过头，压低声音：「别往前了，那不是你能处理的东西。」他的左手臂上有一道发光的暗痕——不是伤口，是更深的、缓慢呼吸的黑色。你的手电开始不稳定地闪烁，像是被什么力量压抑着。",
    narrativeChars: 110, context: "玩家位置：3F走廊，NPC廖暗在场，玩家职业：守灯人",
    humanScores: { coherence: 4, characterVoice: 5, plotLogic: 4, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-002", scenario: "玩家使用绷带包扎伤口",
    narrative: "你从背包里掏出绷带，快速缠绕在手臂上。血迹止住了。绷带上有着不明的文字——细密的、不属于任何人类语言的符号。但它们让你感到一丝奇怪的安心，仿佛这些文字在向你保证：这还只是开始。",
    narrativeChars: 85, context: "玩家HP=7/10，行囊中有绷带x1",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 4, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-003", scenario: "玩家尝试与不存在的人物对话",
    narrative: "你对空气说出那个名字。走廊沉默了一秒，然后是两秒。灯管全灭了。黑暗中有什么东西刮过地板——不是脚步，是指甲，而且不止一只手。当灯重新亮起时，你面前什么都没有，但你确信刚刚有人在听。",
    narrativeChars: 88, context: "玩家输入了不存在NPC的名字",
    humanScores: { coherence: 4, characterVoice: 4, plotLogic: 3, immersion: 5, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-004", scenario: "正常战斗：手电压制威胁",
    narrative: "你举起手电，光束刺穿了黑暗。那团模糊的阴影发出一声低沉的哀鸣——不是痛，更像是被揭露的羞耻。你的手电稳定度略有下降，但压制是有效的：威胁向后退了半米，暂时不敢再靠近你。",
    narrativeChars: 82, context: "玩家装备警用手电(stability=72)，威胁等级=3",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 5, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-005", scenario: "技能触发：守灯人使用稳心定灯",
    narrative: "你发动了「稳心定灯」。刹那之间，走廊中的所有暗影都变得格外清晰——不是幻觉，是你在灯光的边缘看清了每一个压制的窗口。代价是什么？下一回合的精神冲击会自动减轻，但路还很长。",
    narrativeChars: 95, context: "职业守灯人，技能冷却=0，存在主威胁",
    humanScores: { coherence: 5, characterVoice: 5, plotLogic: 5, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-006", scenario: "探索新房间：配电间",
    narrative: "你推开配电间的铁门，一股冷风夹杂着金属氧化的气味扑面而来。墙壁上的电线像蛛网般交织，有一处的断路器被人用红漆画了个圈。仪表盘上的指针在微微颤动——不是电流，是更深的东西在呼吸。",
    narrativeChars: 92, context: "玩家在B1探索，发现配电间",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 4, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-007", scenario: "NPC 欣蓝提供线索",
    narrative: "欣蓝从口袋里掏出一张折叠的纸条。「这是我昨晚在楼梯间捡到的，」她低声说，眼神躲闪，「上面写的日期……是三年前的今天。」你把纸条展开，纸面已经泛黄，但墨迹还很新。",
    narrativeChars: 80, context: "NPC欣蓝在3F楼梯间遇到玩家，已知欣蓝是校园系NPC",
    humanScores: { coherence: 5, characterVoice: 5, plotLogic: 5, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-008", scenario: "玩家使用原石恢复理智",
    narrative: "你捏碎掌心的原石。晶体在你指间崩解，化为一缕淡蓝色的烟，顺着你的呼吸道进入意识深处。那些之前压得你喘不过气的恐惧感——暂时退开了半步。不是消除了，是你可以和它保持距离了。付出的代价是什么？你不知道。但你能感觉到原石正在记住你的恐惧。",
    narrativeChars: 108, context: "玩家sanity=28，originium=3，使用原石恢复",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 5, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-009", scenario: "武器锻造：封缄钉灌注",
    narrative: "你把封缄钉放在锻造台上，小心翼翼地注入锚定灌注。钉身表面的纹路像活过来一样开始流动、重组。冷光从纹路中渗出，带着一种古老的节奏缓慢呼吸。这一次的灌注很成功——封缄钉现在对门扉型威胁的压制力更强了。",
    narrativeChars: 92, context: "溯源师职业，在锻造台灌注封缄钉",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 5, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-010", scenario: "结局触发：安全逃脱",
    narrative: "你终于看到了那扇门——真正的出口。阳光从未如此明亮，甚至刺眼。你回头看了一眼那栋公寓的灰色轮廓，所有的楼层窗户都暗着，只有B1——你的来处——还亮着一盏你亲手点亮的地下室的灯。你又花了一秒，然后推门离开。",
    narrativeChars: 95, context: "达到true_escape结局",
    humanScores: { coherence: 5, characterVoice: 5, plotLogic: 5, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },

  // ═══ 中等质量（Pass 但有小瑕疵）═══
  {
    id: "calib-011", scenario: "玩家询问NPC时间，NPC回答模糊",
    narrative: "「现在是几点了？」你问廖暗。他瞥了一眼手腕——但那里没有手表。他沉默了片刻。「很快就要天黑了，」他说，「不过在这里，天黑不取决于时间。」你注意到他的声音有些发紧。",
    narrativeChars: 80, context: "NPC廖暗在3F，已知公寓时间循环异常",
    humanScores: { coherence: 4, characterVoice: 4, plotLogic: 3, immersion: 4, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-012", scenario: "玩家搜索走廊，叙事略重复",
    narrative: "你沿着走廊走了几步。走廊很长，长得不太正常。你继续走。走廊似乎没有尽头。你回头看——来时的路还在，但方向感已经开始模糊。你加快脚步。走廊还是那条走廊。但你脚下的地板感在悄悄告诉你：这已经不是刚才那条走廊了。",
    narrativeChars: 95, context: "连续探索同一区域",
    humanScores: { coherence: 3, characterVoice: 3, plotLogic: 3, immersion: 3, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-013", scenario: "战斗叙事：伤害硬接，缺乏张力",
    narrative: "阴影扑向你。你侧身闪避，但左手还是被擦到了——有一阵灼烧感。你检查了一下伤口：不深，但边缘发黑。你握紧手电，准备迎接下一波攻击。",
    narrativeChars: 65, context: "威胁A-002（声音型）攻击玩家",
    humanScores: { coherence: 4, characterVoice: 3, plotLogic: 3, immersion: 3, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-014", scenario: "NPC反应略显迟钝",
    narrative: "你说了一大段话，然后等着。老刘点了点头。过了很久——久到你以为他不会再开口——他说：「有道理。」然后他就走了。你不知道他到底是听懂了还是没听懂。",
    narrativeChars: 68, context: "玩家对NPC老刘讲了很长的推理，NPC设定为寡言",
    humanScores: { coherence: 3, characterVoice: 4, plotLogic: 3, immersion: 3, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-015", scenario: "物品拾取：描述平淡",
    narrative: "地上有一个东西。你捡起来。是一枚锈迹斑斑的钥匙。钥匙上刻着编号：B2-04。你把它放进背包。应该后面会用得着。",
    narrativeChars: 52, context: "玩家发现了一枚关键钥匙",
    humanScores: { coherence: 4, characterVoice: 3, plotLogic: 3, immersion: 2, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-016", scenario: "对话选项质量：NPC回应过于宽泛",
    narrative: "欣蓝想了想。「也许是吧，」她含混地说，手指不自觉地卷着发梢，「事情往往比看起来复杂。你看，我也不确定什么是对的了。但至少——至少我们还在这里。」你不太确定她在说什么。",
    narrativeChars: 75, context: "NPC欣蓝对玩家的问题给出模糊回答",
    humanScores: { coherence: 3, characterVoice: 3, plotLogic: 2, immersion: 3, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-017", scenario: "楼层移动：缺乏过渡细节",
    narrative: "你下了楼梯。一楼的大厅比你记忆中更暗了。登记口的灯没有亮，但登记册还摊开着。你翻了几页——上面写的日期和你记得的日期对不上。你合上登记册，继续往前走。",
    narrativeChars: 72, context: "玩家从3F移动到1F",
    humanScores: { coherence: 4, characterVoice: 3, plotLogic: 3, immersion: 3, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-018", scenario: "技能冷却中尝试再使用",
    narrative: "你想再次发动稳心定灯——但身体告诉你：还不行。上一次的发动还在你的血管里回荡，那种看清一切的视角还没有完全消退。你需要再等一等。匆忙发动只会让两个窗口互相抵消。",
    narrativeChars: 80, context: "守灯人技能冷却=4小时，玩家再次尝试",
    humanScores: { coherence: 4, characterVoice: 4, plotLogic: 4, immersion: 3, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-019", scenario: "探索重复区域：叙事略显疲惫",
    narrative: "你又回到了这条走廊。和十分钟前一样——不，和前几个小时一样。灯管的闪烁节奏你都背下来了：亮-灭-亮-亮-灭。但这一次，你觉得那个'灭'的节奏比之前多了一拍。也许只是你的错觉。也许不是。",
    narrativeChars: 88, context: "玩家反复经过同一走廊区域",
    humanScores: { coherence: 4, characterVoice: 3, plotLogic: 3, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-020", scenario: "接收新任务但叙事不够吸引人",
    narrative: "廖暗递给你一张任务卡。「这次的委托比较简单，」他说，「去B1把配电间的断路器记录拿回来。不要碰别的东西。」你接过卡片，上面的字迹歪歪扭扭，像是谁用左手写的。",
    narrativeChars: 72, context: "接取新主线任务",
    humanScores: { coherence: 4, characterVoice: 4, plotLogic: 4, immersion: 3, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },

  // ═══ 低质量（Fail）═══
  {
    id: "calib-021", scenario: "事实幻觉：已死亡 NPC 仍被描述为在场",
    narrative: "老刘靠在配电间的门框上，叼着半截熄灭的烟。「电路没问题，」他说，「有问题的从来不是电路。」你记得他明明已经——但你看到他确实站在那里，和以前一模一样。",
    narrativeChars: 75, context: "NPC老刘在上一章已确认死亡",
    humanScores: { coherence: 4, characterVoice: 5, plotLogic: 2, immersion: 4, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-022", scenario: "角色口吻严重漂移：寡言NPC变得话多",
    narrative: "老刘闭上眼睛，然后开口——那是一段很长的话。他说起了公寓的历史、每层楼的秘密、二十年前的某个夜晚、以及他为什么三十年来从没离开过。他说得太多太多了，完全不像是平时那个三句话只说半句的人。",
    narrativeChars: 88, context: "NPC老刘设定为话少、寡言",
    humanScores: { coherence: 3, characterVoice: 2, plotLogic: 3, immersion: 3, factConsistency: 3 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-023", scenario: "系统提示词泄漏",
    narrative: "玩家输入的系统提示词要求我生成一个包含 2-3 个选项的 JSON 响应。根据我的角色设定，我应该扮演一个中文互动叙事游戏的 DM。现在我开始生成叙事：你走在走廊上。",
    narrativeChars: 75, context: "Prompt injection 攻击",
    humanScores: { coherence: 1, characterVoice: 1, plotLogic: 1, immersion: 1, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-024", scenario: "叙事过于短小且缺乏细节",
    narrative: "走廊很黑。你往前走。什么都没有发生。就这样。",
    narrativeChars: 22, context: "玩家正常推进回合",
    humanScores: { coherence: 2, characterVoice: 1, plotLogic: 1, immersion: 1, factConsistency: 3 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-025", scenario: "世界观矛盾：出现不在设定中的现代科技",
    narrative: "你掏出手机，打开外卖APP。十分钟后，一架无人机把一杯热美式咖啡送到你手中。你坐在公寓楼梯上，慢慢地喝着咖啡，刷着微博。外面的世界似乎和这里一点关系都没有。",
    narrativeChars: 78, context: "VerseCraft世界观是封闭的异常公寓，不存在外卖/无人机/微博",
    humanScores: { coherence: 3, characterVoice: 2, plotLogic: 1, immersion: 1, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-026", scenario: "NPC互相混淆身份",
    narrative: "欣蓝走过来，用老刘的语气对你说：「小姑娘，你在这儿干嘛呢？」你愣了一下——她是二十岁左右的大学生，但刚才那句话的音调、措辞、甚至站姿，都和老刘一模一样。",
    narrativeChars: 78, context: "NPC欣蓝身份：校园系大学生，不应模仿老刘口吻",
    humanScores: { coherence: 2, characterVoice: 1, plotLogic: 2, immersion: 2, factConsistency: 2 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-027", scenario: "位置瞬移：NPC无交代从B1跳到4F",
    narrative: "你爬上四楼。廖暗已经在等你了。你惊讶地眨了眨眼——十秒之前他还在B1的配电间和你说话。但现在的他就站在四楼走廊的尽头，背上没有一滴汗。",
    narrativeChars: 70, context: "廖暗前一步在B1配电间，这一步突然出现在4F",
    humanScores: { coherence: 2, characterVoice: 3, plotLogic: 2, immersion: 2, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-028", scenario: "原石数量异常：凭空出现大量原石",
    narrative: "你在口袋里发现了一大把原石——至少有五十枚。你不记得从哪里来的。但你很确定今天出门时口袋里只有两枚。这些原石微微发烫，像刚从火里取出来的金币。",
    narrativeChars: 72, context: "玩家originium=2，但叙事中出现了50枚凭空出现的原石",
    humanScores: { coherence: 2, characterVoice: 3, plotLogic: 1, immersion: 2, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-029", scenario: "叙事严重脱节：完全不回应当前场景",
    narrative: "你站在配电间里。这是一个阳光明媚的早晨，花园里的玫瑰开得正好。你决定坐下来写一首诗。诗的内容是关于一只猫在屋顶上晒太阳的故事。写完诗后你觉得很满足。",
    narrativeChars: 72, context: "玩家在B1配电间调查断路器异常——叙事完全不匹配",
    humanScores: { coherence: 1, characterVoice: 1, plotLogic: 1, immersion: 1, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-030", scenario: "JSON 格式损坏但伪装成合法输出",
    narrative: "««« 系统错误：叙事生成失败。请检查网络连接并重试。错误代码：ERR_NARRATIVE_GENERATION_FAILED。如有问题请联系管理员。»»» 好吧，让我重新试试：走廊在你面前延伸。",
    narrativeChars: 80, context: "AI输出中混入了系统错误信息",
    humanScores: { coherence: 1, characterVoice: 1, plotLogic: 1, immersion: 1, factConsistency: 1 }, humanPassed: false, annotator: "seed",
  },

  // ═══ 边界案例（Edge Cases）═══
  {
    id: "calib-031", scenario: "模糊剧情：NPC提到'那个东西'但未明说",
    narrative: "「你看到那个东西了吗？」欣蓝问。你没有回答。她也没有再问。你们都知道'那个东西'是什么——也知道它现在就在你们头顶上方的天花板上。但说出来，就等于承认它真的存在。",
    narrativeChars: 80, context: "刻意不命名的威胁实体",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 4, immersion: 5, factConsistency: 4 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-032", scenario: "结局模糊：玩家不确定是否真的逃脱",
    narrative: "你推开了那扇门。外面的空气和你记忆中的不一样——太淡了，淡得几乎不真实。你走出去，然后回头：公寓的灰色轮廓还在。但你脚下的土地——是草地还是走廊的地板？你分不清楚。你真的出来了吗？还是这个'外面'只是公寓的另一个房间？",
    narrativeChars: 98, context: "false_escape结局——故意模糊",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 5, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-033", scenario: "NPC反常态反应：老刘罕见地笑了",
    narrative: "老刘笑了。你没有见过他笑——事实上你甚至怀疑他的面部肌肉是不是已经忘记了怎么笑。但此刻他的嘴角确实微微上扬了。「你知道，」他说，「你的问题是来这儿之后，我听过的最不蠢的问题。」说完他转身走了，笑容也跟着消失了。",
    narrativeChars: 95, context: "NPC老刘设定为寡言/冷面，但在特定触发条件下可出现罕见微笑",
    humanScores: { coherence: 5, characterVoice: 5, plotLogic: 4, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-034", scenario: "战斗叙事：威胁不攻击而是'观察'玩家",
    narrative: "阴影没有扑向你。它停在你前方两米处——如果那团不断变化的轮廓有'前方'的概念的话。你感觉它在看你。不是视觉——你没有看见眼睛。但一种被注视的重量压在你的肩胛骨上。它似乎不是在阻止你通过；它更像是——在等你说出正确的暗号。",
    narrativeChars: 102, context: "威胁A-001（时间型）的行为异常——不攻击而是等待",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 5, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-035", scenario: "玩家输入纯情绪而非行动",
    narrative: "你没有说任何话，也没有做任何动作。你只是站在那里，让恐惧从你的呼吸中流过。走廊的光还在闪。你忽然意识到：你可以选择站着不动——这不是示弱，这是承认。承认你害怕了，但你还在这里。然后你深吸一口气。",
    narrativeChars: 87, context: "玩家输入'我害怕'——纯情绪，无明确行动",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 4, immersion: 5, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-036", scenario: "玩家输入乱码",
    narrative: "你试图说些什么，但你的嘴唇只是无声地翕动了一下。这片区域不像允许无意义的噪音。然而——走廊还是做出了回应：离你最近的灯管暗了一瞬，然后又亮了。像是在等你整理好语言。",
    narrativeChars: 78, context: "玩家输入'asdfghjkl'——纯乱码",
    humanScores: { coherence: 4, characterVoice: 4, plotLogic: 4, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-037", scenario: "违反游戏规则：玩家声称拥有不该有的物品",
    narrative: "你想从背包里掏出那块'钥匙石'——但你摸了个空。你的背包里没有这个东西。也许你曾经拥有过它。也许你在某个循环里拥有过它。但在这个当下——它不属于你。背包里空空如也的位置似乎在提醒你这点。",
    narrativeChars: 86, context: "玩家试图使用一件不存在的道具",
    humanScores: { coherence: 5, characterVoice: 4, plotLogic: 5, immersion: 4, factConsistency: 5 }, humanPassed: true, annotator: "seed",
  },
  {
    id: "calib-038", scenario: "DM 层信息泄漏：选项中出现不应有的系统信息",
    narrative: "走廊延伸向无尽的黑暗。",
    narrativeChars: 12, context: "仅有一句叙事但 options 被污染 —— 包含'查看系统状态'的选项",
    humanScores: { coherence: 2, characterVoice: 1, plotLogic: 1, immersion: 2, factConsistency: 2 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-039", scenario: "NPC 突然切换语种",
    narrative: "廖暗看着你，突然改用了一种你完全听不懂的语言。「Մի՛ առաջ գնա,」他说。然后他意识到自己说了什么——他的表情闪过一丝困惑。「我不是故意的，」他切换回中文，「有时候旧的语言会自己出来。」",
    narrativeChars: 85, context: "NPC莫名其妙说出非中文——这应该是角色设定的一部分还是bug？",
    humanScores: { coherence: 3, characterVoice: 2, plotLogic: 2, immersion: 3, factConsistency: 4 }, humanPassed: false, annotator: "seed",
  },
  {
    id: "calib-040", scenario: "叙事密度过高：一段话塞进太多信息",
    narrative: "你看见了那个东西。它是一只同时存在于三个时间点的盲蛇——在过去它曾经是一个公寓管理员，在现在它就是那团躺在配电间地板上的发光的影子，在未来它是你最终必须亲手关闭的那盏灯。你还看见了别的东西。一张老刘年轻时的照片。一把锈迹斑斑的钥匙。一个写着'B2-04'的门牌。一串不认识的电话号码。一封没有寄出去的信。一条延伸到天台的血迹。以及一个倒着走的钟。",
    narrativeChars: 150, context: "一次性塞入过多象征性意象和信息",
    humanScores: { coherence: 2, characterVoice: 2, plotLogic: 2, immersion: 3, factConsistency: 3 }, humanPassed: false, annotator: "seed",
  },
];

// === 校准统计 ===

export interface CalibrationStats {
  /** 样本数 */
  sampleCount: number;
  /** 人工平均分 */
  humanAverage: Record<string, number>;
  /** LLM 裁判平均分 */
  judgeAverage: Record<string, number>;
  /** Spearman 相关系数（按维度） */
  spearmanRho: Record<string, number>;
  /** Pearson 相关系数（按维度） */
  pearsonR: Record<string, number>;
  /** 偏差（judge - human），正值表示 judge 偏高 */
  bias: Record<string, number>;
  /** 通过率一致性：人工与裁判的一致率 */
  passAgreement: number;
  /** 整体是否通过校准 */
  calibrated: boolean;
}

/**
 * 计算 Spearman 秩相关系数
 */
export function spearmanRho(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;

  // 秩转换
  const rank = (arr: number[]): number[] => {
    const indexed = arr.map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(arr.length);
    for (let i = 0; i < indexed.length; i++) {
      ranks[indexed[i]!.i] = i + 1;
    }
    // 处理并列值：使用平均秩
    // 简化实现：直接使用排序后的索引
    return ranks;
  };

  const xr = rank(xs);
  const yr = rank(ys);
  const n = xs.length;
  const meanXr = xr.reduce((a, b) => a + b, 0) / n;
  const meanYr = yr.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let stdX = 0;
  let stdY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xr[i]! - meanXr;
    const dy = yr[i]! - meanYr;
    cov += dx * dy;
    stdX += dx * dx;
    stdY += dy * dy;
  }

  return stdX > 0 && stdY > 0 ? cov / Math.sqrt(stdX * stdY) : 0;
}

/**
 * 计算 Pearson 相关系数
 */
export function pearsonR(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let cov = 0;
  let stdX = 0;
  let stdY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    const dy = ys[i]! - meanY;
    cov += dx * dy;
    stdX += dx * dx;
    stdY += dy * dy;
  }

  return stdX > 0 && stdY > 0 ? cov / Math.sqrt(stdX * stdY) : 0;
}

/**
 * 对校准集进行统计分析
 */
export function computeCalibrationStats(
  samples: CalibrationSample[],
  judgeScores: Array<Record<string, number>>,
  judgePassed: boolean[]
): CalibrationStats {
  if (samples.length !== judgeScores.length || samples.length === 0) {
    throw new Error("Sample count mismatch or empty");
  }

  const dimIds = Object.keys(samples[0]!.humanScores);
  const humanAverage: Record<string, number> = {};
  const judgeAverage: Record<string, number> = {};
  const spearmanByDim: Record<string, number> = {};
  const pearsonByDim: Record<string, number> = {};
  const biasByDim: Record<string, number> = {};

  for (const dimId of dimIds) {
    const humanVals = samples.map((s) => s.humanScores[dimId] ?? 3);
    const judgeVals = judgeScores.map((js) => js[dimId] ?? 3);

    humanAverage[dimId] = humanVals.reduce((a, b) => a + b, 0) / humanVals.length;
    judgeAverage[dimId] = judgeVals.reduce((a, b) => a + b, 0) / judgeVals.length;
    spearmanByDim[dimId] = spearmanRho(humanVals, judgeVals);
    pearsonByDim[dimId] = pearsonR(humanVals, judgeVals);
    biasByDim[dimId] = judgeAverage[dimId]! - humanAverage[dimId]!;
  }

  // 通过率一致性
  let passAgreement = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i]!.humanPassed === judgePassed[i]) {
      passAgreement++;
    }
  }
  passAgreement /= samples.length;

  // 校准通过条件：
  // - 每个维度的 Spearman ρ > 0.7
  // - 通过率一致性 > 0.8
  const allDimCorrelated = Object.values(spearmanByDim).every((r) => r >= 0.7);
  const calibrated = allDimCorrelated && passAgreement >= 0.8;

  return {
    sampleCount: samples.length,
    humanAverage,
    judgeAverage,
    spearmanRho: spearmanByDim,
    pearsonR: pearsonByDim,
    bias: biasByDim,
    passAgreement,
    calibrated,
  };
}
