import test from "node:test";
import assert from "node:assert/strict";
import { buildNpcHeartRuntimeView, selectRelevantNpcHearts } from "./selectors";
import { buildNpcHeartPromptBlock } from "./prompt";

test("NpcHeartRuntimeView attitude shifts with trust/fear", () => {
  const warm = buildNpcHeartRuntimeView({
    npcId: "N-008",
    relationPartial: { trust: 60, fear: 5, debt: 0, favorability: 10 },
    locationId: "B1_SafeZone",
    activeTaskIds: ["t1"],
    hotThreatPresent: false,
  });
  assert.ok(warm);
  assert.equal(warm!.attitudeLabel, "warm");

  const hostile = buildNpcHeartRuntimeView({
    npcId: "N-010",
    relationPartial: { trust: 10, fear: 80, debt: 0, favorability: 0 },
    locationId: "1F_PropertyOffice",
    activeTaskIds: [],
    hotThreatPresent: true,
  });
  assert.ok(hostile);
  assert.equal(hostile!.attitudeLabel, "hostile");
});

test("NpcHeart selector only picks a few relevant NPCs", () => {
  const ids = selectRelevantNpcHearts({
    locationId: "B1_SafeZone",
    presentNpcIds: ["N-008", "N-014", "N-020"],
    issuerNpcIds: ["N-010", "N-018"],
    volatileNpcIds: ["N-008", "N-999"],
    maxNpc: 3,
  });
  assert.equal(ids.length, 3);
  assert.ok(ids.includes("N-008"));
});

test("NpcHeart prompt block is length-capped", () => {
  const v = buildNpcHeartRuntimeView({
    npcId: "N-018",
    relationPartial: { trust: 30, fear: 10, debt: 0, favorability: 0 },
    locationId: "6F_Stairwell",
    activeTaskIds: [],
    hotThreatPresent: true,
  });
  assert.ok(v);
  const block = buildNpcHeartPromptBlock({ views: [v!], maxChars: 180 });
  assert.ok(block.length <= 180);
  assert.ok(block.includes("NPC心脏约束"));
});

