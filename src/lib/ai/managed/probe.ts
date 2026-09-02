import { completionEndpoint, embeddingEndpoint } from "./urlSafety";
import { resilientFetch } from "@/lib/ai/resilience/fetchWithRetry";
import type { ManagedTransport } from "./types";

export type ProbeModelInput = { upstreamModel: string; capability: "generation" | "embedding"; embeddingDimension?: number | null };

export async function probeManagedModel(input: {
  baseUrl: string; apiKey: string; transport: ManagedTransport; model: ProbeModelInput; timeoutMs?: number; allowLocalhost?: boolean;
}): Promise<{ ok: true; embeddingDimension?: number } | { ok: false; reason: string }> {
  try {
    if (input.transport === "mock") return { ok: true, embeddingDimension: input.model.embeddingDimension ?? undefined };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(10_000, input.timeoutMs ?? 6000)));
    try {
      const isEmbedding = input.model.capability === "embedding";
      const url = isEmbedding
        ? embeddingEndpoint(input.baseUrl, input.transport)
        : completionEndpoint(input.baseUrl, input.transport);
      const body = isEmbedding
        ? input.transport === "ark_multimodal"
          ? { model: input.model.upstreamModel, input: [{ type: "text", text: "连接测试" }], dimensions: input.model.embeddingDimension, encoding_format: "float" }
          : { model: input.model.upstreamModel, input: "连接测试" }
        : input.transport === "openai_responses"
          ? { model: input.model.upstreamModel, input: "只回复 OK", max_output_tokens: 16 }
          : { model: input.model.upstreamModel, messages: [{ role: "user", content: "只回复 OK" }], max_tokens: 16, temperature: 0 };
      const res = await resilientFetch(url, {
        method: "POST", redirect: "manual",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify(body),
      }, {
        timeoutMs: Math.max(1000, Math.min(10_000, input.timeoutMs ?? 6000)),
        maxRetries: 0,
        parentSignal: controller.signal,
        transport: url.startsWith("https:") ? "http1" : "default",
        validateManagedUrl: true,
        allowLocalhost: input.allowLocalhost,
      });
      if (res.status >= 300 && res.status < 400) return { ok: false, reason: "service_redirect_not_allowed" };
      if (!res.ok) return { ok: false, reason: res.status === 401 || res.status === 403 ? "service_auth_failed" : "service_test_failed" };
      if (!isEmbedding) return { ok: true };
      const json = await res.json().catch(() => null) as { data?: Array<{ embedding?: number[] }> | { embedding?: number[] } } | null;
      const vector = Array.isArray(json?.data) ? json?.data?.[0]?.embedding : json?.data?.embedding;
      if (!Array.isArray(vector) || vector.length === 0) return { ok: false, reason: "embedding_response_invalid" };
      if (input.model.embeddingDimension && vector.length !== input.model.embeddingDimension) return { ok: false, reason: "embedding_dimension_mismatch" };
      return { ok: true, embeddingDimension: vector.length };
    } finally { clearTimeout(timer); }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "service_test_failed";
    return { ok: false, reason: reason === "This operation was aborted" ? "service_test_timeout" : reason };
  }
}
