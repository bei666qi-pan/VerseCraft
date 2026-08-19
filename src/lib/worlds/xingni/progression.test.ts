import test from "node:test";
import assert from "node:assert/strict";
import { createInitialXingniState, resolveXingniAction } from "./progression";

test("Xingni cultivation advances only at the registered spirit spring", () => {
  const initial = createInitialXingniState("玄水");
  assert.equal(resolveXingniAction(initial, { type: "cultivate", locationId: "QS_GUOYAN_INN" }).ok, false);
  const first = resolveXingniAction(initial, { type: "cultivate", locationId: "QS_SPIRIT_SPRING_CAVE" }, { currentLocation: "QS_SPIRIT_SPRING_CAVE" });
  const second = resolveXingniAction(first.state, { type: "cultivate", locationId: "QS_SPIRIT_SPRING_CAVE" }, { currentLocation: "QS_SPIRIT_SPRING_CAVE" });
  assert.equal(second.state.cultivation.realm, "炼气3层");
  assert.equal(second.state.cultivation.qiSeaDamaged, false);
});

test("alchemy and refining fail without registered resources", () => {
  const initial = createInitialXingniState();
  assert.equal(resolveXingniAction(initial, { type: "alchemy", recipeId: "pill_qi_gathering", materialIds: [] }, { currentLocation: "QS_HERB_HALL", inventoryItemIds: [] }).ok, false);
  assert.equal(resolveXingniAction(initial, { type: "refining", recipeId: "repair_damaged_artifact", materialIds: [] }, { currentLocation: "QS_DIVINE_FORGE", inventoryItemIds: [] }).ok, false);
});

test("ascension requires level four, two credentials and the registered construct", () => {
  let state = createInitialXingniState();
  for (let i = 0; i < 4; i += 1) state = resolveXingniAction(state, { type: "cultivate", locationId: "QS_SPIRIT_SPRING_CAVE" }, { currentLocation: "QS_SPIRIT_SPRING_CAVE" }).state;
  state = { ...state, quests: { ...state.quests, credentialStages: { ...state.quests.credentialStages, combat: "prepared" } } };
  state = resolveXingniAction(state, { type: "combat", targetId: "XQ-E001" }, { currentLocation: "QS_BLACK_PINE_RIDGE" }).state;
  state = { ...state, quests: { ...state.quests, credentialStages: { ...state.quests.credentialStages, alchemy: "prepared" } } };
  state = resolveXingniAction(state, { type: "alchemy", recipeId: "pill_qi_gathering", materialIds: ["xq_herb_spirit_leaf", "xq_herb_sun_seed"] }, { currentLocation: "QS_HERB_HALL", inventoryItemIds: ["xq_herb_spirit_leaf", "xq_herb_sun_seed"] }).state;
  state = { ...state, quests: { ...state.quests, mainStageId: "XQ-M14" }, ascensionTrial: "eligible", vitality: { ...state.vitality, health: 100, stamina: 80, injury: "none" } };
  const passed = resolveXingniAction(state, { type: "ascension_trial", targetId: "XQ-E002" }, { currentLocation: "QS_ASCENSION_TERRACE" });
  assert.equal(passed.ok, true);
  assert.equal(passed.state.ascensionTrial, "passed");
  assert.ok(passed.state.unlockedMapIds.includes("xingni_qingyun_ferry"));
});
