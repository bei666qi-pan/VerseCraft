// src/lib/ai/stream/openaiLike.ts
import type { OpenAiStreamFrame, TokenUsage } from "@/lib/ai/types/core";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function normalizeUsage(raw: unknown): TokenUsage | null {
  const u = asRecord(raw);
  if (!u) return null;
  const total = Number(u.total_tokens ?? u.totalTokens ?? 0);
  const input = Number(u.prompt_tokens ?? u.input_tokens ?? u.promptTokens ?? 0);
  const output = Number(u.completion_tokens ?? u.output_tokens ?? u.completionTokens ?? 0);
  const totalTokens = Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
  const promptTokens = Number.isFinite(input) && input > 0 ? Math.trunc(input) : undefined;
  const completionTokens = Number.isFinite(output) && output > 0 ? Math.trunc(output) : undefined;
  const mergedTotal =
    totalTokens > 0
      ? totalTokens
      : (promptTokens ?? 0) + (completionTokens ?? 0) > 0
        ? (promptTokens ?? 0) + (completionTokens ?? 0)
        : 0;
  if (mergedTotal <= 0 && !promptTokens && !completionTokens) return null;
  return {
    totalTokens: mergedTotal > 0 ? mergedTotal : undefined,
    promptTokens,
    completionTokens,
  };
}

/**
 * Parse one SSE `data:` JSON payload from OpenAI-compatible streams (e.g. one-api / upstream chat).
 */
export function parseOpenAiLikeStreamData(data: string): OpenAiStreamFrame | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") {
    return { deltaText: "", usage: null, isDoneToken: trimmed === "[DONE]" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  if (!root) return null;

  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    const usage = normalizeUsage(root.usage);
    return { deltaText: "", usage, isDoneToken: false };
  }

  const c0 = asRecord(choices[0]);
  if (!c0) {
    return { deltaText: "", usage: null, isDoneToken: false };
  }

  const delta = asRecord(c0.delta);
  const message = asRecord(c0.message);
  const deltaContent = typeof delta?.content === "string" ? delta.content : "";
  const messageContent = typeof message?.content === "string" ? message.content : "";
  const deltaText = deltaContent || messageContent;

  const obj = typeof root.object === "string" ? root.object : "";
  const finishReason = typeof c0.finish_reason === "string" ? c0.finish_reason : "";
  const isFinalObject = obj === "chat.completion" || (finishReason.length > 0 && !delta);

  const usage = normalizeUsage(root.usage);
  return {
    deltaText,
    usage,
    isDoneToken: isFinalObject,
  };
}

export function extractNonStreamContent(data: unknown): { content: string; usage: TokenUsage | null } {
  const root = asRecord(data);
  if (!root) return { content: "", usage: null };
  const choices = root.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { content: "", usage: normalizeUsage(root.usage) };
  }
  const c0 = asRecord(choices[0]);
  const message = c0 ? asRecord(c0.message) : null;
  const content = message && typeof message.content === "string" ? message.content : "";
  return { content, usage: normalizeUsage(root.usage) };
}
