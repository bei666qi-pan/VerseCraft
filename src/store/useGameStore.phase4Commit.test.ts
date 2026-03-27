import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./useGameStore";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

test("phase4: awarded_items write should land in inventory", () => {
  resetStore();
  const s = useGameStore.getState();
  s.addItems([
    {
      id: "IT_AWARD_1",
      name: "旧钥匙",
      tier: "B",
      description: "desc",
      tags: "loot",
      ownerId: "N-019",
    } as never,
  ]);
  assert.equal(useGameStore.getState().inventory.some((x) => x.id === "IT_AWARD_1"), true);
});

test("phase4: awarded_warehouse_items write should land in warehouse", () => {
  resetStore();
  const s = useGameStore.getState();
  s.addWarehouseItems([
    {
      id: "WH_AWARD_1",
      name: "锈蚀齿轮",
      description: "desc",
      benefit: "benefit",
      sideEffect: "side",
      ownerId: "N-019",
      floor: "B1",
    } as never,
  ]);
  assert.equal(useGameStore.getState().warehouse.some((x) => x.id === "WH_AWARD_1"), true);
});

test("phase4: saveGame should update main_slot even when options are empty", () => {
  resetStore();
  useGameStore.setState({
    isGameStarted: true,
    currentOptions: [],
    logs: [{ role: "assistant", content: "推进到新回合" }],
    time: { day: 1, hour: 3 },
    playerLocation: "B1_SafeZone",
  });
  const s = useGameStore.getState();
  s.saveGame("main_slot");
  const first = useGameStore.getState().saveSlots["main_slot"]?.slotMeta?.updatedAt ?? null;
  assert.ok(first);
  useGameStore.setState({ time: { day: 1, hour: 4 } });
  s.saveGame("main_slot");
  const second = useGameStore.getState().saveSlots["main_slot"]?.slotMeta?.updatedAt ?? null;
  assert.ok(second);
  assert.notEqual(first, second);
});

test("phase4: options-only update must not mutate dialogue/time/world state", () => {
  resetStore();
  useGameStore.setState({
    dialogueCount: 3,
    time: { day: 2, hour: 6 },
    inventory: [{ id: "IT-1", name: "A", tier: "B", description: "d", tags: "t", ownerId: "N-019" }] as never,
    warehouse: [{ id: "WH-1", name: "W", description: "d", benefit: "b", sideEffect: "s", ownerId: "N-019", floor: "B1" }] as never,
    tasks: [{ id: "t1", title: "T1", status: "active" }] as never,
    playerLocation: "1F_Corridor",
    logs: [{ role: "assistant", content: "old" }],
  });
  const before = useGameStore.getState();
  useGameStore.getState().setCurrentOptions(["选项A", "选项B"]);
  const after = useGameStore.getState();
  assert.equal(after.dialogueCount, before.dialogueCount);
  assert.deepEqual(after.time, before.time);
  assert.equal(after.playerLocation, before.playerLocation);
  assert.equal(after.inventory.length, before.inventory.length);
  assert.equal(after.warehouse.length, before.warehouse.length);
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(after.logs.length, before.logs.length);
});
