// src/lib/langgraph/actorSimulationSubgraph.ts
/**
 * LangGraph StateGraph for Actor Simulation (Phase 3).
 *
 * A thin LangGraph wrapper around the existing Actor Simulation pipeline
 * in src/lib/worldEngine/actorSimulation/. The graph provides state
 * management, conditional routing, and checkpointing, while delegating
 * all business logic to the existing functions.
 *
 * Graph topology:
 *   START → run_simulation → build_context_hint → END
 *
 * The graph serves as an orchestration layer; the actual simulation
 * logic remains in the existing modules.
 */

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import type { ChatMessage } from "@/lib/ai/types/core";

// ---- State ----

export interface ActorSimGraphState {
  ctx: any;
  messages: ChatMessage[];
  reasonerContextHint: string;
  telemetry: Record<string, unknown>;
  error: string | null;
  status: "running" | "completed" | "skipped" | "error";
}

export const ActorSimGraphAnnotation = Annotation.Root({
  ctx: Annotation<any>,
  messages: Annotation<ChatMessage[]>,
  reasonerContextHint: Annotation<string>,
  telemetry: Annotation<Record<string, unknown>>,
  error: Annotation<string | null>,
  status: Annotation<"running" | "completed" | "skipped" | "error">,
});

// ---- Nodes ----

/**
 * Run the full actor simulation phase.
 * Delegates to the existing runActorSimulationPhase function.
 */
async function runSimulationNode(
  state: ActorSimGraphState
): Promise<Partial<ActorSimGraphState>> {
  try {
    const { runActorSimulationPhase } = await import(
      "@/lib/worldEngine/actorSimulation/integration"
    );

    const result = await runActorSimulationPhase(state.ctx);

    return {
      reasonerContextHint: result.reasonerContextHint ?? "",
      telemetry: (result.telemetry as unknown as Record<string, unknown>) ?? {},
      status: "completed",
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "actor_simulation_failed",
      status: "error",
      reasonerContextHint: "",
      telemetry: {},
    };
  }
}

/**
 * Build the reasoner context hint from simulation results.
 */
async function buildContextHintNode(
  _state: ActorSimGraphState
): Promise<Partial<ActorSimGraphState>> {
  // Context hint is already computed in run_simulation node.
  // This node exists as a hook for future extensions.
  return {};
}

// ---- Routing ----

function routeAfterSimulation(state: ActorSimGraphState): string {
  if (state.status === "error") return END;
  return "build_context_hint";
}

// ---- Graph ----

export function buildActorSimulationSubgraph() {
  return new StateGraph(ActorSimGraphAnnotation)
    .addNode("run_simulation", runSimulationNode)
    .addNode("build_context_hint", buildContextHintNode)

    .addEdge("__start__", "run_simulation")
    .addConditionalEdges("run_simulation", routeAfterSimulation)
    .addEdge("build_context_hint", END)

    .compile();
}

/**
 * Run the Actor Simulation through the LangGraph pipeline.
 */
export async function runActorSimulationSubgraph(
  ctx: any
): Promise<{
  reasonerContextHint: string;
  telemetry: Record<string, unknown>;
}> {
  const graph = buildActorSimulationSubgraph();
  const initialState: Partial<ActorSimGraphState> = {
    ctx,
    messages: [],
    reasonerContextHint: "",
    telemetry: {},
    error: null,
    status: "running",
  };

  const result = await graph.invoke(initialState);
  const final = result as ActorSimGraphState;

  return {
    reasonerContextHint: final.reasonerContextHint,
    telemetry: final.telemetry,
  };
}
