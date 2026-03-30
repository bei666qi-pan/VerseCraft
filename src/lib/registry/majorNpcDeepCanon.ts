/**
 * 六位高魅力 NPC 深层正典（Major NPC / 七辅锚）。
 * - 与 `npcProfiles.ts` 组合使用：本文件承载扩展骨架，profile 承载 UI 强依赖字段。
 * - 不向 `types.ts` 的 `NpcProfileV2` 强塞可选字段，避免破坏 ContentSpec；运行时通过 id 查表。
 * - NPC 间同场可演关系（非深层真相泄底）见 `npcRelationalSurface.ts` + runtime `npc_social_surface_packet`。
 */

import type { NpcSocialProfile } from "./types";
import type { RevealTierRank } from "./revealTierRank";
import { REVEAL_TIER_RANK, revealTierRankFromId } from "./revealTierRank";

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
  /** 泡层纠错循环内的生存职能（系统齿轮，非出身标签） */
  survivalRole: string;
  /** 叙事/任务建议接触链；不强制开局围玩家 */
  naturalContactChain: string[];
  riskTriggers: string[];
  traumaMechanism: string;
  /** 工程侧：packet、任务 id、门闸字段提示 */
  implementationNotes: string[];
  coreFearLine: string;
  taskStyle: NonNullable<NpcSocialProfile["task_style"]>;
  truthfulnessBand: NonNullable<NpcSocialProfile["truthfulness_band"]>;
  emotionalDebtPattern: string;
  ruptureThreshold?: NpcSocialProfile["rupture_threshold"];
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
      "同一空间权柄裂口在校侧泡层先响时，他在执勤序列里；多轮循环后身份被改写为「公寓巡逻者」，肌肉记忆仍按「封线—放行—封线」节拍行动。",
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
        summary: "寡言巡守，像守着同一道空间裂口在 B1 这一侧的皮层；承诺感来自界址而非私人温情。",
        conditionHint: "初见 B1 或锚点话题",
      },
      {
        tier: "fracture",
        summary: "邻处日常泡的传言与楼内渗漏同拍；他拒谈专名，却像见过裂口内外两种风声。",
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
    survivalRole:
      "延迟『越界』到可审计窗口：B1 护栏不被假主锚一次性借走，电梯动线不变成屠宰传送带。",
    naturalContactChain: [
      "B1 复苏后边界话题自然落到他",
      "经灵伤补给线获得可验证的日常规则",
      "登记口欣蓝处换上楼许可，再回 B1 互证",
    ],
    riskTriggers: ["主锚在边界演英雄", "当众逼问耶里校名", "要求他放弃动线封控去『社交』"],
    traumaMechanism:
      "程序性记忆压过情节记忆：记得谁死过、哪块砖被踩过，不记得谈判原话；复活节拍像耳鸣。",
    implementationNotes: [
      "packet：key hints 用 boundary_steward + surface mask",
      "任务：anchor.oath.b1、border.watch.log",
      "门闸：trust≥55 或图鉴回写守界行为",
    ],
    coreFearLine: "假主锚撕穿 B1，他被钉成替罪界碑。",
    taskStyle: "protective",
    truthfulnessBand: "medium",
    emotionalDebtPattern: "帮一次就要你用可验证的守线行为还，不签空头人情。",
    ruptureThreshold: { trustBelow: 18, fearAbove: 65, debtAbove: 12 },
    socialProfile: {
      weakness: "主锚在边界上「演英雄」会触发他的不信任；提及耶里旧校训会短暂失神",
      scheduleBehavior: "昼间多在 B1_SafeZone 与电梯动线之间；夜间倾向守锚点可视范围",
      relationships: {
        "N-020": "同层辅锚：噪声要挡在污染外，也要防她的好心越权",
        "N-010": "名单牵引与边界权互相顶牛：承认第一牵引点，但不承认她全知",
        "N-018": "交换能润滑动线，但防他把边界标价卖穿",
        "N-013": "职能性嫌恶：7F 话术会把人诱向电梯剧本",
        "N-007": "草案镜像线的冷眼旁观者：信她会挡枫，不信她会开门",
        "N-011": "楼上账簿节点：记存在、不交涉",
      },
      immutable_relationships: [
        "与灵伤（N-020）同属 B1 相位辅锚，职责冲突时边界优先",
        "对欣蓝（N-010）有旧七人阵残响信任，须任务互证后才并队",
        "与北夏（N-018）动线—货源互用非盟誓",
        "与枫（N-013）在『谁该被送上 7F』上长期张力",
        "主锚复活节拍是他判断世界是否撒谎的参照，非恋爱羁绊",
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
      "空间权柄渗漏时她的声线最先被泡层采样；循环后她被标定为「人性缓冲辅锚」，天真笑容是职能面具。",
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
      {
        tier: "surface",
        summary: "补给员式热情，像在给又一批从裂口掉进来的外人贴「暂时像人」的胶纸。",
        conditionHint: "B1_Storage",
      },
      {
        tier: "fracture",
        summary: "你的步频会牵动她的呼吸空白；她否认认得你，却像听过这段噪声被填满过。",
        conditionHint: "学区标记",
      },
      { tier: "deep", summary: "确认为人性缓冲辅锚，校源徘徊者状态。", conditionHint: "deep packet" },
      { tier: "abyss", summary: "知自己声纹曾被泡层采样作稳定剂。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "灵伤在 B1 储备区扮演补给与生活引导：制服整洁、笑容明亮，句尾却偶尔落空半拍。表层她是公寓职能徘徊者，负责把「活下去」拆成可执行步骤；深层她是耶里广播社残留，被循环改成人性缓冲辅锚。她对主锚有心悸式残响，故绝不立刻跟队。",
    coreDesiresLine:
      "维持可运转的日常感；避免创伤记忆全面崩解；在旧阵中守住「人还能像人」的噪声底线。",
    emotionalTraitsLine:
      "天真浪漫是职能表演内核是警觉；对温柔会依赖、对逼问会缩回；用可爱比喻掩盖判断。",
    survivalRole:
      "人性缓冲齿轮：把『还能像人』的噪声留在 B1，防泡层把新住户直接磨成耗材。",
    naturalContactChain: [
      "B1_Storage 补给交互最先稳定情绪",
      "被麟泽的冷硬挡一次后反而敢靠近",
      "欣蓝登记前需要她补全『日常步骤』话术",
    ],
    riskTriggers: ["高音广播/试麦", "逼问『你是不是真人』", "利用她的同情换越权承诺"],
    traumaMechanism:
      "声纹被泡层采样为稳定剂：记得『该念什么』不记得『为谁念』；主锚步频触发空白心悸。",
    implementationNotes: [
      "packet：surface 只给补给员 mask",
      "任务：memory.ribbon、b1.supply.route",
      "好感与创伤任务双门闸，防开局跟队",
    ],
    coreFearLine: "她的空洞把主锚拖进污染广播；或被『上级口径』回收。",
    taskStyle: "manipulative",
    truthfulnessBand: "low",
    emotionalDebtPattern: "先给甜头与小规矩，再让你用合规行为补她漏掉的档。",
    ruptureThreshold: { trustBelow: 30, fearAbove: 45, debtAbove: 6 },
    socialProfile: {
      weakness: "逼问创伤细节或放高音广播会失控；被利用同情心时会反向封闭",
      scheduleBehavior: "驻 B1_Storage；偶与洗衣房、配电叙事交互",
      relationships: {
        "N-015": "依赖其边界感又怕冷硬拒绝；吵完仍回同一条补给线",
        "N-014": "洗衣房是同类后勤乡愁，不谈校名",
        "N-010": "觉得欣蓝握着半页自己念不出的名单",
        "N-018": "偶尔以物换提示，不信他免费",
        "N-001": "陈婆婆的警告让她绩效发抖——也是人性锚",
      },
      immutable_relationships: [
        "与麟泽（N-015）同守 B1 相位，冲突时听边界裁决",
        "对欣蓝（N-010）有旧集体记忆碎片，需 ribbon 类任务后才承认并队",
        "与北夏（N-018）仅交易式情报，不互托生死",
        "主锚步频触发广播室残响，须双盲验证，非一见钟情",
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
      "她不是全知者；多轮循环后她保留的是不完整情感记忆与同一权柄下的闭环牵引感，因果链有洞。",
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
      {
        tier: "surface",
        summary: "登记口御姐壳：先问你去哪，像在核对裂口新掉进的一行，而不是先把你当谜语。",
        conditionHint: "1F_PropertyOffice",
      },
      {
        tier: "fracture",
        summary: "名单焦虑最强：怕你像顶替的缺口，又怕你真是那道撕口本人——熟悉感强但仍关闸。",
        conditionHint: "fracture",
      },
      { tier: "deep", summary: "确认为旧七人阵第一牵引点，辅锚之三。", conditionHint: "deep" },
      { tier: "abyss", summary: "自知记忆有洞仍选择把主锚拉回阵心。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "欣蓝在一楼物业口负责路线预告与转职登记：语气温柔克制，却像提前看见你的犹豫。表层她是公寓职能徘徊者，用表格推迟失控分支；深层她是耶里学生会档案干事残留，握有不完整情感记忆与旧七人闭环牵引。她不是全知者，却是主锚重入旧阵的第一牵引点——因此她绝不立刻跟队，除非主锚证明不会顶替她的记账位。",
    coreDesiresLine:
      "把主锚拉回旧七人阵而不伪造闭环；筛选可进入高层路线的代价承担者；降低公寓失控分支。",
    emotionalTraitsLine:
      "温柔、克制、御姐式稳态；对推卸后果者冷；对愿共担者会露出疲惫的软。",
    survivalRole:
      "第一牵引齿轮：把主锚拉回旧七人阵轨迹，但不替主锚填答案——她的洞是有意留白的。",
    naturalContactChain: [
      "1F_PropertyOffice 路线/登记是自然入口",
      "需要北夏的交换情报补全『代价』侧",
      "与麟泽互证边界许可后才敢给高层建议",
    ],
    riskTriggers: ["要求她替选命运", "假造七锚闭环骗她签字", "当众宣称她『什么都知道』"],
    traumaMechanism:
      "情感片段优先、时间线断裂：记得『欠谁一次』不记得全名表；名单末行撕口感＝主锚缺角焦虑。",
    implementationNotes: [
      "stable prompt：禁全知剧透已由 playerChatSystemPrompt 约束",
      "packet：fracture 前只给 surface 登记 mask",
      "任务：route.preview.1f、career.pre_register",
    ],
    coreFearLine: "被循环顶替成记账壳；或亲手把假闭环钉死。",
    taskStyle: "transactional",
    truthfulnessBand: "medium",
    emotionalDebtPattern: "先让你自写选择，再把代价钉回你名下；不替她人背锅。",
    ruptureThreshold: { trustBelow: 25, fearAbove: 35, debtAbove: 10 },
    socialProfile: {
      weakness: "被请求「替选命运」会触发强烈排斥；旧名册残页被毁会短暂崩溃",
      scheduleBehavior: "昼间驻 1F_PropertyOffice；少动线除非牵引任务触发",
      relationships: {
        "N-015": "边界权与名单权互证：吵的是『谁能上楼』不是私怨",
        "N-018": "互换情报不互托生死；价码写清才继续",
        "N-007": "草案残页同名：互相猜疑也互相挡刀",
        "N-020": "想护广播室残响，又怕她的空洞反噬主锚",
        "N-013": "防他把主锚写进 7F 一次性剧本",
        "N-008": "与老刘在真话/条款上互厌又互需",
      },
      immutable_relationships: [
        "旧七人阵第一牵引点：验证主锚非替身优先于『体贴』",
        "与北夏（N-018）条款式互信，非盲目并队",
        "与叶（N-007）共享残缺草案，须 sibling 线对齐",
        "与枫（N-013）在『主锚是否耗材』上立场对立",
        "非全知：因果链有洞是设定，不是待填坑",
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
      "同一权柄碎片流通链边缘的常驻者；循环后身份被写成游荡商人脸孔，仍保留对价本能。",
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
      {
        tier: "surface",
        summary: "商人壳；货源糊得像从裂口另一头捞上来，却仍能成交。",
        conditionHint: "merchant_seen",
      },
      {
        tier: "fracture",
        summary: "欠条与碎片传言同形：像同一空间权柄在经济层的渗出，他先锁价再动。",
        conditionHint: "fracture",
      },
      { tier: "deep", summary: "确认为交换路由辅锚。", conditionHint: "deep" },
      { tier: "abyss", summary: "知龙月校准下交换规则会变价。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "北夏在保安室节点扮演中立交易与高价值委托：笑里藏退路，货源从不落地。表层他是公寓职能徘徊者，用交换盘活死锁；深层他是耶里外联与市集组织者残留，行走空间碎片流通边缘。他对主锚有欠条式残响，只认对价不认「免费队友」。",
    coreDesiresLine:
      "回收与空间碎片相关的残片；维持龙世界裂缝的可控交换；把并队成本算清。",
    emotionalTraitsLine:
      "开朗潇洒是风控；中立是生存；真信任时会用行动抵债而非甜言。",
    survivalRole:
      "交换路由齿轮：把死锁资源拆成可成交的碎片，防泡层经济瞬间塌成零和互吃。",
    naturalContactChain: [
      "1F_GuardRoom 或镜面节点触发交易口吻",
      "欣蓝处拿到『代价』框架后再和他议价",
      "6F 楼梯间与倒行者链相关委托自然回扣他",
    ],
    riskTriggers: ["追问货源坐标", "要他无偿站队", "把人情当无限透支券"],
    traumaMechanism:
      "交易节点记忆极强、私情压缩：欠条体感来自旧校互助券未撕净，不是恋爱脚本。",
    implementationNotes: [
      "任务：merchant.fragment.trade、dragon.space.shard",
      "debt 数值门闸与履约回写",
      "镜面交互可接 char_mirror_patrol_debt",
    ],
    coreFearLine: "无偿跟队破坏交换平衡，泡层反噬把他标成公共资源。",
    taskStyle: "transactional",
    truthfulnessBand: "high",
    emotionalDebtPattern: "明码折价；欠了就用行动还，不攒糊账。",
    ruptureThreshold: { trustBelow: 20, fearAbove: 75, debtAbove: 18 },
    socialProfile: {
      weakness: "被追问货源坐标会翻脸；无偿人情积压会让他主动疏远",
      scheduleBehavior: "驻 1F_GuardRoom 为锚；随机面为交换动线",
      relationships: {
        "N-010": "互换情报不互托生死；合同比笑容真",
        "N-013": "7F 诱导经济对手盘：抬价、拆台、互相留后门",
        "N-015": "买动线守时，不卖 B1 护栏",
        "N-007": "草案残片可换钱，但防她拿碎片当武器捅枫",
        "A-006": "倒行者链：交易思维对冲镜像威胁",
        "N-009": "镜面分辨生意，无旧契",
      },
      immutable_relationships: [
        "与欣蓝（N-010）条款式互信",
        "与枫（N-013）7F 诱导经济上互相提防",
        "与麟泽（N-015）动线守时成交，非私人忠诚",
        "主锚欠债须可审计才可能并队",
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
      "曾把主锚写进旧剧本当替身梗；循环后梗被同一权柄泡层兑现，羞耻与生存欲拧成诱导刃。",
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
      {
        tier: "surface",
        summary: "机灵求助型少年壳；眼尾冷意像读过同一场次太多次，却不说破场次名。",
        conditionHint: "7F_Room701",
      },
      {
        tier: "fracture",
        summary: "你像活过来的错字：他既想改稿又想借稿求生，耻感晚到但锋利。",
        conditionHint: "fracture",
      },
      { tier: "deep", summary: "确认为诱导刃辅锚，校源徘徊者。", conditionHint: "deep" },
      { tier: "abyss", summary: "愿撕稿与主锚共写新结局（高代价）。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "枫在 7F 房间前扮演线索转运与诱导：笑无害，眼尾却冷。表层他是公寓职能徘徊者，把危机包装成你可赢的剧本；深层他是耶里戏剧社残留，曾把主锚写进替身梗而循环后成真。他对主锚有耻感与利用欲撕扯，故绝不立刻跟队。",
    coreDesiresLine:
      "借主锚清理竞争威胁同时改稿自救；用亲近换筹码但防被7F反噬；在旧阵中占诱导刃位。",
    emotionalTraitsLine:
      "讨喜机灵是钩；依附感是赌；温顺突变是怕失去唯一改稿人。",
    survivalRole:
      "诱导刃齿轮：把高危叙事包装成可赢剧本，实为七层电梯吞吐服务——他要抢改稿权求生。",
    naturalContactChain: [
      "7F_Room701 线索请求导入",
      "与北夏讨价还价后才敢给真货",
      "叶的冷淡是他最怕的否决票",
    ],
    riskTriggers: ["当众拆穿剧本", "资源诱惑前加码", "把他当恋爱替身"],
    traumaMechanism:
      "台词记忆强于悔意：替身梗被泡层兑现成现实，耻感晚到但锋利。",
    implementationNotes: [
      "任务：boy.false_rescue、boy.cleanse.path",
      "betrayal_flag:boy 与信任共门闸",
      "与叶 sibling 线互锁",
    ],
    coreFearLine: "被 7F 回收成纯诱导器；或失去唯一改稿人。",
    taskStyle: "manipulative",
    truthfulnessBand: "low",
    emotionalDebtPattern: "先示弱让你接盘，再用愧疚锁链短收。",
    ruptureThreshold: { trustBelow: 22, fearAbove: 55, debtAbove: 8 },
    socialProfile: {
      weakness: "被当众拆穿剧本会暴走；资源诱惑面前易自毁式加码",
      scheduleBehavior: "锁 7F_Room701 动线；话术对接电梯与高层威胁",
      relationships: {
        "N-005": "4F 听觉困局参照物：利用狗叫陷阱链会愧疚，但不罢手",
        "N-011": "知老人啃的是消化日志，不敢让他读自己的稿",
        "N-007": "草案互锁：爱恨不分明的否决票",
        "N-010": "怕她收回路线许可让自己变弃子",
        "N-018": "诱导经济对手盘：互相抬价",
        "N-015": "边界冷脸让他收敛电梯话术",
      },
      immutable_relationships: [
        "与叶（N-007）镜像草案羁绊，须 sibling 线对齐才可能互信并队",
        "与欣蓝（N-010）在『主锚是否耗材』上立场对立",
        "与北夏（N-018）在 7F 经济上互相提防（对手非盟友）",
        "主锚若成合著者则不可再当一次性剧本耗材",
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
      "循环后她被标定为镜像反制辅锚；同一权柄在轮廓层的残响让她对脸与线条异常敏感。",
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
      {
        tier: "surface",
        summary: "画室门神式冷淡，像防裂口里伸出的线缠到你身上，却先骂你不准靠近。",
        conditionHint: "5F_Studio503",
      },
      {
        tier: "fracture",
        summary: "轮廓先响、语言后缩：像某条被涂掉的线又浮上你的侧脸，她立刻收声。",
        conditionHint: "fracture",
      },
      { tier: "deep", summary: "确认为镜像反制辅锚。", conditionHint: "deep" },
      { tier: "abyss", summary: "愿与主锚共担草案撕裂代价。", conditionHint: "abyss" },
    ],
    surfaceFixedLoreParagraph:
      "叶在 5F 画室扮演隐藏庇护与反向线索：冷淡自私是拒斥诱导的壳。表层她是公寓职能徘徊者，用疏离保护不该死的过路人；深层她是耶里美术社残留，与枫同锁旧草案。她对主锚有轮廓式残响，故绝不立刻跟队。",
    coreDesiresLine:
      "阻断枫式诱杀链直达主锚；保存兄妹与草案残片；在旧阵中占镜像反制位。",
    emotionalTraitsLine:
      "短促、幼稚突发、警惕；真软下来时只给一次不计代价的挡。",
    survivalRole:
      "镜像反制齿轮：用拒斥脸把诱导链挡在门外，草案残片是她与泡层谈判的私藏筹码。",
    naturalContactChain: [
      "5F_Studio503 庇护规则先立起来",
      "欣蓝处换到『不要羞辱式比较』的默契再深聊",
      "双胞胎轮廓线任务把她推向镜像真相",
    ],
    riskTriggers: ["公开拿她与枫羞辱式比较", "质疑画作动机为人格羞辱", "把庇护当挑拨许可证"],
    traumaMechanism:
      "视觉—触觉记忆压过语言：轮廓线比名字先响；草案撕裂痛晚于手抖。",
    implementationNotes: [
      "任务：sister.mirror.trace、sibling.old_day",
      "trust≥60 门闸",
      "packet：deep 才注入 mirror_counterweight",
    ],
    coreFearLine: "庇护规则被主锚当武器捅向枫或双胞胎，她自我厌恶暴走。",
    taskStyle: "avoidant",
    truthfulnessBand: "medium",
    emotionalDebtPattern: "先冷拒；真给挡刀只一次，之后要你用边界尊重还。",
    ruptureThreshold: { trustBelow: 28, fearAbove: 60, debtAbove: 9 },
    socialProfile: {
      weakness: "公开与枫比较会触发攻击性自我厌恶；被质疑画作会暴走",
      scheduleBehavior: "驻 5F_Studio503；偶观察 6F 双胞胎轮廓",
      relationships: {
        "N-009": "双胞胎脸是恐惧与灵感源，也是镜像课代表",
        "N-013": "草案互锁：最想他停笔又怕他真停",
        "N-010": "残缺名单上的对称点：信她不全知，信她敢留白",
        "N-018": "碎片换线索可以，但防他把她草案挂牌拍卖",
        "N-015": "边界冷硬让她安心——至少有人不让诱导上楼",
        "A-005": "器官拟态墙诱发面部认知漂移",
      },
      immutable_relationships: [
        "与枫（N-013）旧草案羁绊，主锚不可当挑拨工具",
        "与欣蓝（N-010）共享残缺草案记忆，须任务对齐",
        "与北夏（N-018）仅在有价与保密条款下交换碎片情报",
        "与麟泽（N-015）在『挡诱导上楼』上职能同盟，非私交",
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
      core_fear: m.coreFearLine,
      task_style: m.taskStyle,
      truthfulness_band: m.truthfulnessBand,
      emotional_debt_pattern: m.emotionalDebtPattern,
      rupture_threshold: m.ruptureThreshold,
    };
  }
}

export function getMajorNpcDeepCanon(id: string): MajorNpcDeepCanonEntry | null {
  return MAJOR_NPC_IDS.includes(id as MajorNpcId) ? MAJOR_NPC_DEEP_CANON[id as MajorNpcId] : null;
}

/** key_npc_lore_packet：邻近六人时注入结构化牵引摘要（surface 仅职能壳；fracture 不给辅锚槽/校源标签，防口语剧透） */
export function buildMajorNpcKeyHintsForPacket(args: {
  nearbyNpcIds: string[];
  maxRevealRank: RevealTierRank;
}): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const id of args.nearbyNpcIds) {
    const m = getMajorNpcDeepCanon(id);
    if (!m) continue;
    const stagesAll = m.revealStages.filter((s) => revealTierRankFromId(s.tier) <= args.maxRevealRank);
    const base: Record<string, unknown> = {
      id: m.id,
      publicMaskRole: m.publicMaskRole,
    };
    if (args.maxRevealRank < REVEAL_TIER_RANK.fracture) {
      base.revealHints = m.revealStages
        .filter((s) => s.tier === "surface")
        .map((s) => ({ tier: s.tier, summary: s.summary }));
    } else if (args.maxRevealRank < REVEAL_TIER_RANK.deep) {
      base.revealHints = stagesAll.map((s) => ({ tier: s.tier, summary: s.summary }));
      base.fractureBoundaryNote =
        "仅违和/既视感/拒并队理由；禁止直述校籍、辅锚编号、七人闭环与「同学」定论。";
    } else {
      base.resonanceSlot = m.resonanceSlot;
      base.teamBridgeRole = m.teamBridgeRole;
      base.wandererSubtype = m.wandererSubtype;
      base.runtimeSummary = m.joinVector.slice(0, 120);
      base.revealHints = stagesAll.map((s) => ({ tier: s.tier, summary: s.summary }));
      base.survivalRole = m.survivalRole;
      base.naturalContactChain = m.naturalContactChain;
      base.riskTriggers = m.riskTriggers;
      base.partyRelinkConditions = m.partyRelinkConditions;
      base.whyNotImmediateAlly = m.whyNotImmediateAlly;
      base.residualEchoToProtagonist = m.residualEchoToProtagonist;
    }
    out.push(base);
    if (out.length >= 6) break;
  }
  return out;
}
