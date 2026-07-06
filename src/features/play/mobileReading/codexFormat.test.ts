import assert from "node:assert/strict";
import test from "node:test";
import type { CodexEntry } from "@/store/useGameStore";
import { ALL_CODEX_CATALOG_SLOTS, B1_NPC_CODEX_SLOTS } from "./codexCatalog";
import {
  buildMobileCodexCardModels,
  buildMobileCodexDetail,
  buildMobileCodexIntro,
  buildMobileCodexObservation,
  filterMobileCodexSlotsByQuery,
  filterMobileCodexSlotsByType,
  formatMobileCodexLocation,
  getMobileCodexIdentifiedCount,
  getMobileCodexSlotsForFloor,
  getMobileCodexUnreadCount,
  isMobileCodexEntryUnread,
  resolveMobileCodexDangerLabel,
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

  assert.ok(slots.some((slot) => slot.id === "A-004"));
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
  const slots = getMobileCodexSlotsForFloor({ playerLocation: "4F_CorridorEnd" });
  const cards = buildMobileCodexCardModels({ "A-002": anomalyEntry("A-002", "无头猎犬") }, slots);
  const anomalyCard = cards.find((card) => card.kind === "slot" && card.id === "A-002");

  assert.equal(anomalyCard?.identified, true);
  assert.equal(anomalyCard?.displayName, "无头猎犬");
});

test("mobile codex intro keeps only the opening registry description", () => {
  const intro = buildMobileCodexIntro(npcEntry("N-015", "麟泽"));

  assert.equal(intro, "黑色旧制式外套，披肩常带雨痕，站姿笔直，眼神克制而冷峻。");
  assert.equal(intro.includes("\n"), false);
  assert.equal(intro.includes("坊间印象"), false);
  assert.equal(intro.includes("忌讳"), false);
});

test("mobile codex observation prefers newest structured observations", () => {
  const entry = npcEntry("N-015", "N-015");
  entry.known_info = buildMobileCodexIntro(entry);
  entry.observations = [
    "second scene: he blocks the storage door before answering.",
    "first scene: rain on the coat shoulder.",
  ];

  const observation = buildMobileCodexObservation(entry);

  assert.equal(observation.startsWith("second scene"), true);
  assert.equal(observation.includes("first scene"), true);
  assert.equal(observation.includes(entry.known_info), false);
});

test("mobile codex unread tracking follows identified + viewed state", () => {
  const codex = { "N-001": npcEntry("N-001", "陈婆婆") };

  assert.equal(isMobileCodexEntryUnread(codex, {}, "N-001"), true);
  assert.equal(isMobileCodexEntryUnread(codex, { "N-001": true }, "N-001"), false);
  assert.equal(isMobileCodexEntryUnread(codex, {}, "N-002"), false, "未识别条目不算未读");

  const slots = getMobileCodexSlotsForFloor({ playerLocation: "1F_Lobby" });
  assert.ok(getMobileCodexUnreadCount(codex, {}, slots) >= 1);
  assert.equal(getMobileCodexUnreadCount(codex, { "N-001": true }, slots), 0);
});

test("mobile codex card models expose unread flag for the strip badge", () => {
  const slots = getMobileCodexSlotsForFloor({ playerLocation: "1F_Lobby" });
  const codex = { "N-001": npcEntry("N-001", "陈婆婆") };

  const unviewedCards = buildMobileCodexCardModels(codex, slots, { viewedCodexIds: {} });
  const target = unviewedCards.find((card) => card.id === "N-001");
  assert.equal(target?.kind === "slot" && target.unread, true);

  const viewedCards = buildMobileCodexCardModels(codex, slots, { viewedCodexIds: { "N-001": true } });
  const viewedTarget = viewedCards.find((card) => card.id === "N-001");
  assert.equal(viewedTarget?.kind === "slot" && viewedTarget.unread, false);
});

test("mobile codex filters slots by type", () => {
  const npcOnly = filterMobileCodexSlotsByType(ALL_CODEX_CATALOG_SLOTS, "npc");
  const anomalyOnly = filterMobileCodexSlotsByType(ALL_CODEX_CATALOG_SLOTS, "anomaly");

  assert.ok(npcOnly.length > 0 && npcOnly.every((slot) => slot.type === "npc"));
  assert.ok(anomalyOnly.length > 0 && anomalyOnly.every((slot) => slot.type === "anomaly"));
  assert.equal(
    filterMobileCodexSlotsByType(ALL_CODEX_CATALOG_SLOTS, "all").length,
    ALL_CODEX_CATALOG_SLOTS.length
  );
});

test("mobile codex search only matches identified entries by display name", () => {
  const codex = { "N-001": npcEntry("N-001", "陈婆婆") };

  const hit = filterMobileCodexSlotsByQuery(ALL_CODEX_CATALOG_SLOTS, codex, "陈婆婆");
  assert.deepEqual(hit.map((slot) => slot.id), ["N-001"]);

  // 未识别条目即使名字匹配也不应命中，避免搜索提前泄露尚未发现的条目身份。
  const missIdentifiedOthers = filterMobileCodexSlotsByQuery(ALL_CODEX_CATALOG_SLOTS, codex, "林医生");
  assert.deepEqual(missIdentifiedOthers, []);

  assert.equal(filterMobileCodexSlotsByQuery(ALL_CODEX_CATALOG_SLOTS, codex, "").length, ALL_CODEX_CATALOG_SLOTS.length);
});

test("mobile codex danger label only shows for identified anomalies", () => {
  const anomalySlot = ALL_CODEX_CATALOG_SLOTS.find((slot) => slot.id === "A-002");
  const npcSlot = ALL_CODEX_CATALOG_SLOTS.find((slot) => slot.id === "N-001");
  assert.ok(anomalySlot && npcSlot);

  assert.equal(resolveMobileCodexDangerLabel(anomalySlot!, false), null);
  assert.equal(resolveMobileCodexDangerLabel(anomalySlot!, true), "危险等级：高");
  assert.equal(resolveMobileCodexDangerLabel(npcSlot!, true), null, "人物类条目不展示危险等级");
});

test("mobile codex detail carries dangerLabel only for identified anomalies", () => {
  const slots = getMobileCodexSlotsForFloor({ playerLocation: "4F_CorridorEnd" });
  const slot = slots.find((s) => s.id === "A-002");
  assert.ok(slot);

  const unidentified = buildMobileCodexDetail({}, slot!, {});
  assert.equal(unidentified.dangerLabel, null);

  const identified = buildMobileCodexDetail({ "A-002": anomalyEntry("A-002", "无头猎犬") }, slot!, {});
  assert.equal(identified.dangerLabel, "危险等级：高");
});
