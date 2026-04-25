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

test("phase4: warehouse state supports narrative consume without changing save fields", () => {
  resetStore();
  const s = useGameStore.getState();
  s.addWarehouseItems([
    {
      id: "WH_CONSUME_1",
      name: "旧仓库钥匙",
      description: "desc",
      benefit: "benefit",
      sideEffect: "side",
      ownerId: "N-019",
      floor: "B1",
    } as never,
  ]);
  s.removeWarehouseItems(["WH_CONSUME_1"]);
  assert.equal(useGameStore.getState().warehouse.some((x) => x.id === "WH_CONSUME_1"), false);
});

test("phase4: weapon save fields remain readable after UI entry pruning", () => {
  resetStore();
  const equippedWeapon = {
    id: "WPN_SAVE_1",
    name: "存档主手",
    description: "旧存档中的主手武器。",
    counterThreatIds: ["A-002"],
    counterTags: ["sound"],
    stability: 72,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: ["silent"],
    currentInfusions: [],
    contamination: 11,
    repairable: true,
  } as never;
  const weaponBag = [
    {
      id: "WPN_SAVE_BAG",
      name: "存档备用",
      description: "旧存档中的备用武器。",
      counterThreatIds: ["A-006"],
      counterTags: ["mirror"],
      stability: 64,
      calibratedThreatId: null,
      modSlots: ["core", "surface"],
      currentMods: [],
      currentInfusions: [],
      contamination: 3,
      repairable: true,
    },
  ] as never;

  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    logs: [{ role: "assistant", content: "武器存档兼容测试" }],
    time: { day: 2, hour: 8 },
    playerLocation: "2F_Corridor",
    equippedWeapon,
    weaponBag,
  });
  useGameStore.getState().saveGame("main_slot");
  const saved = useGameStore.getState().saveSlots.main_slot;
  assert.equal(saved?.equippedWeapon?.id, "WPN_SAVE_1");
  assert.equal(saved?.weaponBag?.[0]?.id, "WPN_SAVE_BAG");

  resetStore();
  useGameStore.setState({ saveSlots: { main_slot: saved } as never });
  useGameStore.getState().loadGame("main_slot");
  assert.equal(useGameStore.getState().equippedWeapon?.id, "WPN_SAVE_1");
  assert.equal(useGameStore.getState().weaponBag[0]?.id, "WPN_SAVE_BAG");
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

test("phase4: setCurrentOptions filters journal/menu-like options", () => {
  resetStore();
  useGameStore.getState().setCurrentOptions(["查看灵感手记", "检查背包", "我用手电照向门缝"]);
  assert.deepEqual(useGameStore.getState().currentOptions, ["我用手电照向门缝"]);
});

test("phase4: saveGame does not persist journal/menu-like options", () => {
  resetStore();
  useGameStore.setState({
    isGameStarted: true,
    currentOptions: ["查看灵感手记", "我贴墙听走廊动静"],
    logs: [{ role: "assistant", content: "推进到新回合" }],
    time: { day: 1, hour: 3 },
    playerLocation: "B1_SafeZone",
  });
  useGameStore.getState().saveGame("main_slot");
  assert.deepEqual(useGameStore.getState().saveSlots.main_slot?.currentOptions, ["我贴墙听走廊动静"]);
});
