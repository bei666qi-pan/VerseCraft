// src/lib/ai/types/core.ts
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";

/** Unified gateway (one-api OpenAI-compatible). */
export type AiProviderId = "oneapi";

/**
 * Task taxonomy for routing. Policy table: `src/lib/ai/tasks/taskPolicy.ts`.
 * - PLAYER_CHAT: online DM / SSE (forbidden roles: reasoner, enhance).
 * - Control-plane tasks: PLAYER_CONTROL_PREFLIGHT, INTENT_PARSE, SAFETY_PREFILTER (control role).
 * - Adjudication / combat text: RULE_RESOLUTION, COMBAT_NARRATION (main role).
 * - Sensory polish: SCENE_ENHANCEMENT, NPC_EMOTION_POLISH (enhance role).
 * - Offline / admin: WORLDBUILD_OFFLINE, STORYLINE_SIMULATION, DEV_ASSIST, MEMORY_COMPRESSION.
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
  isDoneToken: boolean;
}
