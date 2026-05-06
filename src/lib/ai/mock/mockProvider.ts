import { resolveAiEnv } from "@/lib/ai/config/envCore";
import { resolveOperationMode } from "@/lib/ai/degrade/modeCore";
import { buildMockCompletionScenario, buildMockStreamScenario } from "@/lib/ai/mock/mockScenarios";
import { createMockOpenAiStreamResponse } from "@/lib/ai/mock/mockStream";
import type { AiRoutingAttempt, AiRoutingReport } from "@/lib/ai/routing/types";
import type { AIResponse } from "@/lib/ai/types";
import type { AIRequestContext, ChatMessage, TaskType } from "@/lib/ai/types/core";
import type { PlayerChatStreamResult } from "@/lib/ai/router/execute";

const MOCK_PROVIDER_ID = "mock" as const;

export function isMockAiProviderEnabled(): boolean {
  return resolveAiEnv().gatewayProvider === MOCK_PROVIDER_ID;
}

function mockAttempt(task: TaskType, latencyMs: number): AiRoutingAttempt {
  const logicalRole = task === "PLAYER_CHAT" ? "main" : task === "PLAYER_CONTROL_PREFLIGHT" ? "control" : "main";
  return {
    logicalRole,
    providerId: MOCK_PROVIDER_ID,
    gatewayModel: `mock-${logicalRole}`,
    phase: "http",
    latencyMs,
  };
}

function mockRoutingReport(args: {
  task: TaskType;
  ctx: AIRequestContext;
  attempt: AiRoutingAttempt;
}): AiRoutingReport {
  return {
    requestId: args.ctx.requestId,
    task: args.task,
    operationMode: resolveOperationMode(),
    intendedRole: args.attempt.logicalRole,
    actualLogicalRole: args.attempt.logicalRole,
    fallbackCount: 0,
    attempts: [args.attempt],
    finalStatus: "success",
  };
}

export async function executeMockPlayerChatStream(params: {
  messages: ChatMessage[];
  ctx: AIRequestContext;
}): Promise<PlayerChatStreamResult> {
  const t0 = Date.now();
  const scenario = buildMockStreamScenario({
    task: "PLAYER_CHAT",
    messages: params.messages,
    tags: params.ctx.tags,
  });
  const attempt = mockAttempt("PLAYER_CHAT", Date.now() - t0);
  return {
    ok: true,
    response: createMockOpenAiStreamResponse(scenario),
    logicalRole: "main",
    providerId: MOCK_PROVIDER_ID,
    intendedLogicalRole: "main",
    gatewayModel: "mock-main",
    operationMode: resolveOperationMode(),
    httpAttempts: [attempt],
  };
}

export async function executeMockChatCompletion(params: {
  task: TaskType;
  messages: ChatMessage[];
  ctx: AIRequestContext;
}): Promise<AIResponse> {
  const t0 = Date.now();
  const scenario = buildMockCompletionScenario({
    task: params.task,
    messages: params.messages,
    tags: params.ctx.tags,
  });
  const latencyMs = Math.max(1, Date.now() - t0);
  const attempt = mockAttempt(params.task, latencyMs);
  return {
    ok: true,
    providerId: MOCK_PROVIDER_ID,
    logicalRole: attempt.logicalRole,
    content: scenario.content,
    usage: scenario.usage,
    latencyMs,
    routing: mockRoutingReport({ task: params.task, ctx: params.ctx, attempt }),
  };
}
