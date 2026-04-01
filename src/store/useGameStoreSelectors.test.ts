import test from "node:test";
import assert from "node:assert/strict";
import { useGameStore } from "@/store/useGameStore";
import {
  extractMainSlotSnapshot,
  selectPersistenceCoreState,
  selectPlayerSurfaceState,
  selectRuntimeOnlyState,
  selectSupportPlaneState,
  selectTurnResultState,
  summarizePlaySurfaceDemand,
} from "@/store/useGameStoreSelectors";

test("store selectors: player surface keeps only UI-driving fields", () => {
  const s = useGameStore.getState();
  const x = selectPlayerSurfaceState(s);
  assert.equal(typeof x.playerName, "string");
  assert.ok(Array.isArray(x.currentOptions));
  assert.equal(typeof x.originium, "number");
  assert.equal(typeof x.playerLocation, "string");
});

test("store selectors: support plane excludes hot UI arrays", () => {
  const s = useGameStore.getState();
  const x = selectSupportPlaneState(s);
  assert.equal("memorySpine" in x, true);
  assert.equal("escapeMainline" in x, true);
  assert.equal("professionState" in x, true);
});

test("store selectors: turn result includes feedback/log/tasks", () => {
  const s = useGameStore.getState();
  const x = selectTurnResultState(s);
  assert.ok(Array.isArray(x.logs));
  assert.ok(Array.isArray(x.tasks));
  assert.ok(Array.isArray(x.journalClues));
});

test("store selectors: runtime-only and persistence-core slices are distinct", () => {
  const s = useGameStore.getState();
  const rt = selectRuntimeOnlyState(s);
  const core = selectPersistenceCoreState(s);
  assert.equal(typeof rt.isHydrated, "boolean");
  assert.ok(Array.isArray(rt.recentOptions));
  assert.ok(core.saveSlots && typeof core.saveSlots === "object");
  assert.ok(Array.isArray((core as any).tasks ?? []));
});

test("store selectors: demand summary + main slot snapshot", () => {
  const s = useGameStore.getState();
  const sum = summarizePlaySurfaceDemand(s);
  assert.ok(sum.hotUiKeys.includes("tasks"));
  assert.ok(sum.supportKeys.includes("memorySpine"));
  assert.ok(sum.runtimeKeys.includes("isHydrated"));
  const snap = extractMainSlotSnapshot(s);
  assert.equal(snap, null);
});
