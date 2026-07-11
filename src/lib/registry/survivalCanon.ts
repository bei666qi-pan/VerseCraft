/**
 * Survival Canon — 如月公寓生存系统：阈值、消耗品、伤害、环境
 *
 * 定义玩家在公寓内面对的所有生存维度量化数据。
 * 扩展自圣经第 12 章及世界观设定，覆盖食物、水源、疲劳、理智、
 * 伤害与治疗、物品腐败、楼层环境危害、内部气候八个子系统。
 * DM 编排时参照本文件确保生存体验的一致性与可信度。
 */

// ════════════════════════════════════════════
// Section 1: 食物（现有 + 扩展）
// ════════════════════════════════════════════

/** 饥饿阶段阈值（单位：跳过用餐次数） */
export const HUNGER_THRESHOLDS = {
  /** 轻度饥饿：影响专注与判断 */
  mild: 3,
  /** 中度饥饿：体力下降、轻度幻觉可能 */
  moderate: 6,
  /** 重度饥饿：濒危状态，战斗力大幅下降 */
  severe: 10,
} as const;

/** 公寓内获取食物的主要途径 */
export type FoodSource =
  | "7F_kitchen_share"     // 陶师傅共享食物
  | "B1_rations"           // B1 补给（灵伤售卖）
  | "room_search"          // 房间搜索
  | "trade_goods"          // 北夏交易
  | "originium_purchase"   // 源质购买
  | "hunt_vermin"          // 猎杀鼠类/虫类（高风险）
  | "forage_mold";         // 采集可食用霉菌（B1/B2）

/** 公寓内具体食物条目 */
export interface FoodEntry {
  name: string;
  /** 饱腹度（0-10，10=一顿饱餐） */
  satiety: number;
  /** 可能发现途径 */
  sources: FoodSource[];
  /** 是否安全（false 意味着可能造成伤害或认知影响） */
  safe: boolean;
  /** 腐败时间（小时，达到后变为"变质"状态；-1=不腐败） */
  spoilageHours: number;
  /** 特殊说明 */
  note: string;
}

export const APARTMENT_FOODS: readonly FoodEntry[] = [
  { name: "陶师傅炖菜", satiety: 8, sources: ["7F_kitchen_share"], safe: true, spoilageHours: 48, note: "每晚餐点供应，食材来源不明但味道正常" },
  { name: "压缩饼干", satiety: 4, sources: ["B1_rations", "room_search"], safe: true, spoilageHours: -1, note: "标准配给，口感干涩但耐储" },
  { name: "罐头食品", satiety: 5, sources: ["room_search", "trade_goods"], safe: true, spoilageHours: -1, note: "品牌和年限随机，部分已过期但密封完好可食用" },
  { name: "方便面", satiety: 3, sources: ["B1_rations", "room_search"], safe: true, spoilageHours: -1, note: "常见的储备食品，需要热水" },
  { name: "干粮/馒头", satiety: 4, sources: ["7F_kitchen_share", "trade_goods"], safe: true, spoilageHours: 72, note: "陶师傅偶尔多做，凉了也能吃" },
  { name: "北夏的巧克力", satiety: 2, sources: ["trade_goods"], safe: true, spoilageHours: 120, note: "北夏库存中的稀缺品，交易价格高" },
  { name: "不明肉干", satiety: 3, sources: ["trade_goods", "originium_purchase"], safe: false, spoilageHours: 168, note: "可能是鼠肉或更糟——食用有 20% 概率触发轻微消化反应（理智 -1）" },
  { name: "红色果冻状物质", satiety: 1, sources: ["forage_mold"], safe: false, spoilageHours: 24, note: "B1 墙角渗出的胶质物。勉强可食，但每食用一次加速 1% 同化进度" },
  { name: "烤鼠肉", satiety: 3, sources: ["hunt_vermin"], safe: true, spoilageHours: 36, note: "需要成功猎杀并自行烹饪；陶师傅可代加工" },
  { name: "地下室蘑菇", satiety: 2, sources: ["forage_mold"], safe: true, spoilageHours: 12, note: "B1 至 B2 楼梯间生长的灰色菌类；煮熟后安全，生食有 30% 概率致幻" },
  { name: "过期面包", satiety: 3, sources: ["room_search"], safe: true, spoilageHours: 24, note: "从空房间翻出，大多已硬化，泡水后可食" },
] as const;

/** 每日最低食物需求（饱腹度单位） */
export const DAILY_CALORIC_REQUIREMENT = 8;

/** 跳过一餐后饥饿度累积 */
export const HUNGER_PER_SKIP = 1;

// ── 腐败系统 ──

/** 腐败程度 */
export type SpoilageLevel = "fresh" | "stale" | "spoiled" | "toxic";

/** 腐败阶段对应的效果 */
export const SPOILAGE_EFFECTS: Record<SpoilageLevel, { hoursPast: number; effect: string }> = {
  fresh: { hoursPast: 0, effect: "正常食用" },
  stale: { hoursPast: 1, effect: "口感变差，饱腹度 -1，无额外风险" },
  spoiled: { hoursPast: 2, effect: "食用可能引起呕吐（体质判定 DC 10），理智 -2" },
  toxic: { hoursPast: 3, effect: "食用必定触发中毒（造成 1d4+1 伤害），理智 -4" },
} as const;

/**
 * 各楼层腐败加速倍数。
 * 温度越高、湿度越大 → 腐败越快。
 */
export const SPOILAGE_FLOOR_MULTIPLIERS: Record<string, number> = {
  B2: 0.5,   // 寒冷干燥 → 腐败极慢
  B1: 0.7,   // 阴凉 → 较慢
  "1": 1.0,  // 常温基准
  "2": 1.0,  // 常温
  "3": 1.1,  // 略暖
  "4": 1.2,  // 暖气管道旁 → 微暖
  "5": 0.9,  // 略凉爽
  "6": 1.3,  // 潮热
  "7": 1.5,  // 厨房热源 → 腐败最快
};

/** 保存方法 */
export type PreservationMethod = "none" | "salt" | "smoke" | "dry" | "cold_storage" | "ferment";

export const PRESERVATION_METHODS: Record<PreservationMethod, { description: string; shelfLifeMultiplier: number }> = {
  none:          { description: "无处理", shelfLifeMultiplier: 1.0 },
  salt:          { description: "盐渍", shelfLifeMultiplier: 4.0 },
  smoke:         { description: "烟熏", shelfLifeMultiplier: 5.0 },
  dry:           { description: "风干/脱水", shelfLifeMultiplier: 6.0 },
  cold_storage:  { description: "冷藏（B1 储物间冰柜）", shelfLifeMultiplier: 3.0 },
  ferment:       { description: "发酵", shelfLifeMultiplier: 8.0 },
} as const;

// ════════════════════════════════════════════
// Section 2: 水源（现有 + 扩展）
// ════════════════════════════════════════════

/** 脱水阶段阈值（单位：小时） */
export const DEHYDRATION_THRESHOLDS = {
  /** 开始出现脱水症状 */
  onset: 12,
  /** 严重脱水，危及行动能力 */
  severe: 24,
} as const;

/** 红色自来水警告 */
export const RED_WATER_WARNING =
  "自来水不可直接饮用——红色液体含高浓度胃酸与消化沉淀物。" +
  "静置 12 小时后胃酸沉降可降低毒性，但仍有微弱消化活性。" +
  "频繁饮用会加速被公寓同化。";

/** 公寓内所有水源 */
export interface WaterSourceEntry {
  name: string;
  /** 安全等级：safe=直接饮用 / conditional=需处理 / dangerous=不可饮用 */
  safety: "safe" | "conditional" | "dangerous";
  /** 获取位置 */
  locations: string[];
  /** 同化加速值（每次饮用，百分比点） */
  assimilationPerDrink: number;
  /** 特殊说明 */
  note: string;
}

export const WATER_SOURCES: readonly WaterSourceEntry[] = [
  {
    name: "红色自来水",
    safety: "dangerous",
    locations: ["所有楼层水龙头"],
    assimilationPerDrink: 3,
    note: RED_WATER_WARNING,
  },
  {
    name: "静置沉淀水",
    safety: "conditional",
    locations: ["所有楼层（需静置 12h）"],
    assimilationPerDrink: 0.5,
    note: "自来水静置 12h 后胃酸沉降，毒性大幅降低。仍有微量残留，长期饮用仍会缓慢加速同化",
  },
  {
    name: "煮沸沉淀水",
    safety: "safe",
    locations: ["7F 厨房", "任何有明火处"],
    assimilationPerDrink: 0.1,
    note: "静置后煮沸 10 分钟 → 几乎完全去毒。最安全的水源方式",
  },
  {
    name: "B1 储备水",
    safety: "safe",
    locations: ["B1 储蓄间"],
    assimilationPerDrink: 0,
    note: "公寓异变前储存的桶装纯净水。有限存量，灵伤管理，需交易或用任务换取",
  },
  {
    name: "冷凝水",
    safety: "conditional",
    locations: ["B2 管道壁", "6F 窗台（夜间）"],
    assimilationPerDrink: 0.3,
    note: "管道表面冷凝收集的液体。微含空间残余，但不显著。收集效率低（每 2h 获取 1 份）",
  },
  {
    name: "不明来源瓶装水",
    safety: "conditional",
    locations: ["房间搜索", "北夏交易"],
    assimilationPerDrink: 1,
    note: "标记完好但来源不明的水瓶。可能是异变前遗留，也可能是公寓「生成」的陷阱——饮用前仔细观察标签",
  },
] as const;

/** 每日最低饮水量（单位：水源摄取次数） */
export const DAILY_WATER_REQUIREMENT = 3;

// ════════════════════════════════════════════
// Section 3: 疲劳系统（新增）
// ════════════════════════════════════════════

/** 疲劳等级 */
export type FatigueLevel = "fresh" | "tired" | "weary" | "exhausted" | "collapsed";

/** 疲劳阶段阈值与效果 */
export const FATIGUE_THRESHOLDS: Record<FatigueLevel, { minExertion: number; effect: string; combatPenalty: number }> = {
  fresh:     { minExertion: 0,   effect: "正常状态",                                     combatPenalty: 0 },
  tired:     { minExertion: 6,   effect: "行动略显迟缓，感知判定 -1",                      combatPenalty: 1 },
  weary:     { minExertion: 12,  effect: "体力明显下降，搬重物/爬楼梯消耗加倍",               combatPenalty: 2 },
  exhausted: { minExertion: 20,  effect: "每回合需休息一次，否则可能晕厥",                    combatPenalty: 4 },
  collapsed: { minExertion: 30,  effect: "无法行动——必须强制休息 ≥4 小时",                  combatPenalty: 99 },
} as const;

/** 各行动的基础疲劳点 */
export const EXERTION_COSTS: Record<string, number> = {
  climb_one_flight:  1,   // 爬一层楼梯
  descend_one_flight: 0.5, // 下一层楼梯（轻松）
  combat_round:      2,   // 一回合战斗
  sprint_30min:      2,   // 持续奔跑 30 分钟
  carry_heavy:       1,   // 搬运重物（每次移动楼层）
  search_room:       0.5, // 搜索一个房间
  craft_1h:          1,   // 制作/修理 1 小时
  fight_boss_round:  3,   // 与 BOSS 级战斗一回合
  swim:              3,   // 涉水/游泳
  dig:               2,   // 挖掘/撬开障碍
};

/** 疲劳自然恢复（每 10 分钟）
 *  休息状态（坐/靠墙）| 睡眠状态 */
export const FATIGUE_RECOVERY = {
  resting: 0.5,   // 每 10 分钟休息恢复 0.5 点
  sleeping: 2,    // 每 10 分钟睡眠恢复 2 点
} as const;

// ════════════════════════════════════════════
// Section 4: 理智系统（大幅扩展）
// ════════════════════════════════════════════

/** 理智状态等级 */
export type SanityLevel = "stable" | "uneasy" | "disturbed" | "fragile" | "broken";

/** 理智阶段阈值与效果 */
export const SANITY_THRESHOLDS: Record<SanityLevel, { max: number; effect: string }> = {
  stable:   { max: 100, effect: "认知正常，能做出理性判断" },
  uneasy:   { max: 75,  effect: "轻度焦虑，偶尔出现直觉偏差；社交判定 -1" },
  disturbed: { max: 50, effect: "幻觉边缘，无法区分部分真实与幻象；战斗判定 -2，可能会误伤友军" },
  fragile:  { max: 25,  effect: "严重认知损伤，记忆断层加剧；无法完成复杂推理，有自毁倾向可能" },
  broken:   { max: 0,   effect: "认知崩溃——角色暂时或永久失去行动能力，取决于环境和救援" },
} as const;

/** 理智伤害事件表 */
export interface SanityDamageEvent {
  id: string;
  /** 事件描述 */
  description: string;
  /** 基础理智伤害 */
  baseDamage: number;
  /** 是否可被当前理智状态减免 */
  reducible: boolean;
}

export const SANITY_DAMAGE_EVENTS: readonly SanityDamageEvent[] = [
  { id: "SDEATH_WITNESS",   description: "目睹其他住户死亡/被消化",                       baseDamage: 15, reducible: true },
  { id: "SDEATH_SELF",      description: "自身死亡/回声重建",                                baseDamage: 20, reducible: false },
  { id: "SDARK_10",         description: "在完全黑暗中停留 ≥10 分钟",                        baseDamage: 5,  reducible: true },
  { id: "SDARK_30",         description: "在完全黑暗中停留 ≥30 分钟",                        baseDamage: 12, reducible: true },
  { id: "SDARK_120",        description: "在完全黑暗中停留 ≥2 小时",                         baseDamage: 25, reducible: false },
  { id: "SANOMALY_DIRECT",  description: "直接目击空间异变（天花板融化/墙内血管蠕动等）",    baseDamage: 10, reducible: true },
  { id: "SANOMALY_TOUCH",   description: "接触到异变体（墙壁血管/蠕动管道等）",             baseDamage: 8,  reducible: true },
  { id: "SMEMORY_FLASH",    description: "经历记忆闪流——他人的记忆片段强行植入",            baseDamage: 8,  reducible: false },
  { id: "SMEMORY_SHATTER",  description: "碎裂阶段——主动崩解回声体壳",                      baseDamage: 15, reducible: false },
  { id: "STORTURE",         description: "遭受公寓的主动精神攻击/扭曲空间囚禁",               baseDamage: 18, reducible: true },
  { id: "SISOLATION_24H",   description: "独自一人超过 24 小时无任何社交接触",               baseDamage: 3,  reducible: true },
  { id: "SBETRAYAL",        description: "被信任的 NPC 背叛/欺骗",                           baseDamage: 12, reducible: true },
  { id: "SREVELATION",      description: "获知重大世界观真相（如自己并非原主的事实）",        baseDamage: 10, reducible: false },
  { id: "SREVELATION_DEEP", description: "获知公寓本质、龙、消化系统等终极真相",             baseDamage: 18, reducible: false },
  { id: "SLOOP_DEJA_VU",    description: "循环中经历强烈的既视感——意识到自己曾在此处死过", baseDamage: 6,  reducible: true },
] as const;

/** 理智自然恢复速率（每自然日，基于休息质量） */
export const SANITY_RECOVERY_RATES = {
  safe_sleep:  15,  // 在安全楼层充分睡眠 → 恢复 15 点
  risky_sleep: 8,   // 在风险楼层睡眠 → 恢复 8 点
  no_sleep:    2,   // 不睡眠但充分休息 → 恢复 2 点
  social_bonus: 5,  // 与关系 ≥5 的 NPC 深入交流一次 → 额外恢复 5 点
  comfort_item: 3,  // 使用安慰物品（如陈婆婆的织品等） → 恢复 3 点
} as const;

/** 各周期相位理智伤害倍率 */
export const PHASE_SANITY_MODIFIERS = {
  QUIESCENCE:       1.0, // 平静期——基准
  CALIBRATION:      1.2, // 校准期——公寓开始调整，压力略升
  PRECURSOR:        1.5, // 前兆期——空间不稳定，理智压力增大
  CORRECTION_WINDOW: 1.8, // 修正窗口——最高风险
} as const;

// ════════════════════════════════════════════
// Section 5: 伤害、健康与疾病系统（新增）
// ════════════════════════════════════════════

/** 伤害/疾病等级 */
export type InjurySeverity = "minor" | "moderate" | "severe" | "critical" | "fatal";

/** 伤害类型 */
export type InjuryType =
  | "cut"           // 切割伤
  | "bruise"        // 钝器伤/瘀伤
  | "fracture"      // 骨折
  | "burn"          // 烧伤
  | "corrosion"     // 腐蚀（消化液/红色液体）
  | "infection"     // 感染
  | "cognitive"     // 认知损伤（空间异变导致）
  | "asphyxiation"  // 窒息
  | "poison"        // 中毒
  | "anomaly";      // 空间异常伤害（不可名状）

/** 伤势条目 */
export interface InjuryEntry {
  /** 伤害类型 */
  type: InjuryType;
  /** 严重程度 */
  severity: InjurySeverity;
  /** 基础治愈时间（小时，无医疗干预下） */
  baseHealHours: number;
  /** 各治疗层级的治愈时间倍率（null = 该层级无法处理） */
  treatmentMultiplier: Record<TreatmentTier, number | null>;
  /** 是否可能造成永久损伤 */
  permanentPossible: boolean;
  /** 描述 */
  description: string;
}

/** 引用 TreatmentTier 但避免循环依赖 */
type TreatmentTier = "self" | "basic" | "professional" | "emergency";

export const INJURY_CATALOG: readonly InjuryEntry[] = [
  { type: "cut",       severity: "minor",    baseHealHours: 24,  treatmentMultiplier: { self: 1.0, basic: 0.5, professional: 0.2, emergency: 0.1 }, permanentPossible: false, description: "浅表切口，出血少" },
  { type: "cut",       severity: "moderate", baseHealHours: 72,  treatmentMultiplier: { self: 1.0, basic: 0.5, professional: 0.25, emergency: 0.1 }, permanentPossible: false, description: "深层切口，需缝合" },
  { type: "cut",       severity: "severe",   baseHealHours: 168, treatmentMultiplier: { self: null, basic: 1.0, professional: 0.3, emergency: 0.15 }, permanentPossible: true, description: "大动脉受损或大面积撕脱伤" },
  { type: "bruise",    severity: "minor",    baseHealHours: 12,  treatmentMultiplier: { self: 1.0, basic: 0.7, professional: 0.4, emergency: 0.2 }, permanentPossible: false, description: "轻度瘀青" },
  { type: "bruise",    severity: "moderate", baseHealHours: 48,  treatmentMultiplier: { self: 1.0, basic: 0.6, professional: 0.3, emergency: 0.15 }, permanentPossible: false, description: "深部软组织挫伤" },
  { type: "bruise",    severity: "severe",   baseHealHours: 120, treatmentMultiplier: { self: null, basic: 1.0, professional: 0.4, emergency: 0.2 }, permanentPossible: true, description: "内脏挫伤/大范围血肿" },
  { type: "fracture",  severity: "moderate", baseHealHours: 240, treatmentMultiplier: { self: null, basic: null, professional: 0.5, emergency: 0.3 }, permanentPossible: true, description: "单纯骨折，需复位固定" },
  { type: "fracture",  severity: "severe",   baseHealHours: 480, treatmentMultiplier: { self: null, basic: null, professional: 1.0, emergency: 0.4 }, permanentPossible: true, description: "粉碎性骨折/开放性骨折" },
  { type: "fracture",  severity: "critical", baseHealHours: 720, treatmentMultiplier: { self: null, basic: null, professional: null, emergency: 1.0 }, permanentPossible: true, description: "多发性骨折伴内脏损伤" },
  { type: "burn",      severity: "minor",    baseHealHours: 18,  treatmentMultiplier: { self: 1.0, basic: 0.5, professional: 0.25, emergency: 0.1 }, permanentPossible: false, description: "一度烧伤，表皮红肿" },
  { type: "burn",      severity: "moderate", baseHealHours: 96,  treatmentMultiplier: { self: 1.0, basic: 0.6, professional: 0.3, emergency: 0.15 }, permanentPossible: true, description: "二度烧伤，水泡形成" },
  { type: "burn",      severity: "severe",   baseHealHours: 360, treatmentMultiplier: { self: null, basic: null, professional: 0.5, emergency: 0.25 }, permanentPossible: true, description: "三度烧伤，皮肤全层损毁" },
  { type: "corrosion", severity: "moderate", baseHealHours: 48,  treatmentMultiplier: { self: null, basic: 1.0, professional: 0.4, emergency: 0.2 }, permanentPossible: true, description: "消化液轻度灼伤，持续微痛" },
  { type: "corrosion", severity: "severe",   baseHealHours: 168, treatmentMultiplier: { self: null, basic: null, professional: 0.6, emergency: 0.3 }, permanentPossible: true, description: "消化液深度侵蚀，已伤及筋膜" },
  { type: "infection", severity: "minor",    baseHealHours: 48,  treatmentMultiplier: { self: 1.0, basic: 0.4, professional: 0.2, emergency: 0.1 }, permanentPossible: false, description: "浅表伤口感染，红肿" },
  { type: "infection", severity: "moderate", baseHealHours: 120, treatmentMultiplier: { self: null, basic: 0.6, professional: 0.3, emergency: 0.15 }, permanentPossible: true, description: "蜂窝织炎/深部感染" },
  { type: "infection", severity: "severe",   baseHealHours: 240, treatmentMultiplier: { self: null, basic: null, professional: 0.5, emergency: 0.25 }, permanentPossible: true, description: "败血症——全身性感染" },
  { type: "poison",    severity: "moderate", baseHealHours: 24,  treatmentMultiplier: { self: 1.0, basic: 0.5, professional: 0.25, emergency: 0.1 }, permanentPossible: false, description: "食物中毒或轻度毒物" },
  { type: "poison",    severity: "severe",   baseHealHours: 72,  treatmentMultiplier: { self: null, basic: null, professional: 0.5, emergency: 0.25 }, permanentPossible: true, description: "重度中毒，器官功能受损" },
  { type: "cognitive", severity: "moderate", baseHealHours: 48,  treatmentMultiplier: { self: null, basic: 1.0, professional: 0.5, emergency: 0.3 }, permanentPossible: false, description: "轻度认知碎片化，记忆短暂混乱" },
  { type: "cognitive", severity: "severe",   baseHealHours: 240, treatmentMultiplier: { self: null, basic: null, professional: 1.0, emergency: 0.5 }, permanentPossible: true, description: "严重认知侵蚀，人格片段丢失" },
  { type: "anomaly",   severity: "severe",   baseHealHours: 360, treatmentMultiplier: { self: null, basic: null, professional: null, emergency: 1.0 }, permanentPossible: true, description: "空间异常伤害——常规医学无法处理，需特殊手段" },
] as const;

/** 未处理伤口感染概率（每小时，未消毒/未包扎情况下） */
export const WOUND_INFECTION_CHANCE = {
  clean_env:    0.01, // 清洁环境（B1 等）
  normal_env:   0.03, // 普通环境（1-5F 走廊）
  dirty_env:    0.06, // 脏污环境（B2、6F 管道间）
  contaminated: 0.10, // 污染环境（红色液体接触区、7F 深层）
} as const;

/** 公寓内可能的疾病 */
export interface DiseaseEntry {
  name: string;
  /** 症状 */
  symptoms: string[];
  /** 感染途径 */
  transmission: string;
  /** 潜伏期（小时） */
  incubationHours: number;
  /** 基础病程（小时，若无治疗） */
  durationHours: number;
  /** 是否可治疗 */
  curable: boolean;
  /** 是否需要林医生专业治疗 */
  requiresProfessional: boolean;
  /** 致死性（0-1） */
  fatalityRate: number;
}

export const APARTMENT_DISEASES: readonly DiseaseEntry[] = [
  {
    name: "红锈咳",
    symptoms: ["持续干咳", "痰中带红色颗粒", "夜间加重", "嗅觉逐渐丧失"],
    transmission: "吸入 B2 区域飘散的红色粉尘",
    incubationHours: 24,
    durationHours: 120,
    curable: true,
    requiresProfessional: true,
    fatalityRate: 0.15,
  },
  {
    name: "镜面热",
    symptoms: ["高烧（39-40°C）", "皮肤出现镜面样反光斑", "幻视", "畏光"],
    transmission: "长时间暴露于 6F 镜像层",
    incubationHours: 12,
    durationHours: 72,
    curable: true,
    requiresProfessional: true,
    fatalityRate: 0.25,
  },
  {
    name: "空间眩晕症",
    symptoms: ["持续性眩晕", "空间定向障碍", "恶心", "偶尔看见「错误的走廊」"],
    transmission: "频繁穿越异常空间区域",
    incubationHours: 6,
    durationHours: 48,
    curable: true,
    requiresProfessional: false,
    fatalityRate: 0,
  },
  {
    name: "消化热",
    symptoms: ["低热持续", "食欲大增但对正常食物无感", "对红色液体产生渴望", "情绪淡漠"],
    transmission: "频繁饮用未处理红色自来水 / 长期接触 B2 区域",
    incubationHours: 48,
    durationHours: 168,
    curable: false,
    requiresProfessional: true,
    fatalityRate: 0.6,
  },
  {
    name: "记忆枯竭症",
    symptoms: ["近期记忆快速流失", "无法形成新记忆", "人格平淡化", "对外界刺激反应减弱"],
    transmission: "死亡 3 次以上 / 经历过度认知伤害",
    incubationHours: 0,
    durationHours: 0,
    curable: false,
    requiresProfessional: false,
    fatalityRate: 0,
  },
] as const;

/** 永久损伤条目 */
export interface PermanentDamageEntry {
  name: string;
  /** 触发条件 */
  trigger: string;
  /** 效果 */
  effect: string;
  /** 是否可逆转 */
  reversible: boolean;
  /** 逆转条件（如可逆转） */
  reversalCondition?: string;
}

export const PERMANENT_DAMAGES: readonly PermanentDamageEntry[] = [
  { name: "瘸腿", trigger: "骨折未经专业治疗愈合", effect: "爬楼梯消耗 +1 疲劳点；奔跑判定 -2", reversible: false },
  { name: "失指", trigger: "严重切割伤延迟治疗", effect: "精细操作判定 -1", reversible: false },
  { name: "疤痕面容", trigger: "三度烧伤未及时治疗", effect: "社交判定 -1（部分 NPC 反应不同）", reversible: false },
  { name: "慢性咳嗽", trigger: "红锈咳未经治愈自愈", effect: "潜行判定 -1；夜间无法完全安静", reversible: true, reversalCondition: "林医生专业治疗一个完整周期" },
  { name: "记忆空洞", trigger: "记忆枯竭症 / 碎裂阶段失败后果", effect: "永久丢失一段关键记忆；退出链相关判定永久 -1", reversible: false },
  { name: "消化敏感", trigger: "累计同化进度 ≥60% 后逆转", effect: "对红色液体抵抗力永久下降；额外理智伤害 +2/每次接触", reversible: false },
  { name: "回声耳", trigger: "在 13 层停留超过 20 分钟", effect: "间歇性听到回声低语；专注判定 -1；解开部分真相的线索 +1", reversible: false },
] as const;

// ════════════════════════════════════════════
// Section 6: 楼层环境危害（新增）
// ════════════════════════════════════════════

/** 环境危害 */
export interface FloorHazard {
  floorId: string;
  /** 危害名称 */
  hazard: string;
  /** 风险等级 */
  severity: "low" | "medium" | "high" | "extreme";
  /** 触发条件 */
  trigger: string;
  /** 效果 */
  effect: string;
  /** 是否可规避 */
  avoidable: boolean;
  /** 规避方式 */
  avoidance?: string;
}

export const FLOOR_HAZARDS: readonly FloorHazard[] = [
  { floorId: "B2", hazard: "空间裂隙辐射", severity: "extreme", trigger: "接近 B2 木门区域", effect: "每 10 分钟理智 -3；同化进度 +2%/次", avoidable: true, avoidance: "不从 B1 至 B2 的楼梯直接下到底层" },
  { floorId: "B2", hazard: "消化液池", severity: "high", trigger: "误入 B2 未标记区域", effect: "接触造成腐蚀伤害（中度/每轮 1d4）；衣物/道具损毁", avoidable: true, avoidance: "沿灵伤标记的安全路径行走" },
  { floorId: "B2", hazard: "A-008 精神压制", severity: "high", trigger: "未满足条件靠近木门", effect: "意志判定 DC 15 否则强制后退；理智 -5", avoidable: true, avoidance: "持有正确钥匙或陪伴者令牌" },
  { floorId: "B1", hazard: "管道泄漏（偶发）", severity: "low", trigger: "靠近 B1 管道区域", effect: "腐蚀液滴溅射，轻度烧伤可能", avoidable: true, avoidance: "绕行" },
  { floorId: "1", hazard: "身份混淆", severity: "medium", trigger: "在 1F 登记处长时间逗留", effect: "理智 -1/10 分钟；开始忘记自己名字的倾向", avoidable: true, avoidance: "不在登记处区域停留超过 15 分钟" },
  { floorId: "2", hazard: "消毒水毒气累积", severity: "medium", trigger: "在 2F 封闭室内 >30 分钟", effect: "头晕，感知判定 -2；离开后 10 分钟缓解", avoidable: true, avoidance: "保持通风；每 30 分钟到走廊换气" },
  { floorId: "3", hazard: "认知改写磁场", severity: "high", trigger: "在 3F 停留超过 1 小时", effect: "开始接受「这里本来就是家」的思想钢印；理智 -1/10 分钟", avoidable: false },
  { floorId: "4", hazard: "狩猎空间触发", severity: "high", trigger: "在非安全室过夜 / 独自一人时间 >2h", effect: "被 A-002 感知锁定，可能触发狩猎序列", avoidable: true, avoidance: "始终在 ≥2 人组队状态过夜" },
  { floorId: "5", hazard: "器官重塑幻觉", severity: "medium", trigger: "观看墙上画作超过 5 分钟", effect: "开始感觉自己的身体「不对劲」；理智 -2；可能触发身体检查强迫行为", avoidable: true, avoidance: "不直视 5F 画作超过 5 秒" },
  { floorId: "6", hazard: "镜像分裂", severity: "high", trigger: "在 6F 走廊看到镜子或反光面", effect: "镜像中的自己可能做出不同动作；若凝视超过 10 秒，镜像开始独立行动", avoidable: true, avoidance: "遮住 6F 所有反光面再通行" },
  { floorId: "6", hazard: "阿绣的低语", severity: "medium", trigger: "经过 602 室门口", effect: "理智 -1；听到不属于自己的耳语", avoidable: true, avoidance: "快速通过，不停留" },
  { floorId: "7", hazard: "高温蒸汽泄漏", severity: "low", trigger: "靠近 7F 厨房蒸汽管", effect: "轻度烫伤可能（DC 10 敏捷豁免）", avoidable: true, avoidance: "保持距离" },
  { floorId: "7", hazard: "紧闭门扉辐射", severity: "high", trigger: "靠近 7F 深处紧闭的门扉", effect: "每 5 分钟理智 -4，同化进度 +1%/次", avoidable: true, avoidance: "不靠近门扉 5 米以内" },
  { floorId: "all", hazard: "鼠群侵扰", severity: "low", trigger: "在无人的黑暗区域搜索食物", effect: "30% 概率遭遇鼠群，造成轻微咬伤", avoidable: true, avoidance: "携带光源；不在无照明时搜索" },
  { floorId: "all", hazard: "空间移位", severity: "medium", trigger: "修正窗口期使用楼梯", effect: "走完一层楼梯可能出现在完全不同楼层；理智 -3", avoidable: true, avoidance: "修正窗口期不走楼梯" },
] as const;

// ════════════════════════════════════════════
// Section 7: 内部气候与环境（新增）
// ════════════════════════════════════════════

/** 楼层气候特征 */
export interface FloorClimate {
  floorId: string;
  /** 温度范围（摄氏度） */
  temperatureRange: [number, number];
  /** 湿度描述 */
  humidity: "极干" | "干燥" | "适中" | "潮湿" | "极湿";
  /** 空气质量 */
  airQuality: "清新" | "可接受" | "沉闷" | "刺鼻" | "有毒";
  /** 特点气味 */
  odor: string;
  /** 背景噪音 */
  ambientNoise: string;
  /** 光照质量（区别于 FLOOR_LIGHT_LEVELS） */
  lightQuality: string;
  /** 特殊环境效果 */
  specialEffect?: string;
}

export const FLOOR_CLIMATES: readonly FloorClimate[] = [
  { floorId: "B2", temperatureRange: [6, 10], humidity: "极干", airQuality: "刺鼻", odor: "铁锈、旧血、胃酸混合味，浓重刺鼻", ambientNoise: "持续低频嗡鸣，间歇滴水声", lightQuality: "无自然光，只有生物荧光苔藓", specialEffect: "空间裂隙辐射（见 FLOOR_HAZARDS）" },
  { floorId: "B1", temperatureRange: [12, 16], humidity: "适中", airQuality: "沉闷", odor: "潮湿水泥、消毒水、旧纸箱味", ambientNoise: "管道水流声，偶尔楼上脚步声透过楼板", lightQuality: "昏暗荧光灯，偶有闪烁" },
  { floorId: "1", temperatureRange: [18, 22], humidity: "适中", airQuality: "可接受", odor: "旧家具蜡味、灰尘、陈婆婆的毛线味", ambientNoise: "门厅偶尔开关声，街上声音透过大门变形成沉闷嗡鸣", lightQuality: "日光灯，白天可透过门玻璃看到灰色天光", specialEffect: "从窗户看出去的街景永远相同" },
  { floorId: "2", temperatureRange: [20, 24], humidity: "潮湿", airQuality: "刺鼻", odor: "浓消毒水掩盖下的甜腻腐败味", ambientNoise: "空调低鸣，偶尔听到 201 诊室的仪器滴声", lightQuality: "日光灯，部分房间永远拉紧窗帘" },
  { floorId: "3", temperatureRange: [20, 23], humidity: "适中", airQuality: "沉闷", odor: "旧地毯霉味、灰尘、淡淡的糯米香（阿花房间）", ambientNoise: "小孩脚步声和毽子击地声，24 小时不间断", lightQuality: "昏暗——很多灯泡坏了没人换" },
  { floorId: "4", temperatureRange: [22, 26], humidity: "适中", airQuality: "沉闷", odor: "旧报纸、暖气管道铁锈味、周伯的烟味", ambientNoise: "持续狗叫声（大黄），时远时近", lightQuality: "日光灯，走廊中间灯管闪烁不定" },
  { floorId: "5", temperatureRange: [17, 21], humidity: "干燥", airQuality: "可接受", odor: "松节油、颜料、旧画纸的植物纤维味", ambientNoise: "寂静——异常安静，偶尔传来铅笔在纸上的摩擦声", lightQuality: "柔和——503 画室的窗户透出不确定来源的光", specialEffect: "画中人物视线会跟随移动" },
  { floorId: "6", temperatureRange: [24, 28], humidity: "极湿", airQuality: "刺鼻", odor: "霉变织物、积水、香水掩盖下的腐味", ambientNoise: "章嫂持续的喃喃自语，603 的滴水声", lightQuality: "昏暗——走廊灯光被湿气雾化", specialEffect: "反光面产生镜像分裂（见 FLOOR_HAZARDS）" },
  { floorId: "7", temperatureRange: [22, 30], humidity: "潮湿", airQuality: "沉闷", odor: "厨房油烟、炖菜味、焚香味（紧闭门扉方向）", ambientNoise: "陶师傅的锅铲声、夜读老人的翻书声", lightQuality: "厨房灯光亮，走廊深处光线被黑暗吞噬", specialEffect: "越靠近紧闭门扉越寒冷，与室温矛盾" },
] as const;

// ════════════════════════════════════════════
// Section 8: 同化进度系统（新增）
// ════════════════════════════════════════════

/** 同化进度阶段 */
export type AssimilationStage = "resistant" | "sensitive" | "integrated" | "merged" | "digested";

/** 同化进度阈值与效果 */
export const ASSIMILATION_STAGES: Record<AssimilationStage, { range: [number, number]; effect: string }> = {
  resistant: { range: [0, 20],   effect: "正常状态；公寓的消化信号被有效抵抗" },
  sensitive: { range: [21, 40],  effect: "对红色自来水产生微弱渴望；理智伤害 +1/次；偶尔听到公寓的「低语」" },
  integrated: { range: [41, 60], effect: "开始把公寓称为「家」；对外的记忆模糊化；某些 NPC 不再对你的存在感到异常" },
  merged:    { range: [61, 85],  effect: "身体出现消化性改变（皮肤纹理类似墙壁、头发开始脱落）；进食红色液体不再造成额外理智伤害；退出链部分阶段永久锁定" },
  digested:  { range: [86, 100], effect: "认知公寓为唯一真实；不再试图逃离；玩家角色实质上被公寓吸收——触发特定结局" },
} as const;

/** 各行为对同化的加速量 */
export const ASSIMILATION_ACCELERATORS: Record<string, number> = {
  drink_raw_red_water: 3,        // 饮用未处理红色自来水：+3%/次
  drink_settled_water: 0.5,      // 饮用静置沉淀水：+0.5%/次
  eat_red_jelly: 1,              // 食用红色果冻状物质：+1%/次
  touch_b2_rift: 2,              // 接触 B2 裂隙区域：+2%/次
  anomaly_exposure: 1,           // 经历空间异变（每次事件）：+1%
  death_without_exit: 8,         // 死亡一次且未在退出链中：+8%
  stay_13f_per_10min: 1,         // 在 13F 每停留 10 分钟：+1%
  close_to_boss_door_per_5min: 1,// 在 B2 木门附近每 5 分钟：+1%
  correction_window_exposure: 2, // 修正窗口期暴露在异常区：+2%/次
  exit_chain_stage_progress: -5, // 退出链每通过一阶段：-5%
  consumable_purifier: -3,       // 使用净化道具（如时间偏移石英）：-3%/次
} as const;

// ════════════════════════════════════════════
// Builder 函数
// ════════════════════════════════════════════

/** 构建完整生存规则上下文块（供 DM 使用） */
export function buildSurvivalRulesBlock(): string {
  const lines: string[] = [
    // ── 食物 ──
    "【食物系统】",
    `饥饿阈值：跳过 3 餐轻度影响 / 6 餐中度 / 10 餐濒危`,
    `每日最低需求：${DAILY_CALORIC_REQUIREMENT} 饱腹度`,
    `主要食物来源：陶师傅炖菜(饱8)、压缩饼干(饱4)、罐头(饱5)、方便面(饱3)、地下室蘑菇(饱2)、烤鼠肉(饱3)`,
    `风险食物：不明肉干(20% 理智-1)、红色果冻(+1% 同化)、地下室蘑菇生食(30% 致幻)`,
    `腐败系统：各楼层腐败速率不同——B2 ×0.5、7F ×1.5（最快）、6F ×1.3`,
    `保存方法：盐渍(×4)、烟熏(×5)、风干(×6)、冷藏(×3)、发酵(×8)`,
    "",
    // ── 水源 ──
    "【水源系统】",
    `脱水阈值：12h 开始症状 / 24h 严重脱水`,
    `安全水源：B1 储备水(0%同化)、煮沸沉淀水(0.1%)`,
    `条件水源：冷凝水(0.3%)、不明瓶装水(1%)`,
    `危险水源：自来水直饮(+3%同化)、静置沉淀水(+0.5%)`,
    `每日需求：${DAILY_WATER_REQUIREMENT} 份`,
    "",
    // ── 疲劳 ──
    "【疲劳系统】",
    `等级：fresh(0) → tired(6) → weary(12) → exhausted(20) → collapsed(30)`,
    `典型消耗：爬一层(1)、战斗一回合(2)、搜索房间(0.5)`,
    `恢复：休息 0.5/10min、睡眠 2/10min`,
    "",
    // ── 理智 ──
    "【理智系统】",
    `等级：stable(76-100) / uneasy(51-75) / disturbed(26-50) / fragile(1-25) / broken(0)`,
    `主要理智伤害事件：目击死亡(-15)、死亡重建(-20)、黑暗≥30min(-12)、异变直视(-10)、获知真相(-10~18)`,
    `恢复：安全睡眠 +15/晚、社交互动 +5、安慰物品 +3`,
    `相位倍率：平静×1.0 / 校准×1.2 / 前兆×1.5 / 修正窗口×1.8`,
    "",
    // ── 伤害与治疗 ──
    "【伤害与治疗】",
    `治疗四层级：自行(0源质，仅轻伤)、基本(3源质，中度伤)、专业(8源质，重伤)、急救(15源质，保命/断肢)`,
    `伤害类型：切割/钝器/骨折/烧伤/腐蚀/感染/认知/窒息/中毒/异常`,
    `感染概率：清洁环境 1%/h / 普通 3%/h / 脏污 6%/h / 污染 10%/h`,
    `疾病：红锈咳(致命15%)、镜面热(25%)、空间眩晕症(0%)、消化热(60%)、记忆枯竭症`,
    `永久损伤：瘸腿、失指、疤痕面容、慢性咳嗽、记忆空洞、消化敏感、回声耳`,
    "",
    // ── 同化 ──
    "【同化进度】",
    `阶段：抵抗(0-20%) / 敏感(21-40%) / 整合(41-60%) / 融合(61-85%) / 消化(86-100%)`,
    `加速：饮自来水(+3%/次)、死亡(+8%/次)、B2裂隙(+2%/次)、13F(+1%/10min)`,
    `减速：退出链阶段(-5%/阶段)、净化道具(-3%/次)`,
    "",
    // ── 楼层环境 ──
    "【楼层环境】",
    `B2：6-10°C，空间裂隙辐射(极端)，消化液池`,
    `B1：12-16°C，安全缓冲层，管道偶发泄漏`,
    `1F：18-22°C，身份混淆风险`,
    `2F：20-24°C，消毒水毒气累积`,
    `3F：20-23°C，认知改写磁场(不可规避)`,
    `4F：22-26°C，A-002 狩猎空间`,
    `5F：17-21°C，画作触发器官重塑幻觉`,
    `6F：24-28°C，镜像分裂 + 阿绣低语`,
    `7F：22-30°C，厨房高温 + 紧闭门扉辐射`,
    `全楼：鼠群侵扰、修正窗口期空间移位`,
  ];
  return lines.join("\n");
}
