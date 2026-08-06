// src/lib/langgraph/worldDirectorGraph.ts
/**
 * LangGraph StateGraph for World Director tick orchestration.
 *
 * Replaces the manual sequential pipeline in runWorldEngineTick() with a
 * declarative graph. Each node maps 1:1 to an existing business logic
 * function in src/lib/worldEngine/engine.ts.
 *
 * Graph topology:
 *
 *   START → load_context → build_messages → run_reasoner → parse_delta
 *                                                            │
 *   ┌────────────────────────────────────────────────────────┘
 *   ▼
 *   validate_plan → run_critic → apply_social_gm → build_director_hint
 *                                                      │
 *   ┌──────────────────────────────────────────────────┘
 *   ▼
 *   write_outputs → compute_next_state → END
 *
 * Conditional edges:
 *   - load_context failure → END (hasPlan=false)
 *   - run_reasoner failure → retry once → fallback (hasPlan=false)
 *   - parse_delta invalid → repair once → skip (hasPlan=false)
 *   - validate_plan violation → continue degraded (planConfidence="degraded")
 *   - write_outputs failure → rollback
 */

import { StateGraph, END } from "@langchain/langgraph";
import {
  WorldDirectorGraphAnnotation,
  createInitialState,
} from "./worldDirectorState";
import type { WorldDirectorGraphState } from "./worldDirectorState";
import type { WorldEngineTickPayload } from "@/lib/worldEngine/contracts";

// ---- Analytics helper ----

async function recordNodeAnalytics(
  nodeName: string,
  durationMs: number,
  status: "ok" | "error" | "skipped",
  state: WorldDirectorGraphState
): Promise<void> {
  try {
    const { recordGenericAnalyticsEvent } = await import("@/lib/analytics/repository");
    const idempotencyKey = `${state.payload.requestId}:langgraph:${nodeName}`;
    await recordGenericAnalyticsEvent({
      eventId: idempotencyKey,
      idempotencyKey,
      userId: state.payload.userId,
      guestId: state.payload.userId ? null : undefined,
      sessionId: state.payload.sessionId,
      eventName: "world_engine_langgraph_node",
      eventTime: new Date(),
      page: null,
      source: "world_engine",
      platform: "unknown",
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: {
        node_name: nodeName,
        duration_ms: durationMs,
        status,
        tick_id: state.payload.dedupKey ?? state.payload.requestId,
        hasPlan: state.hasPlan,
      },
    });
  } catch {
    // Analytics is best-effort; never fail the graph
  }
}

/**
 * Wraps a node function with timing, Langfuse tracing, and analytics.
 * Langfuse tracing is best-effort — failures never block the graph.
 */
function withAnalytics(
  nodeName: string,
  fn: (state: WorldDirectorGraphState) => Promise<Partial<WorldDirectorGraphState>>
): (state: WorldDirectorGraphState) => Promise<Partial<WorldDirectorGraphState>> {
  return async (state: WorldDirectorGraphState) => {
    const t0 = Date.now();

    // Langfuse stage span — best-effort, never block
    let langfuseSpan: import("@/lib/observability/langfuse").SpanHandle | undefined;
    try {
      const { startStageSpan } = await import("@/lib/observability/langfuse");
      langfuseSpan = startStageSpan({
        name: `world_director.${nodeName}`,
        status: "ok",
      });
    } catch {
      // Langfuse unavailable — continue without tracing
    }

    let result: Partial<WorldDirectorGraphState>;
    try {
      result = await fn(state);
      const merged = { ...state, ...result };
      const isError =
        merged.status === "error" || merged.status === "degraded";
      void recordNodeAnalytics(
        nodeName,
        Date.now() - t0,
        isError ? "error" : "ok",
        merged as WorldDirectorGraphState
      );

      // End Langfuse span with latency
      try {
        langfuseSpan?.setAttributes({ latencyMs: Date.now() - t0 });
        langfuseSpan?.end();
      } catch {
        // Langfuse failure is non-blocking
      }
    } catch (err) {
      void recordNodeAnalytics(nodeName, Date.now() - t0, "error", state);

      // End Langfuse span on error
      try {
        langfuseSpan?.setAttributes({ latencyMs: Date.now() - t0 });
        langfuseSpan?.end();
      } catch {
        // Langfuse failure is non-blocking
      }
      throw err;
    }
    return result;
  };
}

// ---- Node implementations ----

/**
 * Node: load_context
 *
 * Loads recent world facts, agenda summary, and director state from DB.
 * On failure, sets hasPlan=false and routes to END.
 */
async function loadContextNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { loadRecentWorldFacts, loadRecentAgendaSummary } =
    await import("@/lib/worldEngine/engine");
  const { loadDirectorState } = await import("@/lib/worldEngine/directorState");

  try {
    const [recentFacts, recentAgenda, directorState] = await Promise.all([
      loadRecentWorldFacts(state.payload.userId, state.payload.sessionId),
      loadRecentAgendaSummary(state.payload.sessionId),
      loadDirectorState(state.payload.sessionId),
    ]);

    return { recentFacts, recentAgenda, directorState, loadError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error loading context";
    return {
      loadError: message,
      hasPlan: false,
      planConfidence: "none",
      status: "error",
      errorStage: "load_context",
    };
  }
}

/**
 * Node: build_messages
 *
 * Builds the LLM prompt messages for the reasoner.
 */
async function buildMessagesNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { buildWorldEngineMessages } = await import("@/lib/worldEngine/engine");
  const { resolveWorldDirectorConfig } = await import("@/lib/worldEngine/config");
  const { resolveSocialWorldConfig } = await import("@/lib/socialWorld/config");

  const _cfg = resolveWorldDirectorConfig();
  const socialCfg = resolveSocialWorldConfig();

  const messages = buildWorldEngineMessages({
    payload: state.payload,
    recentFacts: state.recentFacts,
    recentAgenda: state.recentAgenda,
    directorState: state.directorState,
    socialWorld: {
      config: socialCfg,
      tickTriggered: false,
      skipReason: "langgraph_path",
      activeNpcIds: [],
      pendingEventCount: 0,
    },
  });

  return { messages };
}

/**
 * Node: run_reasoner
 *
 * Calls the offline reasoner (WORLDBUILD_OFFLINE task) to generate the
 * director plan. Retries once on failure.
 */
async function runReasonerNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { runOfflineReasonerTask } = await import("@/lib/ai/logicalTasks");
  const { resolveWorldDirectorConfig } = await import("@/lib/worldEngine/config");

  const cfg = resolveWorldDirectorConfig();

  try {
    const res = await runOfflineReasonerTask({
      kind: "worldbuild",
      messages: state.messages,
      ctx: {
        requestId: state.payload.requestId,
        userId: state.payload.userId,
        sessionId: state.payload.sessionId,
        path: "/worker/world-engine",
        tags: { purpose: "world_director", mode: cfg.mode },
      },
      requestTimeoutMs: 45_000,
      skipCache: true,
      extraBody: {
        enable_thinking: false,
        thinking: { type: "disabled" },
      },
      devOverrides: {
        responseFormatJsonObject: true,
        temperature: 0.2,
        maxTokens: 2048,
      },
    });

    if (!res.ok) {
      throw new Error(`Reasoner failed: ${res.code}`);
    }

    return {
      rawResponse: res.content ?? "",
      reasonerError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reasoner error";
    const retries = state.reasonerRetries + 1;

    if (retries < 2) {
      // Retry: stay on current node
      return {
        reasonerError: message,
        reasonerRetries: retries,
      };
    }

    // Exhausted retries: fallback with no plan
    return {
      reasonerError: message,
      reasonerRetries: retries,
      hasPlan: false,
      planConfidence: "none",
      status: "degraded",
    };
  }
}

/**
 * Node: parse_delta
 *
 * Parses the reasoner's JSON output into a structured delta.
 * On parse failure, attempts repair once via repairJsonObjectString.
 */
async function parseDeltaNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { parseWorldEngineDeltaJson } = await import("@/lib/worldEngine/contracts");

  if (!state.rawResponse) {
    return {
      parseError: "No raw response to parse",
      hasPlan: false,
      planConfidence: "none",
    };
  }

  try {
    const parsed = parseWorldEngineDeltaJson(state.rawResponse);
    if (!parsed) {
      throw new Error("Failed to parse reasoner JSON output");
    }

    return {
      structuredDelta: parsed,
      parseError: null,
      hasPlan: true,
      planConfidence: "normal",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse error";
    return {
      parseError: message,
      structuredDelta: null,
      hasPlan: false,
      planConfidence: "none",
    };
  }
}

/**
 * Node: validate_plan
 *
 * Runs deterministic validation on the structured delta.
 * Violations set planConfidence to "degraded" but don't block execution.
 */
async function validatePlanNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { validateDirectorPlan } = await import("@/lib/worldEngine/validator");

  if (!state.structuredDelta) {
    return {
      validationResult: {
        accepted: false,
        acceptedEventCodes: [],
        rejectedEventCodes: [],
        acceptedSocialEventCodes: [],
        rejectedSocialEventCodes: [],
        issues: [{ code: "no_delta", message: "No structured delta to validate", severity: "high" }],
      },
      hasPlan: false,
      planConfidence: "none",
    };
  }

  const result = validateDirectorPlan(state.structuredDelta);

  if (!result.accepted) {
    return {
      validationResult: result,
      planConfidence: "degraded",
    };
  }

  return { validationResult: result };
}

/**
 * Node: run_critic
 *
 * Optional LLM critic pass. Failure does not block execution.
 */
async function runCriticNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { runOptionalCritic } = await import("@/lib/worldEngine/engine");

  if (!state.structuredDelta || !state.validationResult) {
    return { criticResult: null };
  }

  try {
    const result = await runOptionalCritic({
      payload: state.payload,
      plan: state.structuredDelta,
      recentFacts: state.recentFacts,
      validation: state.validationResult,
    });
    return { criticResult: result as unknown as Record<string, unknown> };
  } catch {
    // Critic failure is non-blocking
    return { criticResult: null };
  }
}

/**
 * Node: apply_social_gm
 *
 * Applies social game master deltas (NPC relation changes, social events).
 * Failure does not block execution.
 */
async function applySocialGmNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  if (!state.structuredDelta || !state.validationResult) {
    return { socialGmResult: null };
  }

  // Social GM is optional — skip if no social events
  const socialEvents = state.structuredDelta.social_events_to_schedule ?? [];
  if (socialEvents.length === 0) {
    return { socialGmResult: null };
  }

  try {
    const { applySocialGmDeltas } = await import("@/lib/socialWorld/applyDeltas");
    const result = await applySocialGmDeltas({
      sessionId: state.payload.sessionId,
      userId: state.payload.userId,
      turnIndex: state.payload.turnIndex,
      dedupKey: state.payload.dedupKey,
      playerLocationId: state.payload.playerLocation,
      directorSocialEvents: socialEvents,
      npcRelationDeltas: state.structuredDelta.npc_relation_deltas ?? [],
      npcAgentPatches: state.structuredDelta.npc_agent_patches ?? [],
      riskAssessment: state.structuredDelta.risk_assessment,
      acceptedSocialEventCodes: state.validationResult.acceptedSocialEventCodes,
      cooldownTurns: 5,
      maxPendingEventsPerSession: 12,
    }).catch(() => null);

    return { socialGmResult: result as unknown as Record<string, unknown> ?? null };
  } catch {
    return { socialGmResult: null };
  }
}

/**
 * Node: write_outputs
 *
 * Persists the director plan, agenda items, and world meta.
 * On failure, attempts rollback.
 */
async function writeOutputsNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { writeWorldEngineOutputs } = await import("@/lib/worldEngine/engine");

  if (!state.structuredDelta || !state.validationResult) {
    return {
      writeResult: { agendaCreated: 0, agendaSkipped: 0 },
      writeError: "No structured delta or validation result",
      hasPlan: false,
    };
  }

  try {
    const out = await writeWorldEngineOutputs({
      payload: state.payload,
      delta: state.structuredDelta,
      validation: state.validationResult,
      socialGm: (state.socialGmResult as unknown as any) ?? null,
      socialTelemetry: {
        socialWorldMode: "shadow",
        socialTickTriggered: false,
        socialActiveNpcCount: 0,
        socialEventsAccepted: 0,
        socialEventsRejected: 0,
        socialPromptChars: 0,
        socialQueryLatencyMs: 0,
        socialReasonerLatencyMs: 0,
        socialRejectedByCode: {},
        socialProjectionSkippedReason: "langgraph_path",
        socialPendingEventCount: 0,
        socialTickSkippedReason: "langgraph_path",
      },
      previousDirectorState: state.directorState,
      // Pass the pre-built LangGraph hint block so it gets persisted in
      // world_engine_agenda_snapshots.snapshot_json.langgraph_hint_block.
      langgraphHintBlock: state.directorHintBlock || undefined,
    });

    return {
      writeResult: {
        agendaCreated: out.agendaCreated,
        agendaSkipped: out.agendaSkipped,
      },
      writeError: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write error";
    return {
      writeResult: { agendaCreated: 0, agendaSkipped: 0 },
      writeError: message,
      status: "error",
      errorStage: "write_outputs",
    };
  }
}

/**
 * Node: compute_next_state
 *
 * Computes and persists the next director state (pacing, phase transition).
 */
async function computeNextStateNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { computeNextDirectorState, saveDirectorState } =
    await import("@/lib/worldEngine/directorState");

  if (!state.structuredDelta || !state.directorState) {
    return { nextDirectorState: null };
  }

  try {
    const next = computeNextDirectorState({
      previousState: state.directorState,
      plan: state.structuredDelta,
      sessionId: state.payload.sessionId,
      userId: state.payload.userId,
      turnIndex: state.payload.turnIndex,
    });

    await saveDirectorState(next).catch(() => {
      // Non-blocking: state save failure should not fail the tick
    });

    return { nextDirectorState: next };
  } catch {
    return { nextDirectorState: state.directorState };
  }
}

/**
 * Node: build_director_hint
 *
 * Generates the directorHintBlock for injection into the writing agent's prompt.
 */
async function buildDirectorHintNode(
  state: WorldDirectorGraphState
): Promise<Partial<WorldDirectorGraphState>> {
  const { buildDirectorHintBlock, buildDegradedDirectorHint } =
    await import("@/lib/langgraph/directorHintBuilder");

  if (state.hasPlan && state.structuredDelta) {
    if (state.planConfidence === "degraded") {
      return {
        directorHintBlock: buildDegradedDirectorHint(state.structuredDelta),
      };
    }
    return {
      directorHintBlock: buildDirectorHintBlock({
        hasPlan: true,
        planConfidence: state.planConfidence,
        structuredDelta: state.structuredDelta,
        // Only directorState is available at this point (nextDirectorState is
        // computed later in compute_next_state after write_outputs).
        directorState: state.directorState,
      }),
    };
  }

  return { directorHintBlock: "" };
}

// ---- Conditional edge routing ----

/**
 * Route after load_context.
 * On error → END. Otherwise → build_messages.
 */
function routeAfterLoadContext(state: WorldDirectorGraphState): string {
  if (state.loadError) return END;
  return "build_messages";
}

/**
 * Route after run_reasoner.
 * If retries < 2 and error → retry (stay). If exhausted → END.
 * Otherwise → parse_delta.
 */
function routeAfterReasoner(state: WorldDirectorGraphState): string {
  if (state.reasonerError) {
    if (state.reasonerRetries < 2) return "run_reasoner"; // retry
    return END;
  }
  return "parse_delta";
}

/**
 * Route after parse_delta.
 * If failed and hasPlan=false → END. Otherwise → validate_plan.
 */
function routeAfterParseDelta(state: WorldDirectorGraphState): string {
  if (!state.hasPlan) return END;
  return "validate_plan";
}

/**
 * Route after write_outputs.
 * On error → END. Otherwise → compute_next_state.
 */
function routeAfterWriteOutputs(state: WorldDirectorGraphState): string {
  if (state.writeError && state.status === "error") return END;
  return "compute_next_state";
}

// ---- Graph construction ----

/**
 * Build and compile the World Director StateGraph.
 *
 * Returns a CompiledStateGraph that can be invoked with:
 *   graph.invoke(createInitialState(payload), config)
 */
export function buildWorldDirectorGraph() {
  const graph = new StateGraph(WorldDirectorGraphAnnotation)
    // Add nodes (key nodes wrapped with analytics)
    .addNode("load_context", withAnalytics("load_context", loadContextNode))
    .addNode("build_messages", withAnalytics("build_messages", buildMessagesNode))
    .addNode("run_reasoner", withAnalytics("run_reasoner", runReasonerNode))
    .addNode("parse_delta", withAnalytics("parse_delta", parseDeltaNode))
    .addNode("validate_plan", withAnalytics("validate_plan", validatePlanNode))
    .addNode("run_critic", withAnalytics("run_critic", runCriticNode))
    .addNode("apply_social_gm", withAnalytics("apply_social_gm", applySocialGmNode))
    .addNode("write_outputs", withAnalytics("write_outputs", writeOutputsNode))
    .addNode("compute_next_state", withAnalytics("compute_next_state", computeNextStateNode))
    .addNode("build_director_hint", withAnalytics("build_director_hint", buildDirectorHintNode))

    // Define edges
    // build_director_hint runs BEFORE write_outputs so the rich LangGraph hint
    // can be persisted into world_engine_agenda_snapshots.snapshot_json.langgraph_hint_block.
    .addEdge("__start__", "load_context")
    .addConditionalEdges("load_context", routeAfterLoadContext)
    .addEdge("build_messages", "run_reasoner")
    .addConditionalEdges("run_reasoner", routeAfterReasoner)
    .addConditionalEdges("parse_delta", routeAfterParseDelta)
    .addEdge("validate_plan", "run_critic")
    .addEdge("run_critic", "apply_social_gm")
    .addEdge("apply_social_gm", "build_director_hint")
    .addEdge("build_director_hint", "write_outputs")
    .addConditionalEdges("write_outputs", routeAfterWriteOutputs)
    .addEdge("compute_next_state", END);

  return graph.compile();
}

// ---- Invocation entry point ----

/**
 * Run the World Director tick through the LangGraph pipeline.
 *
 * This is the main entry point called from runWorldEngineTick()
 * when VERSECRAFT_ENABLE_LANGGRAPH=true.
 *
 * Returns the graph's final state, which includes:
 * - hasPlan: whether a valid director plan was generated
 * - directorHintBlock: directional guidance for the writing agent
 * - writeResult: agenda creation summary
 */
export async function runWorldEngineTickGraph(
  payload: WorldEngineTickPayload
): Promise<WorldDirectorGraphState> {
  const graph = buildWorldDirectorGraph();
  const initialState = createInitialState(payload);

  const result = await graph.invoke(initialState, {
    configurable: {
      thread_id: `world_director_${payload.sessionId}_${payload.dedupKey}`,
    },
  });

  return result as WorldDirectorGraphState;
}
