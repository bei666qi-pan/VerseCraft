import assert from "node:assert/strict";
import test from "node:test";
import { applyB1ServiceExecutionGuard } from "./serviceExecution";

test("B1_PowerRoom repair with N-008 present produces weapon_updates", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你把武器交给老刘。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "我在配电间修复主手武器",
    playerContext:
      "用户位置[B1_PowerRoom]。行囊道具：防爆手电筒[I-C03|C]。仓库物品：配电间的绝缘胶带[W-B101]。主手武器[WPN-003|稳定40|反制mirror/direction|模组无|灌注无|污染35|可修复1]。原石[4]。NPC当前位置：N-008@B1_PowerRoom。",
    clientState: {
      v: 1,
      turnIndex: 14,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 4 },
      stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
      originium: 4,
      inventoryItemIds: ["I-C03"],
      warehouseItemIds: ["W-B101"],
      equippedWeapon: {
        id: "WPN-003",
        name: "测试武器",
        description: "d",
        counterThreatIds: [],
        counterTags: ["mirror", "direction"],
        stability: 40,
        calibratedThreatId: null,
        modSlots: ["core", "surface"],
        currentMods: [],
        currentInfusions: [],
        contamination: 35,
        repairable: true,
      },
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  const updates = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.ok(updates.length > 0, "should produce weapon_updates for repair");
  assert.equal((updates[0] as { weaponId?: string }).weaponId, "WPN-003");
  assert.equal(out.consumes_time, true);
});

test("B1_PowerRoom forge without N-008 present is rejected", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你走进配电间。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "我在配电间修复主手武器",
    playerContext: "用户位置[B1_PowerRoom]。原石[30]。",
    clientState: {
      v: 1,
      turnIndex: 20,
      playerLocation: "B1_PowerRoom",
      time: { day: 1, hour: 5 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 30,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  assert.equal(out.is_action_legal, false, "should be illegal without N-008");
});
