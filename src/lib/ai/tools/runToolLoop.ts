// src/lib/ai/tools/runToolLoop.ts
/**
 * 有界 tool-calling 循环执行器（workflow over agent）：
 * - 固定轮数上限 + 总时长预算，最后一轮强制 toolChoice="none" 收口为最终答案；
 * - handler 全防护：未知工具 / 参数非法 / 抛错 / 超时都折叠为结构化 tool 结果，循环不中断；
 * - 仅显式允许工具的任务可用；在线场景只能由受预算的 Mechanics Workflow 调用；
 * - `execute` 可注入，便于单测不经网关验证循环语义。
 */
import { executeChatCompletion } from "@/lib/ai/router/execute";
import { assertToolUseAllowedForTask, TASK_POLICY, type TaskBinding } from "@/lib/ai/tasks/taskPolicy";
import type { AiInvocationBudget } from "@/lib/ai/runtime/aiInvocationBudget";
import type { AIErrorResponse, AIResponse } from "@/lib/ai/types";
import type {
  AIRequestContext,
  ChatMessage,
  TaskType,
  ToolCall,
  ToolDefinition,
} from "@/lib/ai/types/core";

export interface ToolHandlerContext {
  requestId: string;
  userId?: string | null;
  sessionId?: string | null;
  signal?: AbortSignal;
}

export interface RegisteredTool {
  definition: ToolDefinition;
  /** Read tools may run in parallel; a workflow may execute at most one write tool in total. */
  kind?: "read" | "write";
  /** 返回值会被 JSON.stringify 后作为 tool 消息回灌；抛错/超时折叠为 {ok:false,error} 结果。 */
  handler: (args: Record<string, unknown>, ctx: ToolHandlerContext) => Promise<unknown>;
  /** 单次 handler 超时；默认 DEFAULT_PER_TOOL_TIMEOUT_MS。 */
  timeoutMs?: number;
}

export type ToolRegistry = Readonly<Record<string, RegisteredTool>>;

export interface ToolCallTraceEntry {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ToolExecutionReceipt {
  callId: string;
  name: string;
  kind: "read" | "write";
  ok: boolean;
  latencyMs: number;
  data?: unknown;
  error?: string;
}

export interface ToolLoopRoundTrace {
  round: number;
  latencyMs: number;
  toolCalls: ToolCallTraceEntry[];
}

export interface ToolLoopTrace {
  rounds: ToolLoopRoundTrace[];
  totalToolCalls: number;
  failedToolCalls: number;
  totalLatencyMs: number;
}

export type ToolLoopResult =
  | { ok: true; response: AIResponse; receipts: ToolExecutionReceipt[]; trace: ToolLoopTrace }
  | {
      ok: false;
      code: "AI_ERROR" | "BUDGET_EXHAUSTED" | "INVOCATION_BUDGET" | "MAX_ROUNDS_NO_FINAL" | "ABORTED";
      message: string;
      lastError?: AIErrorResponse;
      receipts: ToolExecutionReceipt[];
      trace: ToolLoopTrace;
    };

export type ExecuteChatCompletionFn = typeof executeChatCompletion;

const DEFAULT_MAX_ROUNDS = 3;
const MAX_ROUNDS_HARD_CAP = 5;
const DEFAULT_TOTAL_BUDGET_MS = 60_000;
const DEFAULT_PER_TOOL_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_TOOL_CALLS_PER_ROUND = 8;
const DEFAULT_MAX_TOOL_RESULT_CHARS = 4_000;
/** 一轮模型调用低于该剩余预算就不再发起，避免必然超时的尾部请求。 */
const MIN_ROUND_BUDGET_MS = 1_500;

function stringifyToolResult(value: unknown, maxChars: number): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value ?? null) ?? "null";
  } catch {
    serialized = JSON.stringify({ ok: false, error: "unserializable_tool_result" });
  }
  if (serialized.length > maxChars) {
    return `${serialized.slice(0, maxChars)}…(truncated)`;
  }
  return serialized;
}

function parseToolArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw || "{}");
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

async function runSingleTool(args: {
  call: ToolCall;
  registry: ToolRegistry;
  handlerCtx: ToolHandlerContext;
  perToolTimeoutMs: number;
  maxResultChars: number;
}): Promise<{ content: string; receipt: ToolExecutionReceipt; trace: ToolCallTraceEntry }> {
  const t0 = Date.now();
  const name = args.call.function.name;
  const kind = args.registry[name]?.kind ?? "read";
  const fail = (error: string): { content: string; receipt: ToolExecutionReceipt; trace: ToolCallTraceEntry } => {
    const latencyMs = Date.now() - t0;
    return {
      content: stringifyToolResult({ ok: false, error }, args.maxResultChars),
      receipt: { callId: args.call.id, name, kind, ok: false, latencyMs, error },
      trace: { name, ok: false, latencyMs, error },
    };
  };

  const tool = args.registry[name];
  if (!tool) return fail("unknown_tool");

  const parsedArgs = parseToolArguments(args.call.function.arguments);
  if (parsedArgs === null) return fail("invalid_arguments");

  const timeoutMs = Math.max(1, tool.timeoutMs ?? args.perToolTimeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      tool.handler(parsedArgs, args.handlerCtx),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tool_timeout")), timeoutMs);
      }),
    ]);
    return {
      content: stringifyToolResult(result, args.maxResultChars),
      receipt: {
        callId: args.call.id,
        name,
        kind,
        ok: true,
        latencyMs: Date.now() - t0,
        data: result,
      },
      trace: { name, ok: true, latencyMs: Date.now() - t0 },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(message.slice(0, 300) || "tool_handler_error");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runToolLoop(params: {
  task: TaskType;
  messages: ChatMessage[];
  tools: ToolRegistry;
  ctx: Pick<AIRequestContext, "requestId" | "userId" | "sessionId" | "path" | "tags">;
  signal?: AbortSignal;
  /** 含最终收口轮的模型调用上限；默认 3，硬上限 5。 */
  maxRounds?: number;
  /** 整个循环（模型调用 + handler）的总时长预算。 */
  totalBudgetMs?: number;
  /** 单轮模型调用超时（受剩余预算进一步收紧）。 */
  requestTimeoutMs?: number;
  perToolTimeoutMs?: number;
  maxToolCallsPerRound?: number;
  maxToolResultChars?: number;
  extraBody?: Record<string, unknown>;
  devOverrides?: Partial<Pick<TaskBinding, "maxTokens" | "temperature" | "timeoutMs" | "responseFormatJsonObject">>;
  /** Workflow-wide model-call/token/cost authority shared across retries and fallbacks. */
  invocationBudget?: AiInvocationBudget;
  /** 测试注入点；默认真实 executeChatCompletion。 */
  execute?: ExecuteChatCompletionFn;
}): Promise<ToolLoopResult> {
  assertToolUseAllowedForTask(params.task);

  const execute = params.execute ?? executeChatCompletion;
  const maxRounds = Math.max(1, Math.min(MAX_ROUNDS_HARD_CAP, Math.trunc(params.maxRounds ?? DEFAULT_MAX_ROUNDS)));
  const totalBudgetMs = Math.max(MIN_ROUND_BUDGET_MS, Math.trunc(params.totalBudgetMs ?? DEFAULT_TOTAL_BUDGET_MS));
  const perToolTimeoutMs = Math.max(1, Math.trunc(params.perToolTimeoutMs ?? DEFAULT_PER_TOOL_TIMEOUT_MS));
  const maxToolCallsPerRound = Math.max(
    1,
    Math.min(16, Math.trunc(params.maxToolCallsPerRound ?? DEFAULT_MAX_TOOL_CALLS_PER_ROUND))
  );
  const maxToolResultChars = Math.max(
    200,
    Math.trunc(params.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS)
  );

  const toolDefinitions: ToolDefinition[] = Object.values(params.tools).map((t) => t.definition);
  const transcript: ChatMessage[] = [...params.messages];
  const handlerCtx: ToolHandlerContext = {
    requestId: params.ctx.requestId,
    userId: params.ctx.userId,
    sessionId: params.ctx.sessionId,
    signal: params.signal,
  };

  const t0 = Date.now();
  const remainingMs = () => Math.max(0, totalBudgetMs - (Date.now() - t0));
  const trace: ToolLoopTrace = { rounds: [], totalToolCalls: 0, failedToolCalls: 0, totalLatencyMs: 0 };
  const receipts: ToolExecutionReceipt[] = [];
  const finishTrace = () => {
    trace.totalLatencyMs = Date.now() - t0;
    return trace;
  };

  let lastError: AIErrorResponse | undefined;
  let stateChangingToolClaimed = false;

  for (let round = 1; round <= maxRounds; round++) {
    if (params.signal?.aborted) {
      return { ok: false, code: "ABORTED", message: "Tool loop aborted by caller.", receipts, trace: finishTrace() };
    }
    const budgetLeft = remainingMs();
    if (budgetLeft < MIN_ROUND_BUDGET_MS) {
      return {
        ok: false,
        code: "BUDGET_EXHAUSTED",
        message: `Tool loop budget exhausted before round ${round} (budget ${totalBudgetMs}ms).`,
        lastError,
        receipts,
        trace: finishTrace(),
      };
    }

    const isFinalRound = round === maxRounds;
    const invocationClaim = params.invocationBudget?.claim({
      outputTokens: params.devOverrides?.maxTokens ?? TASK_POLICY[params.task].maxTokens,
    });
    if (invocationClaim && !invocationClaim.ok) {
      return {
        ok: false,
        code: "INVOCATION_BUDGET",
        message: `Invocation budget rejected round ${round}: ${invocationClaim.reason}.`,
        lastError,
        receipts,
        trace: finishTrace(),
      };
    }
    const roundT0 = Date.now();
    const res = await execute({
      task: params.task,
      messages: transcript,
      ctx: {
        requestId: params.ctx.requestId,
        task: params.task,
        userId: params.ctx.userId,
        sessionId: params.ctx.sessionId,
        path: params.ctx.path,
        tags: { ...(params.ctx.tags ?? {}), toolLoopRound: round },
      },
      signal: params.signal,
      requestTimeoutMs: Math.min(budgetLeft, Math.max(1, Math.trunc(params.requestTimeoutMs ?? budgetLeft))),
      // Tool 结果是运行时态，绝不允许命中/写入响应缓存。
      skipCache: true,
      extraBody: params.extraBody,
      ...(toolDefinitions.length > 0
        ? { tools: toolDefinitions, toolChoice: isFinalRound ? ("none" as const) : ("auto" as const) }
        : {}),
      devOverrides: params.devOverrides,
    });

    if (!res.ok) {
      lastError = res;
      if (res.code === "ABORTED") {
        return { ok: false, code: "ABORTED", message: res.message, lastError, receipts, trace: finishTrace() };
      }
      return { ok: false, code: "AI_ERROR", message: res.message, lastError, receipts, trace: finishTrace() };
    }

    const toolCalls = res.toolCalls ?? [];
    if (toolCalls.length === 0) {
      trace.rounds.push({ round, latencyMs: Date.now() - roundT0, toolCalls: [] });
      return { ok: true, response: res, receipts, trace: finishTrace() };
    }

    // 非常规上游：最后一轮已强制 toolChoice="none" 仍返回 tool_calls。
    if (isFinalRound) {
      trace.rounds.push({ round, latencyMs: Date.now() - roundT0, toolCalls: [] });
      if (res.content.trim()) {
        return { ok: true, response: res, receipts, trace: finishTrace() };
      }
      return {
        ok: false,
        code: "MAX_ROUNDS_NO_FINAL",
        message: `Model kept requesting tools after ${maxRounds} rounds without a final answer.`,
        receipts,
        trace: finishTrace(),
      };
    }

    const acceptedCalls = toolCalls.slice(0, maxToolCallsPerRound).filter((call) => {
      const kind = params.tools[call.function.name]?.kind ?? "read";
      if (kind !== "write") return true;
      if (stateChangingToolClaimed) return false;
      stateChangingToolClaimed = true;
      return true;
    });
    transcript.push({ role: "assistant", content: res.content ?? "", toolCalls: acceptedCalls });

    const readCalls = acceptedCalls.filter((call) => (params.tools[call.function.name]?.kind ?? "read") === "read");
    const writeCalls = acceptedCalls.filter((call) => params.tools[call.function.name]?.kind === "write");
    const runCalls = (calls: ToolCall[]) => Promise.all(
      calls.map((call) =>
        runSingleTool({
          call,
          registry: params.tools,
          handlerCtx,
          perToolTimeoutMs,
          maxResultChars: maxToolResultChars,
        })
      )
    );
    const settled = [...await runCalls(readCalls), ...await runCalls(writeCalls)];
    const settledByCallId = new Map(settled.map((entry) => [entry.receipt.callId, entry]));
    const roundTrace: ToolCallTraceEntry[] = [];
    for (let i = 0; i < acceptedCalls.length; i++) {
      const settledCall = settledByCallId.get(acceptedCalls[i].id);
      if (!settledCall) continue;
      const { content, receipt, trace: callTrace } = settledCall;
      transcript.push({ role: "tool", content, toolCallId: acceptedCalls[i].id });
      receipts.push(receipt);
      roundTrace.push(callTrace);
      trace.totalToolCalls += 1;
      if (!callTrace.ok) trace.failedToolCalls += 1;
    }
    trace.rounds.push({ round, latencyMs: Date.now() - roundT0, toolCalls: roundTrace });
  }

  // maxRounds >= 1 时循环内必然 return；保底返回防御性错误。
  return {
    ok: false,
    code: "MAX_ROUNDS_NO_FINAL",
    message: "Tool loop ended without a final answer.",
    lastError,
    receipts,
    trace: finishTrace(),
  };
}
