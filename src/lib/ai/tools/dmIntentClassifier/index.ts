// src/lib/ai/tools/dmIntentClassifier/index.ts
//
// per-world DM Agent intent 分类器入口。组合三层：
//
//   1. embedding 余弦相似度（主路径），由 scripts/buildDmIntentEmbeddings.ts 在 build
//      time 生成的 per-world seed 向量；运行时只对玩家输入做一次 embed + 一轮向量
//      比较。500ms race-based 超时 + 30s LRU 缓存（见 ./runtime.ts）。
//
//   2. 纯关键词分类器（fallback），搬自 dmMechanicsIntentRouter.ts 的现有语义——
//      当 embedding 不可用（not_configured / timeout / 网络错误）时降级到这里，
//      保证暗月+星逆 DM Agent 路径在任意环境下都不退化到全 envelope。
//
//   3. 默认 ambiguous（极端降级），仅在两条路径同时抛错时触发。
//
// 设计契约（详见 AGENTS.md §3.2.3 Deterministic Stage Router）：
//   - 输入：玩家最新输入 + 当前 worldId（必须 worldId，不要 mapId——seed 表按 world 分桶）。
//   - 输出：{ classification, path, latencyMs } 三个字段，分别给 /api/chat route
//     做 gate 决策、做 telemetry、做 perf 监控。
//   - 永不抛错；所有错误降级到 `path = "keywords" / "ambiguous"`。

import { DARKMOON_MECHANICS_SEEDS } from "./embeddings/darkMoonMechanics";
import { XINGNI_MECHANICS_SEEDS } from "./embeddings/xingniMechanics";
import { bestCosineSimilarity, cosineSimilarity } from "./cosine";
import {
  embedTextWithTimeout,
  type EmbedTextWithTimeoutResult,
} from "./runtime";
import { classifyMechanicsIntent } from "@/lib/ai/tools/dmMechanicsIntentRouter";
import type { MechanicsIntentClassification } from "@/lib/ai/tools/dmMechanicsIntentRouter";
import { DARK_MOON_WORLD_ID, XINGNI_WORLD_ID } from "@/lib/worlds/types";
import type { WorldId } from "@/lib/worlds/types";

// ============================================================
// Tunables
// ============================================================

/** 余弦相似度阈值：超过此值认为 mechanics 意图。调高 = 更严格（少进 DM Agent）。 */
export const DM_INTENT_EMBEDDING_THRESHOLD = 0.6;

/** 余弦相似度"模糊带"上限：超过此值即使未到阈值也返回 mechanics（rare 词）。 */
export const DM_INTENT_EMBEDDING_HIGH = 0.85;

/** 在线 embedding 超时（毫秒）。 */
export const DM_INTENT_EMBEDDING_TIMEOUT_MS = 500;

// ============================================================
// Public types
// ============================================================

export type IntentClassifierPath =
  | "embedding"      // 主路径命中
  | "keywords"       // embedding 失败/超时，降级到关键词分类器
  | "ambiguous";     // 两条路径都不出 mechanics——走 envelope

export interface IntentClassifierResult {
  classification: MechanicsIntentClassification;
  path: IntentClassifierPath;
  /** embedding 调用总耗时（毫秒）；keywords 路径下为 0 */
  latencyMs: number;
  /** 仅 embedding 路径下有值；keywords 路径下为 null */
  bestSimilarity: number | null;
  /** 仅 embedding 路径下有值；用于审计 "哪条 seed 触发" */
  bestSeedPhrase: string | null;
}

// ============================================================
// Public API
// ============================================================

/**
 * 分类玩家输入是否包含 mechanics 意图。
 *
 * 内部先试 embedding（500ms timeout + 30s LRU），失败/超时/未命中阈值则降级到
 * keyword classifier。永不抛错。
 */
export async function classifyIntent(
  userInput: string,
  worldId: WorldId | string,
): Promise<IntentClassifierResult> {
  // 1. embedding 路径
  try {
    const seeds = pickSeedsForWorld(worldId);
    if (seeds.length > 0) {
      const emb = await embedTextWithTimeout(userInput, {
        timeoutMs: DM_INTENT_EMBEDDING_TIMEOUT_MS,
      });
      if (emb.ok) {
        const candidates = seeds.map((s) => s.vector);
        const best = bestCosineSimilarity(emb.vector, candidates);
        if (best.max >= DM_INTENT_EMBEDDING_THRESHOLD) {
          return {
            classification: "mechanics",
            path: "embedding",
            latencyMs: emb.latencyMs,
            bestSimilarity: best.max,
            bestSeedPhrase: best.bestIndex >= 0 ? seeds[best.bestIndex]?.phrase ?? null : null,
          };
        }
        // 高分但未到阈值：保留 bestSimilarity 供 telemetry，但 classification 走 fallback
        return {
          classification: "narrative",
          path: "ambiguous",
          latencyMs: emb.latencyMs,
          bestSimilarity: best.max,
          bestSeedPhrase: best.bestIndex >= 0 ? seeds[best.bestIndex]?.phrase ?? null : null,
        };
      }
      // emb.ok === false → 落到 keyword fallback（不是失败，是降级）
    }
  } catch {
    // 任意抛错都被 keyword fallback 接管
  }

  // 2. keyword fallback
  const kw = classifyMechanicsIntent(userInput);
  return {
    classification: kw.classification,
    path: kw.classification === "mechanics" ? "keywords" : "ambiguous",
    latencyMs: 0,
    bestSimilarity: null,
    bestSeedPhrase: null,
  };
}

/**
 * 同步版本：只走 keyword 分类器，跳过 embedding。
 * 用于：测试 / 极快路径（毫秒级 budget 不允许 500ms IO）/ 已经降级确定不会用 DM Agent 的场景。
 */
export function classifyIntentSync(userInput: string): IntentClassifierResult {
  const kw = classifyMechanicsIntent(userInput);
  return {
    classification: kw.classification,
    path: kw.classification === "mechanics" ? "keywords" : "ambiguous",
    latencyMs: 0,
    bestSimilarity: null,
    bestSeedPhrase: null,
  };
}

// ============================================================
// Helpers
// ============================================================

function pickSeedsForWorld(worldId: WorldId | string): readonly { phrase: string; vector: readonly number[] }[] {
  if (worldId === DARK_MOON_WORLD_ID) return DARKMOON_MECHANICS_SEEDS;
  if (worldId === XINGNI_WORLD_ID) return XINGNI_MECHANICS_SEEDS;
  // 未知世界 → 空 seed，强制走 keyword 分类器（fail-closed 防止泄漏）
  return [];
}

// ============================================================
// Re-exports
// ============================================================

export { cosineSimilarity, bestCosineSimilarity } from "./cosine";
export { embedTextWithTimeout } from "./runtime";
export type { EmbedTextWithTimeoutResult } from "./runtime";
export { DARKMOON_MECHANICS_SEEDS } from "./embeddings/darkMoonMechanics";
export { XINGNI_MECHANICS_SEEDS } from "./embeddings/xingniMechanics";
