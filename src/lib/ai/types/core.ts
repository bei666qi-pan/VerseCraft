// src/lib/ai/types/core.ts
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";

/** Unified gateway (one-api OpenAI-compatible) plus deterministic local mock for tests/evals. */
export type AiProviderId = "oneapi" | "mock";

/**
 * Task taxonomy for routing. Policy table: `src/lib/ai/tasks/taskPolicy.ts`.
 * - PLAYER_CHAT: online DM / SSE (forbidden roles: reasoner, enhance).
 * - Control-plane tasks: PLAYER_CONTROL_PREFLIGHT, INTENT_PARSE, SAFETY_PREFILTER (control role).
 * - Adjudication / combat text: RULE_RESOLUTION, COMBAT_NARRATION (main role).
 * - Sensory polish: SCENE_ENHANCEMENT, NPC_EMOTION_POLISH, NARRATIVE_EXPANSION (enhance role).
 * - Presentation-only localization: GAMEPLAY_LOCALIZATION (main role, no state changes).
 * - Offline / admin: WORLDBUILD_OFFLINE, STORYLINE_SIMULATION, DEV_ASSIST, MEMORY_COMPRESSION.
 * - Eval / judge: EVAL_JUDGE (fast JSON, control role, no streaming).
 */
export type TaskType =
  | "PLAYER_CHAT"
  /** Control-plane for realtime play: intent, slots, risk tags, enhancement flags (no story text). */
  | "PLAYER_CONTROL_PREFLIGHT"
  | "INTENT_PARSE"
  | "SAFETY_PREFILTER"
  | "RULE_RESOLUTION"
  | "COMBAT_NARRATION"
  | "SCENE_ENHANCEMENT"
  | "NARRATIVE_EXPANSION"
  | "NPC_EMOTION_POLISH"
  | "GAMEPLAY_LOCALIZATION"
  | "WORLDBUILD_OFFLINE"
  | "STORYLINE_SIMULATION"
  | "DIRECTOR_PLAN_CRITIC"
  | "DEV_ASSIST"
  | "MEMORY_COMPRESSION"
  /** LLM-as-Judge: structured rubric scoring, non-streaming, control-role fast path. */
  | "EVAL_JUDGE";

/** Declared abilities for registry entries (extensible for future tools / vision). */
export type ModelCapability =
  | "chat"
  | "stream"
  | "json_mode"
  | "reasoning"
  | "high_speed_variant";

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** OpenAI-compatible function tool declaration (request side). */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema object describing the arguments. */
    parameters: Record<string, unknown>;
  };
}

/** OpenAI-compatible tool call emitted by the assistant (response side). */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** Raw JSON string as returned by the model; parse defensively. */
    arguments: string;
  };
}

/** Request-level tool selection strategy. */
export type ToolChoiceOption = "auto" | "none" | "required";

/** Message shape after sanitization (no reasoning_content). */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant tool-call round; serialized as `tool_calls` upstream. Only meaningful when role === "assistant". */
  toolCalls?: ToolCall[];
  /** Links a role === "tool" result message to its originating call; serialized as `tool_call_id` upstream. */
  toolCallId?: string;
}

export interface AIRequestContext {
  requestId: string;
  task: TaskType;
  userId?: string | null;
  sessionId?: string | null;
  path?: string;
  tags?: Record<string, string | number | boolean | null | undefined>;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** OpenAI-style prompt cache / KV hits when upstream exposes them. */
  cachedPromptTokens?: number;
}

/** Normalized chunk from any vendor stream before business SSE. */
export type StreamChunk =
  | { kind: "delta"; text: string }
  | { kind: "usage"; usage: TokenUsage }
  | { kind: "done" };

/** Ordered fallback description (logical roles with configured gateway models). */
export interface FallbackPolicy {
  chain: readonly AiLogicalRole[];
  stopOnFirstSuccess: boolean;
  tripCircuitOnFailure: boolean;
}

/** OpenAI-compatible streaming line parse output. */
export interface OpenAiStreamFrame {
  deltaText: string;
  usage: TokenUsage | null;
  finishReason: string | null;
  isDoneToken: boolean;
}
