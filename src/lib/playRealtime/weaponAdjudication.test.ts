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
      main_threat_updates: [{ floorId: "2", threatId: "A-002", phase: "active", suppressionProgress: 20 }],
    },
    playerContext: "用户位置[2F_Corridor]。原石[0]。行囊道具：空。",
    latestUserInput: "我硬闯过去",
    requestId: "test-req-1",
  });

  assert.equal(out.sanity_damage, 1);
  assert.ok(String(out.narrative).includes("没有装备武器"));
});

