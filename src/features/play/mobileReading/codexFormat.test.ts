import assert from "node:assert/strict";
import test from "node:test";
import type { CodexEntry } from "@/store/useGameStore";
import { B1_NPC_CODEX_SLOTS } from "./codexCatalog";
import {
  buildMobileCodexCardModels,
  formatMobileCodexLocation,
  getMobileCodexIdentifiedCount,
  getMobileCodexSlotsForFloor,
  resolveMobileCodexFloorId,
  shouldAppendMobileCodexMoreCard,
} from "./codexFormat";

function npcEntry(id: string, name = id): CodexEntry {
  return {
    id,
    name,
    type: "npc",
    known_info: "已记录。",
  };
}

function anomalyEntry(id: string, name = id): CodexEntry {
  return {
    id,
    name,
    type: "anomaly",
    known_info: "已记录。",
  };
}

test("mobile codex resolves floor ids from play locations", () => {
  assert.equal(resolveMobileCodexFloorId("B1_SafeZone"), "B1");
  assert.equal(resolveMobileCodexFloorId("B2_Exit"), "B2");
  assert.equal(resolveMobileCodexFloorId("2F_Corridor"), "2");
  assert.equal(resolveMobileCodexFloorId("3 楼楼梯间"), "3");
  assert.equal(resolveMobileCodexFloorId("unknown"), null);
});

test("mobile codex filters slots to the player's current floor", () => {
  const slots = getMobileCodexSlotsForFloor({ playerLocation: "B1_SafeZone" });

  assert.equal(slots.length, 4);
  assert.deepEqual(
    slots.map((slot) => slot.id),
    B1_NPC_CODEX_SLOTS.map((slot) => slot.id)
  );
});

test("mobile codex moves NPC slots to their dynamic floor", () => {
  const b1Slots = getMobileCodexSlotsForFloor({
    playerLocation: "B1_SafeZone",
    dynamicNpcStates: {
      "N-010": { currentLocation: "B1_SafeZone", isAlive: true },
      "N-008": { currentLocation: "1F_Lobby", isAlive: true },
    },
  });
  const oneFloorSlots = getMobileCodexSlotsForFloor({
    playerLocation: "1F_Lobby",
    dynamicNpcStates: {
      "N-008": { currentLocation: "1F_Lobby", isAlive: true },
    },
  });

  assert.ok(b1Slots.some((slot) => slot.id === "N-010"));
  assert.ok(!b1Slots.some((slot) => slot.id === "N-008"));
  assert.ok(oneFloorSlots.some((slot) => slot.id === "N-008"));
});

test("mobile codex shows active threat anomalies on their runtime floor", () => {
  const slots = getMobileCodexSlotsForFloor({
    playerLocation: "2F_Corridor",
    mainThreatByFloor: {
      "2": { threatId: "A-008", floorId: "2", phase: "active" },
    },
  });

  assert.ok(slots.some((slot) => slot.id === "A-002"));
  assert.ok(slots.some((slot) => slot.id === "A-008"));
});

test("mobile codex counts identified slots on a selected floor", () => {
  const b1Slots = getMobileCodexSlotsForFloor({ playerLocation: "B1_SafeZone" });
  const fullB1Codex = Object.fromEntries(b1Slots.map((slot) => [slot.id, npcEntry(slot.id)]));

  assert.equal(getMobileCodexIdentifiedCount({}, b1Slots), 0);
  assert.equal(getMobileCodexIdentifiedCount({ "N-008": npcEntry("N-008", "电工老刘") }, b1Slots), 1);
  assert.equal(getMobileCodexIdentifiedCount(fullB1Codex, b1Slots), 4);
});

test("mobile codex appends disabled more card only after all current-floor slots are identified", () => {
  const b1Slots = getMobileCodexSlotsForFloor({ playerLocation: "B1_SafeZone" });
  const partialCodex = { "N-008": npcEntry("N-008", "电工老刘") };
  assert.equal(shouldAppendMobileCodexMoreCard(partialCodex, b1Slots), false);
  assert.equal(buildMobileCodexCardModels(partialCodex, b1Slots).some((card) => card.kind === "more"), false);

  const fullCodex = Object.fromEntries(b1Slots.map((slot) => [slot.id, npcEntry(slot.id)]));
  assert.equal(shouldAppendMobileCodexMoreCard(fullCodex, b1Slots), true);
  const cards = buildMobileCodexCardModels(fullCodex, b1Slots);
  assert.equal(cards.at(-1)?.kind, "more");
  assert.equal(cards.at(-1)?.disabled, true);
  assert.equal(cards.at(-1)?.displayName, "——");
});

test("mobile codex location labels avoid raw internal ids", () => {
  assert.equal(formatMobileCodexLocation("B1_Storage"), "B1 储物间");
  assert.equal(formatMobileCodexLocation("B1_SafeZone"), "B1 安全中枢");
  assert.equal(formatMobileCodexLocation("B9_UnknownRoom"), "未知区域");
  assert.equal(formatMobileCodexLocation("配电间 / 各楼层"), "配电间 / 各楼层");
});

test("mobile codex supports anomaly card models", () => {
  const slots = getMobileCodexSlotsForFloor({ playerLocation: "2F_Corridor" });
  const cards = buildMobileCodexCardModels({ "A-002": anomalyEntry("A-002", "无头猎犬") }, slots);
  const anomalyCard = cards.find((card) => card.kind === "slot" && card.id === "A-002");

  assert.equal(anomalyCard?.identified, true);
  assert.equal(anomalyCard?.displayName, "无头猎犬");
});
