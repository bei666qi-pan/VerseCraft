import assert from "node:assert/strict";
import test from "node:test";
import { QINGSHI_EVENTS, QINGSHI_MAIN_STAGES, QINGSHI_NPC_PROFILES, QINGSHI_REPEATABLES, selectQingshiEvent, validateQingshiProductionContent } from "./qingshiProductionContent";

test("production content registers five chapters, schedules and deterministic events", () => {
  assert.deepEqual(validateQingshiProductionContent(), []);
  assert.equal(QINGSHI_MAIN_STAGES.length, 14);
  assert.equal(new Set(QINGSHI_MAIN_STAGES.map((stage) => stage.chapter)).size, 5);
  assert.equal(Object.keys(QINGSHI_NPC_PROFILES).length, 8);
  assert.equal(QINGSHI_REPEATABLES.length, 4);
  assert.equal(QINGSHI_EVENTS.length, 12);
  assert.deepEqual(selectQingshiEvent("slot-a", 3, "QS_GUOYAN_INN"), selectQingshiEvent("slot-a", 3, "QS_GUOYAN_INN"));
});

test("all NPC profiles expose four schedule slots and public facts", () => {
  for (const profile of Object.values(QINGSHI_NPC_PROFILES)) {
    assert.deepEqual(Object.keys(profile.schedule).sort(), ["dawn", "day", "dusk", "night"]);
    assert.ok(profile.facts.some((fact) => fact.tier === "public"));
  }
});
