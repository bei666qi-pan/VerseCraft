/**
 * Combat Canon — 如月公寓所有反常体 A-00x 的战斗数据注册表 + 楼层战斗修正
 *
 * 本文件分为两节：
 *   1. A-00x 反常体战斗 stat blocks（ANOMALY_COMBAT_STATS）
 *   2. 楼层战斗环境修正（FLOOR_COMBAT_MODIFIERS）
 *
 * 遵循 survivalCanon.ts / npcBehaviorCanon.ts 模式：export const + readonly 数组，
 * 带类型接口与节头注释。供 resolveCombat.ts / combatInjuryIntegration.ts 消费。
 *
 * 楼层绑定参照 rootCanon.ts STABLE_MECHANISM_ANCHORS：
 *   1F A-001, 2F A-004, 3F A-003, 4F A-002, 5F A-005, 6F A-006, 7F A-007, B2 A-008
 */

import type { CombatStyleTag, MainThreatPhase } from "@/lib/combat/types";
import type { FloorId } from "@/lib/registry/types";

// ──────────────────────────────────────
// Section 1: Anomaly Combat Stat Block
// ──────────────────────────────────────

export interface AnomalyCombatStatBlock {
  /** 反常体编号，如 "A-001" */
  threatId: string;
  /** 反常体展示名称，如 "窃时者" */
  name: string;
  /** 所属楼层（rootCanon.ts 强制绑定） */
  floor: FloorId;
  /** 战斗强度基底（0..60），与 HiddenNpcCombatProfileV1.basePower 同范围 */
  basePower: number;
  /** 波动性 0..1：越高越容易出现互伤/失手/翻车 */
  volatility: number;
  /** 进攻倾向 0..1：越高越主动逼近/压迫 */
  aggression: number;
  /** 纪律 0..1：越高越克制、少失手、少夸张破坏 */
  discipline: number;
  /** 抗压 0..1：越高越不易在高压相位崩盘 */
  resilience: number;
  /** 恐惧阈 0..1：越高越不易被威胁/压迫逼退 */
  fearThreshold: number;
  /** 标签组：描述核心战斗风格 */
  styleTags: CombatStyleTag[];
  /** 弱点标签：武器/策略克制的语义依据 */
  vulnerableToTags: string[];
  /** 相位特性：每个相位下的战斗行为简述 */
  phaseDescriptors: Partial<Record<MainThreatPhase, string>>;
  /** 唯一威胁说明——非纯数值可表达的战术叙事 */
  uniqueThreatNote: string;
}

/**
 * A-00x 反常体战斗 stat blocks
 *
 * floor 字段严格遵守 rootCanon.ts 楼层绑定：
 *   1F A-001 窃时者   — 伏击/近身爆发
 *   2F A-004 循环裂隙  — 空间循环伏击
 *   3F A-003 深层呢喃  — 认知侵蚀与狩猎
 *   4F A-002 静默回廊  — 边界固化与社交压制
 *   5F A-005 镜中倒映  — 镜像反制
 *   6F A-006 门扉执念  — 门扉操控与封缄（vulnerable: seal,door）
 *   7F A-007 龙胃蠕动  — 高破坏消化威胁（vulnerable: anchor,seal — 双武器反制）
 *   B2 A-008 归途回声  — 精神压迫守门（vulnerable: cognition,anchor）
 */
export const ANOMALY_COMBAT_STATS: readonly AnomalyCombatStatBlock[] = [
  {
    threatId: "A-001",
    name: "窃时者",
    floor: "1",
    basePower: 32,
    volatility: 0.7,
    aggression: 0.7,
    discipline: 0.3,
    resilience: 0.5,
    fearThreshold: 0.4,
    styleTags: ["ambush", "close_quarters"],
    vulnerableToTags: ["time", "anchor"],
    phaseDescriptors: {
      idle: "静止态——如环境噪声般融入背景，等待猎物触发时间异常",
      active: "时间偷取——攻击加速，行动容错窗口缩短；玩家节奏被打乱时伤害溢出",
      suppressed: "相位退缩——退入时间夹缝，伏击节奏被打断但未瓦解",
      breached: "崩解——时间线锚点断裂，窃时者短暂失去行动力",
    },
    uniqueThreatNote:
      "高伏击爆发，相位切换使动作容错降低。持有时针刺（clock_spike）可锚定时间线大幅降低威胁。",
  },
  {
    threatId: "A-002",
    name: "静默回廊",
    floor: "4",
    basePower: 28,
    volatility: 0.4,
    aggression: 0.5,
    discipline: 0.8,
    resilience: 0.7,
    fearThreshold: 0.6,
    styleTags: ["boundary_guard", "social_pressure"],
    vulnerableToTags: ["sound", "silence"],
    phaseDescriptors: {
      idle: "边界冷却——回廊正常通行，违禁信号未触发",
      active: "边界固化——走廊两端封锁，通信受阻时压制强度倍增",
      suppressed: "约束收敛——边界出现缝隙，压制力回升中",
      breached: "回廊碎裂——边界瓦解，静默压制解除",
    },
    uniqueThreatNote:
      "边界固化，通信受阻时压制成倍增强。静默短棍（silent_baton）是唯一确认的反制武器。",
  },
  {
    threatId: "A-003",
    name: "深层呢喃",
    floor: "3",
    basePower: 30,
    volatility: 0.5,
    aggression: 0.5,
    discipline: 0.7,
    resilience: 0.6,
    fearThreshold: 0.3,
    styleTags: ["tradecraft", "social_pressure"],
    vulnerableToTags: ["cognition", "sound"],
    phaseDescriptors: {
      idle: "暝色——呢喃声微弱，认知侵蚀缓慢累积",
      active: "狩猎序列——精神锁定目标，呢喃密度急剧上升",
      suppressed: "退缩回响——认知干扰减弱，但残留精神力消耗痕迹",
      breached: "沉默——深层回声破裂，短暂失去锁定能力",
    },
    uniqueThreatNote:
      "认知侵蚀主威胁，精神力损耗累积型战斗；不适合短时爆发解决。",
  },
  {
    threatId: "A-004",
    name: "循环裂隙",
    floor: "2",
    basePower: 34,
    volatility: 0.8,
    aggression: 0.6,
    discipline: 0.3,
    resilience: 0.4,
    fearThreshold: 0.5,
    styleTags: ["ambush", "mirror_counter"],
    vulnerableToTags: ["time", "direction"],
    phaseDescriptors: {
      idle: "空间折叠——裂隙休眠，通道几何结构扭曲程度低",
      active: "循环陷阱——空间折叠触发，多次遭遇叠加伤害累积",
      suppressed: "裂隙收缩——通道开始走向单一方向，追击受阻碍",
      breached: "空间断裂——裂隙锚点破裂，循环结构瓦解",
    },
    uniqueThreatNote:
      "空间循环，多次遭遇伤害累积；不适合持久战。方向感恢复/时间锚定可提前逃离循环。",
  },
  {
    threatId: "A-005",
    name: "镜中倒映",
    floor: "5",
    basePower: 36,
    volatility: 0.5,
    aggression: 0.5,
    discipline: 0.7,
    resilience: 0.6,
    fearThreshold: 0.4,
    styleTags: ["mirror_counter", "close_quarters"],
    vulnerableToTags: ["mirror", "direction"],
    phaseDescriptors: {
      idle: "镜面冷却——反射面安静，镜像未激活",
      active: "镜像反制——攻势被复制反弹，近战劣势被放大",
      suppressed: "碎镜——镜像数量减少，反制频率下降",
      breached: "镜渊破裂——主镜面破裂，镜像反制彻底失效",
    },
    uniqueThreatNote:
      "镜像反制型，近战劣势会被大幅放大。镜背匕（mirror_dagger）可扰乱镜像映射。",
  },
  {
    threatId: "A-006",
    name: "门扉执念",
    floor: "6",
    basePower: 26,
    volatility: 0.3,
    aggression: 0.4,
    discipline: 0.9,
    resilience: 0.8,
    fearThreshold: 0.7,
    styleTags: ["boundary_guard", "utility_support"],
    vulnerableToTags: ["seal", "door"],
    phaseDescriptors: {
      idle: "门扉闭锁——所有门维持正常状态，未见执念活动",
      active: "封缄扩散——门扉自主开关，退路被逐扇封锁",
      suppressed: "门缝收缩——封缄范围回缩，但仍维持已封锁扇区",
      breached: "门枢断裂——执念崩解，所有被封门扉恢复开放",
    },
    uniqueThreatNote:
      "门扉操控型威胁，退路封锁增强压制。封缄钉（sealing_spike）是最优克制武器。",
  },
  {
    threatId: "A-007",
    name: "龙胃蠕动",
    floor: "7",
    basePower: 38,
    volatility: 0.8,
    aggression: 0.8,
    discipline: 0.2,
    resilience: 0.3,
    fearThreshold: 0.8,
    styleTags: ["ambush", "close_quarters"],
    vulnerableToTags: ["anchor", "seal"],
    phaseDescriptors: {
      idle: "胃壁松弛——蠕动减缓，消化腔处于安静状态",
      active: "消化加速——强烈蠕动+压迫，战斗后触发环境消化判定",
      suppressed: "胃挛——高破坏被抑制，但消化液还在缓慢积累",
      breached: "胃穿孔——消化中止，龙胃结构崩解",
    },
    uniqueThreatNote:
      "最高破坏力之一，战斗后触发环境消化（与 survivalCanon 联动）。锚定+封缄可抑制消化进程。",
  },
  {
    threatId: "A-008",
    name: "归途回声",
    floor: "B2",
    basePower: 40,
    volatility: 0.3,
    aggression: 0.4,
    discipline: 0.9,
    resilience: 0.9,
    fearThreshold: 0.9,
    styleTags: ["tradecraft", "social_pressure"],
    vulnerableToTags: ["cognition", "anchor"],
    phaseDescriptors: {
      idle: "静默守门——回声闭锁，守门人处于观察态",
      active: "精神审判——心理压迫全力输出，意志判定频率骤增",
      suppressed: "回声衰减——精神链接减弱，但仍维持门禁封锁",
      breached: "回声消逝——守门失效，出口通道短暂可通行",
    },
    uniqueThreatNote:
      "精神威胁最高的反常体，心理压迫为主。硬战不可取；正确钥匙/陪伴者令牌是主要对策。",
  },
];

// ──────────────────────────────────────
// Section 2: Floor Combat Modifiers
// ──────────────────────────────────────

export interface FloorCombatModifier {
  /** 楼层 ID */
  floor: FloorId;
  /** 简短标识标签 */
  label: string;
  /** 环境隐蔽度 -1..1（负值 = 暴露，正值 = 利于隐蔽） */
  concealment: number;
  /** 环境压力 -1..1（负值 = 舒适/安全，正值 = 高压/危险） */
  pressure: number;
  /** 脱离难度修正（正值 = 更难脱离，负值 = 更易脱离） */
  escapeModifier: number;
  /** 说明 */
  note: string;
}

/**
 * 楼层战斗环境修正
 *
 * 数据来源：survivalCanon.ts FLOOR_HAZARDS + FLOOR_CLIMATES +
 *           world.ts 楼层描述 + rootCanon.ts 结构摘要
 */
export const FLOOR_COMBAT_MODIFIERS: readonly FloorCombatModifier[] = [
  {
    floor: "B2",
    label: "出口层·守门人结界",
    concealment: -0.3,
    pressure: 0.8,
    escapeModifier: 1.2,
    note: "A-008 精神压制 + 出口封锁。脱离极难，意志判定前置。",
  },
  {
    floor: "B1",
    label: "设备层·安全区",
    concealment: 0.2,
    pressure: -0.6,
    escapeModifier: -0.5,
    note: "安全区，战斗收敛。隐蔽空间多（管道间/仓库），脱离容易。",
  },
  {
    floor: "1",
    label: "大厅层·A-001 领地",
    concealment: 0.3,
    pressure: 0.1,
    escapeModifier: -0.2,
    note: "入口层，开阔+隐蔽混合。A-001 伏击可能来自阴影角落。",
  },
  {
    floor: "2",
    label: "商业层·循环裂隙",
    concealment: 0.5,
    pressure: 0.3,
    escapeModifier: 0.5,
    note: "A-004 空间循环使脱离复杂化。商铺隔间提供隐蔽也制造困局。",
  },
  {
    floor: "3",
    label: "居住层·呢喃走廊",
    concealment: 0.1,
    pressure: 0.5,
    escapeModifier: 0.3,
    note: "A-003 认知狩猎空间。居住区走廊窄，交互受限。",
  },
  {
    floor: "4",
    label: "回廊层·边界固化",
    concealment: -0.2,
    pressure: 0.4,
    escapeModifier: 0.8,
    note: "A-002 边界固化极易封锁退路。走廊长、遮蔽少。",
  },
  {
    floor: "5",
    label: "镜面层·镜像投射",
    concealment: 0.6,
    pressure: 0.3,
    escapeModifier: 0.2,
    note: "A-005 镜面映射丰富，视觉迷惑性强。隐蔽高但方向迷失风险大。",
  },
  {
    floor: "6",
    label: "门扉层·封缄领域",
    concealment: -0.1,
    pressure: 0.4,
    escapeModifier: 0.6,
    note: "A-006 门扉操控。退路随时可能被封锁，脱离难度中等偏高。",
  },
  {
    floor: "7",
    label: "胃袋层·消化腔",
    concealment: -0.5,
    pressure: 0.8,
    escapeModifier: 1.0,
    note: "A-007 消化环境。暴露度高、压力最大，脱离极难。",
  },
];

// ──────────────────────────────────────
// Section 3: Lookup Helpers
// ──────────────────────────────────────

/**
 * 根据 threatId 获取反常体战斗数据
 *
 * @param threatId - 反常体编号，如 "A-001"
 * @returns AnomalyCombatStatBlock | null
 */
export function getAnomalyCombatStat(threatId: string): AnomalyCombatStatBlock | null {
  return ANOMALY_COMBAT_STATS.find((s) => s.threatId === threatId) ?? null;
}

/**
 * 根据 floorId 获取楼层战斗修正
 *
 * @param floor - 楼层 ID，如 "1" | "B2"
 * @returns FloorCombatModifier | null
 */
export function getFloorCombatModifier(floor: FloorId): FloorCombatModifier | null {
  return FLOOR_COMBAT_MODIFIERS.find((m) => m.floor === floor) ?? null;
}
