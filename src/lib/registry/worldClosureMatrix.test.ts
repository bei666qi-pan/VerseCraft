import assert from "node:assert/strict";
import test from "node:test";
import { ANOMALIES } from "./anomalies";
import { NPCS } from "./npcs";
import { APARTMENT_RULES, APARTMENT_SURVIVAL_NOTES } from "./rules";
import { ITEMS } from "./items";
import { WAREHOUSE_ITEMS } from "./warehouseItems";
import { MAP_ROOMS } from "./world";
import {
  WORLD_CLOSURE_MATRIX,
  getCanonicalAnomalyIdForFloor,
  getCanonicalFloorForAnomaly,
  survivalNoteExists,
} from "./worldClosureMatrix";

const allRoomNodes = new Set(Object.values(MAP_ROOMS).flat());
const anomalyById = new Map(ANOMALIES.map((a) => [a.id, a]));
const npcById = new Map(NPCS.map((n) => [n.id, n]));
const itemIds = new Set(ITEMS.map((i) => i.id));
const warehouseItemIds = new Set(WAREHOUSE_ITEMS.map((i) => i.id));

test("APARTMENT_RULES remains a compatibility export over survival notes", () => {
  assert.deepEqual(
    APARTMENT_RULES,
    APARTMENT_SURVIVAL_NOTES.map((note) => note.surfaceText)
  );
  assert.ok(APARTMENT_SURVIVAL_NOTES.every((note) => note.reliability && note.actualMechanism));
});

test("world closure matrix keeps canonical floor to anomaly mapping", () => {
  const expected = new Map([
    ["1", "A-001"],
    ["2", "A-004"],
    ["3", "A-003"],
    ["4", "A-002"],
    ["5", "A-005"],
    ["6", "A-006"],
    ["7", "A-007"],
    ["B2", "A-008"],
  ]);

  for (const [floorId, anomalyId] of expected) {
    assert.equal(getCanonicalAnomalyIdForFloor(floorId as any), anomalyId);
    assert.equal(getCanonicalFloorForAnomaly(anomalyId), floorId);
  }

  for (const entry of WORLD_CLOSURE_MATRIX) {
    for (const room of entry.legalRoomNodes) assert.equal(allRoomNodes.has(room), true, room);
    if (entry.linkedAnomalyId) {
      const anomaly = anomalyById.get(entry.linkedAnomalyId);
      assert.ok(anomaly, entry.linkedAnomalyId);
      assert.equal(anomaly.floor, entry.floorId);
    }
    for (const npcId of entry.keyNpcIds) assert.ok(npcById.has(npcId), npcId);
    for (const noteId of entry.survivalNoteIds) assert.equal(survivalNoteExists(noteId), true, noteId);
    for (const itemId of entry.itemIds) assert.equal(itemIds.has(itemId), true, itemId);
    for (const itemId of entry.warehouseItemIds) assert.equal(warehouseItemIds.has(itemId), true, itemId);
  }
});

test("N-016 and N-019 stay on legal in-map projection nodes", () => {
  const n016 = npcById.get("N-016");
  const n019 = npcById.get("N-019");
  assert.ok(n016);
  assert.ok(n019);
  assert.equal(n016!.floor, "6");
  assert.equal(n019!.floor, "7");
  assert.equal(allRoomNodes.has(n016!.location), true);
  assert.equal(allRoomNodes.has(n019!.location), true);
  assert.ok(!n016!.location.startsWith("10F_"));
  assert.ok(!n019!.location.startsWith("11F_"));
});

test("B2 rust item cannot bypass the exit qualification chain", () => {
  const rust = WAREHOUSE_ITEMS.find((item) => item.id === "W-B202");
  assert.ok(rust);
  assert.equal(rust!.floor, "B2");
  assert.equal(rust!.ownerId, "A-008");
  assert.ok(!rust!.benefit.includes("强行打开"));
  assert.ok(rust!.benefit.includes("不能破坏出口木门"));
});
