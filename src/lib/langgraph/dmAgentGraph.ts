// src/lib/langgraph/dmAgentGraph.ts
/**
 * LangGraph agent graph for DM Agent tool-calling loop.
 *
 * A thin LangGraph wrapper around the existing runDmAgentTurn function
 * in dmAgentOrchestrator.ts. The graph provides state management and
 * structured routing, while the actual tool-calling logic remains
 * in the existing module.
 *
 * Hard constraints preserved (from DM_AGENT_DEFAULTS):
 * - Maximum 2 tool-calling rounds (3 absolute upper bound)
 * - Total budget 30 seconds
 * - Per-tool timeout 3 seconds
 *
 * Graph topology:
 *
 *   START → run_agent → END
 */

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import type { ChatMessage } from "@/lib/ai/types/core";
import type {
  DmAgentContext,
  DmAgentTurnResult,
  DmAgentFeatureFlags,
} from "@/lib/ai/tools/dmAgentTypes";

// ---- State ----

export interface DmAgentGraphState {
  ctx: DmAgentContext;
  messages: ChatMessage[];
  flags: DmAgentFeatureFlags;
  result: DmAgentTurnResult | null;
  error: string | null;
  status: "running" | "completed" | "skipped" | "error";
}

export const DmAgentGraphAnnotation = Annotation.Root({
  ctx: Annotation<DmAgentContext>,
  messages: Annotation<ChatMessage[]>,
  flags: Annotation<DmAgentFeatureFlags>,
  result: Annotation<DmAgentTurnResult | null>,
  error: Annotation<string | null>,
  status: Annotation<"running" | "completed" | "skipped" | "error">,
});

// ---- Nodes ----

/**
 * Run the DM Agent turn.
 * Delegates to the existing runDmAgentTurn function.
 */
async function runAgentNode(
  state: DmAgentGraphState
): Promise<Partial<DmAgentGraphState>> {
  try {
    const { runDmAgentTurn } = await import(
      "@/lib/ai/tools/dmAgentOrchestrator"
    );

    const result = await runDmAgentTurn({
      flags: state.flags,
      ctx: state.ctx,
      messages: state.messages,
    });

    return {
      result,
      status: result ? "completed" : "skipped",
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "dm_agent_failed",
      status: "error",
      result: null,
    };
  }
}

// ---- Graph ----

export function buildDmAgentGraph() {
  return new StateGraph(DmAgentGraphAnnotation)
    .addNode("run_agent", runAgentNode)
    .addEdge("__start__", "run_agent")
    .addEdge("run_agent", END)
    .compile();
}

// ---- Invocation ----

/**
 * Run the DM Agent through the LangGraph pipeline.
 * Returns the same result as runDmAgentTurn.
 */
export async function runDmAgentGraph(
  flags: DmAgentFeatureFlags,
  ctx: DmAgentContext,
  messages: ChatMessage[]
): Promise<DmAgentTurnResult | null> {
  const graph = buildDmAgentGraph();
  const initialState: Partial<DmAgentGraphState> = {
    ctx,
    messages,
    flags,
    result: null,
    error: null,
    status: "running",
  };

  const result = await graph.invoke(initialState, {
    configurable: {
      thread_id: `dm_agent_${ctx.requestId}`,
    },
  });

  const final = result as DmAgentGraphState;
  return final.result;
}
