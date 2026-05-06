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
  | "options_only_invalid";

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
