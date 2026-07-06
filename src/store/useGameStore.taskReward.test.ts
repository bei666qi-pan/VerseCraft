import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./useGameStore";
import type { GameTask } from "./useGameStore";

function resetStore() {
  const initial = (
    useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }
  ).getInitialState();
  useGameStore.setState(initial, true);
}

const g = () => useGameStore.getState();

function addActiveTask(id: string, reward: Partial<GameTask["reward"]>, extra?: Partial<GameTask>) {
  g().addTask({
    id,
    title: `委托-${id}`,
    desc: "测试用委托",
    type: "floor",
    status: "active",
    claimMode: "manual",
    reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [], ...reward },
    ...extra,
  });
}

test("完成委托时发放 reward.originium（updateTaskStatus 路径）", () => {
  resetStore();
  const before = g().originium;
  addActiveTask("t_reward_originium", { originium: 5 });
  assert.equal(g().originium, before, "仅新增 active 委托不应发放奖励");

  g().updateTaskStatus("t_reward_originium", "completed");
  assert.equal(g().originium, before + 5, "委托完成应把 reward.originium 加到原石余额");
  assert.ok(
    (g().appliedRewardTaskIds ?? []).includes("t_reward_originium"),
    "已发放的委托应登记到幂等账本"
  );
});

test("同一委托不会重复发奖（updateTaskStatus + updateTask 双触发幂等）", () => {
  resetStore();
  const before = g().originium;
  addActiveTask("t_reward_idem", { originium: 3 });

  // 复刻 page.tsx 的 task.update 处理：对已完成委托会同时调用两个 action。
  g().updateTaskStatus("t_reward_idem", "completed");
  g().updateTask({ id: "t_reward_idem", status: "completed" });

  assert.equal(g().originium, before + 3, "两次触发只应发放一次奖励");
});

test("reward.items / reward.warehouseItems 落到行囊与仓库", () => {
  resetStore();
  addActiveTask("t_reward_items", { items: ["I-S01"], warehouseItems: ["W-B101"] });
  g().updateTaskStatus("t_reward_items", "completed");

  assert.ok(g().inventory.some((i) => i.id === "I-S01"), "奖励道具应进入行囊");
  assert.ok(g().warehouse.some((w) => w.id === "W-B101"), "奖励仓库物品应进入仓库");
});

test("addTask 直接以 completed 加入也会结算奖励", () => {
  resetStore();
  const before = g().originium;
  g().addTask({
    id: "t_reward_addcompleted",
    title: "已完成委托",
    desc: "测试",
    type: "floor",
    status: "completed",
    claimMode: "auto",
    reward: { originium: 7, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
  });
  assert.equal(g().originium, before + 7, "以 completed 状态加入的委托应立即结算奖励");
});

test("端到端：完成「在B1建立生存节奏」发放 +2 原石并推进任务链", () => {
  resetStore();
  g().initCharacter(
    { name: "测试者", gender: "unknown", height: 170, personality: "谨慎" },
    { sanity: 10, agility: 0, luck: 0, charm: 0, background: 10 },
    "洞察之眼"
  );

  const b1 = g().tasks.find((t) => t.id === "b1_survival_rhythm");
  assert.ok(b1, "开局起始委托应包含 b1_survival_rhythm");
  assert.equal(b1?.status, "active", "b1_survival_rhythm 开局为 active");
  assert.equal(b1?.reward.originium, 2, "b1_survival_rhythm 奖励为 2 原石");

  const frag0 = g().tasks.find((t) => t.id === "escape_route_fragments");
  assert.equal(frag0?.status, "hidden", "完成 B1 节奏前，后续「出口碎片」为 hidden");

  const beforeOri = g().originium;
  g().updateTaskStatus("b1_survival_rhythm", "completed");

  assert.equal(g().originium, beforeOri + 2, "完成委托应实际到账 +2 原石");
  const frag1 = g().tasks.find((t) => t.id === "escape_route_fragments");
  assert.notEqual(frag1?.status, "hidden", "完成 B1 节奏应解锁任务链的下一环");
});

test("currency_change 通路（addOriginium）仍正常加原石", () => {
  resetStore();
  const before = g().originium;
  g().addOriginium(4);
  assert.equal(g().originium, before + 4, "NPC 直接赠送原石（currency_change）仍应到账");
});

test("零奖励委托不报错，且仍登记幂等账本避免重复扫描", () => {
  resetStore();
  addActiveTask("t_reward_zero", { originium: 0 });
  const before = g().originium;
  g().updateTaskStatus("t_reward_zero", "completed");
  assert.equal(g().originium, before, "零奖励不应改变原石");
  assert.ok(
    (g().appliedRewardTaskIds ?? []).includes("t_reward_zero"),
    "零奖励委托完成后也应登记账本"
  );
});

test("appliedRewardTaskIds 进入持久化投影（partialize 快照可序列化）", () => {
  resetStore();
  addActiveTask("t_reward_persist", { originium: 1 });
  g().updateTaskStatus("t_reward_persist", "completed");
  // 直接落一份 main_slot 存档，确认账本随存档投影，避免读档后重复发奖。
  g().saveGame("main_slot");
  const slot = g().saveSlots?.main_slot as { appliedRewardTaskIds?: string[] } | undefined;
  assert.ok(
    (slot?.appliedRewardTaskIds ?? []).includes("t_reward_persist"),
    "存档投影应包含已发奖账本"
  );
});
