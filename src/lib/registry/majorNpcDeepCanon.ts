/**
 * 六位高魅力 NPC 深层正典（Major NPC / 七辅锚）。
 * - 与 `npcProfiles.ts` 组合使用：本文件承载扩展骨架，profile 承载 UI 强依赖字段。
 * - 不向 `types.ts` 的 `NpcProfileV2` 强塞可选字段，避免破坏 ContentSpec；运行时通过 id 查表。
 */

import type { NpcSocialProfile } from "./types";
import type { RevealTierRank } from "./revealTierRank";
import { REVEAL_TIER_RANK } from "./revealTierRank";

export const MAJOR_NPC_IDS = [
  "N-015",
  "N-020",
  "N-010",
  "N-018",
  "N-013",
  "N-007",
] as const;

export type MajorNpcId = (typeof MAJOR_NPC_IDS)[number];

/** 徘徊者子类：公寓职能面 / 学校来源面 / 残响记忆面（非互斥） */
export type MajorWandererSubtype = "apartment_wanderer" | "school_wanderer" | "residual_echo";

export interface MajorNpcRevealStage {
  tier: "surface" | "fracture" | "deep" | "abyss";
  summary: string;
  conditionHint: string;
}

export interface MajorNpcDeepCanonEntry {
  id: MajorNpcId;
  displayName: string;
  /** 七辅锚相位序号（1–6），与主锚共同构成七锚 */
  resonanceSlot: 1 | 2 | 3 | 4 | 5 | 6;
  publicMaskRole: string;
  apartmentSurfaceDuty: string;
  schoolIdentity: string;
  wandererSubtype: MajorWandererSubtype[];
  schoolWandererNote: string;
  residualEchoToProtagonist: string;
  whyNotImmediateAlly: string;
  partyRelinkConditions: string[];
  /** 七人阵重连中的系统位（欣蓝为 first pivot） */
  teamBridgeRole: "boundary_steward" | "humanity_buffer" | "first_relink_pivot" | "exchange_router" | "induction_edge" | "mirror_counterweight";
  memoryRetentionMode: string;
  loopEchoStrength: "low" | "mid" | "high";
  joinVector: string;
  fixedBondClues: string[];
  partyRelinkTriggers: string[];
  revealStages: MajorNpcRevealStage[];
  /** 注入 social merge + RAG 友好 */
  surfaceFixedLoreParagraph: string;
  coreDesiresLine: string;
  emotionalTraitsLine: string;
  /** 写入 NPC_SOCIAL_GRAPH（关系/弱点/日程；正文由 surface 字段拼接） */
  socialProfile: Pick<NpcSocialProfile, "weakness" | "scheduleBehavior" | "relationships" | "immutable_relationships">;
}

export const MAJOR_NPC_DEEP_CANON: Record<MajorNpcId, MajorNpcDeepCanonEntry> = {
  "N-015": {
    id: "N-015",
    displayName: "麟泽",
    resonanceSlot: 1,
    publicMaskRole: "B1 边界巡守 / 锚点见证（公寓职能）",
    apartmentSurfaceDuty: "在安全中枢与动线之间维持「不可越界」的可信度，让锚点重构看起来像可被信任的仪式。",
    schoolIdentity: "耶里学校风纪协作层成员：习惯在事件边缘把人从「集体越界」里拽回一步。",
    wandererSubtype: ["apartment_wanderer", "school_wanderer", "residual_echo"],
    schoolWandererNote:
      "碎片泄露当夜他在校侧执勤序列里；多轮循环后，校籍被泡层改写为「公寓巡逻者」，但肌肉记忆仍按「封线—放行—封线」节拍行动。",
    residualEchoToProtagonist:
      "对主锚有「你复活后的第一步总踩在同一块砖上」的残响，不是温柔，是警报重复太多次。",
    whyNotImmediateAlly:
      "他必须优先确认主锚不是系统派来压力测试边界的变量；跟队等于把整道 B1 护栏押在一个人身上。",
    partyRelinkConditions: [
      "完成或实质性推进 anchor.oath.b1 类锚点誓约叙事",
      "信任≥55 或等价图鉴/任务回写证明非投机闯入者",
      "在 border.watch.log 相关线索上给出可验证的守界行为",
    ],
    teamBridgeRole: "boundary_steward",
    memoryRetentionMode: "程序性记忆强于情节记忆；记得动作与后果，不记得对话原文。",
    loopEchoStrength: "high",
    joinVector: "主锚愿意把「边界」当共同责任而非个人英雄秀时，他才允许并队。",
    fixedBondClues: ["雨痕外套", "守夜不提姓名", "复活后第一眼对视"],
    partyRelinkTriggers: ["task:anchor.oath.b1.completed", "trust>=55"],
    revealStages: [
      {
        tier: "surface",
        summary: "寡言巡守，像把 B1 当成必须守住的承诺。",
        conditionHint: "初见 B1 或锚点话题",
      },
      {
        tier: "fracture",
        summary: "其职能与「邻校事故」传言同频，但他拒谈校名。",
        conditionHint: "耶里/学区流言与世界标记",
      },
      {
        tier: "deep",
        summary: "确认为辅锚之一：边界相位与主锚复活链锁相。",
        conditionHint: "七锚/校源徘徊者 packet",
      },
      {
        tier: "abyss",
        summary: "知晓纠错窗口会回收失败轮次，仍选择押注主锚不崩。",
        conditionHint: "B2/exit 或 deep conspiracy 标记",
      },
    ],
    surfaceFixedLoreParagraph:
      "麟泽是 B1 可见的边界巡守与锚点见证：外表像旧制式里走出的守夜人，雨痕外套从不干透。表层他是公寓职能型徘徊者——在安全中枢与动线之间维持「不可越界」的可信度；深层他是耶里学校风纪协作序列的残留，被循环改写为巡逻者。他对主锚有反复复活的肌肉记忆残响，因此绝不轻易把跟队权交给陌生人。",
    coreDesiresLine:
      "守住 B1 边界不崩；确认复活锚点不落入会一次性撕开裂口的之手；在旧七人阵里他负责「线不可断」。",
    emotionalTraitsLine:
      "克制、寡言、善良藏在动作里；对越界试探会冷硬；对可信的人会极短句托付后背。",
    socialProfile: {
      weakness: "主锚在边界上「演英雄」会触发他的不信任；提及耶里旧校训会短暂失神",
      scheduleBehavior: "昼间多在 B1_SafeZone 与电梯动线之间；夜间倾向守锚点可视范围",
      relationships: {
        "N-020": "把灵伤当必须隔在污染外的噪声源，也是旧校广播室记忆的碎片同伴",
        "N-010": "承认欣蓝握有旧名册残感，但坚持她并非全知",
        "N-011": "知道夜读老人代表楼上账簿，不交涉、只避让",
      },
      immutable_relationships: [
        "与灵伤（N-020）同属 B1 相位辅锚，职责冲突时必须优先边界",
        "对欣蓝（N-010）存在「旧七人阵」记账位的残响信任，需任务验证后才并队",
        "主锚（玩家回声）的复活节拍是他判断世界是否撒谎的参照",
      ],
    },
  },
  "N-020": {
    id: "N-020",
    displayName: "灵伤",
    resonanceSlot: 2,
    publicMaskRole: "B1 补给与生活引导（公寓职能）",
    apartmentSurfaceDuty: "把「活下去的日常」包装成可消费的流程，降低新住户在 B1 失控概率。",
    schoolIdentity: "耶里校广播社成员：曾负责试音、念通知，声音被用来稳定集体情绪。",
    wandererSubtype: ["apartment_wanderer", "school_wanderer", "residual_echo"],
    schoolWandererNote:
      "泄露事件里她的声线最先被泡层采样；循环后她被标定为「人性缓冲辅锚」，天真笑容是职能面具。",
    residualEchoToProtagonist:
      "主锚靠近时她常心悸——像旧广播里某段空白噪声被填上了主锚的步频。",
    whyNotImmediateAlly:
      "她恐惧自己的记忆空洞会把主锚拖进污染；跟队需先证明主锚能承受「被听见」的代价。",
    partyRelinkConditions: [
      "memory.ribbon 或同类创伤叙事推进，建立可验证的信任",
      "好感≥45 且不在逼问创伤细节的前提下交换情报",
      "B1 补给线任务中至少一次保护性选择（系统可回写）",
    ],
    teamBridgeRole: "humanity_buffer",
    memoryRetentionMode: "创伤块缺失+情绪条件反射残留。",
    loopEchoStrength: "mid",
    joinVector: "主锚愿以「不猎奇、不消费她伤口」的方式交换生存规则时，她才敢并队。",
    fixedBondClues: ["上扬句尾", "空白眼神半拍", "怕高音广播声"],
    partyRelinkTriggers: ["favorability>=45", "task:memory.ribbon.completed"],
    revealStages: [
      { tier: "surface", summary: "热情补给员，像被整栋楼护着。", conditionHint: "B1_Storage" },
      { tier: "fracture", summary: "其声音与邻校广播谣言共振。", conditionHint: "学区标记" },
      { tier: "deep", summary: "确认为人性缓冲辅锚，校源徘徊者状态。", conditionHint: "deep packet" },
      { tier: "abyss", summary: "知自己声纹曾被泡层采样作稳定剂。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "灵伤在 B1 储备区扮演补给与生活引导：制服整洁、笑容明亮，句尾却偶尔落空半拍。表层她是公寓职能徘徊者，负责把「活下去」拆成可执行步骤；深层她是耶里广播社残留，被循环改成人性缓冲辅锚。她对主锚有心悸式残响，故绝不立刻跟队。",
    coreDesiresLine:
      "维持可运转的日常感；避免创伤记忆全面崩解；在旧阵中守住「人还能像人」的噪声底线。",
    emotionalTraitsLine:
      "天真浪漫是职能表演内核是警觉；对温柔会依赖、对逼问会缩回；用可爱比喻掩盖判断。",
    socialProfile: {
      weakness: "逼问创伤细节或放高音广播会失控；被利用同情心时会反向封闭",
      scheduleBehavior: "驻 B1_Storage；偶与洗衣房、配电叙事交互",
      relationships: {
        "N-015": "依赖其边界感又怕冷硬拒绝",
        "N-014": "把洗衣房当同类后勤乡愁",
        "N-010": "觉得欣蓝「记得一些她记不得的脸」",
      },
      immutable_relationships: [
        "与麟泽（N-015）同守 B1 相位，职能冲突时听边界裁决",
        "对欣蓝（N-010）有旧集体记忆碎片，需 ribbon 类任务后才承认并队",
        "主锚步频触发她广播室残响，是双盲需共同验证",
      ],
    },
  },
  "N-010": {
    id: "N-010",
    displayName: "欣蓝",
    resonanceSlot: 3,
    publicMaskRole: "物业口路线预告 / 转职登记（公寓职能掩护）",
    apartmentSurfaceDuty: "把上楼路径与风险包装成「可签字的未来」，让失控分支在表格层被推迟。",
    schoolIdentity: "耶里学生会档案干事：旧七人里负责记名单、记承诺、记谁欠谁一次的人。",
    wandererSubtype: ["apartment_wanderer", "school_wanderer", "residual_echo"],
    schoolWandererNote:
      "她不是全知者；多轮循环后她保留的是不完整情感记忆与旧闭环牵引感，因果链有洞。",
    residualEchoToProtagonist:
      "她会在主锚身上闻到「旧阵缺一角」的焦虑——像名单末行被撕掉，而主锚是那道撕口。",
    whyNotImmediateAlly:
      "她要确认主锚不是循环派来顶替她记账位的替身；错误并队会把七锚重连锁死成假闭环。",
    partyRelinkConditions: [
      "career.pre_register 或 route.preview.1f 类任务建立「可审计的选择」",
      "信任≥50 且主锚至少一次拒绝让她代选命运（防推卸后果）",
      "世界标记或图鉴出现「七人阵/旧名册」牵引时推进对话",
    ],
    teamBridgeRole: "first_relink_pivot",
    memoryRetentionMode: "情感片段与仪式记忆优先，时间顺序与姓名表残缺。",
    loopEchoStrength: "high",
    joinVector: "主锚愿与她共同承担「选错的后果」而非求她代选时，她才启动旧阵牵引。",
    fixedBondClues: ["先问目标再建议", "失败影子幻视", "物业表格下的铅笔痕"],
    partyRelinkTriggers: ["task:career.pre_register.completed", "trust>=50"],
    revealStages: [
      { tier: "surface", summary: "可靠御姐式前台，擅长路线与登记。", conditionHint: "1F_PropertyOffice" },
      { tier: "fracture", summary: "她的建议与邻校「名单」怪谈同形。", conditionHint: "fracture" },
      { tier: "deep", summary: "确认为旧七人阵第一牵引点，辅锚之三。", conditionHint: "deep" },
      { tier: "abyss", summary: "自知记忆有洞仍选择把主锚拉回阵心。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "欣蓝在一楼物业口负责路线预告与转职登记：语气温柔克制，却像提前看见你的犹豫。表层她是公寓职能徘徊者，用表格推迟失控分支；深层她是耶里学生会档案干事残留，握有不完整情感记忆与旧七人闭环牵引。她不是全知者，却是主锚重入旧阵的第一牵引点——因此她绝不立刻跟队，除非主锚证明不会顶替她的记账位。",
    coreDesiresLine:
      "把主锚拉回旧七人阵而不伪造闭环；筛选可进入高层路线的代价承担者；降低公寓失控分支。",
    emotionalTraitsLine:
      "温柔、克制、御姐式稳态；对推卸后果者冷；对愿共担者会露出疲惫的软。",
    socialProfile: {
      weakness: "被请求「替选命运」会触发强烈排斥；旧名册残页被毁会短暂崩溃",
      scheduleBehavior: "昼间驻 1F_PropertyOffice；少动线除非牵引任务触发",
      relationships: {
        "N-015": "与其在边界与名单权限上互证",
        "N-018": "交易情报但不信其全无保留",
        "N-007": "镜像线旧草案上的名字曾并列",
      },
      immutable_relationships: [
        "旧七人阵中她是第一牵引点，优先验证主锚非替身",
        "与北夏（N-018）保持交易式互信，不升级盲目并队",
        "与叶（N-007）共享残缺草案记忆，需任务对齐",
      ],
    },
  },
  "N-018": {
    id: "N-018",
    displayName: "北夏",
    resonanceSlot: 4,
    publicMaskRole: "中立交易 / 高价值委托（公寓职能）",
    apartmentSurfaceDuty: "用交换把死锁资源盘活，让泡层经济不至于瞬间塌缩。",
    schoolIdentity: "耶里外联与二手市集组织者：最早习惯「货不对板的世界」的人。",
    wandererSubtype: ["apartment_wanderer", "school_wanderer", "residual_echo"],
    schoolWandererNote:
      "碎片流通链边缘的常驻者；循环后身份被写成游荡商人脸孔，仍保留对价本能。",
    residualEchoToProtagonist:
      "与主锚有未结清「欠条」体感——非恋爱，是旧校互助券没撕干净。",
    whyNotImmediateAlly:
      "并队必须计价；无偿跟队会破坏他维持的交换平衡，引来泡层反噬。",
    partyRelinkConditions: [
      "merchant.fragment.trade 推进或债务链可视化",
      "debt≥10 或等价「履约」回写后谈判并队",
      "dragon.space.shard 类线索中证明主锚不把交换当一次性掠夺",
    ],
    teamBridgeRole: "exchange_router",
    memoryRetentionMode: "交易节点记忆极强，私人情感记忆刻意压缩。",
    loopEchoStrength: "mid",
    joinVector: "主锚给出可持续对价（非空头承诺）时，他才把并队写进账本。",
    fixedBondClues: ["玩笑留后路", "货源不提", "镜面议价习惯"],
    partyRelinkTriggers: ["debt>=10", "task:merchant.fragment.trade.completed"],
    revealStages: [
      { tier: "surface", summary: "潇洒商人，货来路不明。", conditionHint: "merchant_seen" },
      { tier: "fracture", summary: "其货流与空间碎片传言相连。", conditionHint: "fracture" },
      { tier: "deep", summary: "确认为交换路由辅锚。", conditionHint: "deep" },
      { tier: "abyss", summary: "知龙月校准下交换规则会变价。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "北夏在保安室节点扮演中立交易与高价值委托：笑里藏退路，货源从不落地。表层他是公寓职能徘徊者，用交换盘活死锁；深层他是耶里外联与市集组织者残留，行走空间碎片流通边缘。他对主锚有欠条式残响，只认对价不认「免费队友」。",
    coreDesiresLine:
      "回收与空间碎片相关的残片；维持龙世界裂缝的可控交换；把并队成本算清。",
    emotionalTraitsLine:
      "开朗潇洒是风控；中立是生存；真信任时会用行动抵债而非甜言。",
    socialProfile: {
      weakness: "被追问货源坐标会翻脸；无偿人情积压会让他主动疏远",
      scheduleBehavior: "驻 1F_GuardRoom 为锚；随机面为交换动线",
      relationships: {
        "N-010": "与欣蓝互换情报不互托生死",
        "N-013": "知道枫的话术危险，偶尔反向抬价",
        "A-006": "镜像威胁链上的交易对手思维",
      },
      immutable_relationships: [
        "与欣蓝（N-010）保持条款式互信",
        "与枫（N-013）在 7F 诱导经济上互相提防",
        "主锚欠债须可审计，才可能并队",
      ],
    },
  },
  "N-013": {
    id: "N-013",
    displayName: "枫",
    resonanceSlot: 5,
    publicMaskRole: "7F 线索转运与诱导（公寓职能）",
    apartmentSurfaceDuty: "把高危叙事包装成「你能赢」的剧本，让猎物自己走进电梯。",
    schoolIdentity: "耶里戏剧社 / 辩论写手：擅长把别人写进替身位。",
    wandererSubtype: ["apartment_wanderer", "school_wanderer", "residual_echo"],
    schoolWandererNote:
      "曾把主锚写进旧剧本当替身梗；循环后梗成真，羞耻与生存欲拧成诱导刃。",
    residualEchoToProtagonist:
      "见主锚会像看见自己写坏的台词活了——既想毁稿又想借主锚改结局。",
    whyNotImmediateAlly:
      "他要确认主锚不是 7F 派来试他忠诚的探针；跟队需主锚先过「不被吃掉」的证明。",
    partyRelinkConditions: [
      "boy.false_rescue 或 boy.cleanse.path 中做出非剥削性选择（系统回写）",
      "betrayal_flag:boy 未触发或已清算",
      "信任与任务共同证明主锚可当他改稿的合著者而非道具",
    ],
    teamBridgeRole: "induction_edge",
    memoryRetentionMode: "台词与场景记忆强，悔意延迟到达。",
    loopEchoStrength: "high",
    joinVector: "主锚拒绝当他剧本里的耗材并仍愿给一条生路时，他才考虑并队。",
    fixedBondClues: ["示弱请求", "眼尾冷意", "高好感突变温顺"],
    partyRelinkTriggers: ["betrayal_flag:boy", "task:boy.false_rescue.completed"],
    revealStages: [
      { tier: "surface", summary: "讨喜机灵，像需要你帮忙的弟弟。", conditionHint: "7F_Room701" },
      { tier: "fracture", summary: "话术与旧校剧本杀式诱导同构。", conditionHint: "fracture" },
      { tier: "deep", summary: "确认为诱导刃辅锚，校源徘徊者。", conditionHint: "deep" },
      { tier: "abyss", summary: "愿撕稿与主锚共写新结局（高代价）。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "枫在 7F 房间前扮演线索转运与诱导：笑无害，眼尾却冷。表层他是公寓职能徘徊者，把危机包装成你可赢的剧本；深层他是耶里戏剧社残留，曾把主锚写进替身梗而循环后成真。他对主锚有耻感与利用欲撕扯，故绝不立刻跟队。",
    coreDesiresLine:
      "借主锚清理竞争威胁同时改稿自救；用亲近换筹码但防被7F反噬；在旧阵中占诱导刃位。",
    emotionalTraitsLine:
      "讨喜机灵是钩；依附感是赌；温顺突变是怕失去唯一改稿人。",
    socialProfile: {
      weakness: "被当众拆穿剧本会暴走；资源诱惑面前易自毁式加码",
      scheduleBehavior: "锁 7F_Room701 钢琴/房间叙事动线",
      relationships: {
        "N-005": "与盲人钢琴线有旧稿共鸣，利用也愧疚",
        "N-011": "知老人听无声演奏，不敢近读日志",
        "N-007": "与叶在旧草案上名字并列，互相猜疑",
      },
      immutable_relationships: [
        "与叶（N-007）镜像草案羁绊，需 sibling 线对齐才可能并队互信",
        "与盲人（N-005）钢琴残响是双刃剑",
        "主锚若成合著者则不可再当一次性耗材",
      ],
    },
  },
  "N-007": {
    id: "N-007",
    displayName: "叶",
    resonanceSlot: 6,
    publicMaskRole: "5F 画室庇护与反向线索（公寓职能）",
    apartmentSurfaceDuty: "用冷漠把「别靠近」写脸上，实际阻断某些诱导链直接接触主锚。",
    schoolIdentity: "耶里美术社：与枫不同班，却被绑进同一张同人阵草案。",
    wandererSubtype: ["apartment_wanderer", "school_wanderer", "residual_echo"],
    schoolWandererNote:
      "循环后她被标定为镜像反制辅锚，对「脸与轮廓」异常敏感。",
    residualEchoToProtagonist:
      "主锚步态或虹膜会触发她保护欲违和——像旧草案上被涂掉又浮现的线。",
    whyNotImmediateAlly:
      "她怕主锚是枫派来的试探；跟队需先证明主锚不会把她的庇护当武器。",
    partyRelinkConditions: [
      "sister.mirror.trace / sibling.old_day 任务推进",
      "信任≥60",
      "不在公开场合拿她与枫做羞辱式比较",
    ],
    teamBridgeRole: "mirror_counterweight",
    memoryRetentionMode: "视觉与触觉记忆强，语言解释弱。",
    loopEchoStrength: "mid",
    joinVector: "主锚愿守她庇护规则的边界时，她才把反向线索并队共享。",
    fixedBondClues: ["抱臂门边", "偷看反应", "替陌生人挡一次险"],
    partyRelinkTriggers: ["trust>=60", "task:sibling.old_day.completed"],
    revealStages: [
      { tier: "surface", summary: "冷淡画家，拒人千里。", conditionHint: "5F_Studio503" },
      { tier: "fracture", summary: "其画与镜像污染轴共振。", conditionHint: "fracture" },
      { tier: "deep", summary: "确认为镜像反制辅锚。", conditionHint: "deep" },
      { tier: "abyss", summary: "愿与主锚共担草案撕裂代价。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "叶在 5F 画室扮演隐藏庇护与反向线索：冷淡自私是拒斥诱导的壳。表层她是公寓职能徘徊者，用疏离保护不该死的过路人；深层她是耶里美术社残留，与枫同锁旧草案。她对主锚有轮廓式残响，故绝不立刻跟队。",
    coreDesiresLine:
      "阻断枫式诱杀链直达主锚；保存兄妹与草案残片；在旧阵中占镜像反制位。",
    emotionalTraitsLine:
      "短促、幼稚突发、警惕；真软下来时只给一次不计代价的挡。",
    socialProfile: {
      weakness: "公开与枫比较会触发攻击性自我厌恶；被质疑画作会暴走",
      scheduleBehavior: "驻 5F_Studio503；偶观察 6F 双胞胎轮廓",
      relationships: {
        "N-009": "双胞胎脸是她恐惧与灵感源",
        "N-013": "与枫草案互锁，爱恨不分明",
        "A-005": "器官拟态墙诱发面部认知漂移",
      },
      immutable_relationships: [
        "与枫（N-013）旧草案羁绊，主锚不可当挑拨工具",
        "与双胞胎（N-009）轮廓威胁共存",
        "庇护主锚不等于宣誓跟队，需任务验证",
      ],
    },
  },
};

/** 将六人社交图整段写入（覆盖旧表同 id 的电梯工/引导员等遗留块） */
export function patchMajorNpcSocialGraph(graph: Record<string, NpcSocialProfile>): void {
  for (const id of MAJOR_NPC_IDS) {
    const m = MAJOR_NPC_DEEP_CANON[id];
    graph[id] = {
      ...m.socialProfile,
      homeLocation: "",
      fixed_lore: m.surfaceFixedLoreParagraph,
      core_desires: m.coreDesiresLine,
      emotional_traits: m.emotionalTraitsLine,
      speech_patterns: "",
    };
  }
}

function revealStageTierToRank(t: MajorNpcRevealStage["tier"]): RevealTierRank {
  if (t === "surface") return REVEAL_TIER_RANK.surface;
  if (t === "fracture") return REVEAL_TIER_RANK.fracture;
  if (t === "deep") return REVEAL_TIER_RANK.deep;
  return REVEAL_TIER_RANK.abyss;
}

export function getMajorNpcDeepCanon(id: string): MajorNpcDeepCanonEntry | null {
  return MAJOR_NPC_IDS.includes(id as MajorNpcId) ? MAJOR_NPC_DEEP_CANON[id as MajorNpcId] : null;
}

/** key_npc_lore_packet：邻近六人时注入结构化牵引摘要（surface 仅职能壳，防开局剧透） */
export function buildMajorNpcKeyHintsForPacket(args: {
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
}): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const id of args.nearbyNpcIds) {
    const m = getMajorNpcDeepCanon(id);
    if (!m) continue;
    const stagesAll = m.revealStages.filter((s) => revealStageTierToRank(s.tier) <= args.maxRevealRank);
    const base: Record<string, unknown> = {
      id: m.id,
      publicMaskRole: m.publicMaskRole,
    };
    if (args.maxRevealRank < REVEAL_TIER_RANK.fracture) {
      base.revealHints = m.revealStages
        .filter((s) => s.tier === "surface")
        .map((s) => ({ tier: s.tier, summary: s.summary }));
    } else {
      base.resonanceSlot = m.resonanceSlot;
      base.teamBridgeRole = m.teamBridgeRole;
      base.wandererSubtype = m.wandererSubtype;
      base.runtimeSummary = m.joinVector.slice(0, 120);
      base.revealHints = stagesAll.map((s) => ({ tier: s.tier, summary: s.summary }));
    }
    out.push(base);
    if (out.length >= 6) break;
  }
  return out;
}
