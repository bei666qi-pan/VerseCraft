import assert from "node:assert/strict";
import test from "node:test";
import cases from "@/lib/socialWorld/__fixtures__/socialWorldEvalCases.json";
import { runSocialWorldEvalCases, type SocialWorldEvalCase } from "@/lib/socialWorld/eval";

test("social world eval fixture covers required regression scenarios", () => {
  const ids = new Set((cases as SocialWorldEvalCase[]).map((item) => item.id));
  for (const id of [
    "rumor_spread_legal",
    "private_warning",
    "knowledge_scope_violation",
    "must_not_reveal_violation",
    "agency_violation",
    "location_impossible",
    "duplicate_event",
    "prompt_budget",
    "memory_spine_write",
    "fail_open",
  ]) {
    assert.equal(ids.has(id), true, `missing eval case ${id}`);
  }
});

test("social world eval passes hard safety and budget gates", async () => {
  const report = await runSocialWorldEvalCases(cases as SocialWorldEvalCase[]);

  assert.deepEqual(report.failures, []);
  assert.ok(report.metrics.accepted_count > 0);
  assert.ok(report.metrics.rejected_count > 0);
  assert.ok(report.metrics.projected_count > 0);
  assert.equal(report.metrics.leaked_must_not_reveal_count, 0);
  assert.equal(report.metrics.prompt_budget_violation_count, 0);
  assert.equal(report.metrics.private_projection_count, 0);
  assert.ok(report.metrics.rejection_by_code.knowledge_scope_violation >= 1);
  assert.ok(report.metrics.rejection_by_code.must_not_reveal_in_model_summary >= 1);
  assert.ok(report.metrics.rejection_by_code.forced_player_failure >= 1);
});
