import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFloorProgressionPacket,
  buildForgePacket,
  buildTacticalContextPacket,
  buildThreatPacket,
  buildWeaponPacket,
} from "./stage2Packets";

test("stage2 threat/weapon/forge packet builders return focused payloads", () => {
  const threat = buildThreatPacket({
    location: "2F_Corridor",
    contextThreatMap: { "2": { threatId: "A-002", phase: "active", suppressionProgress: 35 } },
  });
  assert.equal(threat.activeThreatId, "A-002");
  const weapon = buildWeaponPacket({
    weapon: {
      weaponId: "WPN-001",
      stability: 70,
      counterTags: ["sound"],
      mods: ["silent"],
      infusions: ["mirror:2"],
      contamination: 10,
      repairable: true,
    },
    threatName: "听觉锁定回响体",
    threatId: "A-002",
  });
  assert.equal(weapon.matchAgainstMainThreat, false);
  const forge = buildForgePacket({
    location: "B1_PowerRoom",
    contextThreatPhase: "active",
  });
  assert.ok(Array.isArray(forge.availableMods));
  assert.ok(Array.isArray(forge.availableInfusions));
});

test("stage2 floor/tactical packets are compact and scenario-scoped", () => {
  const floor = buildFloorProgressionPacket({
    location: "4F_Hall",
    worldFlags: ["a", "b"],
    recentEvents: ["recent_revive@anchor_b1_safe"],
    discoveredTruths: ["conspiracy_seeded"],
  });
  assert.equal(floor.floorThreatTier, "high");
  const tactical = buildTacticalContextPacket({
    latestUserInput: "我要先回 B1 配电间做灌注并压制主威胁，再推进任务",
    activeTasks: ["任务A", "任务B"],
    runtimeLoreHints: ["- [rule] x"],
    nearbyNpcIds: ["N-008"],
    threatPhase: "active",
  });
  assert.ok(Array.isArray(tactical.nextTurnFocus));
  assert.ok(Array.isArray(tactical.requiredWritebacks));
  assert.ok(tactical.requiredWritebacks.includes("weapon_updates"));
  assert.ok(tactical.requiredWritebacks.includes("main_threat_updates"));
  assert.ok(tactical.requiredWritebacks.includes("task_updates"));
});

