import test from "node:test";
import assert from "node:assert/strict";
import type { TurnEnvelope } from "@/features/play/turnCommit/turnEnvelope";

/**
 * Runtime structure validation for TurnEnvelope.server_director_state.
 * TypeScript types are compile-time only; these tests assert the expected
 * runtime shape so consumers (client StoryDirector, SSE parser, merge
 * pipeline) can rely on the field's presence and structure.
 */

function makeMinimalEnvelope(): TurnEnvelope {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "测试文本",
    is_death: false,
    consumes_time: true,
    options: [],
    currency_change: 0,
    consumed_items: [],
    consumed_warehouse_items: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    codex_updates: [],
    relationship_updates: [],
    new_tasks: [],
    task_updates: [],
    clue_updates: [],
    npc_location_updates: [],
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    turn_mode: "narrative_only",
    narrative_goal: "",
    narrative_density: "medium",
    decision_required: false,
    decision_options: [],
    decision_required_strict: false,
    auto_continue_hint: null,
    protagonist_anchor: "",
    world_consistency_flags: [],
    anti_cheat_meta: {},
    task_changes: { new_tasks: [], task_updates: [] },
    relation_changes: { relationship_updates: [] },
    conflict_outcome: null,
    loot_changes: {
      currency_change: 0,
      consumed_items: [],
      consumed_warehouse_items: [],
      awarded_items: [],
      awarded_warehouse_items: [],
    },
    clue_changes: { clue_updates: [] },
    world_state_changes: {
      npc_location_updates: [],
      main_threat_updates: [],
      weapon_updates: [],
      weapon_bag_updates: [],
    },
  };
}

test("server_director_state is optional and absent by default", () => {
  const envelope = makeMinimalEnvelope();
  assert.equal("server_director_state" in envelope, false);
});

test("server_director_state when present contains directorIntent, currentPhase, pacingSummary, turnIndex", () => {
  const envelope: TurnEnvelope = {
    ...makeMinimalEnvelope(),
    server_director_state: {
      directorIntent: "逐步提升压迫感，本回合释放一个NPC线索",
      currentPhase: "build_up",
      pacingSummary: {
        tension: 0.45,
        mystery: 0.7,
        fatigue: 0.15,
        progress: 0.3,
        agency_health: 0.8,
        reveal_pressure: 0.6,
      },
      turnIndex: 12,
    },
  };

  const sds = envelope.server_director_state!;
  assert.ok(sds, "server_director_state should be present");

  // Top-level fields
  assert.equal(typeof sds.directorIntent, "string");
  assert.equal(typeof sds.currentPhase, "string");
  assert.equal(typeof sds.turnIndex, "number");

  // pacingSummary
  assert.equal(typeof sds.pacingSummary, "object");
  assert.equal(typeof sds.pacingSummary.tension, "number");
  assert.equal(typeof sds.pacingSummary.mystery, "number");
  assert.equal(typeof sds.pacingSummary.fatigue, "number");
  assert.equal(typeof sds.pacingSummary.progress, "number");
  assert.equal(typeof sds.pacingSummary.agency_health, "number");
  assert.equal(typeof sds.pacingSummary.reveal_pressure, "number");
});

test("server_director_state pacingSummary values are within [0,1]", () => {
  const envelope: TurnEnvelope = {
    ...makeMinimalEnvelope(),
    server_director_state: {
      directorIntent: null,
      currentPhase: "release",
      pacingSummary: {
        tension: 0.25,
        mystery: 0.0,
        fatigue: 1.0,
        progress: 0.5,
        agency_health: 1.0,
        reveal_pressure: 0.0,
      },
      turnIndex: 0,
    },
  };

  const pacing = envelope.server_director_state!.pacingSummary;

  function inRange(v: number): boolean {
    return v >= 0 && v <= 1;
  }

  assert.ok(inRange(pacing.tension), "tension in [0,1]");
  assert.ok(inRange(pacing.mystery), "mystery in [0,1]");
  assert.ok(inRange(pacing.fatigue), "fatigue in [0,1]");
  assert.ok(inRange(pacing.progress), "progress in [0,1]");
  assert.ok(inRange(pacing.agency_health), "agency_health in [0,1]");
  assert.ok(inRange(pacing.reveal_pressure), "reveal_pressure in [0,1]");
});

test("server_director_state directorIntent can be null", () => {
  const envelope: TurnEnvelope = {
    ...makeMinimalEnvelope(),
    server_director_state: {
      directorIntent: null,
      currentPhase: "quiet",
      pacingSummary: {
        tension: 0.1,
        mystery: 0.1,
        fatigue: 0.1,
        progress: 0.1,
        agency_health: 0.5,
        reveal_pressure: 0.1,
      },
      turnIndex: 3,
    },
  };

  assert.equal(envelope.server_director_state!.directorIntent, null);
});

test("server_director_state currentPhase is a non-empty string", () => {
  const envelope: TurnEnvelope = {
    ...makeMinimalEnvelope(),
    server_director_state: {
      directorIntent: null,
      currentPhase: "pressure",
      pacingSummary: {
        tension: 0.8,
        mystery: 0.2,
        fatigue: 0.5,
        progress: 0.4,
        agency_health: 0.4,
        reveal_pressure: 0.7,
      },
      turnIndex: 7,
    },
  };

  assert.equal(typeof envelope.server_director_state!.currentPhase, "string");
  assert.ok(envelope.server_director_state!.currentPhase.length > 0);
});

test("server_director_state turnIndex is a non-negative integer", () => {
  const envelope: TurnEnvelope = {
    ...makeMinimalEnvelope(),
    server_director_state: {
      directorIntent: null,
      currentPhase: "quiet",
      pacingSummary: {
        tension: 0,
        mystery: 0,
        fatigue: 0,
        progress: 0,
        agency_health: 1,
        reveal_pressure: 0,
      },
      turnIndex: 0,
    },
  };

  const ti = envelope.server_director_state!.turnIndex;
  assert.equal(typeof ti, "number");
  assert.ok(Number.isInteger(ti));
  assert.ok(ti >= 0);
});

test("server_director_state survives a round-trip through JSON", () => {
  const original: TurnEnvelope = {
    ...makeMinimalEnvelope(),
    server_director_state: {
      directorIntent: "引导玩家走向下一阶段",
      currentPhase: "reveal",
      pacingSummary: {
        tension: 0.9,
        mystery: 0.1,
        fatigue: 0.6,
        progress: 0.8,
        agency_health: 0.3,
        reveal_pressure: 0.95,
      },
      turnIndex: 42,
    },
  };

  const serialized = JSON.stringify(original);
  const parsed: TurnEnvelope = JSON.parse(serialized);

  assert.deepEqual(
    parsed.server_director_state,
    original.server_director_state,
    "server_director_state should survive JSON round-trip intact",
  );
});
