// src/lib/ai/tools/dmIntentClassifier/cosine.test.ts
//
// 纯函数数学性质断言（对称 / 自相似 / 零向量 / 钳位 / 长度校验）。

import test from "node:test";
import assert from "node:assert/strict";

import { cosineSimilarity, bestCosineSimilarity } from "./cosine";

test("cosineSimilarity: symmetric", () => {
  const a = [0.1, 0.2, 0.3];
  const b = [0.4, -0.5, 0.6];
  const ab = cosineSimilarity(a, b);
  const ba = cosineSimilarity(b, a);
  // 浮点允许极小误差
  assert.ok(Math.abs(ab - ba) < 1e-12, `expected symmetric, got ab=${ab} ba=${ba}`);
});

test("cosineSimilarity: self-similarity === 1", () => {
  const a = [0.3, -0.7, 0.5, 0.1];
  const sim = cosineSimilarity(a, a);
  assert.ok(Math.abs(sim - 1) < 1e-12);
});

test("cosineSimilarity: zeroSafe returns 0 for zero vector", () => {
  const zero = [0, 0, 0];
  const a = [0.1, 0.2, 0.3];
  assert.strictEqual(cosineSimilarity(zero, a), 0);
  assert.strictEqual(cosineSimilarity(a, zero), 0);
  assert.strictEqual(cosineSimilarity(zero, zero), 0);
});

test("cosineSimilarity: clamped to [-1, 1]", () => {
  // 用反向向量达到接近 -1 的相似度
  const a = [1, 0];
  const b = [-1, 0];
  const sim = cosineSimilarity(a, b);
  assert.ok(sim >= -1 - 1e-12 && sim <= 1 + 1e-12);
});

test("cosineSimilarity: throws on length mismatch", () => {
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), /length mismatch/);
});

test("cosineSimilarity: throws on empty vector", () => {
  assert.throws(() => cosineSimilarity([], [1]), /non-empty/);
  assert.throws(() => cosineSimilarity([1], []), /non-empty/);
});

test("cosineSimilarity: throws on non-finite value", () => {
  assert.throws(() => cosineSimilarity([Number.NaN, 0], [0, 0]), /non-finite/);
  assert.throws(() => cosineSimilarity([0, 0], [0, Number.POSITIVE_INFINITY]), /non-finite/);
});

test("bestCosineSimilarity: returns max + bestIndex", () => {
  const input = [1, 0, 0];
  const candidates = [
    [1, 0, 0],     // self, sim=1, best
    [0.5, 0.5, 0],
    [0.2, 0.8, 0],
  ];
  const r = bestCosineSimilarity(input, candidates);
  assert.strictEqual(r.bestIndex, 0);
  assert.ok(Math.abs(r.max - 1) < 1e-12);
});

test("bestCosineSimilarity: empty candidates returns {max:0, bestIndex:-1}", () => {
  const r = bestCosineSimilarity([1, 0, 0], []);
  assert.strictEqual(r.max, 0);
  assert.strictEqual(r.bestIndex, -1);
});

test("bestCosineSimilarity: skips empty candidate vectors without throwing", () => {
  const r = bestCosineSimilarity([1, 0, 0], [[], [1, 0, 0], []]);
  assert.strictEqual(r.bestIndex, 1);
  assert.ok(r.max > 0.99);
});
