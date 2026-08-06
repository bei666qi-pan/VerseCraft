// src/lib/langgraph/worldDirectorState.ts
/**
 * LangGraph state schema for the World Director graph.
 *
 * Maps the existing WorldEngineTickPayload + intermediate results through
 * the graph lifecycle. The state flows through nodes: load_context →
 * build_messages → run_reasoner → parse_delta → validate_plan →
 * run_critic → apply_social_gm → build_director_hint → write_outputs →
 * compute_next_state.
 */

import { Annotation } from "@langchain/langgraph";
import type {
  WorldEngineTickPayload,
  WorldEngineStructuredDelta,
} from "@/lib/worldEngine/contracts";
import type { WorldDirectorState as DirectorPacingState } from "@/lib/worldEngine/directorState";
import type { ChatMessage } from "@/lib/ai/types/core";
import type { DirectorValidationResult } from "@/lib/worldEngine/validator";

// ---- State type (for consumer use) ----

export interface WorldDirectorGraphState {
  // Input
  payload: WorldEngineTickPayload;

  // load_context
  recentFacts: string[];
  recentAgenda: Array<Record<string, unknown>>;
  directorState: DirectorPacingState | null;
  loadError: string | null;

  // build_messages
  messages: ChatMessage[];

  // run_reasoner
  rawResponse: string | null;
  reasonerError: string | null;
  reasonerRetries: number;

  // parse_delta
  structuredDelta: WorldEngineStructuredDelta | null;
  parseError: string | null;

  // validate_plan
  validationResult: DirectorValidationResult | null;

  // run_critic
  criticResult: Record<string, unknown> | null;

  // apply_social_gm
  socialGmResult: Record<string, unknown> | null;

  // write_outputs
  writeResult: { agendaCreated: number; agendaSkipped: number } | null;
  writeError: string | null;

  // compute_next_state
  nextDirectorState: DirectorPacingState | null;

  // build_director_hint
  directorHintBlock: string;

  // Output signals
  hasPlan: boolean;
  planConfidence: "none" | "degraded" | "normal";
  status: "running" | "completed" | "error" | "degraded";
  errorStage: string | null;
}

// ---- Annotation schema (for graph definition) ----

export const WorldDirectorGraphAnnotation = Annotation.Root({
  payload: Annotation<WorldEngineTickPayload>,

  recentFacts: Annotation<string[]>,
  recentAgenda: Annotation<Array<Record<string, unknown>>>,
  directorState: Annotation<DirectorPacingState | null>,
  loadError: Annotation<string | null>,

  messages: Annotation<ChatMessage[]>,

  rawResponse: Annotation<string | null>,
  reasonerError: Annotation<string | null>,
  reasonerRetries: Annotation<number>,

  structuredDelta: Annotation<WorldEngineStructuredDelta | null>,
  parseError: Annotation<string | null>,

  validationResult: Annotation<DirectorValidationResult | null>,

  criticResult: Annotation<Record<string, unknown> | null>,

  socialGmResult: Annotation<Record<string, unknown> | null>,

  writeResult: Annotation<{ agendaCreated: number; agendaSkipped: number } | null>,
  writeError: Annotation<string | null>,

  nextDirectorState: Annotation<DirectorPacingState | null>,

  directorHintBlock: Annotation<string>,

  hasPlan: Annotation<boolean>,
  planConfidence: Annotation<"none" | "degraded" | "normal">,
  status: Annotation<"running" | "completed" | "error" | "degraded">,
  errorStage: Annotation<string | null>,
});

/**
 * Create the initial state from a tick payload.
 */
export function createInitialState(
  payload: WorldEngineTickPayload
): WorldDirectorGraphState {
  return {
    payload,
    recentFacts: [],
    recentAgenda: [],
    directorState: null,
    loadError: null,
    messages: [],
    rawResponse: null,
    reasonerError: null,
    reasonerRetries: 0,
    structuredDelta: null,
    parseError: null,
    validationResult: null,
    criticResult: null,
    socialGmResult: null,
    writeResult: null,
    writeError: null,
    nextDirectorState: null,
    directorHintBlock: "",
    hasPlan: false,
    planConfidence: "none",
    status: "running",
    errorStage: null,
  };
}
