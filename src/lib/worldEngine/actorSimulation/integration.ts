// src/lib/worldEngine/actorSimulation/integration.ts
/**
 * Phase 3: World Engine Integration Adapter
 * 
 * 将 Actor Simulation 接入现有 `runWorldEngineTick` 流程。
 * 所有模拟在 worker/background 运行，不进入 /api/chat 等待路径。
 * 
 * 集成策略：
 * - shadow 模式：运行 cast selection + input building，记录 telemetry，不调用 LLM
 * - soft 模式：运行完整流程，将 projection summary 作为 reasoner 的附加上下文
 * - off 模式：完全跳过
 */

import type { NpcAgentState } from "@/lib/socialWorld/types";
import type { ChatMessage } from "@/lib/ai/types/core";
import {
  resolveActorSimulationFlags,
  shouldRunActorSimulation,
  isActorSimulationShadow,
} from "./config";
import { selectCastForTick } from "./castSelection";
import { buildActorSimulationInput, hasValidActorInput } from "./buildActorInput";
import type {
  DirectorCastPlan,
  ActorSimulationInput,
  ActorProjection,
  ActorSimulationTelemetry,
  EpistemicFactSummary,
  ActorRelationEdge,
} from "./types";

// ============================================================
// Integration Context
// ============================================================

export interface ActorSimulationContext {
  /** 所有 NPC agent states */
  npcStates: NpcAgentState[];
  /** 当前回合 */
  turnIndex: number;
  /** 当前场景中的 NPC ID 列表 */
  sceneNpcIds: string[];
  /** 被玩家提及的 NPC ID 列表 */
  playerMentionedNpcIds: string[];
  /** 世界事实摘要（用于 epistemic filtering） */
  worldFacts: EpistemicFactSummary[];
  /** NPC 关系边 */
  relationEdges: ActorRelationEdge[];
  /** 已知/怀疑/禁止事实 ID 集合（按 NPC ID 索引） */
  epistemicIndex: EpistemicIndex;
}

export interface EpistemicIndex {
  /** 所有 NPC 的已知事实 ID */
  knownFactIdsByNpc: Map<string, Set<string>>;
  /** 所有 NPC 的怀疑事实 ID */
  suspectedFactIdsByNpc: Map<string, Set<string>>;
  /** 全局禁止事实 ID */
  forbiddenFactIds: Set<string>;
}

// ============================================================
// Main Adapter
// ============================================================

export interface RunActorSimulationResult {
  /** 选角计划 */
  castPlan: DirectorCastPlan | null;
  /** 构建的 actor 输入（供调试/telemetry） */
  actorInputs: ActorSimulationInput[];
  /** 有效的 actor 输入（有足够信息可推演） */
  validInputs: ActorSimulationInput[];
  /** 模拟结果（仅在 soft 模式下有值） */
  projections: ActorProjection[];
  /** Telemetry 数据 */
  telemetry: ActorSimulationTelemetry;
  /** 用于附加到 reasoner 消息的上下文文本 */
  reasonerContextHint: string | null;
}

/**
 * 运行一轮 Actor Simulation（在 world engine tick 内调用）。
 * 
 * @returns simulation result，包含 cast plan、inputs、projections 和 telemetry
 */
export function runActorSimulationPhase(ctx: ActorSimulationContext): RunActorSimulationResult {
  const t0 = Date.now();
  const flags = resolveActorSimulationFlags();

  const telemetry: ActorSimulationTelemetry = {
    castCandidateCount: 0,
    castSelectedCount: 0,
    simulationMode: flags.enabled ? flags.mode : "off",
    simulationRequested: 0,
    simulationFulfilled: 0,
    simulationRejected: 0,
    simulationTimedOut: 0,
    projectionAccepted: 0,
    projectionRejectedByValidator: 0,
    castSelectionLatencyMs: 0,
    actorSimulationLatencyMs: 0,
    directorSynthesisLatencyMs: 0,
    totalTickLatencyMs: 0,
    agendaAccepted: 0,
    agendaRejected: 0,
  };

  if (!shouldRunActorSimulation(flags)) {
    telemetry.totalTickLatencyMs = Date.now() - t0;
    return {
      castPlan: null,
      actorInputs: [],
      validInputs: [],
      projections: [],
      telemetry,
      reasonerContextHint: null,
    };
  }

  // Step 1: Cast Selection
  const castT0 = Date.now();
  telemetry.castCandidateCount = ctx.npcStates.length;

  const castPlan = selectCastForTick({
    npcStates: ctx.npcStates,
    nowTurn: ctx.turnIndex,
    maxActors: flags.maxActors,
    horizonTurns: flags.horizonTurns,
    sceneNpcIds: ctx.sceneNpcIds,
    playerMentionedNpcIds: ctx.playerMentionedNpcIds,
  });

  telemetry.castSelectedCount = castPlan.actors.length;
  telemetry.castSelectionLatencyMs = Date.now() - castT0;

  if (castPlan.actors.length === 0) {
    telemetry.totalTickLatencyMs = Date.now() - t0;
    return {
      castPlan,
      actorInputs: [],
      validInputs: [],
      projections: [],
      telemetry,
      reasonerContextHint: null,
    };
  }

  // Step 2: Build Actor Simulation Inputs
  const scenePublicFactIds = new Set(ctx.worldFacts
    .filter((f) => f.category === "scene_public")
    .map((f) => f.id));

  const actorInputs: ActorSimulationInput[] = [];
  const validInputs: ActorSimulationInput[] = [];

  for (const castActor of castPlan.actors) {
    const npcState = ctx.npcStates.find((s) => s.npcId === castActor.npcId);
    const knownFacts = ctx.epistemicIndex.knownFactIdsByNpc.get(castActor.npcId) ?? new Set();
    const suspectedFacts = ctx.epistemicIndex.suspectedFactIdsByNpc.get(castActor.npcId) ?? new Set();

    const input = buildActorSimulationInput({
      castActor,
      npcState,
      allFacts: ctx.worldFacts,
      scenePublicFactIds,
      actorKnownFactIds: knownFacts,
      actorSuspectedFactIds: suspectedFacts,
      forbiddenFactIds: ctx.epistemicIndex.forbiddenFactIds,
      relationEdges: ctx.relationEdges,
      horizonTurns: flags.horizonTurns,
      simulationId: `sim-${ctx.turnIndex}-${castActor.npcId}`,
    });

    if (input) {
      actorInputs.push(input);
      if (hasValidActorInput(input)) {
        validInputs.push(input);
      }
    }
  }

  telemetry.simulationRequested = validInputs.length;

  // Step 3: Build reasoner context hint (for soft mode)
  let reasonerContextHint: string | null = null;

  if (!isActorSimulationShadow(flags) && validInputs.length > 0) {
    // In soft mode, generate a context hint for the reasoner
    // This is a deterministic summary of what each NPC might do
    const actorSummaries = validInputs.map((input) => {
      const parts: string[] = [];
      if (input.currentGoal) parts.push(`目标: ${input.currentGoal}`);
      if (input.currentNeed) parts.push(`需求: ${input.currentNeed}`);
      parts.push(`已知事实: ${input.knownFactIds.length} 条`);
      parts.push(`场景公共事实: ${input.scenePublicFacts.length} 条`);
      return `NPC ${input.npcId}: ${parts.join("; ")}`;
    });

    reasonerContextHint = [
      "=== Actor Simulation Context (soft mode) ===",
      `本 tick 选中 ${validInputs.length} 个 NPC 进行后台推演：`,
      ...actorSummaries,
      "请基于以上 NPC 的认知边界和驱动力，在 director_plan_v1 的 npc_next_actions 中生成符合各 NPC 认知的候选行动。",
      "每个 NPC 只能基于其 knownFactIds 行动；不要使用 dmOnly 事实或跨 NPC 私有记忆。",
      "=== End Actor Simulation Context ===",
    ].join("\n");
  }

  // Step 4: Projections are filled later by the actual LLM call (gateway-dependent)
  // In this integration layer, we prepare the inputs and context hint.
  // The actual simulation call happens in the reasoner (which already does world building).

  const simLatencyMs = Date.now() - castT0;
  telemetry.actorSimulationLatencyMs = simLatencyMs;
  telemetry.totalTickLatencyMs = Date.now() - t0;

  return {
    castPlan,
    actorInputs,
    validInputs,
    projections: [], // Filled by actual LLM call
    telemetry,
    reasonerContextHint,
  };
}

/**
 * 将 Actor Simulation 上下文提示追加到 reasoner 消息中。
 * 仅在 soft 模式下调用。
 */
export function appendActorSimulationToMessages(
  messages: ChatMessage[],
  contextHint: string | null
): ChatMessage[] {
  if (!contextHint) return messages;

  const augmented = [...messages];
  const lastSystemIdx = augmented.map((m, i) => ({ m, i }))
    .filter(({ m }) => m.role === "system")
    .pop();

  if (lastSystemIdx) {
    augmented[lastSystemIdx.i] = {
      ...lastSystemIdx.m,
      content: `${lastSystemIdx.m.content}\n\n${contextHint}`,
    };
  }

  return augmented;
}
