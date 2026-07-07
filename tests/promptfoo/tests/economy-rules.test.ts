/**
 * Economy Rules — Node Test 镜像
 * 与 economy-rules.yaml 等价的 Node 测试。
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  validateCurrencyChange,
  validateConsumedItems,
  validateAwardedItems,
  validateTaskUpdates,
  validateCodexUpdates,
  validateRelationshipUpdates,
} from "../assertions/schema-validators";

describe("Economy Rules — 经济护栏", () => {
  describe("currency_change", () => {
    it("originium: -1 应通过", () => {
      assert.equal(validateCurrencyChange({ originium: -1 }).length, 0);
    });
    it("originium: 50 应通过（边界）", () => {
      assert.equal(validateCurrencyChange({ originium: 50 }).length, 0);
    });
    it("originium: 51 应被拒", () => {
      assert.ok(validateCurrencyChange({ originium: 51 }).length > 0);
    });
    it("sanity: 3 应通过", () => {
      assert.equal(validateCurrencyChange({ sanity: 3 }).length, 0);
    });
    it("stability: -5 应通过", () => {
      assert.equal(validateCurrencyChange({ stability: -5 }).length, 0);
    });
  });

  describe("consumed_items", () => {
    it("quantity=1 应通过", () => {
      assert.equal(validateConsumedItems([{ item_id: "i1", quantity: 1 }]).length, 0);
    });
    it("quantity=10 应通过（边界）", () => {
      assert.equal(validateConsumedItems([{ item_id: "i1", quantity: 10 }]).length, 0);
    });
    it("quantity=11 应被拒", () => {
      assert.ok(validateConsumedItems([{ item_id: "i1", quantity: 11 }]).length > 0);
    });
    it("quantity=0.5 应被拒", () => {
      assert.ok(validateConsumedItems([{ item_id: "i1", quantity: 0.5 }]).length > 0);
    });
  });

  describe("awarded_items", () => {
    it("1-5 个合法物品应通过", () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, name: `物品${i}` }));
      assert.equal(validateAwardedItems(items).length, 0);
    });
    it("6 个物品应被拒", () => {
      const items = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, name: `物品${i}` }));
      assert.ok(validateAwardedItems(items).length > 0);
    });
    it("空 id 物品应被拒", () => {
      assert.ok(validateAwardedItems([{ id: "", name: "无名" }]).length > 0);
    });
    it("id 超长物品应被拒", () => {
      assert.ok(validateAwardedItems([{ id: "x".repeat(65), name: "n" }]).length > 0);
    });
  });

  describe("task_updates", () => {
    it("合法 task_update 应通过", () => {
      assert.equal(validateTaskUpdates([{ task_id: "t1", status: "active", progress: 50 }]).length, 0);
    });
    it("progress > 100 应被拒", () => {
      assert.ok(validateTaskUpdates([{ task_id: "t1", progress: 101 }]).length > 0);
    });
    it("缺少 task_id 应被拒", () => {
      assert.ok(validateTaskUpdates([{ status: "active" }]).length > 0);
    });
    it("非枚举 status 应被拒", () => {
      assert.ok(validateTaskUpdates([{ task_id: "t1", status: "cancelled" }]).length > 0);
    });
  });

  describe("codex_updates", () => {
    it("合法 codex_update 应通过", () => {
      assert.equal(validateCodexUpdates([{ entry_id: "c1", type: "npc" }]).length, 0);
    });
    it("type=weapon 应被拒", () => {
      assert.ok(validateCodexUpdates([{ entry_id: "c1", type: "weapon" }]).length > 0);
    });
    it("缺少 entry_id 应被拒", () => {
      assert.ok(validateCodexUpdates([{ type: "npc" }]).length > 0);
    });
  });

  describe("relationship_updates", () => {
    it("delta=15 应通过", () => {
      assert.equal(validateRelationshipUpdates([{ npc_id: "n1", delta: 15 }]).length, 0);
    });
    it("delta=31 应被拒（单步变化上限 30）", () => {
      assert.ok(validateRelationshipUpdates([{ npc_id: "n1", delta: 31 }]).length > 0);
    });
    it("delta=-30 应通过（边界）", () => {
      assert.equal(validateRelationshipUpdates([{ npc_id: "n1", delta: -30 }]).length, 0);
    });
    it("delta=-31 应被拒", () => {
      assert.ok(validateRelationshipUpdates([{ npc_id: "n1", delta: -31 }]).length > 0);
    });
  });
});