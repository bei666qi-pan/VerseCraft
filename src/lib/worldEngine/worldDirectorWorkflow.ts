import { runOfflineReasonerTask } from "@/lib/ai/logicalTasks";
import { createAiInvocationBudget } from "@/lib/ai/runtime/aiInvocationBudget";
import type { AIErrorResponse, AIResponse, AIResult } from "@/lib/ai/types";
import type { ChatMessage } from "@/lib/ai/types/core";
import type { ActualAiUsage } from "@/lib/turnEngine/contracts";
import type { WorldId } from "@/lib/worlds/types";

export const WORLD_DIRECTOR_LIMITS = {
  maxModelCalls: 1,
  maxOutputTokens: 2_048,
  deadlineMs: 45_000,
} as const;

export type DirectorExecute = (input: {
  messages: ChatMessage[];
  requestId: string;
  userId: string | null;
  sessionId: string;
  signal: AbortSignal;
}) => Promise<AIResult>;

export type WorldDirectorWorkflowResult =
  | (AIResponse & { actualUsage: ActualAiUsage })
  | (AIErrorResponse & { actualUsage: null });

/** The only Director model invocation Module: one call, 2048 tokens, one shared 45s deadline. */
export async function runWorldDirectorWorkflow(input: {
  messages: ChatMessage[];
  requestId: string;
  userId: string | null;
  sessionId: string;
  worldId: WorldId;
  mapId: string;
  signal?: AbortSignal;
  execute?: DirectorExecute;
  limits?: Partial<typeof WORLD_DIRECTOR_LIMITS>;
}): Promise<WorldDirectorWorkflowResult> {
  const limits = { ...WORLD_DIRECTOR_LIMITS, ...input.limits };
  const invocationBudget = createAiInvocationBudget({
    maxCalls: limits.maxModelCalls,
    maxOutputTokens: limits.maxOutputTokens,
    deadlineMs: limits.deadlineMs,
  });
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  input.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), limits.deadlineMs);
  const execute: DirectorExecute = input.execute ?? ((params) => runOfflineReasonerTask({
    kind: "worldbuild",
    messages: params.messages,
    ctx: {
      requestId: params.requestId,
      userId: params.userId,
      sessionId: params.sessionId,
      path: "/worker/world-engine",
      tags: { purpose: "world_director", worldId: input.worldId, mapId: input.mapId },
    },
    signal: params.signal,
    requestTimeoutMs: limits.deadlineMs,
    skipCache: true,
    extraBody: { enable_thinking: false, thinking: { type: "disabled" } },
    devOverrides: {
      responseFormatJsonObject: true,
      temperature: 0.2,
      maxTokens: limits.maxOutputTokens,
    },
  }));

  try {
    const claim = invocationBudget.claim({ outputTokens: limits.maxOutputTokens });
    if (!claim.ok) {
      return {
        ok: false,
        code: "BUDGET_EXCEEDED",
        message: `World Director invocation rejected: ${claim.reason}`,
        actualUsage: null,
      };
    }
    const result = await execute({
      messages: input.messages,
      requestId: input.requestId,
      userId: input.userId,
      sessionId: input.sessionId,
      signal: controller.signal,
    });
    if (!result.ok) return { ...result, actualUsage: null };
    return {
      ...result,
      actualUsage: {
        requestId: input.requestId,
        runId: `${input.requestId}:director`,
        task: "WORLDBUILD_OFFLINE",
        lane: "director",
        round: 1,
        providerId: result.providerId,
        latencyMs: result.latencyMs,
        usage: result.usage,
      },
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortFromCaller);
  }
}
