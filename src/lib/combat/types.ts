export type CombatActorKind = "player" | "npc";

export type CombatStyleTag =
  | "boundary_guard"   // 守线、卡位、反制越界
  | "close_quarters"   // 近身、压迫、擒拿
  | "ambush"           // 伏击、偷袭、短促爆发
  | "tradecraft"       // 交易/契约式对抗：试探、换价、撤离窗口
  | "mirror_counter"   // 镜像/反制：借力打力、错位回弹
  | "medical_control"  // 诊疗/麻痹/约束：控制而非屠杀
  | "utility_support"  // 护送/掩护/补给式对抗
  | "social_pressure"  // 言语压迫/威慑/逼迫让步（轻量冲突）
  | "unknown";

export type CombatOutcomeTier =
  | "crush"       // 碾压（更强信号：几乎无悬念）
  | "overwhelm"   // 碾压
  | "advantage"   // 占优
  | "edge"        // 细小优势（赢得很勉强/靠一步窗口）
  | "stalemate"   // 僵持
  | "pressured"   // 被压制
  | "collapse"    // 崩盘
  | "mutual_harm" // 互伤（旧名，保留兼容）
  | "mutual_damage" // 互伤（新名：语义更直观）
  | "withdraw"      // 撤退/脱离（主动抓窗口）
  | "forced_retreat"; // 被迫撤退/脱离（被赶走/被逼退）

export type MainThreatPhase = "idle" | "active" | "suppressed" | "breached";

export type CombatDangerTierForPlayer =
  | "negligible" // 不构成威胁
  | "low"        // 低
  | "medium"     // 中
  | "high"       // 高
  | "extreme"    // 极高
  | "unknown";   // 未知

export type CombatConflictKind =
  | "shove"          // 推搡/短促肢体冲突
  | "subdue"         // 制服/控制
  | "escape"         // 脱离/逃跑
  | "protect"        // 护送/挡灾
  | "intimidate"     // 威慑/压迫
  | "weapon_clash";  // 明确器械冲突（仍是小范围）

/**
 * 隐藏战斗画像（V1）
 * - 只用于系统裁决与叙事锚点，不对玩家展示裸数
 * - 目标：稳定、可解释、可扩展（不做“随机乱赢乱输”）
 */
export type NpcCombatStoryClass =
  | "civilian"
  | "resident"
  | "enforcer"
  | "major_charm"
  | "unknown";

export type CombatTacticTag = CombatStyleTag | "grapple" | "feint" | "rule_lock" | "escort" | "panic_break";

export type CombatWeakTag =
  | "low_discipline"
  | "low_resilience"
  | "hesitation"
  | "overconfident"
  | "debt_bound"
  | "unknown";

export type HiddenNpcCombatProfileV1 = {
  npcId: string;
  displayName: string;

  /** 隐藏强度基底（0..60），同 NPC 应稳定 */
  basePower: number;

  /** 波动性（0..1）：越高越容易出现“互伤/失手/翻车”而非线性胜负 */
  volatility: number;
  /** 进攻倾向（0..1）：越高越容易主动逼近/压迫 */
  aggression: number;
  /** 纪律（0..1）：越高越克制、少失手、少夸张破坏 */
  discipline: number;
  /** 抗压（0..1）：越高越不易在高压相位崩盘 */
  resilience: number;
  /** 恐惧阈（0..1）：越低越容易被威胁/压迫逼退 */
  fearThreshold: number;

  /** 战术标签：用于叙事锚与解释，避免散落 prompt */
  tacticTags: CombatTacticTag[];
  /** 弱点标签：用于“掌握弱点”与对策提示，不等于数值破防 */
  weakTags: CombatWeakTag[];

  /** 人设分层：用于约束风格稳定性与压迫感分配 */
  storyClass: NpcCombatStoryClass;
  /** 稳定风格 key：用于注册表/资产化对齐 */
  styleKey: string;

  /** 兼容旧版：风格标签仍保留 */
  styleTags: CombatStyleTag[];
  signature: {
    short: string;
    do: string[];
    dont: string[];
  };
  dangerForPlayer: CombatDangerTierForPlayer;
};

export type CombatPrecheckVerdict =
  | "avoid"        // 强烈不建议正面冲突
  | "risky"        // 高风险（可能赢但代价大/互伤高）
  | "contested"    // 可打但会拉扯
  | "favorable"    // 偏有利
  | "unknown";

export type CombatPrecheck = {
  verdict: CombatPrecheckVerdict;
  dangerForPlayer: CombatDangerTierForPlayer;
  explain: string[]; // 可叙事解释（不含裸数）
};

export type CombatScoreBreakdown = {
  base: number;
  scene: number;
  equipment: number;
  psyche: number;
  style: number;
  total: number;
  notes: string[];
};

export type CombatActorScore = {
  kind: CombatActorKind;
  actorId: string;
  score: number;
  breakdown: CombatScoreBreakdown;
  styleTags: CombatStyleTag[];
};

export type SceneCombatContext = {
  locationId: string;
  floorId: string;
  threatPhase: MainThreatPhase;
  isSafeZone: boolean;
  timeOfDay: "day" | "night";
  modifiers: {
    pressure: number; // 环境压迫（威胁相位/高层等）
    concealment: number; // 遮蔽/暗处
    footing: number; // 立足点/退路
  };
  notes: string[];
};

export type CombatResolution = {
  outcome: CombatOutcomeTier;
  winner: "attacker" | "defender" | "none";
  advantageBand: "huge" | "clear" | "thin" | "even";
  attacker: CombatActorScore;
  defender: CombatActorScore;
  scene: SceneCombatContext;
  explain: {
    why: string[]; // 可叙事解释的原因列表（不含裸数）
    likelyCost: "none" | "light" | "moderate" | "heavy";
    collateral: "none" | "minor" | "limited";
  };
};

