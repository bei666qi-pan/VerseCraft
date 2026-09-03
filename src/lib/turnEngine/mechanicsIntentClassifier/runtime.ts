// src/lib/ai/tools/mechanicsIntentClassifier/runtime.ts
//
// 在线 embedding 调用的薄壳：包一层 500ms race-based timeout + 30s in-process LRU 缓存。
// 这是 §2.4 共用底座里的"deterministic stage + 偶尔一次外部 IO"——缓存命中即跳过 HTTP，
// 不命中走 `embedText()`，超时即按 `not_configured` / `timeout` 失败返回让上层降级到
// keyword classifier（与 AGENTS.md §2.5.4 fail-open 一致）。
//
// 设计约束：
//  - 缓存 key 基于 sha256(text)；text 可能在 cache hit 之前就被多次 reuse。
//  - 缓存 TTL 30s（in-process）：够 player 在 30s 内重发同一条输入直接命中。
//  - LRU 上限 256 entries（默认），防止内存膨胀。
//  - 本文件**不**复用 `worldKnowledge/retrieval/vectorSearch` 那条慢路径——后者走
//    `loadRuntimeLoreStage` 的 loreRetrievalP，并发预算 5s+；本文件独立 timeout 500ms
//    以满足 §2.5.5 firstVisibleTextP50 ≤ 2_500ms 的硬约束。

import { createHash } from "node:crypto";
import { embedText } from "@/lib/ai/embeddings/embedText";

export interface EmbedTextWithTimeoutOptions {
  /** 毫秒。超时返回 `{ ok: false, reason: "timeout" }`。默认 500。 */
  timeoutMs?: number;
  /** 调试：跳过 LRU 缓存。 */
  skipCache?: boolean;
}

export type EmbedTextWithTimeoutResult =
  | { ok: true; vector: number[]; model: string; cacheHit: boolean; latencyMs: number }
  | { ok: false; reason: "not_configured" | "http_error" | "bad_response" | "network_error" | "timeout"; status?: number; message?: string; latencyMs: number };

const DEFAULT_TIMEOUT_MS = 300;
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_MAX_ENTRIES = 256;

interface CacheEntry {
  vector: number[];
  model: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function hashKey(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function pruneIfNeeded(): void {
  while (cache.size > DEFAULT_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/** 测试/运维钩子：清空缓存。仅供单测使用。 */
export function __resetEmbedCacheForTest(): void {
  cache.clear();
}

/** 测试/运维钩子：读取当前缓存大小。仅供单测使用。 */
export function __embedCacheSizeForTest(): number {
  return cache.size;
}

export async function embedTextWithTimeout(
  text: string,
  options: EmbedTextWithTimeoutOptions = {},
): Promise<EmbedTextWithTimeoutResult> {
  const startedAt = Date.now();
  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const skipCache = options.skipCache === true;

  if (!skipCache) {
    const key = hashKey(text);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > startedAt) {
      // Refresh recency so LRU is honored.
      cache.delete(key);
      cache.set(key, cached);
      return {
        ok: true,
        vector: cached.vector.slice(),
        model: cached.model,
        cacheHit: true,
        latencyMs: 0,
      };
    }
  }

  // Race embedText against the timeout — embedText does NOT take its own deadline
  // for the online path (it has a 20s default), so we cap it here to keep within
  // firstVisibleTextP50 budget.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutP = new Promise<EmbedTextWithTimeoutResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, reason: "timeout", latencyMs: Date.now() - startedAt });
    }, timeoutMs);
  });
  const embedP = embedText(text, timeoutMs + 1000).then((r): EmbedTextWithTimeoutResult => {
    const elapsed = Date.now() - startedAt;
    if (r.ok) {
      return { ok: true, vector: r.vector, model: r.model, cacheHit: false, latencyMs: elapsed };
    }
    switch (r.reason) {
      case "not_configured":
        return { ok: false, reason: "not_configured", latencyMs: elapsed };
      case "http_error":
        return { ok: false, reason: "http_error", status: r.status, message: r.message, latencyMs: elapsed };
      case "bad_response":
        return { ok: false, reason: "bad_response", message: r.message, latencyMs: elapsed };
      case "network_error":
        return { ok: false, reason: "network_error", message: r.message, latencyMs: elapsed };
      default:
        return { ok: false, reason: "bad_response", message: "unknown embed failure", latencyMs: elapsed };
    }
  });

  const result = await Promise.race([embedP, timeoutP]);
  if (timer !== undefined) clearTimeout(timer);

  if (result.ok && !skipCache) {
    const key = hashKey(text);
    cache.set(key, {
      vector: result.vector.slice(),
      model: result.model,
      expiresAt: Date.now() + DEFAULT_TTL_MS,
    });
    pruneIfNeeded();
  }

  return result;
}
