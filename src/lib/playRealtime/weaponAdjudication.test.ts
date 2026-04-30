import test from "node:test";
import assert from "node:assert/strict";
import { applyWeaponTacticalAdjudication } from "./weaponAdjudication";

test("weapon tactical adjudication: no equipped weapon does not grant advantage (active threat gets +1 sanity damage)", () => {
  const out = applyWeaponTacticalAdjudication({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你试图强行推进。",
      is_death: false,
      player_location: "2F_Corridor",
      main_threat_updates: [{ floorId: "2", threatId: "A-004", phase: "active", suppressionProgress: 20 }],
    },
    playerContext: "用户位置[2F_Corridor]。原石[0]。行囊道具：空。",
    latestUserInput: "我硬闯过去",
    requestId: "test-req-1",
  });

  assert.equal(out.sanity_damage, 1);
  assert.ok(String(out.narrative).includes("没有装备武器"));
});

test("weapon tactical adjudication: matching weapon affects damage and writes durability state", () => {
  const out = applyWeaponTacticalAdjudication({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 3,
      narrative: "你把导电胶带压进走廊里的红水。",
      is_death: false,
      player_location: "2F_Corridor",
      main_threat_updates: [{ floorId: "2", threatId: "A-004", phase: "active", suppressionProgress: 20 }],
    },
    playerContext: "用户位置[2F_Corridor]。主手武器[WPN-001|稳定95|反制liquid/conductive|模组conductive|灌注liquid:1|污染0|可修复1]。",
    latestUserInput: "我用导电封管压制红水",
    requestId: "weapon-positive-0",
  });

  assert.equal(out.sanity_damage, 1);
  const threat = (out.main_threat_updates as Array<Record<string, unknown>>)[0]!;
  assert.equal(threat.suppressionProgress, 35);
  const updates = Array.isArray(out.weapon_updates) ? out.weapon_updates : [];
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as Record<string, unknown>).weaponId, "WPN-001");
  assert.equal((updates[0] as Record<string, unknown>).contamination, 2);
  assert.equal((updates[0] as Record<string, unknown>).stability, 94);
  assert.ok(String(out.narrative).includes("武器介入"));
});

