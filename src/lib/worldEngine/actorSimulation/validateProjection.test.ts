// src/lib/worldEngine/actorSimulation/validateProjection.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateActorProjection } from "./validateProjection";
import type { ActorProjection } from "./types";

const REGISTERED_NPCS = new Set(["N-001", "N-002", "N-003"]);
const REGISTERED_LOCATIONS = new Set(["1F_Lobby", "2F_Hallway", "3F_Room"]);
const ALLOWED_FACTS = new Set(["fact_001", "fact_002", "fact_003"]);
const FORBIDDEN_FACTS = new Set<string>();

function makeProjection(overrides: Partial<ActorProjection> = {}): ActorProjection {
  return {
    schemaVersion: "actor_projection_v1",
    simulationId: "sim-001",
    npcId: "N-001",
    knownFactIdsUsed: ["fact_001"],
    suspectedFactIdsUsed: [],
    intent: "NPC wants to patrol the hallway",
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

describe("validateActorProjection", () => {
  it("accepts a valid projection", () => {
    const result = validateActorProjection({
      projection: makeProjection(),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
      registeredLocationIds: REGISTERED_LOCATIONS,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.issues.length, 0);
  });

  it("rejects unregistered NPC", () => {
    const result = validateActorProjection({
      projection: makeProjection({ npcId: "N-999" }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((i) => i.code === "unregistered_npc"), true);
  });

  it("rejects forbidden fact usage", () => {
    const result = validateActorProjection({
      projection: makeProjection({ knownFactIdsUsed: ["fact_999"] }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((i) => i.code === "forbidden_fact_used"), true);
  });

  it("rejects dm-only fact in projection", () => {
    const result = validateActorProjection({
      projection: makeProjection({ knownFactIdsUsed: ["dm_secret_truth"] }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: new Set(["dm_secret_truth"]),
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((i) => i.code === "dm_only_fact_in_projection"), true);
  });

  it("rejects impossible location", () => {
    const result = validateActorProjection({
      projection: makeProjection({
        candidateActions: [{
          actionCode: "move",
          targetNpcIds: [],
          targetLocationId: "Mars_Base",
          preconditionFactIds: [],
          expectedEffectCode: "arrived",
          playerAgencyConstraint: "observation_only",
          confidence: 0.5,
        }],
      }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
      registeredLocationIds: REGISTERED_LOCATIONS,
    });
    assert.equal(result.issues.some((i) => i.code === "location_impossible"), true);
  });

  it("rejects forced player action", () => {
    const result = validateActorProjection({
      projection: makeProjection({
        candidateActions: [{
          actionCode: "force_player",
          targetNpcIds: [],
          targetLocationId: null,
          preconditionFactIds: [],
          expectedEffectCode: "player_forced",
          playerAgencyConstraint: "player_must_react",
          confidence: 0.9,
        }],
      }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((i) => i.code === "forced_player_action"), true);
  });

  it("rejects forced player failure", () => {
    const result = validateActorProjection({
      projection: makeProjection({
        candidateActions: [{
          actionCode: "kill_player",
          targetNpcIds: [],
          targetLocationId: null,
          preconditionFactIds: [],
          expectedEffectCode: "player_defeat",
          playerAgencyConstraint: "player_must_react",
          confidence: 1.0,
        }],
      }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((i) => i.code === "forced_player_failure"), true);
  });

  it("rejects reveal tier breach", () => {
    const result = validateActorProjection({
      projection: makeProjection({ knownFactIdsUsed: ["root_truth_tier_3"] }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: new Set(["root_truth_tier_3"]),
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.issues.some((i) => i.code === "reveal_tier_breach"), true);
  });

  it("flags missing source when actions exist but no facts cited", () => {
    const result = validateActorProjection({
      projection: makeProjection({ knownFactIdsUsed: [] }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.issues.some((i) => i.code === "missing_source"), true);
    // Evidence-free actions are blocked rather than treated as low-risk invention.
    assert.equal(result.accepted, false);
  });

  it("accepts projection with zero actions (no-op NPC)", () => {
    const result = validateActorProjection({
      projection: makeProjection({
        candidateActions: [],
        blockedReason: "No feasible actions this tick",
      }),
      registeredNpcIds: REGISTERED_NPCS,
      allowedKnownFactIds: ALLOWED_FACTS,
      forbiddenFactIds: FORBIDDEN_FACTS,
    });
    assert.equal(result.accepted, true);
  });
});
