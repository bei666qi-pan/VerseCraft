// src/lib/worldEngine/actorSimulation/index.ts
/**
 * Phase 3: Background Actor Simulation
 * 
 * 后台 NPC 行动推演与导演汇总。
 * 所有模拟均在 worker/background tick 运行，不进入 /api/chat 等待路径。
 */

export type {
  DirectorCastPlan,
  DirectorCastActor,
  CastSelectionReasonCode,
  ActorSimulationInput,
  ActorRelationEdge,
  EpistemicFactSummary,
  ActorProjection,
  ActorCandidateAction,
  PlayerAgencyConstraint,
  ActorProjectionIssue,
  ActorProjectionIssueCode,
  DirectorSynthesisInput,
  ActorSimulationTelemetry,
  ActorSimulationFlags,
} from "./types";

export { selectCastForTick, type SelectCastArgs } from "./castSelection";
export { buildActorSimulationInput, hasValidActorInput, type BuildActorInputArgs } from "./buildActorInput";
export { validateActorProjection, type ValidateProjectionArgs, type ValidateProjectionResult } from "./validateProjection";
export { resolveActorSimulationFlags, shouldRunActorSimulation, isActorSimulationShadow } from "./config";

export {
  runActorSimulationPhase,
  appendActorSimulationToMessages,
  type RunActorSimulationResult,
  type ActorSimulationContext,
  type EpistemicIndex,
} from "./integration";
