import { envBoolean, envNumber } from "@/lib/config/envRaw";
import type { ChatPerfFlags, ChatTtftProfile, RiskLane, TtftAggregatePoint } from "@/lib/turnEngine/types";

const TTFT_HARD_CAP_CONTROL_PREFLIGHT_MS = 260;
const TTFT_HARD_CAP_LORE_MS = 220;
const TTFT_AGGREGATE_RING_MAX = 120;

const ttftAggregateRing: TtftAggregatePoint[] = [];

export function createChatTtftProfile(args: {
  requestReceivedAt: number;
  jsonParseMs: number;
  lane?: RiskLane;
}): ChatTtftProfile {
  return {
    requestReceivedAt: args.requestReceivedAt,
    jsonParseMs: args.jsonParseMs,
    authSessionMs: null,
    validateChatRequestMs: null,
    moderateInputOnServerMs: null,
    preInputModerationMs: null,
    quotaCheckMs: null,
    sessionMemoryReadMs: null,
    controlPreflightMs: null,
    loreRetrievalMs: null,
    promptBuildMs: null,
    generateMainReplyStartedAt: null,
    firstValidStreamChunkAt: null,
    firstSseWriteAt: null,
    lane: args.lane ?? "slow",
  };
}

export function resolveChatPerfFlags(): ChatPerfFlags {
  return {
    enableRiskLaneSplit: envBoolean("AI_CHAT_ENABLE_RISK_LANE_SPLIT", true),
    enableLightweightFastPath: envBoolean("AI_CHAT_ENABLE_LIGHTWEIGHT_FAST_PATH", true),
    enablePromptSlimming: envBoolean("AI_CHAT_ENABLE_PROMPT_SLIMMING", true),
    fastLaneSkipRuntimePackets: envBoolean("AI_CHAT_FASTLANE_SKIP_RUNTIME_PACKETS", true),
    tieredContextBuild: envBoolean("AI_CHAT_TIERED_CONTEXT_BUILD", true),
    controlPreflightBudgetMsCap: Math.max(
      0,
      Math.min(2000, envNumber("AI_CHAT_CONTROL_PREFLIGHT_BUDGET_MS_CAP", TTFT_HARD_CAP_CONTROL_PREFLIGHT_MS))
    ),
    loreRetrievalBudgetMsCap: Math.max(
      0,
      Math.min(2000, envNumber("AI_CHAT_LORE_RETRIEVAL_BUDGET_MS_CAP", TTFT_HARD_CAP_LORE_MS))
    ),
  };
}

export function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[idx] ?? 0;
}

export function pushAndSummarizeTtft(point: TtftAggregatePoint): {
  avg: number;
  p95: number;
  slowestStageTop: string;
  sampleCount: number;
} {
  ttftAggregateRing.push(point);
  if (ttftAggregateRing.length > TTFT_AGGREGATE_RING_MAX) {
    ttftAggregateRing.splice(0, ttftAggregateRing.length - TTFT_AGGREGATE_RING_MAX);
  }
  const totals = ttftAggregateRing.map((item) => item.totalTTFT);
  const avg = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const p95Value = p95(totals);
  const stageCount = new Map<string, number>();
  for (const item of ttftAggregateRing) {
    stageCount.set(item.slowestStage, (stageCount.get(item.slowestStage) ?? 0) + 1);
  }
  const slowestStageTop =
    [...stageCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
  return { avg, p95: p95Value, slowestStageTop, sampleCount: ttftAggregateRing.length };
}

export function nowMs(): number {
  return Date.now();
}

export function elapsedMs(startAt: number): number {
  return Math.max(0, nowMs() - startAt);
}
