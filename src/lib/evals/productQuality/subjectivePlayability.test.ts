import assert from "node:assert/strict";
import test from "node:test";
import { assessSubjectivePlayabilityProxy } from "./subjectivePlayability";

const transcript = (steps: Array<Record<string, unknown>>) => ({ runId: "r", steps, initialState: {}, finalState: {}, persona: "explorer", seed: 1, terminatedReason: "max_steps", totalSteps: steps.length, durationMs: 1 }) as any;

test("subjective proxy is explicitly low-confidence and rewards resolved action", () => {
  const result = assessSubjectivePlayabilityProxy(transcript([{ playerAction: "攻击阴影", narrative: "铁管击中阴影，裂口却在下一秒重新合拢。它仍未退去！", dmJson: { is_action_legal: true, main_threat_updates: [{ phase: "suppressed" }] } }]));
  assert.equal(result.source, "heuristic_proxy");
  assert.ok(result.confidence < 0.5);
  assert.equal(result.dimensions.actionPayoff, 5);
  assert.ok(result.limitations.some((item) => item.includes("真人")));
});

test("empty transcript cannot look fun", () => {
  const result = assessSubjectivePlayabilityProxy(transcript([]));
  assert.equal(result.overallScore5, 1);
});

test("explicit idempotent refusal counts as resolved payoff instead of a dead mutation", () => {
  const result = assessSubjectivePlayabilityProxy(transcript([{ playerAction: "再次提交试炼记录", narrative: "同一份记录不会重复完成、重复认证或重复发放奖励。", dmJson: { is_action_legal: true } }]));
  assert.equal(result.dimensions.actionPayoff, 5);
  assert.ok(result.evidence.includes("mutation_payoff=1/1"));
});

test("deterministic service audits do not dilute story-facing playability", () => {
  const result = assessSubjectivePlayabilityProxy(transcript([
    { playerAction: "检查状态", narrative: "状态未变化。", dmJson: { security_meta: { deterministic_service_fast_lane: true } } },
    { playerAction: "攻击阴影", narrative: "铁管击中阴影，它暂时退开——可门后的脚步声还没有停！", dmJson: { conflict_outcome: { outcomeTier: "partial_success" } } },
  ]));
  assert.ok(result.evidence.includes("beat_turns=1/1"));
  assert.equal(result.dimensions.continueDesire, 5);
});
