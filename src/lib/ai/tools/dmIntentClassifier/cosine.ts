// src/lib/ai/tools/dmIntentClassifier/cosine.ts
//
// 余弦相似度纯函数，用于 per-world DM Agent 意图分类（详见 AGENTS.md §2.4 与本目录
// README）。这是 deterministic stage 的一部分（§3.2.3）：不接受任何外部状态/IO，
// 不依赖模型版本；唯一输入是两条等长向量，输出 [-1, 1] 区间的标量。

/**
 * 余弦相似度（Cosine similarity）。
 *
 * 数学性质（用于单测断言）：
 *  - 对称：cos(a, b) === cos(b, a)
 *  - 自相似：cos(a, a) === 1.0（当 ||a|| !== 0）
 *  - 零向量：任一向量是零向量时返回 0（不返回 NaN）
 *  - 钳位：结果钳制到 [-1, 1] 防止浮点漂移
 *  - 确定性：不引入随机或外部状态
 *
 * 入参校验：
 * - 两向量必须等长且非空；否则抛 Error（fail-closed，避免下游静默错分）
 * - 向量元素必须是有限数（Number.isFinite）；否则抛 Error
 */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) {
    throw new Error("cosineSimilarity: vectors must be non-empty");
  }
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: length mismatch (a=${a.length}, b=${b.length})`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (typeof ai !== "number" || !Number.isFinite(ai)) {
      throw new Error(`cosineSimilarity: non-finite value at a[${i}]`);
    }
    if (typeof bi !== "number" || !Number.isFinite(bi)) {
      throw new Error(`cosineSimilarity: non-finite value at b[${i}]`);
    }
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  const raw = dot / Math.sqrt(normA * normB);
  if (raw > 1) return 1;
  if (raw < -1) return -1;
  return raw;
}

/**
 * 取多条向量中的最大余弦相似度。
 *
 * 用于 intent 分类：input 是玩家输入的 embedding，candidates 是当前世界的
 * mechanics seed 列表。返回 { max, bestIndex }，调用方按阈值判定 mechanics /
 * narrative / ambiguous。
 *
 * candidates 为空时返回 max=0 / bestIndex=-1，便于上层 fail-open 到 keyword 分类器。
 */
export interface BestSimilarity {
  /** 最高余弦相似度 ∈ [-1, 1] */
  max: number;
  /** 命中 candidate 在输入数组中的 index；max 为 0 / 空数组时返回 -1 */
  bestIndex: number;
}

export function bestCosineSimilarity(
  input: readonly number[],
  candidates: readonly (readonly number[])[],
): BestSimilarity {
  if (candidates.length === 0) {
    return { max: 0, bestIndex: -1 };
  }
  let max = -Infinity;
  let bestIndex = 0;
  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (!cand || cand.length === 0) continue;
    let sim: number;
    try {
      sim = cosineSimilarity(input, cand);
    } catch {
      continue;
    }
    if (sim > max) {
      max = sim;
      bestIndex = i;
    }
  }
  if (max === -Infinity) {
    return { max: 0, bestIndex: -1 };
  }
  return { max, bestIndex };
}
