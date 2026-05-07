import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRouteModelOutputFromResolvedTurn,
  buildRouteNarrativeCheckResult,
} from "./routeAdapter";
import type { NarrativeValidationReport } from "./checker";
import type { TurnCommitSummary } from "./committer";

const narrativeGovernanceTelemetry = {
  styleIssueCount: 0,
  styleDriftCount: 0,
  mechanicalExpositionCount: 0,
  npcKnowledgeIssueCount: 0,
  rootCauseLeakCount: 0,
  unsupportedFactCount: 0,
  unsupportedRelationshipClaimCount: 0,
  factCommitRejectedCount: 0,
  narrativeGovernanceFinalSafe: true,
};

describe("routeAdapter", () => {
  it("maps a resolved DM turn into a narrative engine model output", () => {
    const output = buildRouteModelOutputFromResolvedTurn({
      latestUserInput: "check the door",
      resolved: {
        narrative: "You inspect the door and notice a scratched plate.",
        options: ["read plate", "touch handle"],
        player_location: "B1_corridor",
        sanity_damage: 2,
        consumes_time: true,
        relationship_updates: [{ npcId: "N-001", delta: 1 }],
      },
    });

    assert.equal(output.narrative, "You inspect the door and notice a scratched plate.");
    assert.equal(output.turnMode, "decision_required");
    assert.deepEqual(output.decisionOptions, ["read plate", "touch handle"]);
    assert.equal(output.stateChanges.playerLocation, "B1_corridor");
    assert.equal(output.stateChanges.sanityDelta, -2);
    assert.equal(output.stateChanges.timeCost, "standard");
    assert.equal(output.eventCandidates[0]?.type, "player_action");
    assert.equal(output.eventCandidates[1]?.type, "npc_reply");
  });

  it("keeps legacy validator degradation visible to the narrative ledger", () => {
    const output = buildRouteModelOutputFromResolvedTurn({
      latestUserInput: "look",
      resolved: { narrative: "A safe scene response." },
    });
    const check = buildRouteNarrativeCheckResult({
      output,
      validatorReport: validationReport({
        ok: false,
        issues: [
          {
            code: "reveal_tier_breach",
            severity: "medium",
            detail: "gated=1",
          },
        ],
      }),
      commitSummary: commitSummary({ degraded: false }),
    });

    assert.equal(check.ok, true);
    assert.equal(check.safeOutput, output);
    assert.equal(check.issues[0]?.severity, "warn");
    assert.equal(check.issues[0]?.code, "reveal_tier_breach");
  });

  it("adds a block issue when the existing commit step degraded without validator issues", () => {
    const output = buildRouteModelOutputFromResolvedTurn({
      latestUserInput: "look",
      resolved: { narrative: "A safe scene response." },
    });
    const check = buildRouteNarrativeCheckResult({
      output,
      validatorReport: validationReport({ ok: true, issues: [] }),
      commitSummary: commitSummary({ degraded: true }),
    });

    assert.equal(check.ok, false);
    assert.equal(check.degradeReason, "legacy_commit_degraded");
    assert.equal(check.issues[0]?.severity, "block");
  });
});

function validationReport(overrides: Partial<NarrativeValidationReport>): NarrativeValidationReport {
  return {
    ok: true,
    issues: [],
    optionsOverride: null,
    narrativeOverride: null,
    telemetry: {
      totalIssues: overrides.issues?.length ?? 0,
      byCode: {},
      ...narrativeGovernanceTelemetry,
      optionsOverrideApplied: false,
      safeNarrativeFallbackApplied: false,
    },
    ...overrides,
  };
}

function commitSummary(overrides: Partial<TurnCommitSummary>): TurnCommitSummary {
  return {
    requestId: "req-1",
    sessionId: "session-1",
    turnIndex: 1,
    isActionLegal: true,
    degraded: false,
    optionsRewriteApplied: false,
    safeNarrativeFallbackApplied: false,
    playerLocation: null,
    deltaSummary: {
      consumesTime: false,
      timeCost: null,
      sanityDamage: 0,
      hpDelta: null,
      originiumDelta: null,
      isDeath: false,
      npcLocationUpdates: 0,
      npcAttitudeUpdates: 0,
      taskUpdates: 0,
      newTasks: 0,
    },
    validatorIssueCounts: {},
    commitFlags: ["post_validator_ok"],
    ...overrides,
    narrativeGovernanceTelemetry: overrides.narrativeGovernanceTelemetry ?? narrativeGovernanceTelemetry,
  };
}
