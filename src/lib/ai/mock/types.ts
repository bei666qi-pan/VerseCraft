import type { ChatMessage, TaskType, TokenUsage } from "@/lib/ai/types/core";

export type MockAiScenario =
  | "normal_stream"
  | "missing_options"
  | "malformed_json"
  | "empty_stream"
  | "disconnect_before_final"
  | "slow_first_token"
  | "long_chunk_gap"
  | "options_only_valid"
  | "options_only_invalid"
  // Dirty adversarial scenarios (L3 narrative safety gate must detect these)
  | "dirty_forbidden_terms"
  | "dirty_leak_dm_only"
  | "dirty_offscreen_npc_speech"
  | "dirty_reveal_tier_breach"
  | "dirty_malformed_fields"
  | "dirty_canned_options"
  | "dirty_repetitive_empty"
  | "dirty_name_contamination";

export interface MockAiDelayConfig {
  firstTokenDelayMs: number;
  chunkDelayMs: number;
  finalDelayMs: number;
}

export interface MockStreamScenario {
  scenario: MockAiScenario;
  chunks: string[];
  includeDone: boolean;
  usage: TokenUsage;
}

export interface MockCompletionScenario {
  scenario: MockAiScenario;
  content: string;
  usage: TokenUsage;
}

export interface MockScenarioInput {
  task: TaskType;
  messages: ChatMessage[];
  tags?: Record<string, string | number | boolean | null | undefined>;
}
