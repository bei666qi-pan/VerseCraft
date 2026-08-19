// src/lib/ai/embeddings/embedText.ts
//
// 有意不加 `import "server-only"`：调用方只有服务端代码（离线 batch worker、
// retrieveWorldKnowledge.ts 的在线向量检索分支），没有任何 client component 会引入本文件；
// 不加这个 guard 是为了让 `pnpm test:unit`（plain `tsx --test`，未带
// `--conditions=react-server`）能直接测试本文件——与 T7（`observabilityRing.ts`）
// 同一个理由、同一个先例。
// 直接从 envCore（无 server-only guard）取，而不是 `@/lib/ai/config/env`——
// 原因同上：保持本文件可被 `pnpm test:unit` 直接测试。
import { randomUUID } from "node:crypto";
import { envNumber } from "@/lib/config/envRaw";
import { getManagedEmbeddingBindings } from "@/lib/ai/managed/state";
import { buildManagedUsageRecord, enqueueManagedUsage } from "@/lib/ai/managed/usage";
import { resilientFetch } from "@/lib/ai/resilience/fetchWithRetry";

/**
 * T4（2026-07，世界知识向量检索）：批量向量化调用路径。
 *
 * 定位：只服务离线 batch worker（`scripts/worldKnowledgeEmbeddingBackfill.ts`），
 * 不进入 `/api/chat` 首包路径（CLAUDE.md 5.4 性能预算 / 8.3 worker 边界）。
 * 因此这里刻意没有接入 `src/lib/ai/router/execute.ts` 那一整套熔断/降级/多角色候选机制——
 * 那套机制是为在线 PLAYER_CHAT 的时延预算设计的，离线批处理场景反而更需要"简单、可重试、
 * 失败了就跳过等下一轮"，接入反而是不必要的耦合。
 *
 * 鉴权与端点复用 `resolveEmbeddingBinding()`（见 envCore.ts），不新增独立密钥。
 */

export type EmbedTextResult =
  | { ok: true; vector: number[]; model: string }
  | { ok: false; reason: "not_configured" }
  | { ok: false; reason: "http_error"; status: number; message: string }
  | { ok: false; reason: "bad_response"; message: string }
  | { ok: false; reason: "network_error"; message: string };

type EmbeddingWireResponse = {
  // 标准 OpenAI 兼容响应：data 是数组。Ark 多模态向量化响应：data 是单个对象
  // （已用真实凭证探测确认）。两种真实存在，做防御性双路径读取。
  data?: Array<{ embedding?: number[]; index?: number }> | { embedding?: number[] };
};

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * Single-text embedding call. Returns a discriminated result; never throws.
 * @param timeoutMsOverride 调用方可以传更短的超时（例如在线检索路径需要严格预算），
 *   不传时使用 `AI_EMBEDDING_TIMEOUT_MS`（默认 20s，适合离线 batch worker)。
 */
export async function embedText(text: string, timeoutMsOverride?: number): Promise<EmbedTextResult> {
  const bindings = getManagedEmbeddingBindings();
  if (bindings.length === 0) {
    return { ok: false, reason: "not_configured" };
  }
  const requestId = `embedding_${randomUUID()}`;
  let lastFailure: EmbedTextResult = { ok: false, reason: "not_configured" };
  const failedServices = new Set<string>();
  for (const binding of bindings) {
    if (failedServices.has(binding.serviceId)) continue;
    if (binding.transport === "mock") {
    // Mock provider: deterministic pseudo-embedding for tests/dev without real credentials.
    const dim = binding.embeddingDimension ?? 1024;
    const vector = new Array(dim).fill(0).map((_, i) => {
      const seed = (text.length + i * 31) % 997;
      return Math.sin(seed) * 0.01;
    });
      return { ok: true, vector, model: binding.modelName || "mock-embedding" };
    }

  const timeoutMs =
    typeof timeoutMsOverride === "number" && Number.isFinite(timeoutMsOverride) && timeoutMsOverride > 0
      ? timeoutMsOverride
      : Math.max(1000, envNumber("AI_EMBEDDING_TIMEOUT_MS", 20_000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

  try {
    // Ark 多模态向量化（provider: "ark_multimodal"，见 envCore.ts 的架构例外说明）走独立的
    // 请求体形状：input 是 [{type:"text", text}]，且支持 dimensions 参数直接要求目标维度
    // （已用真实凭证探测确认合法值为 1024/2048）。标准 openai_compatible 路径保持原有形状。
    const requestBody =
      binding.transport === "ark_multimodal"
        ? { model: binding.modelName, input: [{ type: "text", text }], dimensions: binding.embeddingDimension, encoding_format: "float" }
        : { model: binding.modelName, input: text };

    const res = await resilientFetch(binding.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${binding.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }, {
      timeoutMs,
      maxRetries: 0,
      parentSignal: controller.signal,
      transport:
        binding.serviceId.startsWith("test-service-")
          ? "default"
          : binding.baseUrl.startsWith("https:")
            ? "http1"
            : "default",
      // Node contract tests use non-resolving `.test` hosts behind a stubbed
      // fetch. Production and ordinary scripts still enforce managed URL DNS
      // validation.
      validateManagedUrl: !binding.serviceId.startsWith("test-service-"),
      allowLocalhost: process.env.NODE_ENV !== "production",
    });

    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 429) failedServices.add(binding.serviceId);
      enqueueManagedUsage(buildManagedUsageRecord({ requestId, task: "MEMORY_COMPRESSION", binding, phase: `embedding_error_${binding.modelId}`, latencyMs: Date.now() - startedAt, outcome: "error", errorCategory: `http_${res.status}` }));
      lastFailure = { ok: false, reason: "http_error", status: res.status, message: "embedding service request failed" };
      continue;
    }

    const json = (await res.json().catch(() => null)) as EmbeddingWireResponse | null;
    const vector = Array.isArray(json?.data) ? json?.data?.[0]?.embedding : json?.data?.embedding;
    if (!isFiniteNumberArray(vector) || vector.length === 0) {
      enqueueManagedUsage(buildManagedUsageRecord({ requestId, task: "MEMORY_COMPRESSION", binding, phase: `embedding_error_${binding.modelId}`, latencyMs: Date.now() - startedAt, outcome: "error", errorCategory: "bad_response" }));
      lastFailure = { ok: false, reason: "bad_response", message: "response missing embedding vector" };
      continue;
    }

    if (binding.embeddingDimension && vector.length !== binding.embeddingDimension) {
      // 真实模型输出维度与 schema 的 vector(256) 不一致时，不在这里静默截断/补零——
      // 那样会产生语义错误的向量。直接判为 bad_response，让调用方（worker）跳过这条记录
      // 并计入失败计数，倒逼在上线前用真实凭证核对 AI_EMBEDDING_DIMENSION 设置。
      enqueueManagedUsage(buildManagedUsageRecord({ requestId, task: "MEMORY_COMPRESSION", binding, phase: `embedding_error_${binding.modelId}`, latencyMs: Date.now() - startedAt, outcome: "error", errorCategory: "dimension_mismatch" }));
      lastFailure = {
        ok: false,
        reason: "bad_response",
        message: `embedding dimension mismatch: got ${vector.length}, expected ${binding.embeddingDimension}`,
      };
      continue;
    }

    enqueueManagedUsage(buildManagedUsageRecord({ requestId, task: "MEMORY_COMPRESSION", binding,
      phase: `embedding_complete_${binding.modelId}`, inputText: text, latencyMs: Date.now() - startedAt, outcome: "success" }));
    return { ok: true, vector, model: binding.modelName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    enqueueManagedUsage(buildManagedUsageRecord({ requestId, task: "MEMORY_COMPRESSION", binding, phase: `embedding_error_${binding.modelId}`, latencyMs: Date.now() - startedAt, outcome: "error", errorCategory: "network_error" }));
    lastFailure = { ok: false, reason: "network_error", message };
  } finally {
    clearTimeout(timer);
  }
  }
  return lastFailure;
}
