// src/lib/worldEngine/actorSimulation/types.ts
/**
 * Phase 3: Background Actor Simulation Types
 * 
 * 这些类型定义后台 NPC 行动推演与导演汇总所需的数据结构。
 * 所有模拟均在 worker/background tick 运行，不进入 /api/chat 等待路径。
 */

// ============================================================
// Cast Selection
// ============================================================

/** 导演选角计划：决定本轮推演哪些 NPC */
export interface DirectorCastPlan {
  schemaVersion: "director_cast_plan_v1";
  /** 推演回合视界（1-3 回合） */
  horizonTurns: number;
  /** 被选中的 NPC 列表（0-3 个） */
  actors: DirectorCastActor[];
  /** 本次未选中的候选 NPC 数量 */
  skippedCandidateCount: number;
  /** 选角策略说明（不含隐藏信息） */
  selectionRationale: string;
}

export interface DirectorCastActor {
  /** 注册的 NPC ID */
  npcId: string;
  /** 选角原因编码 */
  selectionReasonCode: CastSelectionReasonCode;
  /** 优先级 */
  priority: "high" | "medium" | "low";
}

export type CastSelectionReasonCode =
  | "due_agenda"       // 个人 agenda 到期
  | "scene_present"    // 当前场景中出现
  | "player_mentioned" // 被玩家提及
  | "state_change"     // 与该 NPC 相关的状态变化
  | "high_agency"      // 高自主性 NPC
  | "plot_relevance";  // 剧情关联

// ============================================================
// Actor Simulation Input
// ============================================================

/** 单个 NPC 的模拟输入（actor-scoped） */
export interface ActorSimulationInput {
  npcId: string;
  npcName: string;

  /** NPC 当前驱动力 */
  currentGoal: string | null;
  currentFear: string | null;
  currentNeed: string | null;

  /** 该 NPC 的认知边界 */
  knownFactIds: string[];
  suspectedFactIds: string[];
  forbiddenRevealIds: string[];

  /** NPC 关系边 */
  relationEdges: ActorRelationEdge[];

  /** 位置与个人 agenda */
  currentLocation: string;
  personalAgenda: string | null;

  /** 场景公共事实（所有在场 NPC 可见） */
  scenePublicFacts: EpistemicFactSummary[];
  /** NPC 专属事实（只有该 NPC 可知） */
  actorScopedFacts: EpistemicFactSummary[];

  /** 推演视界 */
  horizonTurns: number;

  /** 模拟 ID（用于去重） */
  simulationId: string;
}

export interface ActorRelationEdge {
  targetNpcId: string;
  relationType: string;
  attitude: "friendly" | "neutral" | "hostile" | "suspicious" | "fearful";
  intensity: number; // 0-1
}

export interface EpistemicFactSummary {
  id: string;
  summary: string;       // 人类可读摘要（进入 prompt 的实际文本）
  revealTier: number;    // 揭露层级
  category: string;      // fact category
  sourceId: string;      // 来源事实 ID
}

// ============================================================
// Actor Projection (Output)
// ============================================================

/** NPC 行动推演候选输出 */
export interface ActorProjection {
  schemaVersion: "actor_projection_v1";
  simulationId: string;
  npcId: string;

  /** 本次推演使用的已知事实 ID */
  knownFactIdsUsed: string[];
  /** 本次推演使用的怀疑事实 ID */
  suspectedFactIdsUsed: string[];

  /** 内部意图（不直接对玩家展示） */
  intent: string;

  /** 候选行动列表 */
  candidateActions: ActorCandidateAction[];

  /** 绝对不能泄露的事实 ID */
  mustNotRevealIds: string[];

  /** 被阻止的原因（无可行行动时） */
  blockedReason: string | null;

  /** 置信度 */
  confidence: number; // 0-1
}

export interface ActorCandidateAction {
  /** 行动编码（注册的或受限的） */
  actionCode: string;
  /** 目标 NPC ID 列表 */
  targetNpcIds: string[];
  /** 目标位置 ID */
  targetLocationId: string | null;
  /** 前置条件事实 ID */
  preconditionFactIds: string[];
  /** 预期效果编码 */
  expectedEffectCode: string;
  /** 玩家自主性约束 */
  playerAgencyConstraint: PlayerAgencyConstraint;
  /** 置信度 */
  confidence: number; // 0-1
}

export type PlayerAgencyConstraint =
  | "player_can_ignore_or_avoid"   // 玩家可忽略或回避
  | "player_can_counteract"        // 玩家可反制
  | "player_must_react"            // 玩家必须反应（危险）
  | "observation_only";            // 仅观察，不涉及玩家

// ============================================================
// Projection Validation
// ============================================================

export interface ActorProjectionIssue {
  code: ActorProjectionIssueCode;
  severity: "high" | "medium" | "low";
  detail: string;
  npcId: string;
}

export type ActorProjectionIssueCode =
  | "unregistered_npc"           // NPC 未注册
  | "forbidden_fact_used"        // 使用了禁止的事实
  | "must_not_reveal_leaked"     // 不应泄露的事实出现在输出中
  | "dm_only_fact_in_projection" // DM-only 事实泄露
  | "location_impossible"        // 位置不可达
  | "rumor_as_fact"              // 谣言被写成确定事实
  | "forced_player_action"       // 强制玩家行动
  | "forced_player_failure"      // 强制玩家失败
  | "missing_source"             // 缺少事实来源
  | "reveal_tier_breach";        // 超越揭露层级

// ============================================================
// Director Synthesis
// ============================================================

export interface DirectorSynthesisInput {
  /** 经过校验的 Actor Projection 列表 */
  projections: ActorProjection[];
  /** 被拒绝的 Projection 及原因 */
  rejectedProjections: { npcId: string; reason: string }[];
  /** 当前导演状态 */
  currentDirectorState: unknown;
  /** 会话议程摘要 */
  recentAgenda: unknown;
  /** 最近世界事实 */
  recentFacts: unknown;
}

// ============================================================
// Telemetry
// ============================================================

export interface ActorSimulationTelemetry {
  /** 候选 NPC 数量 */
  castCandidateCount: number;
  /** 选中 NPC 数量 */
  castSelectedCount: number;

  /** 模拟模式 */
  simulationMode: "off" | "batch" | "batch_shadow" | "batch_soft";
  /** 请求模拟次数 */
  simulationRequested: number;
  /** 成功完成模拟次数 */
  simulationFulfilled: number;
  /** 被拒绝次数 */
  simulationRejected: number;
  /** 超时次数 */
  simulationTimedOut: number;

  /** 接受的 Projection 数量 */
  projectionAccepted: number;
  /** 被 validator 拒绝的 Projection 数量 */
  projectionRejectedByValidator: number;

  /** 各阶段延迟（ms） */
  castSelectionLatencyMs: number;
  actorSimulationLatencyMs: number;
  directorSynthesisLatencyMs: number;
  totalTickLatencyMs: number;

  /** 合成的 agenda 数量 */
  agendaAccepted: number;
  agendaRejected: number;
}

// ============================================================
// Feature Flags
// ============================================================

export interface ActorSimulationFlags {
  /** 完全关闭 Actor Simulation */
  enabled: boolean;
  /** 模式：off | batch_shadow | batch_soft */
  mode: "off" | "batch_shadow" | "batch_soft";
  /** 最多同时推演 NPC 数 */
  maxActors: number;
  /** 推演回合视界 */
  horizonTurns: number;
  /** 总 tick 预算（ms） */
  totalTickBudgetMs: number;
  /** 每 actor 超时（ms） */
  perActorTimeoutMs: number;
  /** 每 actor 最大候选行动数 */
  maxActionsPerActor: number;
}
