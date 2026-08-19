import assert from "node:assert/strict";
import test from "node:test";
import {
  assessJudgeEligibility,
  classifyRunEvidence,
  hasAuthenticLiveJudgeProvenance,
  hasRequiredDmFields,
  isFixedTemplateTranscript,
  isQualifiedLiveEvidence,
  resolveEvalExecutionMode,
} from "./runOutcome";

const eligible = assessJudgeEligibility({
  executionMode: "live_full",
  terminatedReason: "max_steps",
  executedSteps: 2,
  degradedSteps: 0,
  protocolComplete: true,
  requiredDmFieldsComplete: true,
});
const base = {
  executionMode: "live_full",
  terminatedReason: "max_steps",
  judgePassed: true,
  judgeMode: "live" as const,
  gameplayGatePassed: false,
  executedSteps: 2,
  plannedScenarioSteps: 6,
  eligibility: eligible,
};

test("zero-step, error, degraded, incomplete SSE and missing required DM fields are not judge eligible", () => {
  const common = { executionMode: "live_full", terminatedReason: "max_steps", executedSteps: 1, degradedSteps: 0, protocolComplete: true, requiredDmFieldsComplete: true };
  assert.deepEqual(assessJudgeEligibility({ ...common, executedSteps: 0 }), { eligible: false, status: "inconclusive", reason: "没有完成任何可评分回合" });
  assert.equal(assessJudgeEligibility({ ...common, terminatedReason: "error" }).status, "infrastructure_failure");
  assert.equal(assessJudgeEligibility({ ...common, executionMode: "live_degraded", degradedSteps: 1 }).status, "infrastructure_failure");
  assert.equal(assessJudgeEligibility({ ...common, protocolComplete: false }).status, "infrastructure_failure");
  assert.equal(assessJudgeEligibility({ ...common, requiredDmFieldsComplete: false }).status, "inconclusive");
});

test("required DM field validation checks the public minimum contract", () => {
  assert.equal(hasRequiredDmFields({ is_action_legal: true, sanity_damage: 0, narrative: "ok", is_death: false }), true);
  assert.equal(hasRequiredDmFields({ is_action_legal: true, sanity_damage: 0, narrative: "ok" }), false);
});

test("repeated fixed-template transcripts are not scoreable", () => {
  assert.equal(isFixedTemplateTranscript(["固定回复", " 固定回复 "]), true);
  assert.equal(isFixedTemplateTranscript(["第一回合", "第二回合"]), false);
  const result = assessJudgeEligibility({ executionMode: "live_full", terminatedReason: "max_steps", executedSteps: 2, degradedSteps: 0, protocolComplete: true, requiredDmFieldsComplete: true, fixedTemplateDetected: true });
  assert.equal(result.eligible, false);
  assert.equal(result.status, "inconclusive");
});

test("deliberately truncated specialist probe is inconclusive, not failed", () => {
  assert.equal(classifyRunEvidence(base), "inconclusive");
});

test("completed scenario missing its required outcome is a real failure", () => {
  assert.equal(classifyRunEvidence({ ...base, executedSteps: 6 }), "fail");
});

test("judge failure remains a quality failure only for eligible evidence", () => {
  assert.equal(classifyRunEvidence({ ...base, judgePassed: false }), "fail");
  const infrastructure = assessJudgeEligibility({ executionMode: "live_degraded", terminatedReason: "error", executedSteps: 0, degradedSteps: 1, protocolComplete: false, requiredDmFieldsComplete: false });
  assert.equal(classifyRunEvidence({ ...base, judgePassed: null, judgeMode: "none", eligibility: infrastructure }), "infrastructure_failure");
});

test("mock, codex and fallback judges cannot form a live pass", () => {
  assert.equal(classifyRunEvidence({ ...base, judgeMode: "mock" }), "inconclusive");
  assert.equal(classifyRunEvidence({ ...base, judgeMode: "codex" }), "inconclusive");
  assert.equal(classifyRunEvidence({ ...base, judgeMode: "fallback" }), "inconclusive");
});

test("passing gameplay gate with a real live judge is pass", () => {
  assert.equal(classifyRunEvidence({ ...base, gameplayGatePassed: true }), "pass");
});

test("only conclusive live_full plus live judge evidence enters live statistics", () => {
  assert.equal(isQualifiedLiveEvidence({ executionMode: "live_full", judgeMode: "live", judgeResult: { passed: true, judgeMode: "live" }, evidenceStatus: "pass" }), true);
  assert.equal(isQualifiedLiveEvidence({ executionMode: "mock_full", judgeMode: "mock", judgeResult: { passed: true, judgeMode: "mock" }, evidenceStatus: "pass" }), false);
  assert.equal(isQualifiedLiveEvidence({ executionMode: "live_full", judgeMode: "live", judgeResult: null, evidenceStatus: "inconclusive" }), false);
});

test("outer live label cannot promote a fallback judge result", () => {
  const fallback = { passed: true, overallScore: 5, judgeMode: "fallback" };
  assert.equal(hasAuthenticLiveJudgeProvenance(fallback), false);
  assert.equal(isQualifiedLiveEvidence({ executionMode: "live_full", judgeMode: "live", judgeResult: fallback, evidenceStatus: "pass" }), false);
});

test("missing final / transport error can never be labeled live_full", () => {
  assert.equal(resolveEvalExecutionMode({ live: true, degradedSteps: 0, terminatedReason: "error" }), "live_degraded");
  assert.equal(resolveEvalExecutionMode({ live: true, degradedSteps: 0, terminatedReason: "max_steps" }), "live_full");
  assert.equal(resolveEvalExecutionMode({ live: false, degradedSteps: 3, terminatedReason: "error" }), "mock_full");
});
