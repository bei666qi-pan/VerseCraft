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
    clientState: {
      v: 1,
      turnIndex: 10,
      playerLocation: "B1_Storage",
      time: { day: 0, hour: 0 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 10,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.ok(awarded.includes("I-C03"));
  assert.equal(out.currency_change, -5);
  assert.equal(out.consumes_time, true);
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
    clientState: {
      v: 1,
      turnIndex: 11,
      playerLocation: "B1_Storage",
      time: { day: 0, hour: 1 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 1,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  assert.equal(out.is_action_legal, false);
  assert.ok(String(out.narrative).includes("原石不足"));
  assert.equal(out.consumes_time, true);
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
    clientState: {
      v: 1,
      turnIndex: 12,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 2 },
      stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
      originium: 9,
      inventoryItemIds: ["I-C03", "I-C12"],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  const consumed = Array.isArray(out.consumed_items) ? out.consumed_items : [];
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.ok(consumed.includes("I-C03"));
  assert.ok(consumed.includes("I-C12"));
  assert.ok(awarded.includes("I-B03"));
  assert.equal(out.currency_change, -3);
  assert.equal(out.consumes_time, true);
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
    clientState: {
      v: 1,
      turnIndex: 13,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 3 },
      stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
      originium: 6,
      inventoryItemIds: ["I-C03"],
      warehouseItemIds: ["W-B101"],
      equippedWeapon: {
        id: "WPN-001",
        name: "测试",
        description: "d",
        counterThreatIds: [],
        counterTags: ["sound", "silence"],
        stability: 70,
        calibratedThreatId: null,
        modSlots: ["core", "surface"],
        currentMods: [],
        currentInfusions: [],
        contamination: 0,
        repairable: true,
      },
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  const options = Array.isArray(out.options) ? out.options : [];
  assert.ok(options.length >= 3);
  assert.ok(String(out.narrative).includes("锻造台"));
  assert.equal(out.consumes_time, false);
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
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { weaponId?: string }).weaponId, "WPN-003");
  assert.equal((updates[0] as { stability?: number }).stability, 70);
  assert.equal((updates[0] as { contamination?: number }).contamination, 0);
  assert.equal(out.currency_change, -1);
  assert.equal(out.consumes_time, true);
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
    clientState: {
      v: 1,
      turnIndex: 15,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 5 },
      stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
      originium: 5,
      inventoryItemIds: ["I-C02"],
      warehouseItemIds: ["W-107"],
      equippedWeapon: {
        id: "WPN-003",
        name: "测试武器",
        description: "d",
        counterThreatIds: [],
        counterTags: ["mirror", "direction"],
        stability: 70,
        calibratedThreatId: null,
        modSlots: ["core", "surface"],
        currentMods: [],
        currentInfusions: [],
        contamination: 0,
        repairable: true,
      },
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  const updates = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(updates.length, 1);
  assert.ok(Array.isArray((updates[0] as { currentMods?: unknown[] }).currentMods));
  assert.equal(out.currency_change, -2);
  assert.equal(out.consumes_time, true);
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
    clientState: {
      v: 1,
      turnIndex: 16,
      playerLocation: "1F_Lobby",
      time: { day: 0, hour: 6 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 10,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
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
    clientState: {
      v: 1,
      turnIndex: 17,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 7 },
      stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
      originium: 5,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: {
        id: "WPN-001",
        name: "测试",
        description: "d",
        counterThreatIds: [],
        counterTags: ["sound", "silence"],
        stability: 50,
        calibratedThreatId: null,
        modSlots: ["core", "surface"],
        currentMods: [],
        currentInfusions: [],
        contamination: 0,
        repairable: true,
      },
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-014"],
    },
  });
  assert.equal(out.is_action_legal, false);
  assert.ok(String(out.narrative).includes("无人值守"));
  assert.equal(out.consumes_time, true);
});

test("service guard ignores model-injected free items by overwriting economy fields", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备交易。",
      is_death: false,
      player_location: "B1_Storage",
      awarded_items: ["I-A01"],
      currency_change: 999,
      consumed_items: ["I-C03"],
      weapon_updates: [{ weaponId: "WPN-001", stability: 100 }],
    },
    latestUserInput: "我购买 I-C03",
    playerContext: "用户位置[B1_Storage]。原石[10]。",
    clientState: {
      v: 1,
      turnIndex: 18,
      playerLocation: "B1_Storage",
      time: { day: 0, hour: 8 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 10,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  const awarded = Array.isArray(out.awarded_items) ? out.awarded_items : [];
  assert.ok(awarded.includes("I-C03"));
  assert.equal(awarded.includes("I-A01"), false);
  assert.equal(out.currency_change, -5);
});

test("weaponize C rejects D-tier items (cannot weaponize D)", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备武器化。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "道具武器化（C）（forge_weaponize_c） I-D01 I-D02 I-D03",
    playerContext: "用户位置[B1_PowerRoom]。原石[10]。",
    clientState: {
      v: 1,
      turnIndex: 19,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 9 },
      stats: { sanity: 30, agility: 30, luck: 30, charm: 30, background: 30 },
      originium: 10,
      inventoryItemIds: ["I-D01", "I-D02", "I-D03"],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  assert.equal(out.is_action_legal, false);
  assert.ok(String(out.narrative).includes("D") || String(out.narrative).includes("品级") || String(out.narrative).includes("不足"));
});

test("weaponize discount: traceorigin gets 10% off on B-tier (10 -> 9)", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备武器化。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "道具武器化（B）（forge_weaponize_b） I-B01 I-B02",
    playerContext: "用户位置[B1_PowerRoom]。原石[10]。",
    clientState: {
      v: 1,
      turnIndex: 20,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 10 },
      stats: { sanity: 60, agility: 60, luck: 60, charm: 60, background: 60 },
      originium: 10,
      inventoryItemIds: ["I-B01", "I-B02"],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [],
      currentProfession: "溯源师",
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  assert.equal(out.is_action_legal, true);
  assert.equal(out.currency_change, -9);
});

test("weaponize rejects when weapon slot occupied (unique weapon slot)", () => {
  const out = applyB1ServiceExecutionGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你准备武器化。",
      is_death: false,
      player_location: "B1_PowerRoom",
    },
    latestUserInput: "道具武器化（C）（forge_weaponize_c） I-C01 I-C02 I-C03",
    playerContext: "用户位置[B1_PowerRoom]。原石[10]。",
    clientState: {
      v: 1,
      turnIndex: 21,
      playerLocation: "B1_PowerRoom",
      time: { day: 0, hour: 11 },
      stats: { sanity: 60, agility: 60, luck: 60, charm: 60, background: 60 },
      originium: 10,
      inventoryItemIds: ["I-C01", "I-C02", "I-C03"],
      warehouseItemIds: [],
      equippedWeapon: {
        id: "WPN-001",
        name: "测试",
        description: "d",
        counterThreatIds: [],
        counterTags: ["sound"],
        stability: 70,
        calibratedThreatId: null,
        modSlots: ["core", "surface"],
        currentMods: [],
        currentInfusions: [],
        contamination: 0,
        repairable: true,
      },
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: ["N-008"],
    },
  });
  assert.equal(out.is_action_legal, false);
  assert.ok(String(out.narrative).includes("武器栏") || String(out.narrative).includes("卸下"));
});
