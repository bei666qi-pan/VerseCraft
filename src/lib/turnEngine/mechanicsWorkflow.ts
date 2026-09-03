import { createAiInvocationBudget } from "@/lib/ai/runtime/aiInvocationBudget";
import {
  runToolLoop,
  type ExecuteChatCompletionFn,
  type ToolExecutionReceipt,
  type ToolRegistry,
} from "@/lib/ai/tools/runToolLoop";
import { MECHANICS_TOOL_REGISTRY } from "@/lib/ai/tools/mechanicsToolHandlers";
import {
  MECHANICS_DEFAULTS,
  MECHANICS_TOOL_INSTRUCTIONS,
  type MechanicsContext,
  type MechanicsExecutionLimits,
  type MechanicsStateDelta,
  type MechanicsTurnResult,
  type MechanicsToolResult,
} from "@/lib/ai/tools/mechanicsTypes";
import type { ChatMessage } from "@/lib/ai/types/core";
import type { ActualAiUsage, MechanicsReceipt } from "./contracts";

export interface MechanicsWorkflowResult extends MechanicsTurnResult {
  receipts: MechanicsReceipt[];
  usage: ActualAiUsage[];
}

export interface MechanicsWorkflowInput {
  ctx: MechanicsContext;
  messages: ChatMessage[];
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
  tools?: ToolRegistry;
  execute?: ExecuteChatCompletionFn;
}

export function createMechanicsFailureCandidate(startedAt = Date.now()): MechanicsWorkflowResult {
  return {
    narrative: "这次操作暂时无法完成，请检查当前资源和条件后重试。",
    toolTrace: [],
    stateDelta: emptyStateDelta(),
    toolsUsed: false,
    totalLatencyMs: Math.max(0, Date.now() - startedAt),
    receipts: [],
    usage: [],
  };
}

export const MECHANICS_LIMITS = {
  maxModelCalls: 2,
  totalBudgetMs: 20_000,
  perToolTimeoutMs: 3_000,
  maxOutputTokensPerCall: 4_096,
  maxToolResultChars: 2_000,
} as const;

export const MECHANICS_DEFAULT_RUNTIME_LIMITS: MechanicsExecutionLimits = {
  maxToolRounds: MECHANICS_LIMITS.maxModelCalls,
  totalBudgetMs: MECHANICS_LIMITS.totalBudgetMs,
  perToolTimeoutMs: MECHANICS_LIMITS.perToolTimeoutMs,
};

export function buildMechanicsSystemPromptBlock(): string {
  return MECHANICS_TOOL_INSTRUCTIONS;
}

function createMechanicsRegistry(ctx: MechanicsContext): ToolRegistry {
  return Object.fromEntries(
    Object.entries(MECHANICS_TOOL_REGISTRY).map(([name, registration]) => [
      name,
      {
        kind: registration.meta.mutatesState ? "write" : "read",
        definition: registration.definition,
        timeoutMs: registration.meta.timeoutMs,
        handler: (args: Record<string, unknown>) => registration.handler(args, ctx),
      },
    ]),
  );
}

function emptyStateDelta(): MechanicsStateDelta {
  return {
    questsIssued: 0,
    questsUpdated: 0,
    itemsConsumed: [],
    itemsGranted: [],
    weaponsForged: [],
    combatResolved: false,
    worldEventsApplied: 0,
  };
}

function successfulToolData(receipt: ToolExecutionReceipt): unknown {
  if (!receipt.ok) return undefined;
  const result = receipt.data as MechanicsToolResult | undefined;
  return result?.ok ? result.data : receipt.data;
}

function buildStateDelta(receipts: ToolExecutionReceipt[]): MechanicsStateDelta {
  const delta = emptyStateDelta();
  for (const receipt of receipts) {
    const data = successfulToolData(receipt) as Record<string, unknown> | undefined;
    if (!receipt.ok || !data) continue;
    switch (receipt.name) {
      case "issue_quest":
        delta.questsIssued += 1;
        break;
      case "update_quest_progress":
        delta.questsUpdated += 1;
        break;
      case "consume_materials":
      case "consume":
        if (Array.isArray(data.consumedItems)) delta.itemsConsumed.push(...data.consumedItems.map(String));
        break;
      case "grant_item":
      case "grant":
        if (data.itemId) delta.itemsGranted.push(String(data.itemId));
        break;
      case "forge_weapon":
        if (data.weaponName) delta.weaponsForged.push(String(data.weaponName));
        break;
      case "resolve_combat_action":
        delta.combatResolved = true;
        break;
      case "apply_world_event":
        delta.worldEventsApplied += 1;
        break;
    }
  }
  return delta;
}

function toMechanicsReceipts(
  receipts: ToolExecutionReceipt[],
  ctx: MechanicsContext,
): MechanicsReceipt[] {
  return receipts.map((receipt) => ({
    callId: receipt.callId,
    toolName: receipt.name,
    access: receipt.kind,
    worldId: ctx.worldId,
    sessionId: ctx.sessionId,
    idempotencyKey: `${ctx.requestId}:${receipt.callId}`,
    ok: receipt.ok,
    latencyMs: receipt.latencyMs,
    result: receipt.data,
    error: receipt.error,
  }));
}

function fallbackNarrative(receipts: ToolExecutionReceipt[]): string {
  if (receipts.some((receipt) => receipt.ok)) return "操作已完成。";
  if (receipts.length > 0) return "操作未能完成。请检查你的资源和条件后重试。";
  return "这次操作暂时无法完成，请稍后重试。";
}

/**
 * The sole mechanics generation Module. It produces a non-authoritative candidate
 * plus deterministic receipts; committing them belongs to TurnFinalizer.
 */
export async function runMechanicsWorkflow(
  input: MechanicsWorkflowInput,
): Promise<MechanicsWorkflowResult> {

  const startedAt = Date.now();
  const usage: ActualAiUsage[] = [];
  let round = 0;
  const execute = input.execute;
  const trackedExecute: ExecuteChatCompletionFn = async (params) => {
    round += 1;
    input.onStatus?.(`mechanics_round_${round}`);
    const result = await (execute ?? (await import("@/lib/ai/router/execute")).executeChatCompletion)(params);
    if (result.ok) {
      usage.push({
        requestId: input.ctx.requestId,
        runId: `${input.ctx.requestId}:mechanics`,
        task: "MECHANICS",
        lane: "mechanics",
        round,
        providerId: result.providerId,
        latencyMs: result.latencyMs,
        usage: result.usage,
      });
    }
    return result;
  };

  const totalBudgetMs = Math.min(
    MECHANICS_LIMITS.totalBudgetMs,
    Math.max(1_500, input.ctx.limits.totalBudgetMs || MECHANICS_LIMITS.totalBudgetMs),
  );
  const loopResult = await runToolLoop({
    task: "MECHANICS",
    messages: input.messages,
    tools: input.tools ?? createMechanicsRegistry(input.ctx),
    ctx: {
      requestId: input.ctx.requestId,
      userId: input.ctx.userId,
      sessionId: input.ctx.sessionId,
      path: "/api/chat",
      tags: { lane: "mechanics", worldId: input.ctx.worldId },
    },
    signal: input.signal ?? input.ctx.signal,
    maxRounds: MECHANICS_LIMITS.maxModelCalls,
    totalBudgetMs,
    requestTimeoutMs: totalBudgetMs,
    perToolTimeoutMs: Math.min(
      MECHANICS_LIMITS.perToolTimeoutMs,
      input.ctx.limits.perToolTimeoutMs || MECHANICS_DEFAULTS.PER_TOOL_TIMEOUT_MS,
    ),
    maxToolCallsPerRound: 4,
    maxToolResultChars: MECHANICS_LIMITS.maxToolResultChars,
    devOverrides: { maxTokens: MECHANICS_LIMITS.maxOutputTokensPerCall },
    invocationBudget: createAiInvocationBudget({
      maxCalls: MECHANICS_LIMITS.maxModelCalls,
      maxOutputTokens: MECHANICS_LIMITS.maxModelCalls * MECHANICS_LIMITS.maxOutputTokensPerCall,
      deadlineMs: totalBudgetMs,
    }),
    execute: trackedExecute,
  });

  const receipts = loopResult.receipts;
  return {
    narrative: loopResult.ok && loopResult.response.content.trim()
      ? loopResult.response.content
      : fallbackNarrative(receipts),
    toolTrace: receipts.map((receipt) => ({
      toolName: receipt.name,
      ok: receipt.ok,
      latencyMs: receipt.latencyMs,
      error: receipt.error,
    })),
    stateDelta: buildStateDelta(receipts),
    toolsUsed: receipts.length > 0,
    totalLatencyMs: Date.now() - startedAt,
    receipts: toMechanicsReceipts(receipts, input.ctx),
    usage,
  };
}
