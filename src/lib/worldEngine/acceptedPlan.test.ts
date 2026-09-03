import assert from "node:assert/strict";
import test from "node:test";
import { parseWorldEngineDeltaJson } from "./contracts";
import { materializeAcceptedChapterPacingPlan } from "./acceptedPlan";

const plan = parseWorldEngineDeltaJson(JSON.stringify({
  schema_version: "director_plan_v1",
  director_intent: "只提交通过所有门禁的方向",
  world_events_to_schedule: [
    { event_code: "EV_KEEP", title: "保留", injection_hint: "走廊远处传来可忽略的轻响。" },
    { event_code: "EV_DROP", title: "丢弃", injection_hint: "被拒绝的方向不应持久化。" },
  ],
}));
assert.ok(plan);

test("commit materialization excludes every rejected event", () => {
  const committed = materializeAcceptedChapterPacingPlan({
    plan,
    validation: {
      accepted: true,
      acceptedEventCodes: ["EV_KEEP"],
      rejectedEventCodes: ["EV_DROP"],
      acceptedSocialEventCodes: [],
      rejectedSocialEventCodes: [],
      issues: [],
    },
  });
  assert.ok(committed);
  assert.deepEqual(committed.world_events_to_schedule.map((event) => event.event_code), ["EV_KEEP"]);
});

test("fully rejected candidate produces no persistable plan", () => {
  assert.equal(materializeAcceptedChapterPacingPlan({
    plan,
    validation: {
      accepted: false,
      acceptedEventCodes: [],
      rejectedEventCodes: ["EV_KEEP", "EV_DROP"],
      acceptedSocialEventCodes: [],
      rejectedSocialEventCodes: [],
      issues: [],
    },
  }), null);
});
