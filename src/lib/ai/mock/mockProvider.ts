import { resolveAiEnv } from "@/lib/ai/config/envCore";
import { resolveOperationMode } from "@/lib/ai/degrade/modeCore";
import { buildMockCompletionScenario, buildMockStreamScenario } from "@/lib/ai/mock/mockScenarios";
import { createMockOpenAiStreamResponse } from "@/lib/ai/mock/mockStream";
import type { AiRoutingAttempt, AiRoutingReport } from "@/lib/ai/routing/types";
import type { AIResponse } from "@/lib/ai/types";
import type { AIRequestContext, ChatMessage, TaskType, ToolChoiceOption } from "@/lib/ai/types/core";
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
  /** Function tools provided by the caller (Mechanics Workflow 等). */
  tools?: ReadonlyArray<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  /** Tool choice strategy. */
  toolChoice?: ToolChoiceOption;
}): Promise<AIResponse> {
  const t0 = Date.now();

  // ── Mechanics Workflow mock tool-calling 模拟 ──
  // 当 task=MECHANICS 且有 tools 且 toolChoice !== "none" 时，
  // 模拟一轮 tool call：返回一个 inspect_forge_options（或其他只读工具）调用，
  // 让调用方执行 handler 后将结果回灌，再在下一轮返回最终 narrative。
  const toolsActive = Boolean(params.tools && params.tools.length > 0);
  const isMechanics = params.task === "MECHANICS";
  const isFinalRound = params.toolChoice === "none" || params.ctx.tags?.mechanicsFinal === true;
  const round = Number(params.ctx.tags?.mechanicsRound) || 1;

  if (isMechanics && toolsActive && !isFinalRound && round === 1) {
    // 模拟第一轮：返回一个只读工具调用
    const toolNames = (params.tools ?? []).map((t) => t.function.name);
    const readTool = toolNames.find((n) => n.startsWith("get_") || n.startsWith("inspect_")) ?? toolNames[0];
    const latencyMs = Math.max(1, Date.now() - t0);
    const attempt = mockAttempt(params.task, latencyMs);
    return {
      ok: true,
      providerId: MOCK_PROVIDER_ID,
      logicalRole: attempt.logicalRole,
      content: "",
      toolCalls: readTool ? [{
        id: `mock_call_${Date.now()}`,
        type: "function" as const,
        function: {
          name: readTool,
          arguments: "{}",
        },
      }] : [],
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      latencyMs,
      routing: mockRoutingReport({ task: params.task, ctx: params.ctx, attempt }),
    };
  }

  // 模拟最终轮：返回 DM JSON narrative
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
