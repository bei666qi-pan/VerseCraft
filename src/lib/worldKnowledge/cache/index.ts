export * from "./worldKnowledgeCache";
/**
 * 世界知识缓存接口（骨架）。
 *
 * 本阶段不落库、不接入 Redis，只定义未来会使用的缓存契约，保持与现有 `src/lib/kg/*` / ai/governance 缓存风格一致。
 */

import type { RetrievalQuery, RetrievalResult, PromptInjectionPayload } from "../types";

export interface WorldKnowledgeCacheBackend {
  getPromptInjection(_key: string): Promise<PromptInjectionPayload | null>;
  setPromptInjection(_key: string, _val: PromptInjectionPayload, _ttlSec: number): Promise<void>;
  getRetrievalResult(_queryKey: string): Promise<RetrievalResult | null>;
  setRetrievalResult(_queryKey: string, _val: RetrievalResult, _ttlSec: number): Promise<void>;
}

const CACHE_PREFIX = "vc:worldKnowledge";

export function buildWorldKnowledgePromptInjectionKey(args: {
  userId: string | null;
  worldRevision: bigint;
  requestHash: string;
}): string {
  return `${CACHE_PREFIX}:prompt_inj:${args.userId ?? "anon"}:wr${args.worldRevision.toString()}:${args.requestHash}`;
}

export function buildWorldKnowledgeRetrievalResultKey(args: {
  userId: string | null;
  worldRevision: bigint;
  requestHash: string;
}): string {
  return `${CACHE_PREFIX}:retrieval:${args.userId ?? "anon"}:wr${args.worldRevision.toString()}:${args.requestHash}`;
}

export function buildWorldKnowledgeQueryKey(_query: RetrievalQuery): string {
  // scaffold：后续由上层提供 requestHash（或按 query 结构 hash）
  return `${CACHE_PREFIX}:queryKey:todo`;
}

/**
 * scaffold：内存缓存后备实现，用于“未接入 Redis 时仍可运行”。
 * 真实 Redis 适配会在后续替换为 `getAppRedisClient()` 风格实现。
 */
export function createInMemoryWorldKnowledgeCache(): WorldKnowledgeCacheBackend {
  const mem = new Map<string, { exp: number; val: PromptInjectionPayload | RetrievalResult }>();

  async function getPromptInjection(key: string): Promise<PromptInjectionPayload | null> {
    const row = mem.get(key);
    if (!row) return null;
    if (row.exp <= Date.now()) {
      mem.delete(key);
      return null;
    }
    if (!("ragLoreFactsBlock" in row.val)) return null;
    return row.val as PromptInjectionPayload;
  }

  async function setPromptInjection(key: string, val: PromptInjectionPayload, ttlSec: number): Promise<void> {
    mem.set(key, { val, exp: Date.now() + Math.max(1, ttlSec) * 1000 });
  }

  async function getRetrievalResult(key: string): Promise<RetrievalResult | null> {
    const row = mem.get(key);
    if (!row) return null;
    if (row.exp <= Date.now()) {
      mem.delete(key);
      return null;
    }
    if (!("facts" in row.val)) return null;
    return row.val as RetrievalResult;
  }

  async function setRetrievalResult(key: string, val: RetrievalResult, ttlSec: number): Promise<void> {
    mem.set(key, { val, exp: Date.now() + Math.max(1, ttlSec) * 1000 });
  }

  return {
    getPromptInjection,
    setPromptInjection,
    getRetrievalResult,
    setRetrievalResult,
  };
}

