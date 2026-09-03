// src/lib/ai/tools/mechanicsToolCache.ts
/**
 * Mechanics Workflow 只读工具结果缓存
 *
 * 对稳定的世界设定、物品定义、配方和规则进行缓存，
 * 减少重复只读工具调用，降低延迟。
 *
 * 设计原则：
 * - 仅缓存只读工具结果（写工具绝不缓存）
 * - TTL 10 秒，LRU 淘汰（最大 64 条目）
 * - 缓存键基于工具名 + 参数的确定性 hash
 * - 与玩家相关的数据不缓存（playerState 每次可能不同）
 */

import type { MechanicsToolResult } from "./mechanicsTypes";

// ============================================================
// Cache Entry
// ============================================================

interface CacheEntry {
  result: MechanicsToolResult;
  timestamp: number;
}

// ============================================================
// LRU Cache Implementation
// ============================================================

class ToolResultCache {
  private map = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 64, ttlMs = 10_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): MechanicsToolResult | null {
    const entry = this.map.get(key);
    if (!entry) return null;

    // TTL 过期检查
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.map.delete(key);
      return null;
    }

    // LRU：移动到末尾
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.result;
  }

  set(key: string, result: MechanicsToolResult): void {
    // LRU 淘汰
    if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next();
      if (!oldest.done) this.map.delete(oldest.value);
    }

    this.map.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// ============================================================
// Cacheable Tool List
// ============================================================

/** 可缓存的只读工具（世界设定类，不依赖玩家实时状态） */
const CACHEABLE_TOOLS = new Set([
  "get_world_context",      // 世界上下文（短时间内不变）
  "inspect_forge_options",   // 锻造配方（除非原石变化）
]);

// ============================================================
// Cache Instance
// ============================================================

const toolCache = new ToolResultCache(64, 10_000);

// ============================================================
// Public API
// ============================================================

/**
 * 构建缓存键
 * 基于工具名 + 参数的确定性 hash
 */
export function buildToolCacheKey(toolName: string, args: Record<string, unknown>): string {
  // 只对可缓存的工具生成键
  if (!CACHEABLE_TOOLS.has(toolName)) return "";

  // 排序键以保证确定性
  const sorted = Object.keys(args).sort().map((k) => `${k}=${JSON.stringify(args[k])}`);
  return `${toolName}:${sorted.join("&")}`;
}

/**
 * 尝试从缓存获取工具结果
 */
export function getCachedToolResult(toolName: string, args: Record<string, unknown>): MechanicsToolResult | null {
  const key = buildToolCacheKey(toolName, args);
  if (!key) return null;
  return toolCache.get(key);
}

/**
 * 将工具结果写入缓存
 */
export function setCachedToolResult(toolName: string, args: Record<string, unknown>, result: MechanicsToolResult): void {
  // 只缓存成功结果
  if (!result.ok) return;

  const key = buildToolCacheKey(toolName, args);
  if (!key) return;
  toolCache.set(key, result);
}

/**
 * 清除所有缓存（用于测试或世界重置）
 */
export function clearToolCache(): void {
  toolCache.clear();
}

/**
 * 获取缓存统计
 */
export function getToolCacheStats(): { size: number; maxSize: number; ttlMs: number } {
  return {
    size: toolCache.size,
    maxSize: 64,
    ttlMs: 10_000,
  };
}
