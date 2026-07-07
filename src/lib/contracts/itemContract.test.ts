/**
 * 道具系统契约测试
 *
 * 验证道具（Item）生命周期：拾取→使用→消耗→容量控制
 * 包括行囊（inventory）和仓库（warehouse）两条存储路径。
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

interface Item {
  id: string;
  name: string;
  tier: "common" | "uncommon" | "rare" | "epic";
  quantity: number;
}

interface ItemState {
  inventory: Item[];
  warehouse: Item[];
  maxInventorySlots: number;
}

function addItem(state: ItemState, item: Item): { newState: ItemState; added: boolean; reason?: string } {
  const existing = state.inventory.find((i) => i.id === item.id);
  if (existing) {
    existing.quantity += item.quantity;
    return { newState: { ...state, inventory: [...state.inventory] }, added: true };
  }
  if (state.inventory.length >= state.maxInventorySlots) {
    return { newState: { ...state }, added: false, reason: "inventory_full" };
  }
  return {
    newState: { ...state, inventory: [...state.inventory, { ...item }] },
    added: true,
  };
}

function consumeItem(state: ItemState, itemId: string, quantity = 1): { newState: ItemState; consumed: boolean } {
  const idx = state.inventory.findIndex((i) => i.id === itemId);
  if (idx < 0) return { newState: { ...state }, consumed: false };
  const item = state.inventory[idx]!;
  if (item.quantity < quantity) return { newState: { ...state }, consumed: false };
  const newInventory = [...state.inventory];
  if (item.quantity === quantity) {
    newInventory.splice(idx, 1);
  } else {
    newInventory[idx] = { ...item, quantity: item.quantity - quantity };
  }
  return { newState: { ...state, inventory: newInventory }, consumed: true };
}

function moveToWarehouse(state: ItemState, itemId: string): { newState: ItemState; moved: boolean } {
  const idx = state.inventory.findIndex((i) => i.id === itemId);
  if (idx < 0) return { newState: { ...state }, moved: false };
  const item = state.inventory[idx]!;
  const newInventory = [...state.inventory];
  newInventory.splice(idx, 1);
  const whIdx = state.warehouse.findIndex((i) => i.id === item.id);
  if (whIdx >= 0) {
    const newWarehouse = [...state.warehouse];
    newWarehouse[whIdx] = { ...newWarehouse[whIdx]!, quantity: newWarehouse[whIdx]!.quantity + item.quantity };
    return { newState: { ...state, inventory: newInventory, warehouse: newWarehouse }, moved: true };
  }
  return {
    newState: { ...state, inventory: newInventory, warehouse: [...state.warehouse, { ...item }] },
    moved: true,
  };
}

function countByRarity(state: ItemState, tier: Item["tier"]): number {
  return state.inventory.filter((i) => i.tier === tier).reduce((sum, i) => sum + i.quantity, 0);
}

describe("道具系统契约", () => {
  const emptyState: ItemState = { inventory: [], warehouse: [], maxInventorySlots: 12 };

  describe("添加道具", () => {
    it("新道具加入空行囊", () => {
      const { newState, added } = addItem(emptyState, { id: "bandage", name: "绷带", tier: "common", quantity: 1 });
      assert.equal(added, true);
      assert.equal(newState.inventory.length, 1);
      assert.equal(newState.inventory[0]!.name, "绷带");
    });

    it("同ID道具堆叠数量", () => {
      const state = emptyState;
      const r1 = addItem(state, { id: "bandage", name: "绷带", tier: "common", quantity: 2 });
      const r2 = addItem(r1.newState, { id: "bandage", name: "绷带", tier: "common", quantity: 3 });
      assert.equal(r2.added, true);
      assert.equal(r2.newState.inventory.length, 1, "同ID应堆叠");
      assert.equal(r2.newState.inventory[0]!.quantity, 5);
    });

    it("行囊满时添加新道具失败", () => {
      let state: ItemState = { inventory: [], warehouse: [], maxInventorySlots: 2 };
      state = addItem(state, { id: "a", name: "A", tier: "common", quantity: 1 }).newState;
      state = addItem(state, { id: "b", name: "B", tier: "common", quantity: 1 }).newState;
      const { added, reason } = addItem(state, { id: "c", name: "C", tier: "uncommon", quantity: 1 });
      assert.equal(added, false);
      assert.equal(reason, "inventory_full");
    });
  });

  describe("消耗道具", () => {
    it("消耗1个绷带从堆叠中", () => {
      const state = addItem(emptyState, { id: "bandage", name: "绷带", tier: "common", quantity: 3 }).newState;
      const { newState, consumed } = consumeItem(state, "bandage", 1);
      assert.equal(consumed, true);
      assert.equal(newState.inventory[0]!.quantity, 2);
    });

    it("消耗最后1个道具后从行囊移除", () => {
      const state = addItem(emptyState, { id: "key", name: "旧钥匙", tier: "uncommon", quantity: 1 }).newState;
      const { newState, consumed } = consumeItem(state, "key", 1);
      assert.equal(consumed, true);
      assert.equal(newState.inventory.length, 0);
    });

    it("数量不足时消耗失败", () => {
      const state = addItem(emptyState, { id: "bandage", name: "绷带", tier: "common", quantity: 1 }).newState;
      const { consumed } = consumeItem(state, "bandage", 3);
      assert.equal(consumed, false);
    });

    it("不存在的道具消耗失败", () => {
      const { consumed } = consumeItem(emptyState, "nonexistent");
      assert.equal(consumed, false);
    });
  });

  describe("仓库转移", () => {
    it("行囊道具转移到空仓库", () => {
      const state = addItem(emptyState, { id: "gem", name: "原石碎片", tier: "rare", quantity: 2 }).newState;
      const { newState, moved } = moveToWarehouse(state, "gem");
      assert.equal(moved, true);
      assert.equal(newState.inventory.length, 0);
      assert.equal(newState.warehouse.length, 1);
      assert.equal(newState.warehouse[0]!.quantity, 2);
    });

    it("转移到已有同ID的仓库中堆叠", () => {
      let state = emptyState;
      state = { ...state, warehouse: [{ id: "gem", name: "原石碎片", tier: "rare", quantity: 1 }] };
      state = addItem(state, { id: "gem", name: "原石碎片", tier: "rare", quantity: 2 }).newState;
      const { newState, moved } = moveToWarehouse(state, "gem");
      assert.equal(moved, true);
      assert.equal(newState.warehouse[0]!.quantity, 3);
    });
  });

  describe("稀有度统计", () => {
    it("正确统计各类稀有度数量", () => {
      let state = emptyState;
      state = addItem(state, { id: "a", name: "A", tier: "common", quantity: 3 }).newState;
      state = addItem(state, { id: "b", name: "B", tier: "uncommon", quantity: 1 }).newState;
      state = addItem(state, { id: "c", name: "C", tier: "rare", quantity: 1 }).newState;
      assert.equal(countByRarity(state, "common"), 3);
      assert.equal(countByRarity(state, "uncommon"), 1);
      assert.equal(countByRarity(state, "rare"), 1);
      assert.equal(countByRarity(state, "epic"), 0);
    });
  });
});
