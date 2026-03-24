import assert from "node:assert/strict";
import test from "node:test";
import { applyMainThreatUpdateGuard } from "./mainThreatGuard";

test("main threat guard auto-fills update when model omits field", () => {
  const out = applyMainThreatUpdateGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你在二楼谨慎前进。",
      is_death: false,
      player_location: "2F_Corridor",
    },
    playerContext: "用户位置[2F_Corridor]。",
  });
  const updates = Array.isArray(out.main_threat_updates) ? out.main_threat_updates : [];
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { floorId?: string }).floorId, "2");
  assert.equal((updates[0] as { threatId?: string }).threatId, "A-002");
});

test("main threat guard rejects floor-threat mismatch", () => {
  const out = applyMainThreatUpdateGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你试图压制威胁。",
      is_death: false,
      player_location: "3F_Stairwell",
      main_threat_updates: [
        { floorId: "3", threatId: "A-001", phase: "suppressed", suppressionProgress: 90 },
      ],
    },
    playerContext: "用户位置[3F_Stairwell]。",
  });
  const updates = Array.isArray(out.main_threat_updates) ? out.main_threat_updates : [];
  assert.equal(updates.length, 1);
  assert.equal((updates[0] as { floorId?: string }).floorId, "3");
  assert.equal((updates[0] as { threatId?: string }).threatId, "A-003");
});

test("main threat guard keeps B1 as idle", () => {
  const out = applyMainThreatUpdateGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 0,
      narrative: "你在B1整理补给。",
      is_death: false,
      player_location: "B1_Storage",
    },
    playerContext: "用户位置[B1_Storage]。",
  });
  const updates = Array.isArray(out.main_threat_updates) ? out.main_threat_updates : [];
  assert.equal(updates.length, 0);
});

