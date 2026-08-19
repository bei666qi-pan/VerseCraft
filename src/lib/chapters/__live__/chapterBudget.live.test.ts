/**
 * 章节字数 2000-5000 边界契约 live 测试。
 *
 * 直接调用真实的纯函数（无 mock）：
 *   - `resolveChapterNarrativeBudget(definition)`
 *   - `getChapterDefinition(order)` / `ensureChapterDefinitionForOrder(order)`
 *
 * 约束（CLAUDE.md §章节 Director 计划与字数约束）：
 *   - 每个 chapter 的 `targetTextChars[0] === 2000`
 *   - 每个 chapter 的 `targetTextChars[1] <= 5000`
 *   - 每个 chapter 的 `hardTextChars <= 5200`
 *   - `hardTextChars >= targetTextChars[1]`
 *
 * 跑法：`pnpm dlx tsx --test src/lib/chapters/__live__/chapterBudget.live.test.ts`
 *   也可被 `pnpm test:unit` 自动收录（扫描 src 下的所有 *.test.ts）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAPTER_DEFINITIONS,
  ensureChapterDefinitionForOrder,
  getChapterDefinition,
  resolveChapterNarrativeBudget,
} from "@/lib/chapters";

const MIN = 2000;
const MAX = 5000;
const HARD = 5200;

test("seed chapter definitions all satisfy 2000..5000 + hardTextChars <= 5200", () => {
  assert.ok(CHAPTER_DEFINITIONS.length >= 1, "must have at least one seed chapter");
  for (const definition of CHAPTER_DEFINITIONS) {
    const budget = resolveChapterNarrativeBudget(definition);
    assert.equal(
      budget.targetTextChars[0],
      MIN,
      `${definition.id} targetTextChars[0] should be ${MIN}, got ${budget.targetTextChars[0]}`
    );
    assert.ok(
      budget.targetTextChars[1] <= MAX,
      `${definition.id} targetTextChars[1] should be <= ${MAX}, got ${budget.targetTextChars[1]}`
    );
    assert.ok(
      budget.hardTextChars <= HARD,
      `${definition.id} hardTextChars should be <= ${HARD}, got ${budget.hardTextChars}`
    );
    assert.ok(
      budget.hardTextChars >= budget.targetTextChars[1],
      `${definition.id} hardTextChars(${budget.hardTextChars}) should be >= target max(${budget.targetTextChars[1]})`
    );
  }
});

test("dynamic chapter definitions (order 3..8) also satisfy the same window", () => {
  for (let order = 3; order <= 8; order++) {
    const definition = ensureChapterDefinitionForOrder(order);
    const budget = resolveChapterNarrativeBudget(definition);
    assert.equal(
      budget.targetTextChars[0],
      MIN,
      `dynamic order=${order} targetTextChars[0] should be ${MIN}, got ${budget.targetTextChars[0]}`
    );
    assert.ok(
      budget.targetTextChars[1] <= MAX,
      `dynamic order=${order} targetTextChars[1] should be <= ${MAX}, got ${budget.targetTextChars[1]}`
    );
    assert.ok(
      budget.hardTextChars <= HARD,
      `dynamic order=${order} hardTextChars should be <= ${HARD}, got ${budget.hardTextChars}`
    );
    assert.ok(
      budget.hardTextChars >= budget.targetTextChars[1],
      `dynamic order=${order} hardTextChars(${budget.hardTextChars}) should be >= target max(${budget.targetTextChars[1]})`
    );
  }
});

test("getChapterDefinition(seed id) returns same budget as ensureChapterDefinitionForOrder(seed order)", () => {
  for (const seed of CHAPTER_DEFINITIONS) {
    const byId = getChapterDefinition(seed.id);
    const byOrder = ensureChapterDefinitionForOrder(seed.order);
    assert.deepEqual(
      resolveChapterNarrativeBudget(byId!),
      resolveChapterNarrativeBudget(byOrder),
      `seed ${seed.id} budgets must agree via id and order lookup`
    );
  }
});

test("chapter one keeps its product-hardcoded title even when override is injected", () => {
  const definition = CHAPTER_DEFINITIONS[0]!;
  assert.equal(definition.title, "暗月初醒", "chapter-1 must keep hardcoded product title");
});