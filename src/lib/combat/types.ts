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
  | "overwhelm"   // 碾压
  | "advantage"   // 占优
  | "stalemate"   // 僵持
  | "pressured"   // 被压制
  | "collapse"    // 崩盘
  | "mutual_harm" // 互伤
  | "withdraw";   // 撤退/脱离

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

