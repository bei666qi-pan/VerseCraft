import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPacingCandidateFromDmRecord,
  normalizeBeatState,
  validatePacing,
  type PacingInput,
} from "@/lib/turnEngine/pacing";
import type { StateDelta } from "@/lib/turnEngine/types";
import type { PacingWorldFact } from "@/lib/turnEngine/pacing/types";

function delta(overrides: Partial<StateDelta> = {}): StateDelta {
  return {
    isActionLegal: true,
    illegalReasons: [],
    consumesTime: true,
    timeCost: "standard",
    sanityDamage: 0,
    isDeath: false,
    npcLocationUpdates: [],
    npcAttitudeUpdates: [],
    taskUpdates: [],
    newTasks: [],
    mustDegrade: false,
    ...overrides,
  };
}

const ROOT_FACT: PacingWorldFact = {
  factId: "fact:root:truth",
  category: "apartment_root",
  truthLevel: "canon",
  revealTier: 3,
};

const EVENT_FACT: PacingWorldFact = {
  factId: "fact:event:door",
  category: "event",
  truthLevel: "canon",
  revealTier: 0,
};

const LOCATION_FACT: PacingWorldFact = {
  factId: "fact:location:b2",
  category: "location",
  truthLevel: "canon",
  revealTier: 1,
};

const NPC_FACT: PacingWorldFact = {
  factId: "fact:npc:deep-role",
  category: "npc",
  truthLevel: "canon",
  revealTier: 2,
};

function validate(overrides: Partial<PacingInput>): ReturnType<typeof validatePacing> {
  return validatePacing({
    lane: "RULE",
    candidate: {},
    stateDelta: delta(),
    allowedFactIds: [],
    worldFacts: [ROOT_FACT, EVENT_FACT, LOCATION_FACT, NPC_FACT],
    ...overrides,
  });
}

test("normalizeBeatState maps director hints to server beat states", () => {
  assert.equal(normalizeBeatState("quiet"), "setup");
  assert.equal(normalizeBeatState("pressure"), "rising");
  assert.equal(normalizeBeatState("collision"), "choice");
  assert.equal(normalizeBeatState("peak"), "peak");
  assert.equal(normalizeBeatState("aftershock"), "aftermath");
});

test("consecutive peak plus major reveal fails", () => {
  const report = validate({
    lane: "RULE",
    previousSnapshot: { beatState: "peak", consecutivePeakTurns: 1, majorRevealCooldown: 0 },
    candidate: {
      beatState: "peak",
      usedFactIds: [ROOT_FACT.factId],
      isMajorReveal: true,
    },
    allowedFactIds: [ROOT_FACT.factId],
  });

  assert.equal(report.maxSeverity, "high");
  assert.ok(report.issues.some((issue) => issue.code === "consecutive_peak"));
  assert.ok(report.issues.some((issue) => issue.code === "major_reveal_requires_reveal_lane"));
});

test("cooldown forbids new root cause facts", () => {
  const report = validate({
    lane: "REVEAL",
    previousSnapshot: { beatState: "cooldown", majorRevealCooldown: 0 },
    candidate: { usedFactIds: [ROOT_FACT.factId] },
    allowedFactIds: [ROOT_FACT.factId],
  });

  assert.equal(report.maxSeverity, "high");
  assert.ok(report.issues.some((issue) => issue.code === "cooldown_major_fact_forbidden"));
});

test("cooldown forbids new major NPC or faction candidate facts", () => {
  const report = validate({
    lane: "RULE",
    previousSnapshot: { beatState: "cooldown", majorRevealCooldown: 0 },
    candidate: {
      candidateNewFacts: [
        {
          text: "A new faction-backed NPC steps into canon.",
          category: "npc",
          confidence: 0.9,
          proposed_source: "model",
        },
      ],
    },
  });

  assert.equal(report.maxSeverity, "high");
  assert.ok(report.issues.some((issue) => issue.code === "cooldown_major_fact_forbidden"));
});

test("FAST lane root truth fact is high severity", () => {
  const report = validate({
    lane: "FAST",
    candidate: { usedFactIds: [ROOT_FACT.factId] },
    allowedFactIds: [ROOT_FACT.factId],
  });

  assert.equal(report.maxSeverity, "high");
  assert.ok(report.issues.some((issue) => issue.code === "strong_fact_budget_exceeded"));
});

test("RULE lane flags three strong facts over budget", () => {
  const report = validate({
    lane: "RULE",
    candidate: {
      usedFactIds: [EVENT_FACT.factId, LOCATION_FACT.factId, NPC_FACT.factId],
    },
    allowedFactIds: [EVENT_FACT.factId, LOCATION_FACT.factId, NPC_FACT.factId],
  });

  assert.equal(report.maxSeverity, "high");
  assert.ok(report.issues.some((issue) => issue.code === "strong_fact_budget_exceeded"));
  assert.equal(report.telemetry.strongFactCount, 3);
});

test("REVEAL allowed fact with satisfied cooldown and clue gate passes", () => {
  const report = validate({
    lane: "REVEAL",
    previousSnapshot: {
      beatState: "rising",
      majorRevealCooldown: 0,
      prerequisiteClueCount: 2,
      completedTaskIds: ["task:gate-open"],
    },
    revealBudget: {
      requiredPrerequisiteClues: 2,
      prerequisiteTaskIds: ["task:gate-open"],
      majorRevealCooldown: 0,
    },
    candidate: {
      beatState: "rising",
      usedFactIds: [ROOT_FACT.factId],
      isMajorReveal: true,
    },
    allowedFactIds: [ROOT_FACT.factId],
  });

  assert.equal(report.ok, true);
  assert.equal(report.maxSeverity, null);
  assert.deepEqual(report.issues, []);
});

test("task completion narrative without task delta is not a pacing issue", () => {
  const candidate = buildPacingCandidateFromDmRecord({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "The task is complete.",
    is_death: false,
    options: ["Continue"],
  });
  const report = validate({
    lane: "RULE",
    candidate,
    stateDelta: delta({ taskUpdates: [], newTasks: [] }),
  });

  assert.equal(report.ok, true);
  assert.ok(!report.issues.some((issue) => issue.code === "choice_without_consequence_delta"));
});

test("key choice resolution requires a consequence delta", () => {
  const report = validate({
    lane: "RULE",
    previousSnapshot: { beatState: "choice" },
    candidate: { isKeyChoiceResolution: true },
    stateDelta: delta({ consumesTime: false, timeCost: "free" }),
  });

  assert.equal(report.maxSeverity, "high");
  assert.ok(report.issues.some((issue) => issue.code === "choice_without_consequence_delta"));
});

test("model-proposed beat state is telemetry only", () => {
  const candidate = buildPacingCandidateFromDmRecord({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "A quiet beat.",
    is_death: false,
    options: ["Continue"],
    dm_change_set: { beat_state: "peak" },
  });
  const report = validate({
    lane: "RULE",
    candidate,
    stateDelta: delta(),
  });

  assert.equal(report.maxSeverity, "low");
  assert.ok(report.issues.some((issue) => issue.code === "model_pacing_state_candidate"));
});
