import assert from "node:assert/strict";
import test from "node:test";
import type { ClueEntry } from "@/lib/domain/narrativeDomain";
import type { WarehouseItem, Weapon } from "@/lib/registry/types";
import type { GameTaskStatus, GameTaskV2 } from "@/lib/tasks/taskV2";
import { useAchievementsStore, type AchievementRecord } from "@/store/useAchievementsStore";
import { useGameStore } from "@/store/useGameStore";
import {
  applyNarrativeFeatureEvent,
  resolveNarrativeInventoryItems,
  resolveNarrativeWarehouseItems,
  type NarrativeWeaponBagUpdate,
  type NarrativeWeaponUpdate,
} from "./narrativeFeatureTriggers";
import { PLAY_GUIDE_SECTIONS } from "./guideContent";

const NOW_ISO = "2026-05-01T00:00:00.000Z";

function resetGameStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

const sampleWeapon: Weapon = {
  id: "weapon.narrative.test",
  name: "叙事测试武器",
  description: "由剧情事件交付的测试武器。",
  counterThreatIds: ["A-001"],
  counterTags: ["time"],
  stability: 80,
  calibratedThreatId: null,
  modSlots: ["core", "surface"],
  currentMods: [],
  currentInfusions: [],
  contamination: 0,
  repairable: true,
};

test("narrative guide and task panel hints surface as passive hints only", () => {
  const logs: Array<{ content: string }> = [];
  const guide = applyNarrativeFeatureEvent(
    { type: "guide.hint", raw: { guide_hint: "先观察门缝，再决定是否进入。", auto_open_panel: "guide" }, writeLog: true },
    { pushLog: (entry) => logs.push(entry) }
  );

  assert.equal(guide.applied, true);
  assert.deepEqual(guide.hints, ["先观察门缝，再决定是否进入。"]);
  assert.equal(guide.counts.guideHintsPresented, 1);
  assert.equal(logs[0]?.content, "**场景提示**：先观察门缝，再决定是否进入。");

  const taskPanel = applyNarrativeFeatureEvent(
    { type: "task.panel_hint", raw: { auto_open_panel: "task", highlight_task_ids: ["task.main"] } },
    {}
  );

  assert.equal(taskPanel.applied, true);
  assert.deepEqual(taskPanel.hints, ["新的叙事线索已被记录。"]);
});

test("narrative guide events can read retained guide content without opening guide UI", () => {
  assert.ok(PLAY_GUIDE_SECTIONS.some((section) => section.title === "30 秒快速上手"));

  const result = applyNarrativeFeatureEvent({ type: "guide.hint", raw: { guide_topic: "quickstart" } }, {});

  assert.equal(result.applied, true);
  assert.equal(result.counts.guideHintsPresented, 1);
  assert.deepEqual(result.hints, ["每回合先明确一件行动，让故事继续；遇到风险时先读现场信息，再决定是否冒险。"]);
});

test("narrative journal clue updates are merged through the existing clue path", () => {
  const existing = [{ id: "seen", title: "旧线索" }];
  let merged: ClueEntry[] = [];

  const result = applyNarrativeFeatureEvent(
    {
      type: "journal.clue_updates",
      nowIso: NOW_ISO,
      raw: [
        { id: "seen", title: "旧线索", detail: "补充细节" },
        { id: "fresh", title: "门后的低语", detail: "门后传来重复的倒数声。" },
      ],
    },
    {
      getJournalClues: () => existing,
      mergeJournalClueUpdates: (incoming) => {
        merged = incoming;
      },
    }
  );

  assert.equal(result.applied, true);
  assert.equal(result.counts.journalCluesMerged, 2);
  assert.deepEqual(result.hints, ["手记更新：门后的低语"]);
  assert.deepEqual(
    merged.map((c) => c.id),
    ["seen", "fresh"]
  );
});

test("narrative journal recall reads retained journal state without opening journal UI", () => {
  const logs: Array<{ content: string }> = [];
  const result = applyNarrativeFeatureEvent(
    { type: "journal.recall", raw: { clue_ids: ["fresh"] }, writeLog: true },
    {
      getJournalClues: () => [
        { id: "seen", title: "旧线索" },
        { id: "fresh", title: "门后的低语" },
      ],
      pushLog: (entry) => logs.push(entry),
    }
  );

  assert.equal(result.applied, true);
  assert.equal(result.counts.journalCluesRead, 1);
  assert.deepEqual(result.hints, ["手记回顾：门后的低语"]);
  assert.equal(logs[0]?.content, "**场景回忆**：手记回顾：门后的低语");
});

test("narrative warehouse awards resolve registry and ad-hoc items without opening a panel", () => {
  const resolved = resolveNarrativeWarehouseItems([
    "W-B101",
    { id: "W-NARRATIVE-TEMP", name: "临时钥匙", description: "从剧情获得。", benefit: "打开一次门", sideEffect: "使用后消失" },
  ]);
  assert.deepEqual(
    resolved.map((item) => item.id),
    ["W-B101", "W-NARRATIVE-TEMP"]
  );

  let warehouse: WarehouseItem[] = [];
  const logs: Array<{ content: string }> = [];
  const result = applyNarrativeFeatureEvent(
    { type: "warehouse.award", raw: resolved },
    {
      getWarehouseItems: () => warehouse,
      addWarehouseItems: (items) => {
        warehouse = [...warehouse, ...items];
      },
      pushLog: (entry) => logs.push(entry),
    }
  );

  assert.equal(result.applied, true);
  assert.equal(result.counts.warehouseItemsWritten, 2);
  assert.deepEqual(
    warehouse.map((item) => item.id),
    ["W-B101", "W-NARRATIVE-TEMP"]
  );
  assert.equal(logs[0]?.content, "**获得了新物品，已收入仓库**");
});

test("narrative inventory events add, consume, and check items without opening inventory UI", () => {
  const resolved = resolveNarrativeInventoryItems([
    "I-A03",
    { id: "I-NARRATIVE-TEMP", name: "临时粉笔", tier: "C", description: "从剧情获得。", tags: "tool", domainLayer: "tool" },
  ]);
  assert.deepEqual(
    resolved.map((item) => item.id),
    ["I-A03", "I-NARRATIVE-TEMP"]
  );

  let inventory = resolved.slice(0, 1);
  const logs: Array<{ content: string }> = [];
  const addResult = applyNarrativeFeatureEvent(
    { type: "inventory.award", raw: [resolved[1]], writeLog: true },
    {
      getInventoryItems: () => inventory,
      addInventoryItems: (items) => {
        inventory = [...inventory, ...items];
      },
      pushLog: (entry) => logs.push(entry),
    }
  );

  assert.equal(addResult.applied, true);
  assert.equal(addResult.counts.inventoryItemsWritten, 1);
  assert.deepEqual(addResult.hints, ["你记下了新道具【临时粉笔】。"]);
  assert.equal(logs[0]?.content, "**获得了新道具，已放入行囊**");

  const checkResult = applyNarrativeFeatureEvent(
    { type: "inventory.check", raw: { item_ids: ["I-A03"] } },
    { getInventoryItems: () => inventory }
  );
  assert.equal(checkResult.applied, true);
  assert.deepEqual(checkResult.hints, ["你摸到包里还有：未消化的钥匙。"]);

  const consumeResult = applyNarrativeFeatureEvent(
    { type: "inventory.consume", raw: ["I-A03"] },
    {
      getInventoryItems: () => inventory,
      consumeInventoryItems: (keys) => {
        inventory = inventory.filter((item) => !keys.includes(item.id) && !keys.includes(item.name));
      },
    }
  );
  assert.equal(consumeResult.applied, true);
  assert.equal(consumeResult.counts.inventoryItemsConsumed, 1);
  assert.equal(inventory.some((item) => item.id === "I-A03"), false);
});

test("narrative warehouse events can check and consume retained warehouse state", () => {
  let warehouse: WarehouseItem[] = [
    {
      id: "W-B105",
      name: "储物间的旧钥匙",
      description: "一把无法辨认编号的钥匙。",
      benefit: "开B1任意废弃储物间门。",
      sideEffect: "2小时后门锁死，门内则被困。",
      ownerId: "N-008",
      floor: "B1",
    },
  ];

  const checkResult = applyNarrativeFeatureEvent(
    { type: "warehouse.check", raw: { warehouse_ids: ["W-B105"] } },
    { getWarehouseItems: () => warehouse }
  );
  assert.equal(checkResult.applied, true);
  assert.deepEqual(checkResult.hints, ["仓库记录里还有：储物间的旧钥匙。"]);

  const consumeResult = applyNarrativeFeatureEvent(
    { type: "warehouse.consume", raw: ["W-B105"] },
    {
      getWarehouseItems: () => warehouse,
      removeWarehouseItems: (keys) => {
        warehouse = warehouse.filter((item) => !keys.includes(item.id) && !keys.includes(item.name));
      },
    }
  );
  assert.equal(consumeResult.applied, true);
  assert.equal(consumeResult.counts.warehouseItemsConsumed, 1);
  assert.equal(warehouse.length, 0);
});

test("former taskbar task actions route through narrative add and update events", () => {
  let tasks: Array<Pick<GameTaskV2, "id" | "title">> = [];
  const addResult = applyNarrativeFeatureEvent(
    { type: "task.add", raw: [{ id: "task.narrative", title: "确认配电间的声音", desc: "不要打开独立面板。", issuer: "旁白" }] },
    {
      getTasks: () => tasks,
      addTask: (task) => {
        tasks = [...tasks, { id: task.id, title: task.title }];
      },
    }
  );

  assert.equal(addResult.applied, true);
  assert.equal(addResult.counts.taskAddsApplied, 1);
  assert.deepEqual(addResult.hints, ["新的叙事线索已被记录。"]);
  assert.deepEqual(tasks, [{ id: "task.narrative", title: "确认配电间的声音" }]);

  const statusUpdates: Array<{ id: string; status: GameTaskStatus }> = [];
  const patches: Array<{ id: string } & Partial<GameTaskV2>> = [];
  const updateResult = applyNarrativeFeatureEvent(
    { type: "task.update", raw: [{ id: "task.narrative", status: "completed", nextHint: "声音停止了。" }] },
    {
      updateTaskStatus: (id, status) => statusUpdates.push({ id, status }),
      updateTask: (patch) => patches.push(patch),
    }
  );

  assert.equal(updateResult.applied, true);
  assert.equal(updateResult.counts.taskUpdatesApplied, 1);
  assert.deepEqual(statusUpdates, [{ id: "task.narrative", status: "completed" }]);
  assert.equal(patches[0]?.nextHint, "声音停止了。");
});

test("narrative achievement unlocks preserve the achievement store contract", () => {
  let captured: Omit<AchievementRecord, "createdAt"> | null = null;
  const record: Omit<AchievementRecord, "createdAt"> = {
    survivalTimeText: "1 日 2 时",
    grade: "B",
    kills: 1,
    maxFloor: 3,
    maxFloorDisplay: "第 3 层",
    reviewLine1: "你活了下来。",
    reviewLine2: "但门后仍有回声。",
  };

  const result = applyNarrativeFeatureEvent(
    { type: "achievement.unlock", record },
    { addAchievementRecord: (next) => {
      captured = next;
    } }
  );

  assert.equal(result.applied, true);
  assert.equal(result.counts.achievementsUnlocked, 1);
  assert.deepEqual(captured, record);
});

test("narrative achievement unlocks still write the persisted achievement store", () => {
  useAchievementsStore.setState({ records: [] });
  const persistApi = (
    useAchievementsStore as typeof useAchievementsStore & {
      persist?: {
        getOptions?: () => {
          name?: string;
          partialize?: (state: unknown) => unknown;
        };
      };
    }
  ).persist;
  const persistOptions = persistApi?.getOptions?.();
  assert.equal(persistOptions?.name, "versecraft-achievements");

  const record: Omit<AchievementRecord, "createdAt"> = {
    survivalTimeText: "2 日 5 时",
    grade: "A",
    kills: 2,
    maxFloor: 7,
    maxFloorDisplay: "第 7 层",
    reviewLine1: "你把这一次经历留进了结算记录。",
    reviewLine2: "它仍可作为后续叙事分支的内部状态。",
  };

  const result = applyNarrativeFeatureEvent(
    { type: "achievement.unlock", record },
    { addAchievementRecord: (next) => useAchievementsStore.getState().addRecord(next) }
  );

  assert.equal(result.applied, true);
  assert.equal(result.hints.length, 0);
  const records = useAchievementsStore.getState().records;
  assert.equal(records.length, 1);
  assert.equal(records[0]?.grade, record.grade);
  assert.equal(records[0]?.maxFloor, record.maxFloor);
  assert.equal(records[0]?.reviewLine1, record.reviewLine1);
  const persisted = persistOptions?.partialize?.(useAchievementsStore.getState()) as { records?: AchievementRecord[] } | undefined;
  assert.equal(Array.isArray(persisted?.records), true);
  assert.equal(persisted?.records?.[0]?.reviewLine2, record.reviewLine2);

  useAchievementsStore.setState({ records: [] });
});

test("narrative weapon events forward normalized weapon and weapon-bag updates", () => {
  let weaponUpdates: NarrativeWeaponUpdate[] = [];
  const weaponResult = applyNarrativeFeatureEvent(
    {
      type: "weapon.update",
      raw: [
        {
          weaponId: "weapon.narrative.test",
          stability: 42,
          currentMods: ["mirror", "not-a-mod"],
          currentInfusions: [{ threatTag: "seal", turnsLeft: 2 }],
        },
      ],
    },
    { applyWeaponUpdates: (updates) => {
      weaponUpdates = updates;
    } }
  );

  assert.equal(weaponResult.applied, true);
  assert.equal(weaponResult.counts.weaponUpdatesApplied, 1);
  assert.deepEqual(weaponUpdates[0]?.currentMods, ["mirror"]);
  assert.deepEqual(weaponUpdates[0]?.currentInfusions, [{ threatTag: "seal", turnsLeft: 2 }]);

  let bagUpdates: NarrativeWeaponBagUpdate[] = [];
  const bagResult = applyNarrativeFeatureEvent(
    {
      type: "weapon_bag.update",
      raw: [{ addWeapon: sampleWeapon }, { removeWeaponId: "old.weapon" }, { addEquippedWeaponId: "weapon.narrative.test" }],
    },
    { applyWeaponBagUpdates: (updates) => {
      bagUpdates = updates;
    } }
  );

  assert.equal(bagResult.applied, true);
  assert.equal(bagResult.counts.weaponBagUpdatesApplied, 3);
  assert.deepEqual(bagUpdates, [
    { addWeapon: sampleWeapon },
    { removeWeaponId: "old.weapon" },
    { addEquippedWeaponId: "weapon.narrative.test" },
  ]);
});

test("narrative weapon events grant, equip, and mutate retained weapon state", () => {
  resetGameStore();

  const grant = applyNarrativeFeatureEvent(
    { type: "weapon_bag.update", raw: [{ addWeapon: sampleWeapon }] },
    { applyWeaponBagUpdates: (updates) => useGameStore.getState().applyWeaponBagUpdates(updates) }
  );
  assert.equal(grant.applied, true);
  assert.equal(useGameStore.getState().weaponBag.some((w) => w.id === sampleWeapon.id), true);

  const equip = applyNarrativeFeatureEvent(
    { type: "weapon.update", raw: [{ weapon: sampleWeapon }] },
    { applyWeaponUpdates: (updates) => useGameStore.getState().applyWeaponUpdates(updates) }
  );
  assert.equal(equip.applied, true);
  assert.equal(useGameStore.getState().equippedWeapon?.id, sampleWeapon.id);

  const degrade = applyNarrativeFeatureEvent(
    { type: "weapon.update", raw: [{ stability: 47, contamination: 32, repairable: false, currentMods: ["mirror"] }] },
    { applyWeaponUpdates: (updates) => useGameStore.getState().applyWeaponUpdates(updates) }
  );
  assert.equal(degrade.applied, true);
  assert.equal(useGameStore.getState().equippedWeapon?.stability, 47);
  assert.equal(useGameStore.getState().equippedWeapon?.contamination, 32);
  assert.equal(useGameStore.getState().equippedWeapon?.repairable, false);
  assert.deepEqual(useGameStore.getState().equippedWeapon?.currentMods, ["mirror"]);

  resetGameStore();
});
