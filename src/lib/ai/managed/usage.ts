import type { TokenUsage, TaskType } from "@/lib/ai/types/core";
import type { ManagedAiBinding } from "./types";
import { purposeForTask } from "./types";

export type AiUsageRecord = {
  idempotencyKey: string; occurredAt: Date; requestId: string; purpose: string; task: string;
  serviceId: string | null; serviceName: string; modelId: string | null; modelName: string;
  inputTokens: number; outputTokens: number; cachedInputTokens: number; totalTokens: number;
  usageEstimated: boolean; costCnyMicros: number | null; inputPriceCnyFenPerMillion: number | null;
  outputPriceCnyFenPerMillion: number | null; latencyMs: number | null; outcome: string; errorCategory: string | null;
};

function finite(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0; }
export function calculateCostCnyMicros(inputTokens: number, outputTokens: number, inFen: number | null, outFen: number | null): number | null {
  if (inFen == null || outFen == null) return null;
  return Math.round((inputTokens * inFen + outputTokens * outFen) / 100);
}

export function buildManagedUsageRecord(input: {
  requestId: string; task: TaskType; binding: ManagedAiBinding; phase: string; usage?: TokenUsage | null;
  inputText?: string; outputText?: string; latencyMs?: number; outcome: "success" | "error"; errorCategory?: string | null;
}): AiUsageRecord {
  const usageAvailable = Boolean(input.usage && [
    input.usage.totalTokens,
    input.usage.promptTokens,
    input.usage.completionTokens,
    input.usage.cachedPromptTokens,
  ].some((value) => value !== undefined && Number.isFinite(Number(value))));
  const inputTokens = usageAvailable ? finite(input.usage?.promptTokens) : 0;
  const outputTokens = usageAvailable ? finite(input.usage?.completionTokens) : 0;
  const totalTokens = usageAvailable ? finite(input.usage?.totalTokens) || inputTokens + outputTokens : 0;
  const cachedInputTokens = usageAvailable ? finite(input.usage?.cachedPromptTokens) : 0;
  return {
    idempotencyKey: ["managed", input.requestId, input.task, input.binding.serviceId, input.binding.modelId, input.phase].join(":"),
    occurredAt: new Date(), requestId: input.requestId, purpose: input.binding.purpose ?? purposeForTask(input.task), task: input.task,
    serviceId: input.binding.serviceId, serviceName: input.binding.serviceName, modelId: input.binding.modelId,
    modelName: input.binding.modelName, inputTokens, outputTokens, cachedInputTokens, totalTokens,
    usageEstimated: false, costCnyMicros: usageAvailable && inputTokens + outputTokens > 0 ? calculateCostCnyMicros(inputTokens, outputTokens, input.binding.inputPriceCnyFenPerMillion, input.binding.outputPriceCnyFenPerMillion) : null,
    inputPriceCnyFenPerMillion: input.binding.inputPriceCnyFenPerMillion, outputPriceCnyFenPerMillion: input.binding.outputPriceCnyFenPerMillion,
    latencyMs: input.latencyMs == null ? null : finite(input.latencyMs), outcome: input.outcome,
    errorCategory: input.errorCategory ?? (!usageAvailable && input.outcome === "success" ? "usage_unavailable" : null),
  };
}

const queue: AiUsageRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
export function dedupeManagedUsageBatch(batch: readonly AiUsageRecord[]): AiUsageRecord[] {
  return [...new Map(batch.map((record) => [record.idempotencyKey, record])).values()];
}
export function enqueueManagedUsage(record: AiUsageRecord): void {
  if (queue.length >= 1000) queue.shift();
  queue.push(record);
  if (!flushTimer) { flushTimer = setTimeout(flushManagedUsage, 1000); flushTimer.unref?.(); }
}

async function flushManagedUsage(): Promise<void> {
  flushTimer = null;
  const batch = queue.splice(0, 100);
  if (batch.length === 0) return;
  try {
    const { persistManagedUsageBatch } = await import("./usageRepository");
    await persistManagedUsageBatch(batch);
  } catch { /* usage persistence never affects generation */ }
  if (queue.length > 0 && !flushTimer) { flushTimer = setTimeout(flushManagedUsage, 1000); flushTimer.unref?.(); }
}

export async function __flushManagedUsageForTests(): Promise<void> { await flushManagedUsage(); }
