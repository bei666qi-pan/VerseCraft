import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "./useGameStore";
import { RESUME_SHADOW_KEY } from "@/lib/state/resumeShadow";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

function mockBrowserStorage() {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  };
  (globalThis as unknown as { window?: unknown }).window = {} as Window;
  (globalThis as unknown as { localStorage?: unknown }).localStorage = storage as Storage;
  return mem;
}

test("phase4: successful saveGame writes resume shadow synchronously", () => {
  const mem = mockBrowserStorage();
  resetStore();
  useGameStore.setState({
    isGameStarted: true,
    logs: [{ role: "assistant", content: "剧情A" }],
    currentOptions: ["选项A"],
    inputMode: "text",
    playerLocation: "1F_Corridor",
    time: { day: 2, hour: 3 },
    tasks: [{ id: "t1", title: "T", status: "active" }] as never,
    memorySpine: { v: 1, entries: [{ id: "m1", kind: "route_hint", scope: "location_local", summary: "你已抵达1F_Corridor。", salience: 0.4, confidence: 0.9, status: "active", createdAtHour: 3, lastTouchedAtHour: 3, ttlHours: 12, mergeKey: "loc:1F_Corridor", anchors: { locationIds: ["1F_Corridor"], floorIds: ["1"] }, recallTags: ["loc_arrival"], source: "location_change", promoteToLore: false }] },
  });
  useGameStore.getState().saveGame("main_slot");
  const raw = mem.get(RESUME_SHADOW_KEY);
  assert.ok(raw);
  const j = JSON.parse(raw!);
  assert.equal(j.playerLocation, "1F_Corridor");
  assert.equal(j.inputMode, "text");
  assert.ok(j.memorySpine);
});

test("phase4: hydrateFromResumeShadow restores options/inputMode/log/time", () => {
  const mem = mockBrowserStorage();
  resetStore();
  mem.set(
    RESUME_SHADOW_KEY,
    JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      isGameStarted: true,
      currentSaveSlot: "main_slot",
      playerLocation: "B1_Archive",
      time: { day: 4, hour: 9 },
      logs: [{ role: "assistant", content: "继续执笔" }],
      inventory: [{ id: "IT-1", name: "道具1" }],
      warehouse: [{ id: "WH-1", name: "物品1" }],
      tasks: [{ id: "t1", title: "T1", status: "active" }],
      codex: { N1: { id: "N1", name: "角色", type: "npc" } },
      currentOptions: ["看向门口", "检查脚印"],
      inputMode: "options",
      currentBgm: "bgm_1_calm",
      stats: { sanity: 11, agility: 2, luck: 2, charm: 2, background: 2 },
      originium: 7,
      memorySpine: { v: 1, entries: [{ id: "m1", kind: "hook", scope: "run_private", summary: "短期钩子。", salience: 0.6, confidence: 0.9, status: "active", createdAtHour: 0, lastTouchedAtHour: 0, ttlHours: 6, mergeKey: "hook:x", anchors: {}, recallTags: ["hook"], source: "system_hook", promoteToLore: false }] },
    })
  );
  const ok = useGameStore.getState().hydrateFromResumeShadow();
  assert.equal(ok, true);
  const s = useGameStore.getState();
  assert.equal(s.playerLocation, "B1_Archive");
  assert.equal(s.time.day, 4);
  assert.equal(s.logs.length > 0, true);
  assert.deepEqual(s.currentOptions.slice(0, 2), ["看向门口", "检查脚印"]);
  assert.equal(s.inputMode, "options");
  assert.equal((s.memorySpine?.entries ?? []).length, 1);
});
