// src/lib/worldEngine/actorSimulation/buildActorInput.ts
/**
 * Phase 3: Actor Simulation Input Builder
 *
 * 为每个选中 NPC 构建 actor-scoped 模拟输入。
 * 严格限制每个 NPC 只能访问其认知边界内的事实。
 *
 * 设计约束：
 * - 纯函数，不做 IO
 * - 不包含其他 NPC 私有记忆
 * - 不包含 dmOnly 世界真相
 * - 不含无 factId/source/revealTier 的关键剧情真相
 */

import type { NpcAgentState } from "@/lib/socialWorld/types";
import type {
  ActorSimulationInput,
  EpistemicFactSummary,
  ActorRelationEdge,
} from "./types";
import type { DirectorCastActor } from "./types";

// ============================================================
// Public API
// ============================================================

export interface BuildActorInputArgs {
  castActor: DirectorCastActor;
  npcState: NpcAgentState | undefined;
  /** 所有已注册世界事实（用于 epistemic filtering） */
  allFacts: EpistemicFactSummary[];
  /** 场景公共事实 ID 集合 */
  scenePublicFactIds: Set<string>;
  /** NPC 已知事实 ID 集合 */
  actorKnownFactIds: Set<string>;
  /** NPC 怀疑事实 ID 集合 */
  actorSuspectedFactIds: Set<string>;
  /** 禁止该 NPC 接触的事实 ID */
  forbiddenFactIds: Set<string>;
  /** NPC 关系边 */
  relationEdges: ActorRelationEdge[];
  /** 推演视界 */
  horizonTurns: number;
  /** 模拟 ID */
  simulationId: string;
}

/**
 * 构建单个 NPC 的模拟输入。
 * 所有事实都经过 epistemic filtering —— 只包含该 NPC 有权访问的。
 */
export function buildActorSimulationInput(args: BuildActorInputArgs): ActorSimulationInput | null {
  const {
    castActor,
    npcState,
    allFacts,
    scenePublicFactIds,
    actorKnownFactIds,
    actorSuspectedFactIds,
    forbiddenFactIds,
    relationEdges,
    horizonTurns,
    simulationId,
  } = args;

  if (!npcState) return null;

  // 过滤场景公共事实（NPC 在场可见）
  const scenePublicFacts = allFacts.filter(
    (f) => scenePublicFactIds.has(f.id) && !forbiddenFactIds.has(f.id)
  );

  // 过滤 NPC 专属事实
  const actorScopedFacts = allFacts.filter(
    (f) => actorKnownFactIds.has(f.id) && !forbiddenFactIds.has(f.id)
  );

  // 已知 fact IDs（进入该 NPC 的 knownFactIds 字段）
  const knownFactIds = allFacts
    .filter((f) => actorKnownFactIds.has(f.id) && !forbiddenFactIds.has(f.id))
    .map((f) => f.id);

  // 怀疑 fact IDs
  const suspectedFactIds = allFacts
    .filter((f) => actorSuspectedFactIds.has(f.id))
    .map((f) => f.id);

  return {
    npcId: castActor.npcId,
    npcName: npcState.npcId, // 使用注册 ID 作为名称
    currentGoal: npcState.currentGoal ?? null,
    currentFear: npcState.currentFear ?? null,
    currentNeed: npcState.currentNeed ?? null,
    knownFactIds,
    suspectedFactIds,
    forbiddenRevealIds: [...forbiddenFactIds],
    relationEdges: relationEdges.filter(
      (e) => e.targetNpcId !== castActor.npcId // 排除自引用
    ),
    currentLocation: "unknown",
    personalAgenda: null,
    scenePublicFacts,
    actorScopedFacts,
    horizonTurns: Math.min(3, Math.max(1, horizonTurns)),
    simulationId,
  };
}

/**
 * 检查 NPC 是否有有效输入（非空、有至少一个可知事实或有推进行动）。
 */
export function hasValidActorInput(input: ActorSimulationInput): boolean {
  return (
    input.knownFactIds.length > 0 ||
    input.scenePublicFacts.length > 0 ||
    input.currentGoal != null ||
    input.currentNeed != null
  );
}
