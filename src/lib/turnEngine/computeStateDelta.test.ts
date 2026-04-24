import test from "node:test";
import assert from "node:assert/strict";
import type { NormalizedPlayerIntent } from "@/lib/turnEngine/types";
import type { PlayerControlPlane, PlayerRuleSnapshot } from "@/lib/playRealtime/types";
import {
  computePostNarrativeDelta,
  computePreNarrativeDelta,
  emptyStateDelta,
} from "@/lib/turnEngine/computeStateDelta";

function makeIntent(partial: Partial<NormalizedPlayerIntent> = {}): NormalizedPlayerIntent {
  return {
    rawText: "我推开门走出去",
    normalizedText: "我推开门走出去",
    kind: "explore",
    slots: {},
    riskTags: [],
    isSystemTransition: false,
    isFirstAction: false,
    clientPurpose: "normal",
    ...partial,
  };
}

function makeRule(partial: Partial<PlayerRuleSnapshot> = {}): PlayerRuleSnapshot {
  return {
    in_combat_hint: false,
    in_dialogue_hint: false,
    location_changed_hint: false,
    high_value_scene: false,
    ...partial,
  } as PlayerRuleSnapshot;
}

function makeControl(partial: Partial<PlayerControlPlane> = {}): PlayerControlPlane {
  return {
    intent: "other",
    confidence: 0.5,
    extracted_slots: {},
    risk_tags: [],
    risk_level: "low",
    dm_hints: "",
    enhance_scene: false,
    enhance_npc_emotion: false,
    block_dm: false,
    block_reason: "",
    ...partial,
  };
}

test("emptyStateDelta returns fresh baseline", () => {
  const d = emptyStateDelta();
  assert.equal(d.isActionLegal, null);
  assert.equal(d.consumesTime, false);
  assert.equal(d.sanityDamage, 0);
  assert.equal(d.isDeath, false);
  assert.equal(d.mustDegrade, false);
  assert.deepEqual(d.illegalReasons, []);
  assert.deepEqual(d.npcLocationUpdates, []);
  assert.deepEqual(d.taskUpdates, []);
});

test("computePreNarrativeDelta marks preflight block as illegal+degrade", () => {
  const d = computePreNarrativeDelta({
    intent: makeIntent({ kind: "combat" }),
    control: makeControl({ block_dm: true }),
    rule: makeRule(),
    inputFellBack: false,
    antiCheatFallback: false,
  });
  assert.equal(d.isActionLegal, false);
  assert.equal(d.mustDegrade, true);
  assert.ok(d.illegalReasons.includes("preflight_block_dm"));
});

test("computePreNarrativeDelta sets system_transition turns to free time", () => {
  const d = computePreNarrativeDelta({
    intent: makeIntent({ isSystemTransition: true, kind: "system_transition" }),
    control: null,
    rule: makeRule(),
    inputFellBack: false,
    antiCheatFallback: false,
  });
  assert.equal(d.consumesTime, false);
  assert.equal(d.timeCost, "free");
});

test("computePreNarrativeDelta defaults normal turns to standard time", () => {
  const d = computePreNarrativeDelta({
    intent: makeIntent(),
    control: null,
    rule: makeRule(),
    inputFellBack: false,
    antiCheatFallback: false,
  });
  assert.equal(d.consumesTime, true);
  assert.equal(d.timeCost, "standard");
});

test("computePreNarrativeDelta marks combat+rule hint as heavy time", () => {
  const d = computePreNarrativeDelta({
    intent: makeIntent({ kind: "combat" }),
    control: null,
    rule: makeRule({ in_combat_hint: true }),
    inputFellBack: false,
    antiCheatFallback: false,
  });
  assert.equal(d.timeCost, "heavy");
});

test("computePreNarrativeDelta tracks anti-cheat fallback reason", () => {
  const d = computePreNarrativeDelta({
    intent: makeIntent(),
    control: null,
    rule: makeRule(),
    inputFellBack: false,
    antiCheatFallback: true,
  });
  assert.ok(d.illegalReasons.includes("anti_cheat_fallback"));
});

test("computePostNarrativeDelta enriches from dm record", () => {
  const pre = computePreNarrativeDelta({
    intent: makeIntent(),
    control: null,
    rule: makeRule(),
    inputFellBack: false,
    antiCheatFallback: false,
  });
  const d = computePostNarrativeDelta({
    pre,
    dmRecord: {
      is_action_legal: true,
      sanity_damage: 3,
      is_death: false,
      consumes_time: true,
      time_cost: "light",
      currency_change: -2,
      player_location: "顶楼天台",
      npc_location_updates: [{ npc_id: "N-001", location: "餐厅" }],
      relationship_updates: [{ npc_id: "N-002", attitude: "hostile", delta: -5 }],
      task_updates: [{ task_id: "T-1", status: "in_progress", note: "发现血迹" }],
      new_tasks: [{ id: "T-2", title: "追查血迹来源" }],
    },
  });
  assert.equal(d.isActionLegal, true);
  assert.equal(d.sanityDamage, 3);
  assert.equal(d.timeCost, "light");
  assert.equal(d.originiumDelta, -2);
  assert.equal(d.playerLocation, "顶楼天台");
  assert.deepEqual(d.npcLocationUpdates, [{ npcId: "N-001", location: "餐厅" }]);
  assert.deepEqual(d.npcAttitudeUpdates, [{ npcId: "N-002", attitude: "hostile", delta: -5 }]);
  assert.equal(d.taskUpdates.length, 1);
  assert.equal(d.taskUpdates[0].taskId, "T-1");
  assert.deepEqual(d.newTasks, [{ taskId: "T-2", title: "追查血迹来源" }]);
});

test("computePostNarrativeDelta keeps mustDegrade when security_meta requests degrade", () => {
  const pre = emptyStateDelta();
  const d = computePostNarrativeDelta({
    pre,
    dmRecord: {
      is_action_legal: false,
      security_meta: { action: "degrade", reason: "safety" },
    },
  });
  assert.equal(d.mustDegrade, true);
  assert.equal(d.isActionLegal, false);
});

test("computePostNarrativeDelta preserves pre-decided illegal state when dm disagrees", () => {
  const pre: ReturnType<typeof emptyStateDelta> = {
    ...emptyStateDelta(),
    isActionLegal: false,
    illegalReasons: ["preflight_block_dm"],
    mustDegrade: true,
  };
  const d = computePostNarrativeDelta({
    pre,
    dmRecord: { is_action_legal: true },
  });
  assert.equal(d.isActionLegal, false);
  assert.equal(d.mustDegrade, true);
});

test("computePostNarrativeDelta handles null dm record gracefully", () => {
  const pre = emptyStateDelta();
  const d = computePostNarrativeDelta({ pre, dmRecord: null });
  assert.deepEqual(d, pre);
});
