// src/lib/worldEngine/actorSimulation/castSelection.ts
/**
 * Phase 3: Deterministic Cast Selection
 *
 * 纯函数，从候选 NPC 中选择本轮需要推演的角色。
 * 复用现有 `selectActiveNpcsForSocialTick()` 并增加窄适配层。
 *
 * 设计约束：
 * - 纯函数，不做 IO，不调用 LLM
 * - 确定性输出，依赖现有 NPC agent state
 * - 默认最多 3 个 NPC
 */

import type { NpcAgentState } from "@/lib/socialWorld/types";
import { selectActiveNpcsForSocialTick } from "@/lib/socialWorld/activation";
import type {
  DirectorCastPlan,
  DirectorCastActor,
  CastSelectionReasonCode,
} from "./types";

// ============================================================
// Public API
// ============================================================

export interface SelectCastArgs {
  npcStates: NpcAgentState[];
  nowTurn: number;
  maxActors: number;
  horizonTurns: number;
  /** 当前场景中的 NPC ID 列表 */
  sceneNpcIds?: readonly string[];
  /** 被玩家提及的 NPC ID 列表 */
  playerMentionedNpcIds?: readonly string[];
  /** 本回合状态变化相关的 NPC ID */
  stateChangeNpcIds?: readonly string[];
}

/**
 * 选角：从候选 NPC 中选择本轮推演角色。
 * 优先复用现有激活评分体系，再根据场景/提及/状态变化做窄调整。
 */
export function selectCastForTick(args: SelectCastArgs): DirectorCastPlan {
  const {
    npcStates,
    nowTurn,
    maxActors,
    horizonTurns,
    sceneNpcIds = [],
    playerMentionedNpcIds = [],
    stateChangeNpcIds = [],
  } = args;

  // Step 1: 获取现有评分体系筛选的活跃 NPC
  const candidates = selectActiveNpcsForSocialTick({
    npcStates,
    nowTurn,
    desiredActiveNpcCount: maxActors * 2, // 先多选一些候选
    budget: {
      maxActiveNpcPerTick: maxActors * 2,
    },
  });

  // Step 2: 排序并确定选角原因
  const sceneSet = new Set(sceneNpcIds);
  const mentionedSet = new Set(playerMentionedNpcIds);
  const stateChangeSet = new Set(stateChangeNpcIds);

  const scored = candidates.map((npc): { npc: NpcAgentState; score: number; reason: CastSelectionReasonCode } => {
    let score = npc.agencyWeight ?? 0;
    let reason: CastSelectionReasonCode = "high_agency";

    if (stateChangeSet.has(npc.npcId)) {
      score += 0.3;
      reason = "state_change";
    }
    if (mentionedSet.has(npc.npcId)) {
      score += 0.2;
      reason = "player_mentioned";
    }
    if (sceneSet.has(npc.npcId)) {
      score += 0.15;
      reason = "scene_present";
    }
    if (hasDueAgenda(npc)) {
      score += 0.1;
      if (reason === "high_agency") reason = "due_agenda";
    }

    return { npc, score, reason };
  });

  // Step 3: 按得分降序排列，取前 maxActors
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, maxActors);

  const actors: DirectorCastActor[] = selected.map((s) => ({
    npcId: s.npc.npcId,
    selectionReasonCode: s.reason,
    priority: s.score >= 0.5 ? "high" : s.score >= 0.3 ? "medium" : "low",
  }));

  return {
    schemaVersion: "director_cast_plan_v1",
    horizonTurns: Math.min(3, Math.max(1, horizonTurns)),
    actors,
    skippedCandidateCount: Math.max(0, scored.length - selected.length),
    selectionRationale:
      actors.length > 0
        ? `Selected ${actors.length} NPC(s) for ${horizonTurns}-turn projection`
        : "No NPCs met selection criteria for this tick",
  };
}

// ============================================================
// Helpers
// ============================================================

function hasDueAgenda(npc: NpcAgentState): boolean {
  // 检查是否有到期个人 agenda（基于 npc 状态中的 agenda 相关字段）
  return (
    (npc.currentGoal != null && npc.currentGoal.length > 0) ||
    (npc.currentNeed != null && npc.currentNeed.length > 0)
  );
}
