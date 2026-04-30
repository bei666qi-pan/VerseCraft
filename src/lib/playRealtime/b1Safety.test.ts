import assert from "node:assert/strict";
import test from "node:test";
import {
  applyB1SafetyGuard,
  buildB1ServiceContextBlock,
  guessPlayerLocationFromContext,
} from "./b1Safety";

test("guessPlayerLocationFromContext extracts location node", () => {
  const loc = guessPlayerLocationFromContext(
    "用户位置[B1_SafeZone]。当前属性：理智[10]"
  );
  assert.equal(loc, "B1_SafeZone");
});

test("applyB1SafetyGuard blocks hostile sanity damage in B1", () => {
  const guarded = applyB1SafetyGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 6,
      narrative: "你在B1遭受攻击。",
      is_death: false,
      risk_source: "hostile_attack" as any,
    },
    fallbackLocation: "B1_SafeZone",
  });
  assert.equal(guarded.sanity_damage, 0);
  assert.equal(guarded.is_action_legal, false);
  assert.equal((guarded as any).damage_source, "hostile_attack");
  assert.equal((guarded as any).security_meta.reason, "hostile_damage_blocked_in_b1");
});

test("applyB1SafetyGuard keeps non-hostile B1 costs", () => {
  const guarded = applyB1SafetyGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 4,
      narrative: "B1 truth shock still costs sanity.",
      is_death: false,
      risk_source: "truth_shock" as any,
      player_location: "B1_Laundry",
    },
    fallbackLocation: "B1_SafeZone",
  });
  assert.equal(guarded.sanity_damage, 4);
  assert.equal(guarded.is_action_legal, true);
  assert.equal((guarded as any).security_meta.reason, "b1_non_hostile_cost_allowed");
});

test("applyB1SafetyGuard does not alter non-B1 records", () => {
  const kept = applyB1SafetyGuard({
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 6,
      narrative: "你在高层遭受攻击。",
      is_death: false,
      player_location: "4F_CorridorEnd",
    },
    fallbackLocation: "4F_CorridorEnd",
  });
  assert.equal(kept.sanity_damage, 6);
  assert.equal(kept.is_action_legal, true);
});

test("buildB1ServiceContextBlock returns structured context for B1 only", () => {
  const b1 = buildB1ServiceContextBlock({ playerLocation: "B1_Storage" });
  assert.ok(b1.includes("服务节点"));
  const nonB1 = buildB1ServiceContextBlock({ playerLocation: "1F_Lobby" });
  assert.equal(nonB1, "");
});
