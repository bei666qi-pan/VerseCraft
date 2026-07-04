// src/lib/ai/embeddings/embedText.ts
//
// 有意不加 `import "server-only"`：调用方只有服务端代码（离线 batch worker、
// retrieveWorldKnowledge.ts 的在线向量检索分支），没有任何 client component 会引入本文件；
// 不加这个 guard 是为了让 `pnpm test:unit`（plain `tsx --test`，未带
// `--conditions=react-server`）能直接测试本文件——与 T7（`observabilityRing.ts`）
// 同一个理由、同一个先例。
// 直接从 envCore（无 server-only guard）取，而不是 `@/lib/ai/config/env`——
// 原因同上：保持本文件可被 `pnpm test:unit` 直接测试。
import { resolveEmbeddingBinding } from "@/lib/ai/config/envCore";
import { envNumber } from "@/lib/config/envRaw";

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
  data?: Array<{ embedding?: number[]; index?: number }>;
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
  const binding = resolveEmbeddingBinding();
  if (!binding.configured) {
    return { ok: false, reason: "not_configured" };
  }

  if (binding.apiUrl === "mock://embeddings") {
    // Mock provider: deterministic pseudo-embedding for tests/dev without real credentials.
    const dim = binding.dimension;
    const vector = new Array(dim).fill(0).map((_, i) => {
      const seed = (text.length + i * 31) % 997;
      return Math.sin(seed) * 0.01;
    });
    return { ok: true, vector, model: binding.model || "mock-embedding" };
  }

  const timeoutMs =
    typeof timeoutMsOverride === "number" && Number.isFinite(timeoutMsOverride) && timeoutMsOverride > 0
      ? timeoutMsOverride
      : Math.max(1000, envNumber("AI_EMBEDDING_TIMEOUT_MS", 20_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(binding.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${binding.apiKey}`,
      },
      body: JSON.stringify({ model: binding.model, input: text }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return { ok: false, reason: "http_error", status: res.status, message: bodyText.slice(0, 500) };
    }

    const json = (await res.json().catch(() => null)) as EmbeddingWireResponse | null;
    const vector = json?.data?.[0]?.embedding;
    if (!isFiniteNumberArray(vector) || vector.length === 0) {
      return { ok: false, reason: "bad_response", message: "response missing data[0].embedding" };
    }

    if (vector.length !== binding.dimension) {
      // 真实模型输出维度与 schema 的 vector(256) 不一致时，不在这里静默截断/补零——
      // 那样会产生语义错误的向量。直接判为 bad_response，让调用方（worker）跳过这条记录
      // 并计入失败计数，倒逼在上线前用真实凭证核对 AI_EMBEDDING_DIMENSION 设置。
      return {
        ok: false,
        reason: "bad_response",
        message: `embedding dimension mismatch: got ${vector.length}, expected ${binding.dimension} (AI_EMBEDDING_DIMENSION)`,
      };
    }

    return { ok: true, vector, model: binding.model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: "network_error", message };
  } finally {
    clearTimeout(timer);
  }
}
