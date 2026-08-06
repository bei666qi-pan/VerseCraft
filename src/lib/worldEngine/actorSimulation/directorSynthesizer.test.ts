// src/lib/worldEngine/actorSimulation/directorSynthesizer.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { synthesizeDirectorPlan } from "./directorSynthesizer";
import type { ActorProjection } from "./types";

const REGISTERED_NPCS = new Set(["N-001", "N-002", "N-003"]);

function makeProjection(overrides: Partial<ActorProjection> = {}): ActorProjection {
  return {
    schemaVersion: "actor_projection_v1",
    simulationId: "sim-100",
    npcId: "N-001",
    knownFactIdsUsed: ["fact_001"],
    suspectedFactIdsUsed: [],
    intent: "NPC wants to patrol",
    candidateActions: [{
      actionCode: "patrol",
      targetNpcIds: [],
      targetLocationId: "2F_Hallway",
      preconditionFactIds: [],
      expectedEffectCode: "presence_established",
      playerAgencyConstraint: "player_can_ignore_or_avoid",
      confidence: 0.8,
    }],
    mustNotRevealIds: [],
    blockedReason: null,
    confidence: 0.8,
    ...overrides,
  };
}

describe("synthesizeDirectorPlan", () => {
  it("synthesizes single projection into safe actions", () => {
    const result = synthesizeDirectorPlan({
      projections: [makeProjection()],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.safeCandidateActions.length, 1);
    assert.equal(result.safeCandidateActions[0].npcId, "N-001");
    assert.equal(result.safeCandidateActions[0].actionCode, "patrol");
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.discardedActions.length, 0);
  });

  it("detects location conflict between two NPCs at same location", () => {
    const p1 = makeProjection({
      npcId: "N-001",
      candidateActions: [{
        actionCode: "patrol",
        targetNpcIds: [],
        targetLocationId: "2F_Hallway",
        preconditionFactIds: [],
        expectedEffectCode: "presence_established",
        playerAgencyConstraint: "player_can_ignore_or_avoid",
        confidence: 0.8,
      }],
    });
    const p2 = makeProjection({
      npcId: "N-002",
      candidateActions: [{
        actionCode: "search",
        targetNpcIds: [],
        targetLocationId: "2F_Hallway",
        preconditionFactIds: [],
        expectedEffectCode: "item_found",
        playerAgencyConstraint: "observation_only",
        confidence: 0.7,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p1, p2],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.conflicts.length > 0, true);
    assert.equal(result.conflicts.some((c) => c.type === "location_conflict"), true);
    // Both actions should still be safe (conflicted but not discarded)
    assert.equal(result.safeCandidateActions.length, 2);
  });

  it("detects duplicate event conflict", () => {
    const action = {
      actionCode: "block_door",
      targetNpcIds: [],
      targetLocationId: "2F_Hallway",
      preconditionFactIds: [],
      expectedEffectCode: "door_blocked",
      playerAgencyConstraint: "player_can_ignore_or_avoid" as const,
      confidence: 0.9,
    };
    const p1 = makeProjection({ npcId: "N-001", candidateActions: [action] });
    const p2 = makeProjection({ npcId: "N-002", candidateActions: [{ ...action }] });

    const result = synthesizeDirectorPlan({
      projections: [p1, p2],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.conflicts.some((c) => c.type === "duplicate_event"), true);
  });

  it("detects target conflict when multiple NPCs target same NPC", () => {
    const p1 = makeProjection({
      npcId: "N-001",
      candidateActions: [{
        actionCode: "threaten",
        targetNpcIds: ["N-003"],
        targetLocationId: null,
        preconditionFactIds: [],
        expectedEffectCode: "intimidation",
        playerAgencyConstraint: "observation_only",
        confidence: 0.7,
      }],
    });
    const p2 = makeProjection({
      npcId: "N-002",
      candidateActions: [{
        actionCode: "protect",
        targetNpcIds: ["N-003"],
        targetLocationId: null,
        preconditionFactIds: [],
        expectedEffectCode: "protected",
        playerAgencyConstraint: "player_can_ignore_or_avoid",
        confidence: 0.8,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p1, p2],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.conflicts.some((c) => c.type === "target_conflict"), true);
  });

  it("discards unregistered NPC actions", () => {
    const p = makeProjection({
      npcId: "N-999",
      candidateActions: [{
        actionCode: "walk",
        targetNpcIds: [],
        targetLocationId: "1F_Lobby",
        preconditionFactIds: [],
        expectedEffectCode: "arrived",
        playerAgencyConstraint: "observation_only",
        confidence: 0.5,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.safeCandidateActions.length, 0);
    assert.equal(result.discardedActions.length, 1);
    assert.equal(result.discardedActions[0].reason, "unregistered_npc");
  });

  it("discards action with unregistered target NPC", () => {
    const p = makeProjection({
      npcId: "N-001",
      candidateActions: [{
        actionCode: "greet",
        targetNpcIds: ["N-999"],
        targetLocationId: null,
        preconditionFactIds: [],
        expectedEffectCode: "greeting_exchanged",
        playerAgencyConstraint: "observation_only",
        confidence: 0.5,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.discardedActions.length, 1);
    assert.equal(result.discardedActions[0].reason, "unregistered_target:N-999");
  });

  it("demotes player_must_react to player_can_ignore_or_avoid", () => {
    const p = makeProjection({
      npcId: "N-001",
      candidateActions: [{
        actionCode: "ambush",
        targetNpcIds: [],
        targetLocationId: null,
        preconditionFactIds: [],
        expectedEffectCode: "ambush_prepared",
        playerAgencyConstraint: "player_must_react",
        confidence: 0.9,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.safeCandidateActions.length, 1);
    assert.equal(result.safeCandidateActions[0].playerAgencyConstraint, "player_can_ignore_or_avoid");
  });

  it("checks must-not-reveal in actionable text", () => {
    const p = makeProjection({
      npcId: "N-001",
      mustNotRevealIds: ["secret_truth"],
      candidateActions: [{
        actionCode: "reveal_secret_truth",
        targetNpcIds: [],
        targetLocationId: null,
        preconditionFactIds: [],
        expectedEffectCode: "secret_revealed",
        playerAgencyConstraint: "observation_only",
        confidence: 0.5,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.discardedActions.length, 1);
    assert.equal(result.discardedActions[0].reason, "must_not_reveal_leaked");
  });

  it("produces summary with all stats", () => {
    const result = synthesizeDirectorPlan({
      projections: [makeProjection()],
      rejectedProjections: [{ npcId: "N-002", reason: "timeout" }],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.summary.includes("1 safe actions"), true);
    assert.equal(result.summary.includes("projections rejected"), true);
  });

  it("handles empty projections gracefully", () => {
    const result = synthesizeDirectorPlan({
      projections: [],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.safeCandidateActions.length, 0);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.injectionHint, null);
  });

  it("builds injection hint with NPC grouping", () => {
    const p1 = makeProjection({
      npcId: "N-001",
      candidateActions: [{
        actionCode: "patrol",
        targetNpcIds: [],
        targetLocationId: "2F_Hallway",
        preconditionFactIds: [],
        expectedEffectCode: "presence_established",
        playerAgencyConstraint: "player_can_ignore_or_avoid",
        confidence: 0.8,
      }],
    });
    const p2 = makeProjection({
      npcId: "N-002",
      candidateActions: [{
        actionCode: "search",
        targetNpcIds: [],
        targetLocationId: "3F_Room",
        preconditionFactIds: [],
        expectedEffectCode: "clue_found",
        playerAgencyConstraint: "observation_only",
        confidence: 0.6,
      }],
    });

    const result = synthesizeDirectorPlan({
      projections: [p1, p2],
      rejectedProjections: [],
      registeredNpcIds: REGISTERED_NPCS,
    });

    assert.equal(result.injectionHint !== null, true);
    assert.equal(result.injectionHint!.includes("N-001"), true);
    assert.equal(result.injectionHint!.includes("N-002"), true);
  });
});
