// src/lib/ai/types/core.ts

/** Upstream vendor implementing chat completions. */
export type AiProviderId = "deepseek" | "zhipu" | "minimax";

/**
 * Task taxonomy for routing. Policy table: `src/lib/ai/tasks/taskPolicy.ts`.
 * - PLAYER_CHAT: only online DM / SSE main path (no reasoner / no MiniMax).
 * - GLM-heavy control tasks: INTENT_PARSE, SAFETY_PREFILTER.
 * - DeepSeek-V3.2 adjudication: RULE_RESOLUTION, COMBAT_NARRATION.
 * - MiniMax sensory-only: SCENE_ENHANCEMENT, NPC_EMOTION_POLISH.
 * - Offline / admin: WORLDBUILD_OFFLINE, STORYLINE_SIMULATION, DEV_ASSIST, MEMORY_COMPRESSION (async).
 */
export type TaskType =
  | "PLAYER_CHAT"
  | "INTENT_PARSE"
  | "SAFETY_PREFILTER"
  | "RULE_RESOLUTION"
  | "COMBAT_NARRATION"
  | "SCENE_ENHANCEMENT"
  | "NPC_EMOTION_POLISH"
  | "WORLDBUILD_OFFLINE"
  | "STORYLINE_SIMULATION"
  | "DEV_ASSIST"
  | "MEMORY_COMPRESSION";

/** Declared abilities for registry entries (extensible for future tools / vision). */
export type ModelCapability =
  | "chat"
  | "stream"
  | "json_mode"
  | "reasoning"
  | "high_speed_variant";

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** Message shape after sanitization (no reasoning_content). */
export interface ChatMessage {
  role: ChatRole;
  content: string;
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
}

/** Normalized chunk from any vendor stream before business SSE. */
export type StreamChunk =
  | { kind: "delta"; text: string }
  | { kind: "usage"; usage: TokenUsage }
  | { kind: "done" };

/** Ordered fallback description (resolved models only). */
export interface FallbackPolicy {
  chain: readonly string[];
  stopOnFirstSuccess: boolean;
  tripCircuitOnFailure: boolean;
}

/** OpenAI-compatible streaming line parse output. */
export interface OpenAiStreamFrame {
  deltaText: string;
  usage: TokenUsage | null;
  isDoneToken: boolean;
}
