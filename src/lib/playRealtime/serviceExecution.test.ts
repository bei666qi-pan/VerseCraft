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
      "用户位置[B1_PowerRoom]。行囊道具：手电[I-C03|C]，备用电池[I-C12|C]。原石[9]。NPC当前位置：N-008@B1_PowerRoom。",
  });
  const consumed = Array.isArray(out.consumed_items) ? out.consumed_items : [];
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.ok(consumed.includes("I-C03"));
  assert.ok(consumed.includes("I-C12"));
  assert.ok(awarded.includes("I-B03"));
  assert.equal(out.currency_change, -3);
});

test("B1 power room forge preview returns actionable options", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你检查锻造台。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "我查看锻造台",
    playerContext:
      "用户位置[B1_PowerRoom]。行囊道具：防爆手电筒[I-C03|C]。仓库物品：配电间的绝缘胶带[W-B101]。主手武器[WPN-001|稳定70|反制sound/silence]。原石[6]。NPC当前位置：N-008@B1_PowerRoom。",
  });
  const options = Array.isArray(out.options) ? out.options : [];
  assert.ok(options.length >= 3);
  assert.ok(String(out.narrative).includes("锻造台"));
});

test("B1 power room weapon repair updates stability and pollution", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备维护武器。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "我在配电间修复主手武器",
    playerContext:
      "用户位置[B1_PowerRoom]。行囊道具：防爆手电筒[I-C03|C]。仓库物品：配电间的绝缘胶带[W-B101]。主手武器[WPN-003|稳定40|反制mirror/direction|模组无|灌注无|污染35|可修复1]。原石[4]。NPC当前位置：N-008@B1_PowerRoom。",
  });
  const updates = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { weaponId?: string }).weaponId, "WPN-003");
  assert.equal((updates[0] as { stability?: number }).stability, 70);
  assert.equal((updates[0] as { contamination?: number }).contamination, 0);
  assert.equal(out.currency_change, -1);
});

test("B1 power room mod operation writes currentMods", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备改装。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "执行 forge_mod_mirror",
    playerContext:
      "用户位置[B1_PowerRoom]。行囊道具：破裂的八卦镜[I-C02|C]。仓库物品：保安室的镜子碎片[W-107]。主手武器[WPN-003|稳定70|反制mirror/direction|模组无|灌注无|污染0|可修复1]。原石[5]。NPC当前位置：N-008@B1_PowerRoom。",
  });
  const updates = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(updates.length, 1);
  assert.ok(Array.isArray((updates[0] as { currentMods?: unknown[] }).currentMods));
  assert.equal(out.currency_change, -2);
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

test("B1 power room forge blocked when service npc absent", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你试图启动锻造台。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "我在配电间修复主手武器",
    playerContext:
      "用户位置[B1_PowerRoom]。主手武器[WPN-001|稳定50|反制sound/silence]。原石[5]。NPC当前位置：N-014@B1_Laundry。",
  });
  assert.equal(out.is_action_legal, false);
  assert.ok(String(out.narrative).includes("无人值守"));
});
