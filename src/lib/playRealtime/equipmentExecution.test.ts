import assert from "node:assert/strict";
import test from "node:test";
import { applyEquipmentExecutionGuard } from "./equipmentExecution";

function baseDm() {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "x",
    is_death: false,
    consumes_time: false,
  } as Record<string, unknown>;
}

test("equip: consumes_time true and moves weapon from bag to slot via writebacks", () => {
  const out = applyEquipmentExecutionGuard({
    dmRecord: baseDm(),
    latestUserInput: "装备武器：WZ-001",
    playerContext: "（兼容快照）",
    clientState: {
      v: 1,
      turnIndex: 1,
      playerLocation: "B1_SafeZone",
      time: { day: 0, hour: 0 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: null,
      weaponBag: [
        {
          id: "WZ-001",
          name: "武器化测试",
          description: "d",
          counterThreatIds: [],
          counterTags: ["mirror"],
          stability: 70,
          calibratedThreatId: null,
          modSlots: ["core", "surface"],
          currentMods: [],
          currentInfusions: [],
          contamination: 0,
          repairable: true,
        },
      ],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  assert.equal(out.consumes_time, true);
  const wu = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(wu.length, 1);
  assert.ok((wu[0] as any).weapon);
  const wbu = Array.isArray(out.weapon_bag_updates) ? out.weapon_bag_updates : [];
  assert.equal(wbu.length, 1);
  assert.equal((wbu[0] as any).removeWeaponId, "WZ-001");
});

test("unequip: consumes_time true, weapon_updates unequip and returns to bag", () => {
  const out = applyEquipmentExecutionGuard({
    dmRecord: baseDm(),
    latestUserInput: "卸下武器",
    playerContext: "（兼容快照）",
    clientState: {
      v: 1,
      turnIndex: 2,
      playerLocation: "B1_SafeZone",
      time: { day: 0, hour: 1 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: {
        id: "WPN-001",
        name: "测试武器",
      } as any,
      weaponBag: [],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  assert.equal(out.consumes_time, true);
  const wu = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(wu.length, 1);
  assert.equal((wu[0] as any).unequip, true);
  const wbu = Array.isArray(out.weapon_bag_updates) ? out.weapon_bag_updates : [];
  assert.equal(wbu.length, 1);
  assert.equal((wbu[0] as any).addEquippedWeaponId, "WPN-001");
});

test("swap: consumes_time true, remove new from bag and return old to bag", () => {
  const out = applyEquipmentExecutionGuard({
    dmRecord: baseDm(),
    latestUserInput: "更换武器：WZ-002",
    playerContext: "（兼容快照）",
    clientState: {
      v: 1,
      turnIndex: 3,
      playerLocation: "B1_SafeZone",
      time: { day: 0, hour: 2 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 0,
      inventoryItemIds: [],
      warehouseItemIds: [],
      equippedWeapon: { id: "WPN-001", name: "旧武器" } as any,
      weaponBag: [
        {
          id: "WZ-002",
          name: "新武器",
          description: "d",
          counterThreatIds: [],
          counterTags: [],
          stability: 50,
          calibratedThreatId: null,
          modSlots: ["core", "surface"],
          currentMods: [],
          currentInfusions: [],
          contamination: 0,
          repairable: true,
        } as any,
      ],
      currentProfession: null,
      worldFlags: [],
      presentNpcIds: [],
    },
  });
  assert.equal(out.consumes_time, true);
  const wbu = Array.isArray(out.weapon_bag_updates) ? out.weapon_bag_updates : [];
  assert.equal(wbu.length, 2);
  assert.equal((wbu[0] as any).removeWeaponId, "WZ-002");
  assert.equal((wbu[1] as any).addEquippedWeaponId, "WPN-001");
});

test("illegal equip: weapon not in bag is blocked", () => {
  const out = applyEquipmentExecutionGuard({
    dmRecord: baseDm(),
    latestUserInput: "装备武器：WZ-404",
    playerContext: "（兼容快照）",
    clientState: {
      v: 1,
      turnIndex: 4,
      playerLocation: "B1_SafeZone",
      time: { day: 0, hour: 3 },
      stats: { sanity: 10, agility: 10, luck: 10, charm: 10, background: 10 },
      originium: 0,
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
  assert.equal(out.consumes_time, true);
});

