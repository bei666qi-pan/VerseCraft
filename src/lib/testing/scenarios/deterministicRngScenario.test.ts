/**
 * 场景测试：确定性随机与重放能力
 *
 * 覆盖：
 * - 相同种子产生相同序列
 * - 失败时输出种子
 * - 支持克隆分支模拟
 * - 随机选取确定性
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createSeededRng, randomTestSeed } from "@/lib/testing/seededRng";

// ── 相同种子确定性 ────────────────────────────────────────────────

test("seededRng: same seed produces same sequence", () => {
  const rng1 = createSeededRng(42);
  const rng2 = createSeededRng(42);

  const seq1 = Array.from({ length: 20 }, () => rng1.next());
  const seq2 = Array.from({ length: 20 }, () => rng2.next());

  assert.deepEqual(seq1, seq2, "相同种子应产生相同序列");
});

test("seededRng: different seeds produce different sequences", () => {
  const rng1 = createSeededRng(42);
  const rng2 = createSeededRng(99);

  const seq1 = Array.from({ length: 10 }, () => rng1.next());
  const seq2 = Array.from({ length: 10 }, () => rng2.next());

  const same = seq1.every((v, i) => v === seq2[i]);
  assert.equal(same, false, "不同种子应产生不同序列（极低概率相同）");
});

// ── nextInt 范围 ───────────────────────────────────────────────────

test("seededRng: nextInt stays within bounds", () => {
  const rng = createSeededRng(42);
  for (let i = 0; i < 1000; i++) {
    const val = rng.nextInt(10);
    assert.ok(val >= 0 && val < 10, `nextInt(10) = ${val} 应在 [0, 10)`);
  }
});

test("seededRng: nextIntInclusive stays within bounds", () => {
  const rng = createSeededRng(42);
  for (let i = 0; i < 1000; i++) {
    const val = rng.nextIntInclusive(3, 7);
    assert.ok(val >= 3 && val <= 7, `nextIntInclusive(3,7) = ${val} 应在 [3, 7]`);
  }
});

// ── pick 确定性 ─────────────────────────────────────────────────────

test("seededRng: pick is deterministic", () => {
  const arr = ["a", "b", "c", "d", "e"];
  const rng1 = createSeededRng(100);
  const rng2 = createSeededRng(100);

  const picks1 = Array.from({ length: 10 }, () => rng1.pick(arr));
  const picks2 = Array.from({ length: 10 }, () => rng2.pick(arr));

  assert.deepEqual(picks1, picks2, "相同种子 pick 应产生相同序列");
});

test("seededRng: pick throws on empty array", () => {
  const rng = createSeededRng(42);
  assert.throws(() => rng.pick([]));
});

// ── clone 独立性 ───────────────────────────────────────────────────

test("seededRng: clone produces independent but identical streams", () => {
  const rng = createSeededRng(42);
  // 推进 5 步
  for (let i = 0; i < 5; i++) rng.next();
  const cloned = rng.clone();

  // 从第 5 步开始，两者应产生相同序列
  const seq1 = Array.from({ length: 10 }, () => rng.next());
  const seq2 = Array.from({ length: 10 }, () => cloned.next());
  assert.deepEqual(seq1, seq2, "clone 应产生相同的后续序列");

  // 但后续独立推进
  rng.next();
  assert.notDeepEqual([rng.next()], [cloned.next()], "独立推进后序列应分叉");
});

// ── 种子记录（用于失败重放） ──────────────────────────────────────

test("seededRng: seed can be recorded and replayed", () => {
  // 模拟：生成随机种子 → 运行测试 → 失败 → 用记录的种子重放
  const recordedSeed = randomTestSeed();

  // 第一次运行
  const rng1 = createSeededRng(recordedSeed);
  const result1 = Array.from({ length: 5 }, () => rng1.nextInt(100));

  // 重放
  const rng2 = createSeededRng(recordedSeed);
  const result2 = Array.from({ length: 5 }, () => rng2.nextInt(100));

  assert.deepEqual(result1, result2, `用种子 ${recordedSeed} 重放应产生相同结果`);
});

// ── 批量模拟确定性 ─────────────────────────────────────────────────

test("seededRng: batch simulation is deterministic", () => {
  const seed = 777;
  const results: number[][] = [];

  // 运行 3 次相同种子
  for (let i = 0; i < 3; i++) {
    const rng = createSeededRng(seed);
    const scores = Array.from({ length: 20 }, () => rng.nextInt(60));
    results.push(scores);
  }

  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
});
