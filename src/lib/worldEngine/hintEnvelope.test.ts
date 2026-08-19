import assert from "node:assert/strict";
import test from "node:test";
import { parseWorldEngineDeltaJson } from "./contracts";
import {
  buildDirectorHintEnvelope,
  isDirectorHintApplicable,
  normalizeDirectorHintReceipt,
  stripDirectorHintReceipt,
} from "./hintEnvelope";

const plan = parseWorldEngineDeltaJson(JSON.stringify({
  schema_version: "director_plan_v1",
  director_intent: "让可观察的门铃异响推进调查",
  current_phase: "quiet",
  target_phase: "build_up",
  world_events_to_schedule: [
    { event_code: "EV-1", title: "门铃", due_in_turns: 1, ttl_turns: 3, priority: "medium", salience: 0.7, trigger_conditions: [], injection_hint: "门铃短响一次，玩家可以忽略", agency_constraints: ["player_can_ignore"], forbidden_outcomes: ["不得强制开门"], payload: {} },
    { event_code: "EV-REJECT", title: "拒绝项", due_in_turns: 1, ttl_turns: 3, priority: "high", salience: 0.9, trigger_conditions: [], injection_hint: "不应出现", agency_constraints: [], forbidden_outcomes: [], payload: {} },
  ],
}));
assert.ok(plan);

test("hint envelope includes accepted subset only", () => {
  const envelope = buildDirectorHintEnvelope({
    scope: { worldId: "dark_moon_prologue", mapId: "dark_moon_apartment", sessionId: "s" },
    runId: 7,
    worldRevision: 9n,
    turnIndex: 3,
    plan,
    validation: { accepted: true, acceptedEventCodes: ["EV-1"], rejectedEventCodes: ["EV-REJECT"], acceptedSocialEventCodes: [], rejectedSocialEventCodes: [], issues: [] },
  });
  assert.ok(envelope);
  assert.deepEqual(envelope.eventRefs, ["EV-1"]);
  assert.equal(envelope.directions.some((line) => line.includes("不应出现")), false);
  assert.equal(isDirectorHintApplicable(envelope, { worldId: "dark_moon_prologue", mapId: "dark_moon_apartment", sessionId: "s" }, 4), true);
  assert.equal(isDirectorHintApplicable(envelope, { worldId: "xingni_taichu", mapId: "xingni_qingshi_county", sessionId: "s" }, 4), false);
});

test("fully rejected candidate cannot create hint", () => {
  assert.equal(buildDirectorHintEnvelope({
    scope: { worldId: "dark_moon_prologue", mapId: "dark_moon_apartment", sessionId: "s" },
    runId: 7,
    worldRevision: 9n,
    turnIndex: 3,
    plan,
    validation: { accepted: false, acceptedEventCodes: [], rejectedEventCodes: ["EV-1", "EV-REJECT"], acceptedSocialEventCodes: [], rejectedSocialEventCodes: [], issues: [] },
  }), null);
});

test("receipts require known IDs and are stripped from final candidates", () => {
  const known = new Set(["hint_ok"]);
  assert.deepEqual(normalizeDirectorHintReceipt({ hintId: "hint_ok", status: "applied" }, known), { hintId: "hint_ok", status: "applied" });
  assert.equal(normalizeDirectorHintReceipt({ hintId: "hint_fake", status: "applied" }, known), null);
  assert.deepEqual(stripDirectorHintReceipt({ narrative: "x", director_hint_receipt: { hintId: "hint_ok" } }), { narrative: "x" });
});
