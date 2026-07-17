import assert from "node:assert/strict";
import test from "node:test";
import { SCENARIOS } from "@/lib/evals/playthrough/scenarios";
import { featureDecision, featureDecisionWithConfidence, inferScenarioFeatures, planAdaptiveFeatureTests, wilsonInterval, type FeatureEvidence } from "./adaptivePlanner";

const emptyEvidence = (): FeatureEvidence => ({ tasks: { touchedTurns: 0, progressionTurns: 0 }, weapons: { touchedTurns: 0, progressionTurns: 0 }, combat: { touchedTurns: 0, progressionTurns: 0 }, codex: { touchedTurns: 0, progressionTurns: 0 }, economy: { touchedTurns: 0, progressionTurns: 0 }, profession: { touchedTurns: 0, progressionTurns: 0 }, location: { touchedTurns: 0, progressionTurns: 0 } });

test("scenario feature inference covers core specialist scenarios", () => {
  assert.ok(inferScenarioFeatures(SCENARIOS.find((x) => x.id === "happy-combat-loop")!).includes("combat"));
  assert.ok(inferScenarioFeatures(SCENARIOS.find((x) => x.id === "profession-progression")!).includes("profession"));
  assert.ok(inferScenarioFeatures(SCENARIOS.find((x) => x.id === "quest-lifecycle")!).includes("tasks"));
});

test("Wilson gates forbid deletion-like decisions on small samples", () => {
  assert.equal(featureDecision({ touchedTurns: 19, progressionTurns: 0 }), "insufficient_evidence");
  assert.equal(featureDecision({ touchedTurns: 50, progressionTurns: 40 }), "keep");
  assert.equal(featureDecision({ touchedTurns: 50, progressionTurns: 0 }), "simplify_experiment_candidate");
  const interval = wilsonInterval(0, 50)!;
  assert.ok(interval.upper < 0.1);
});

test("featureDecisionWithConfidence surfaces statistical interval and judge-weighted confidence", () => {
  const low = featureDecisionWithConfidence({ touchedTurns: 5, progressionTurns: 0 });
  const stable = featureDecisionWithConfidence({ touchedTurns: 60, progressionTurns: 45 }, 0.9);
  assert.equal(low.decision, "insufficient_evidence");
  assert.equal(stable.decision, "keep");
  assert.ok(low.confidence < 0.5);
  assert.ok(stable.confidence > 0.75);
  assert.ok(stable.interval !== null && stable.interval.lower <= stable.interval.upper);
  assert.ok(stable.rationale.some((item) => item.startsWith("judgeConfidence=")));
});

test("no judge signal should remain explicitly conservative", () => {
  const noJudge = featureDecisionWithConfidence({ touchedTurns: 60, progressionTurns: 45 });
  assert.ok(noJudge.rationale.some((item) => item.includes("hasJudgeEvidence=false")));
  assert.ok(noJudge.confidence < 0.75);
});

test("adaptive planner never exceeds live call budget and prioritizes evidence gaps", () => {
  const evidence = emptyEvidence();
  evidence.weapons = { touchedTurns: 20, progressionTurns: 20 };
  evidence.location = { touchedTurns: 20, progressionTurns: 20 };
  const plan = planAdaptiveFeatureTests({ evidence, scenarios: SCENARIOS, maxCalls: 12, maxStepsPerScenario: 6 });
  assert.ok(plan.estimatedCalls <= 12);
  assert.ok(plan.plans.length > 0);
  assert.ok(plan.plans.every((item) => (SCENARIOS.find((scenario) => scenario.id === item.scenarioId)?.scriptedActions?.length ?? 0) >= item.maxSteps));
  assert.ok(plan.plans.every((item) => !item.features.every((feature) => feature === "weapons" || feature === "location")));
});

test("adaptive planner prefers scenarios with explicit gameplay outcome gates over generic prose probes", () => {
  const evidence = emptyEvidence();
  evidence.tasks = { touchedTurns: 7, progressionTurns: 1 };
  evidence.codex = { touchedTurns: 0, progressionTurns: 0 };
  evidence.location = { touchedTurns: 1, progressionTurns: 0 };
  evidence.weapons = { touchedTurns: 20, progressionTurns: 10 };
  evidence.combat = { touchedTurns: 20, progressionTurns: 10 };
  evidence.economy = { touchedTurns: 20, progressionTurns: 10 };
  evidence.profession = { touchedTurns: 20, progressionTurns: 10 };
  const plan = planAdaptiveFeatureTests({ evidence, scenarios: SCENARIOS, maxCalls: 6, maxStepsPerScenario: 6 });
  assert.ok(["task-codex-location-flow", "profession-trial-delivery-commit"].includes(plan.plans[0]?.scenarioId ?? ""));
});
