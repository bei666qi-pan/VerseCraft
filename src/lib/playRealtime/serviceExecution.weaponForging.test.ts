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

test("world-authored equipped weapon can be repaired without a legacy registry entry", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: { is_action_legal: true, sanity_damage: 0, narrative: "老刘接过现有铁管。", is_death: false },
    latestUserInput: "确认对WPN-3F-IRON-PIPE执行一次维护锻造",
    playerContext: "位置:B1_PowerRoom",
    clientState: {
      v: 1,
      turnIndex: 2,
      playerLocation: "B1_PowerRoom",
      stats: { sanity: 80, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 6,
      inventoryItemIds: ["I-C03"],
      warehouseItemIds: ["W-B101"],
      equippedWeapon: { id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 55, contamination: 8, repairable: true },
      weaponBag: [{ id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 55, contamination: 8, repairable: true }],
      currentProfession: "守灯人",
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  assert.equal(out.is_action_legal, true);
  assert.equal(out.currency_change, -1);
  assert.deepEqual(out.weapon_updates, [{ weaponId: "WPN-3F-IRON-PIPE", stability: 85, contamination: 0, repairable: true }]);
  assert.doesNotMatch(String(out.narrative), /没有装备主手武器/);
  assert.doesNotMatch(String(out.narrative), /20石|原石不足/);
});

test("forge quote and state audit expose player-facing facts without internal recipe prose", () => {
  const clientState = {
    v: 1 as const,
    turnIndex: 2,
    playerLocation: "B1_PowerRoom",
    stats: { sanity: 80, agility: 10, luck: 10, charm: 10, background: 10 },
    originium: 6,
    inventoryItemIds: ["I-C03"],
    warehouseItemIds: ["W-B101"],
    equippedWeapon: { id: "WPN-3F-IRON-PIPE", name: "三楼消防铁管", stability: 55, contamination: 8, repairable: true },
    weaponBag: [{ id: "WPN-3F-IRON-PIPE" }],
    currentProfession: "守灯人",
    worldFlags: [],
    presentNpcIds: ["N-008"],
  };
  const quote = applyB1ServiceExecutionGuard({
    dmRecord: { narrative: "模型乱报二十颗原石。", currency_change: -20 },
    latestUserInput: "请N-008检查现有武器并报价",
    playerContext: "位置:B1_PowerRoom",
    clientState,
  });
  assert.match(String(quote.narrative), /基础维护需要 1 颗原石/);
  assert.doesNotMatch(String(quote.narrative), /forge_|二十|WPN-/);
  assert.equal(quote.currency_change, 0);

  const audit = applyB1ServiceExecutionGuard({
    dmRecord: { narrative: "模型说只剩四颗。", currency_change: -1 },
    latestUserInput: "核对锻造后的原石、稳定性、污染与武器袋",
    playerContext: "位置:B1_PowerRoom",
    clientState,
  });
  assert.match(String(audit.narrative), /原石 6 颗/);
  assert.match(String(audit.narrative), /稳定度 55/);
  assert.doesNotMatch(String(audit.narrative), /只剩四颗|WPN-/);
  assert.equal(audit.currency_change, 0);
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
