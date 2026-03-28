/**
 * 旧七人阵重连骨架注册表（系统强控数据源）。
 * 叙事与语气交给模型；阶段门槛、牵引类型、禁止 instant party 由本表 + majorNpcRelinkRegistry 计算裁决。
 */

import type { MajorNpcId } from "@/lib/registry/majorNpcDeepCanon";

export type PartyFirstContactMode =
  | "pivot_desk"
  | "b1_boundary"
  | "b1_supply"
  | "trade_desk"
  | "high_floor_front"
  | "atelier_shelter";

/** 阶段 3 主牵引归因（用于 packet，非玩家可见标签必须照抄） */
export type PartyPhase3Traction = "xinlan_pull" | "crisis_pressure" | "deja_resonance" | "mixed";

/** fracture+ packet 中职责回声/残响的提示风格，供叙事约束 */
export type PartyFractureHintStyle =
  | "ledger_soft"
  | "boundary_dry"
  | "warm_buffer"
  | "price_casual"
  | "script_bait"
  | "mirror_cold";

/**
 * 单名辅锚的重连骨架（字段对齐产品文档 party-relink-system）。
 */
export interface PartyRelinkSkeleton {
  npcId: MajorNpcId;
  /** 开局与主锚的职能距离感 */
  initialDistance: "far" | "routine_visible" | "duty_adjacent";
  /** 玩家表层可理解的需求向量（任务/UI 引导用） */
  publicNeedVector: string[];
  /** 自然首次接触模态 */
  firstContactMode: PartyFirstContactMode;
  /** 禁止开场跟队的系统理由（须可机读摘要） */
  antiInstantPartyReason: string;
  /**
   * 三阶段标签：
   * 1 表层职能接触 → 2 旧残响触发 → 3 危机或任务促成旧阵重连
   */
  relinkStageLabels: [string, string, string];
  relinkTriggerTasks: string[];
  relinkTriggerSignals: string[];
  memoryFlashTriggers: string[];
  crisisJoinCondition: string;
  playerDependencyReasons: string[];
  fallbackJoinPath: string;
  /** 随揭露档解锁的叙事许可摘要（由运行时按 maxReveal 裁剪注入） */
  deepRevealUnlocks: string[];
  /** 1–6：团队型任务权重/优先级提示（越大越宜作聚合锚） */
  closedLoopWeight: number;
  /** 好感门槛：阶段 2 / 阶段 3（与图鉴解析一致） */
  trustFloor: { minFavorPhase2: number; minFavorPhase3: number };
  fractureHintStyle: PartyFractureHintStyle;
  /** 为何不立刻并队（玩家体验向一句） */
  whyNotImmediateParty: string;
  /** 为何最终会进入旧闭环（逻辑向，非恋爱） */
  whyEventuallyJoins: string;
  primaryPhase3Traction: PartyPhase3Traction;
  /** 进入该角色深层闭环时玩家须完成的系统向条件摘要 */
  playerMustDoDeepLoop: string[];
  permanentBondConditions: string[];
  requiresXinlanPivotForPhase3: boolean;
  /** 自然接触链（与 public mask 对齐） */
  contactSurfaceDuty: string;
}

export const PARTY_RELINK_REGISTRY: Record<MajorNpcId, PartyRelinkSkeleton> = {
  "N-010": {
    npcId: "N-010",
    initialDistance: "routine_visible",
    firstContactMode: "pivot_desk",
    publicNeedVector: ["登记与路线分流", "上楼风险表册", "职业/转职前置"],
    antiInstantPartyReason: "须验证主锚非顶替其记账位的替身；错误并队会把七锚锁成假闭环",
    relinkStageLabels: ["表层：登记与路线职能", "残响：名单撕口与牵引焦虑", "旧阵：第一牵引入位（仍非全知）"],
    relinkTriggerTasks: ["route.preview", "career.pre_register", "登记", "转职", "物业", "路线", "欣蓝"],
    relinkTriggerSignals: ["relink", "xinlan", "名册", "登记", "七锚", "旧阵", "first_relink"],
    memoryFlashTriggers: ["旧名册铅笔痕", "失败路线影子幻视", "替选命运排斥反应"],
    crisisJoinCondition: "主威胁失控或连续死亡时，更强硬地把主锚按回可审计选择，不替答",
    playerDependencyReasons: ["稳定上楼节奏", "职业认证节点", "表格式后果承担"],
    fallbackJoinPath: "无替代第一牵引；阶段仍受好感/任务/揭露档约束，避免开局剧透",
    deepRevealUnlocks: [
      "fracture：可提「名单与路线同形」但不展开七锚全貌",
      "deep：可明示第一牵引点职责与「记忆有洞」",
      "abyss：可触及替身恐惧与假闭环风险",
    ],
    closedLoopWeight: 6,
    trustFloor: { minFavorPhase2: 12, minFavorPhase3: 50 },
    fractureHintStyle: "ledger_soft",
    whyNotImmediateParty: "她要先把主锚写进可审计的选择，而不是领进私人小队",
    whyEventuallyJoins: "当主锚愿共担后果且旧阵缺角焦虑被任务对齐，她才能把网络重新系上",
    primaryPhase3Traction: "xinlan_pull",
    playerMustDoDeepLoop: [
      "完成 career.pre_register 或同类可审计登记闭环",
      "至少一次明确拒绝「由她代选命运」",
      "在路线上留下可验证的承担记录（任务/图鉴回写）",
    ],
    permanentBondConditions: ["career.pre_register 或同类可审计选择闭环", "主锚至少一次拒绝代选命运"],
    requiresXinlanPivotForPhase3: false,
    contactSurfaceDuty: "治疗向情绪稳态（叙事）/ 登记 / 路线建议 / 异常熟悉感（非全知剧透）",
  },
  "N-015": {
    npcId: "N-015",
    initialDistance: "duty_adjacent",
    firstContactMode: "b1_boundary",
    publicNeedVector: ["B1 安全", "锚点仪式", "越界规避", "电梯动线守时"],
    antiInstantPartyReason: "跟队等于把整道 B1 护栏押在未验证主锚变量上",
    relinkStageLabels: ["表层：边界巡守可见", "残响：守界与共犯验证", "旧阵：辅锚边界相位入列"],
    relinkTriggerTasks: ["anchor.oath", "border.watch", "锚点", "B1", "守夜", "边界", "麟泽"],
    relinkTriggerSignals: ["anchor", "b1_oath", "border", "relink", "七锚"],
    memoryFlashTriggers: ["复活后第一步落点", "雨痕外套", "同一块砖残响"],
    crisisJoinCondition: "死亡回归或锚点告急时被迫与主锚共担封线",
    playerDependencyReasons: ["复活链", "B1 服务与秩序节点"],
    fallbackJoinPath: "危机可短暂并肩，回稳后须补 anchor 类任务验证",
    deepRevealUnlocks: [
      "fracture：可提邻校传言同频，不提校名亦可",
      "deep：可明示辅锚边界相位与主锚复活链锁",
      "abyss：可触及纠错窗口与押注主锚不崩",
    ],
    closedLoopWeight: 5,
    trustFloor: { minFavorPhase2: 10, minFavorPhase3: 55 },
    fractureHintStyle: "boundary_dry",
    whyNotImmediateParty: "他要先确认你不是来压力测试边界的一次性变量",
    whyEventuallyJoins: "危机或誓约任务证明你会把边界当共同责任，他才允许旧阵接轴",
    primaryPhase3Traction: "mixed",
    playerMustDoDeepLoop: [
      "推进 anchor.oath.b1 或等效锚点誓约",
      "在 border.watch 类线索上留下可验证守界行为",
      "信任或图鉴证明非投机闯入者",
    ],
    permanentBondConditions: ["anchor.oath.b1 实质推进", "守界行为可验证回写"],
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "B1 边界 / 锚点见证 / 秩序 / 守线",
  },
  "N-020": {
    npcId: "N-020",
    initialDistance: "routine_visible",
    firstContactMode: "b1_supply",
    publicNeedVector: ["补给", "B1 生活引导", "情绪缓冲", "规则补全"],
    antiInstantPartyReason: "怕记忆空洞把主锚拖进污染广播",
    relinkStageLabels: ["表层：补给员职能", "残响：创伤与 ribbon 信任", "旧阵：人性缓冲辅锚入列"],
    relinkTriggerTasks: ["b1.supply", "memory.ribbon", "补给", "ribbon", "广播", "储备", "灵伤"],
    relinkTriggerSignals: ["ribbon", "supply", "b1_human", "relink"],
    memoryFlashTriggers: ["心悸半步", "高音回避", "主锚步频共振"],
    crisisJoinCondition: "资源断裂或精神崩溃窗口，需要主锚作稳定参照",
    playerDependencyReasons: ["商店/补给叙事", "B1 任务链"],
    fallbackJoinPath: "危机护送后可抬阶段，仍需 ribbon 类叙事封口",
    deepRevealUnlocks: [
      "fracture：可提广播社传言与声线共振",
      "deep：可明示人性缓冲辅锚",
      "abyss：可触及声纹采样真相",
    ],
    closedLoopWeight: 4,
    trustFloor: { minFavorPhase2: 8, minFavorPhase3: 45 },
    fractureHintStyle: "warm_buffer",
    whyNotImmediateParty: "她要先确认你不会猎奇消费她的伤口",
    whyEventuallyJoins: "ribbon 或等价信任证明你会用规则补她漏掉的档，她才敢把旧阵噪声接回",
    primaryPhase3Traction: "deja_resonance",
    playerMustDoDeepLoop: [
      "推进 memory.ribbon 或同类创伤信任任务",
      "禁逼问创伤细节前提下完成情报交换",
      "B1 补给线中至少一次保护性选择（系统可回写）",
    ],
    permanentBondConditions: ["memory.ribbon 推进", "禁逼问创伤细节前提下交换情报"],
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "补给 / 生活引导 / 创伤保护壳",
  },
  "N-018": {
    npcId: "N-018",
    initialDistance: "far",
    firstContactMode: "trade_desk",
    publicNeedVector: ["资源置换", "碎片线", "委托计价", "镜面记录"],
    antiInstantPartyReason: "无偿跟队破坏交换平衡，引泡层反噬",
    relinkStageLabels: ["表层：商人壳", "残响：债务与交换链", "旧阵：交换路由辅锚入列"],
    relinkTriggerTasks: ["merchant.fragment", "dragon.space", "交易", "委托", "欠债", "商人", "北夏"],
    relinkTriggerSignals: ["merchant", "trade", "debt", "shard", "relink"],
    memoryFlashTriggers: ["欠条体感", "互助券", "对价冷笑"],
    crisisJoinCondition: "经济崩盘或战损需紧急置换时接受短期同行计价",
    playerDependencyReasons: ["高价情报/材料入口", "探索驱动委托"],
    fallbackJoinPath: "危机后先签行动价目再并行，仍非全程免费队友",
    deepRevealUnlocks: [
      "fracture：可提货流与空间碎片传言",
      "deep：可明示交换路由辅锚",
      "abyss：可触及龙月变价规则",
    ],
    closedLoopWeight: 3,
    trustFloor: { minFavorPhase2: 10, minFavorPhase3: 40 },
    fractureHintStyle: "price_casual",
    whyNotImmediateParty: "并队必须先计价；空头人情会把他标成公共资源",
    whyEventuallyJoins: "可审计债务与履约回写后，他才把旧阵互助券写回账本",
    primaryPhase3Traction: "crisis_pressure",
    playerMustDoDeepLoop: [
      "merchant.fragment.trade 或等效推进",
      "debt≥10 或等价履约记录",
      "dragon.space.shard 类线索中证明非一次性掠夺交换",
    ],
    permanentBondConditions: ["merchant.fragment.trade 类完成", "可审计债务或等价履约"],
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "交易 / 碎片 / 探索与真相驱动（对价先行）",
  },
  "N-013": {
    npcId: "N-013",
    initialDistance: "far",
    firstContactMode: "high_floor_front",
    publicNeedVector: ["7F 高危线路", "线索转运", "冲破执行", "风险推进"],
    antiInstantPartyReason: "须确认主锚非 7F 试探其忠诚的探针",
    relinkStageLabels: ["表层：友善诱导壳", "残响：剧本与非剥削验证", "旧阵：诱导刃辅锚入列"],
    relinkTriggerTasks: ["boy.false_rescue", "boy.cleanse", "7F", "701", "枫", "诱导"],
    relinkTriggerSignals: ["betrayal_flag:boy", "boy", "induction", "relink"],
    memoryFlashTriggers: ["示弱眼尾冷", "台词既视感", "替身梗耻感"],
    crisisJoinCondition: "主威胁压顶且唯一安全动线经其节点时被迫共走",
    playerDependencyReasons: ["高层推进常经其话术链"],
    fallbackJoinPath: "危机共走后须 boy 线非剥削回写，否则降回阶段 2",
    deepRevealUnlocks: [
      "fracture：可提剧本杀式诱导同构",
      "deep：可明示诱导刃辅锚",
      "abyss：可触及撕稿共写代价",
    ],
    closedLoopWeight: 2,
    trustFloor: { minFavorPhase2: 10, minFavorPhase3: 40 },
    fractureHintStyle: "script_bait",
    whyNotImmediateParty: "他要先确认你不会把他当一次性剧本耗材",
    whyEventuallyJoins: "非剥削选择与清算背叛旗后，他才愿把主锚当合著者接回旧阵",
    primaryPhase3Traction: "mixed",
    playerMustDoDeepLoop: [
      "boy.false_rescue 或 boy.cleanse.path 中非剥削选择（系统回写）",
      "betrayal_flag:boy 未触发或已清算",
      "与叶的 sibling 线互证（防挑拨）",
    ],
    permanentBondConditions: ["boy.false_rescue 或 cleanse 非剥削选择", "betrayal_flag:boy 未触发或已清算"],
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "高危线路 / 冲破与执行 / 风险推进（话术包装）",
  },
  "N-007": {
    npcId: "N-007",
    initialDistance: "far",
    firstContactMode: "atelier_shelter",
    publicNeedVector: ["5F 庇护", "逆向线索", "镜像轴", "规则质疑"],
    antiInstantPartyReason: "怕主锚是枫派试探；跟队会把庇护暴露成武器",
    relinkStageLabels: ["表层：画室拒斥壳", "残响：庇护规则与共感", "旧阵：镜像反制辅锚入列"],
    relinkTriggerTasks: ["sister.mirror", "sibling.old_day", "503", "画室", "叶", "镜像"],
    relinkTriggerSignals: ["sibling", "mirror", "studio503", "relink"],
    memoryFlashTriggers: ["轮廓违和", "抱臂门边", "虹膜步态既视感"],
    crisisJoinCondition: "主锚被诱导链锁死，仅其庇护规则可断链时短暂并线",
    playerDependencyReasons: ["逆向线索与隐藏真相节点"],
    fallbackJoinPath: "危机断链后须 sibling 任务对齐，否则维持职责距离",
    deepRevealUnlocks: [
      "fracture：可提画与镜像污染轴共振",
      "deep：可明示镜像反制辅锚",
      "abyss：可触及草案撕裂共担",
    ],
    closedLoopWeight: 1,
    trustFloor: { minFavorPhase2: 12, minFavorPhase3: 60 },
    fractureHintStyle: "mirror_cold",
    whyNotImmediateParty: "她要先把庇护规则立住，而不是把门向未知主锚敞开",
    whyEventuallyJoins: "任务证明你不会拿她当羞辱枫的工具时，她才把草案残片接回旧阵",
    primaryPhase3Traction: "deja_resonance",
    playerMustDoDeepLoop: [
      "sister.mirror.trace 或 sibling.old_day 推进",
      "信任≥60 或等价回写",
      "禁止公开羞辱式与枫比较",
    ],
    permanentBondConditions: ["sister.mirror.trace 或 sibling.old_day 推进", "公开羞辱式比较未发生"],
    requiresXinlanPivotForPhase3: true,
    contactSurfaceDuty: "庇护 / 逆向线索 / 质疑与镜像反制",
  },
};
