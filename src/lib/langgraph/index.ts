// src/lib/langgraph/index.ts
/**
 * LangGraph-based director agent orchestration module.
 *
 * This module replaces hand-rolled pipeline code in:
 * - src/lib/worldEngine/engine.ts (World Director main pipeline)
 * - src/lib/worldEngine/actorSimulation/ (Actor Simulation sub-pipeline)
 * - src/lib/ai/tools/dmAgentOrchestrator.ts (DM Agent tool loop)
 *
 * Each node in the LangGraph graph maps 1:1 to an existing business logic
 * function. LangGraph only replaces the orchestration layer — the "how to
 * route between steps" — while each step's logic remains unchanged.
 *
 * Controlled by VERSECRAFT_ENABLE_LANGGRAPH feature flag (default false).
 */

export { resolveLangGraphFlags } from "./featureFlag";
export type { LangGraphFeatureFlags } from "./featureFlag";

export { buildDirectorHintBlock, buildDegradedDirectorHint } from "./directorHintBuilder";
export type { DirectorHintInput } from "./directorHintBuilder";

export { getCheckpointSaver, cleanupExpiredCheckpoints, resetCheckpointSaver } from "./checkpointer";

// World Director main graph
export { buildWorldDirectorGraph, runWorldEngineTickGraph } from "./worldDirectorGraph";
export type { WorldDirectorGraphState } from "./worldDirectorState";
export { WorldDirectorGraphAnnotation, createInitialState } from "./worldDirectorState";

// Actor Simulation subgraph
export { buildActorSimulationSubgraph, runActorSimulationSubgraph } from "./actorSimulationSubgraph";
export type { ActorSimGraphState } from "./actorSimulationSubgraph";

// DM Agent graph
export { buildDmAgentGraph, runDmAgentGraph } from "./dmAgentGraph";
export type { DmAgentGraphState } from "./dmAgentGraph";
