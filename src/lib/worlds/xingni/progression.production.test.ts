import assert from "node:assert/strict";
import test from "node:test";
import { createInitialXingniState, getQingshiRecoverySteps, normalizeXingniState, resolveXingniAction } from "./progression";

test("legacy Xingni state migrates without losing earned progress", () => {
  const migrated = normalizeXingniState({ kind: "xingni_taichu", cultivation: { realm: "炼气4层", progress: 0, qiSeaDamaged: false }, spiritRoot: "赤火", spiritStones: 7, techniqueIds: ["old"], recipeIds: ["pill_qi_gathering"], reputation: 2, credentials: ["combat", "alchemy"], ascensionTrial: "eligible", unlockedMapIds: ["xingni_qingshi_county"] });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.spiritRoot, "赤火");
  assert.deepEqual(migrated.credentials, ["combat", "alchemy"]);
  assert.equal(migrated.quests.mainStageId, "XQ-M13");
});

test("explicit idempotency key prevents duplicate rewards", () => {
  const initial = { ...createInitialXingniState(), spiritStones: 0 };
  const first = resolveXingniAction(initial, { type: "relief", actionId: "relief-1" }, { currentLocation: "QS_GUOYAN_INN" });
  const replay = resolveXingniAction(first.state, { type: "relief", actionId: "relief-1" }, { currentLocation: "QS_GUOYAN_INN" });
  assert.equal(first.state.spiritStones, 2);
  assert.equal(replay.ok, false);
  assert.equal(replay.state.spiritStones, 2);
});

test("reckless defeat preserves progression and opens bounded recovery", () => {
  const initial = { ...createInitialXingniState(), spiritStones: 12, credentials: ["alchemy"] as const, materialCounts: { xq_ore_black_iron: 2 }, quests: { ...createInitialXingniState().quests, mainStageId: "XQ-M09" as const } };
  const result = resolveXingniAction(initial, { type: "combat", targetId: "XQ-E003", method: "reckless", actionId: "loss-1" }, { currentLocation: "QS_BLACK_PINE_RIDGE" });
  assert.equal(result.outcome, "defeat");
  assert.equal(result.locationOverride, "QS_GUOYAN_INN");
  assert.equal(result.state.vitality.injury, "severe");
  assert.deepEqual(result.state.credentials, ["alchemy"]);
  assert.ok(result.state.spiritStones >= 9);
  assert.ok(getQingshiRecoverySteps(result.state).length <= 6);
  const zeroed = { ...result.state, spiritStones: 0 };
  const healed = resolveXingniAction(zeroed, { type: "heal", actionId: "heal-on-credit" }, { currentLocation: "QS_GUOYAN_INN" });
  assert.equal(healed.ok, true);
  assert.equal(healed.state.vitality.injury, "none");
  assert.equal(healed.state.recovery.debtStones, 5);
});

test("all spirit roots retain registered paths while gaining different advantages", () => {
  for (const root of ["青木", "赤火", "玄水"] as const) {
    const initial = createInitialXingniState(root);
    const gathered = resolveXingniAction(initial, { type: "gather" }, { currentLocation: "QS_BLACK_PINE_RIDGE" });
    assert.equal(gathered.ok, true);
    const cultivated = resolveXingniAction(initial, { type: "cultivate" }, { currentLocation: "QS_SPIRIT_SPRING_CAVE" });
    assert.equal(cultivated.ok, true);
  }
  assert.equal(resolveXingniAction(createInitialXingniState("青木"), { type: "gather" }, { currentLocation: "QS_BLACK_PINE_RIDGE" }).awardedItemIds.filter((id) => id === "xq_herb_spirit_leaf").length, 2);
  assert.equal(resolveXingniAction(createInitialXingniState("玄水"), { type: "cultivate" }, { currentLocation: "QS_SPIRIT_SPRING_CAVE" }).state.cultivation.progress, 60);
});

test("protected quest items cannot be sold and material buy-sell cannot profit", () => {
  const initial = { ...createInitialXingniState(), materialCounts: { xq_quest_herb_basket: 1, xq_ore_black_iron: 1 } };
  assert.equal(resolveXingniAction(initial, { type: "trade", operation: "sell", itemId: "xq_quest_herb_basket" }, { currentLocation: "QS_CULTIVATOR_MARKET" }).ok, false);
  const sold = resolveXingniAction(initial, { type: "trade", operation: "sell", itemId: "xq_ore_black_iron" }, { currentLocation: "QS_CULTIVATOR_MARKET" });
  assert.equal(sold.state.spiritStones, initial.spiritStones + 1);
});

test("all eight NPC side quests have deterministic completion and rewards", () => {
  const state = createInitialXingniState();
  const accepted = resolveXingniAction(state, { type: "accept_quest", questId: "XQ-S05", actionId: "side-accept" }, { currentLocation: "QS_GUOYAN_INN" });
  assert.equal(accepted.ok, true);
  const completed = resolveXingniAction(accepted.state, { type: "advance_quest", questId: "XQ-S05", actionId: "side-complete" }, { currentLocation: "QS_SOUTH_GATE" });
  assert.equal(completed.ok, true);
  assert.equal(completed.state.quests.sideQuestStages["XQ-S05"], "completed");
  assert.equal(completed.state.reputation, 1);
});
