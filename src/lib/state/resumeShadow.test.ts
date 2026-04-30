import test from "node:test";
import assert from "node:assert/strict";
import {
  buildResumeShadowSnapshot,
  extractResumeShadowSummary,
  isResumeShadowPlayable,
  readResumeShadowSnapshot,
  RESUME_SHADOW_KEY,
  writeResumeShadowSnapshot,
} from "@/lib/state/resumeShadow";

function mockStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  (globalThis as unknown as { window?: unknown }).window = {} as Window;
  (globalThis as unknown as { localStorage?: unknown }).localStorage = storage as Storage;
  return map;
}

test("phase4: resume shadow should keep options/inputMode/logs/time/location", () => {
  const s = buildResumeShadowSnapshot({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "1F_Corridor",
    time: { day: 3, hour: 8 },
    logs: [{ role: "assistant", content: "剧情继续" }],
    inventory: [{ id: "IT-1" }],
    warehouse: [{ id: "WH-1" }],
    tasks: [{ id: "t1", status: "active" }],
    codex: { n1: { id: "N-1", name: "测试NPC", type: "npc" } },
    currentOptions: ["查看门锁", "后退一步"],
    inputMode: "options",
    currentBgm: "bgm_b1_daily",
    stats: { sanity: 12, agility: 3, luck: 1, charm: 1, background: 2 },
    originium: 5,
    professionState: { currentProfession: "守灯人" },
  });
  assert.equal(s.playerLocation, "1F_Corridor");
  assert.equal(s.time.day, 3);
  assert.equal(s.logs.length, 1);
  assert.equal(s.currentOptions[0], "查看门锁");
  assert.equal(s.inputMode, "options");
});

test("phase4: resume shadow read/write roundtrip", () => {
  mockStorage();
  const s = buildResumeShadowSnapshot({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    time: { day: 1, hour: 2 },
    logs: [{ role: "assistant", content: "A" }],
    inventory: [],
    warehouse: [],
    tasks: [],
    codex: {},
    currentOptions: ["选项A"],
    inputMode: "text",
    currentBgm: "bgm_b1_daily",
    stats: { sanity: 10, agility: 0, luck: 0, charm: 0, background: 0 },
    originium: 0,
  });
  writeResumeShadowSnapshot(s);
  const read = readResumeShadowSnapshot();
  assert.ok(read);
  assert.equal(read?.inputMode, "text");
  assert.equal(read?.currentOptions[0], "选项A");
});

test("phase4: playable and summary extraction", () => {
  const s = buildResumeShadowSnapshot({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    playerLocation: "B1_SafeZone",
    time: { day: 2, hour: 6 },
    logs: [{ role: "assistant", content: "A" }],
    inventory: [],
    warehouse: [],
    tasks: [{ id: "t", status: "active" }],
    codex: {},
    currentOptions: [],
    inputMode: "options",
    currentBgm: "bgm_b1_daily",
    stats: { sanity: 9, agility: 0, luck: 0, charm: 0, background: 0 },
    originium: 0,
    professionState: { currentProfession: "守灯人" },
  });
  assert.equal(isResumeShadowPlayable(s), true);
  const sum = extractResumeShadowSummary(s);
  assert.equal(sum?.day, 2);
  assert.equal(sum?.activeTasksCount, 1);
  assert.equal(sum?.professionLabel, "守灯人");
});

test("phase4: storage key should stay stable", () => {
  assert.equal(RESUME_SHADOW_KEY, "versecraft-resume-shadow");
});
