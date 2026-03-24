import assert from "node:assert/strict";
import test from "node:test";
import { applyB1ServiceExecutionGuard } from "./serviceExecution";

test("B1 storage buy success appends awarded_items and currency change", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你看向货架。",
      is_death: false,
      player_location: "B1_Storage",
      currency_change: 0,
    },
    latestUserInput: "我购买 I-C03",
    playerContext: "用户位置[B1_Storage]。行囊道具：空。原石[10]。",
  });
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.ok(awarded.includes("I-C03"));
  assert.equal(out.currency_change, -5);
});

test("B1 storage buy fails when originium is insufficient", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备交易。",
      is_death: false,
      player_location: "B1_Storage",
    },
    latestUserInput: "我购买 I-C03",
    playerContext: "用户位置[B1_Storage]。行囊道具：空。原石[1]。",
  });
  assert.equal(out.is_action_legal, false);
  assert.ok(String(out.narrative).includes("原石不足"));
});

test("B1 power room forge success consumes inputs and awards output", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你走到锻造台前。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "我使用 forge_recipe_flashlight_battery 进行锻造",
    playerContext:
      "用户位置[B1_PowerRoom]。行囊道具：手电[I-C03|C]，备用电池[I-C12|C]。原石[9]。",
  });
  const consumed = Array.isArray(out.consumed_items) ? out.consumed_items : [];
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.ok(consumed.includes("I-C03"));
  assert.ok(consumed.includes("I-C12"));
  assert.ok(awarded.includes("I-B03"));
  assert.equal(out.currency_change, -3);
});

test("non B1 location keeps record unchanged", () => {
  const inRecord = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "普通楼层。",
    is_death: false,
    player_location: "1F_Lobby",
  };
  const out = applyB1ServiceExecutionGuard({
    dmRecord: inRecord,
    latestUserInput: "我购买 I-C03",
    playerContext: "用户位置[1F_Lobby]。原石[10]。",
  });
  assert.deepEqual(out, inRecord);
});
