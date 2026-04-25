import assert from "node:assert/strict";
import test from "node:test";
import type { CodexEntry } from "@/store/useGameStore";
import { B1_NPC_CODEX_SLOTS } from "./codexCatalog";
import {
  buildMobileCodexCardModels,
  formatMobileCodexLocation,
  getMobileCodexIdentifiedCount,
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

test("mobile B1 codex counts identified NPC slots", () => {
  assert.equal(getMobileCodexIdentifiedCount({}), 0);
  assert.equal(getMobileCodexIdentifiedCount({ "N-008": npcEntry("N-008", "电工老刘") }), 1);
  assert.equal(
    getMobileCodexIdentifiedCount(Object.fromEntries(B1_NPC_CODEX_SLOTS.map((slot) => [slot.id, npcEntry(slot.id)]))),
    4
  );
});

test("mobile B1 codex appends disabled more card only after all four are identified", () => {
  const partialCodex = { "N-008": npcEntry("N-008", "电工老刘") };
  assert.equal(shouldAppendMobileCodexMoreCard(partialCodex), false);
  assert.equal(buildMobileCodexCardModels(partialCodex).some((card) => card.kind === "more"), false);

  const fullCodex = Object.fromEntries(B1_NPC_CODEX_SLOTS.map((slot) => [slot.id, npcEntry(slot.id)]));
  assert.equal(shouldAppendMobileCodexMoreCard(fullCodex), true);
  const cards = buildMobileCodexCardModels(fullCodex);
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
