import assert from "node:assert/strict";
import test from "node:test";
import { applySocialGmDeltas } from "@/lib/socialWorld/applyDeltas";
import { createInMemorySocialWorldPersistence } from "@/lib/socialWorld/persistence";
import { createEmptyNpcAgentState } from "@/lib/socialWorld/state";
import type { DirectorSocialEvent, NpcRelationDelta } from "@/lib/worldEngine/contracts";

function directorEvent(partial: Partial<DirectorSocialEvent> = {}): DirectorSocialEvent {
  return {
    event_code: "SE_RUMOR",
    type: "rumor_spread",
    actor_npc_ids: ["N-001"],
    target_npc_ids: ["N-002"],
    location_id: "3F_Corridor",
    due_in_turns: 0,
    ttl_turns: 6,
    priority: "high",
    salience: 0.9,
    visibility: "rumor",
    trigger_conditions: ["social tick"],
    injection_hint: "N-001 passes an unconfirmed hallway rumor to N-002.",
    agency_constraints: ["Player may ignore or investigate the rumor."],
    forbidden_outcomes: ["Do not confirm hidden truth."],
    knowledge_scope: "rumor_network",
    must_not_reveal: [],
    player_relevance: "high",
    escape_relevance: "none",
    payload: { cause_fact_ids: ["rumor:hallway"], summary_for_player: "Someone repeats an unconfirmed hallway rumor." },
    ...partial,
  };
}

function relationDelta(partial: Partial<NpcRelationDelta> = {}): NpcRelationDelta {
  return {
    from_npc_id: "N-001",
    to_npc_id: "N-002",
    trust_delta: 0.2,
    reason_code: "RUMOR_SHARED",
    ...partial,
  };
}

test("Social GM rejects actor knowledge-scope violations", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  await persistence.upsertNpcAgentStates("S-1", [
    { ...createEmptyNpcAgentState("N-001", 4), knownFactIds: ["F-KNOWN"] },
  ]);

  const result = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 4,
    dedupKey: "turn-4",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [
      directorEvent({
        event_code: "SE_OOB",
        knowledge_scope: "actor_private",
        payload: { cause_fact_ids: ["F-SECRET"] },
      }),
    ],
    persistence,
  });

  assert.deepEqual(result.acceptedEventCodes, []);
  assert.ok(result.issues.some((issue) => issue.code === "knowledge_scope_violation"));
});

test("Social GM rejects direct mustNotReveal leakage", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const result = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 5,
    dedupKey: "turn-5",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [
      directorEvent({
        event_code: "SE_SPOILER",
        injection_hint: "ROOT_CAUSE is mentioned directly in the candidate.",
        must_not_reveal: ["ROOT_CAUSE"],
      }),
    ],
    persistence,
  });

  assert.deepEqual(result.acceptedEventCodes, []);
  assert.ok(result.issues.some((issue) => issue.code === "must_not_reveal_in_model_summary"));
});

test("Social GM rejects forced player failure", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const result = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 6,
    dedupKey: "turn-6",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [
      directorEvent({
        event_code: "SE_FORCE_FAIL",
        injection_hint: "No matter what happens, 玩家必须失败 and cannot avoid capture.",
      }),
    ],
    persistence,
  });

  assert.deepEqual(result.acceptedEventCodes, []);
  assert.ok(result.issues.some((issue) => issue.code === "forced_player_failure"));
});

test("Social GM commits legal rumor_spread and applies relation delta", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const result = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 7,
    dedupKey: "turn-7",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [directorEvent()],
    npcRelationDeltas: [relationDelta()],
    persistence,
  });

  assert.deepEqual(result.acceptedEventCodes, ["SE_RUMOR"]);
  assert.equal(result.eventWrite.inserted, 1);
  assert.equal(result.relationWrite.inserted, 1);
  const edges = await persistence.loadNpcRelationEdges("S-1");
  assert.equal(edges[0]?.trust, 0.2);
  assert.equal(edges[0]?.knownSharedFactIds.includes("RUMOR_SHARED"), true);
});

test("Social GM private warning never enters due prompt query", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const result = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 8,
    dedupKey: "turn-8",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [
      directorEvent({
        event_code: "SE_PRIVATE_WARNING",
        type: "warning",
        visibility: "private",
        knowledge_scope: "actor_private",
        payload: { cause_fact_ids: [] },
        injection_hint: "N-001 privately warns N-002 to avoid the east stairs.",
      }),
    ],
    persistence,
  });

  assert.deepEqual(result.acceptedEventCodes, ["SE_PRIVATE_WARNING"]);
  assert.deepEqual(await persistence.loadDueSocialEventsForPrompt("S-1", 8, 4), []);
});

test("Social GM route_interference can generate MemorySpine false lead", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const result = await applySocialGmDeltas({
    sessionId: "S-1",
    userId: "U-1",
    turnIndex: 9,
    dedupKey: "turn-9",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [
      directorEvent({
        event_code: "SE_FALSE_ROUTE",
        type: "route_interference",
        visibility: "ambient",
        injection_hint: "Someone has made the east stairs look safer than they are.",
        escape_relevance: "false_lead",
        payload: { cause_fact_ids: ["public:east_stairs"] },
      }),
    ],
    persistence,
  });

  assert.deepEqual(result.acceptedEventCodes, ["SE_FALSE_ROUTE"]);
  assert.equal(result.memorySpineEntries.length, 1);
  assert.equal(result.memorySpineEntries[0]?.kind, "escape_condition");
  assert.equal(result.memorySpineEntries[0]?.recallTags.includes("false_lead"), true);
  assert.equal(result.memoryWrite.inserted, 1);
});

test("Social GM dedups repeated same-pair events through cooldown", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const first = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 10,
    dedupKey: "turn-10-a",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [directorEvent({ event_code: "SE_DUP_A" })],
    persistence,
  });
  const second = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 10,
    dedupKey: "turn-10-b",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [directorEvent({ event_code: "SE_DUP_B" })],
    persistence,
  });

  assert.equal(first.eventWrite.inserted, 1);
  assert.deepEqual(second.acceptedEventCodes, []);
  assert.ok(second.issues.some((issue) => issue.code === "duplicate_social_pair_cooldown"));
});

test("Social GM respects per-session pending social event cap", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const first = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 11,
    dedupKey: "turn-11",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [directorEvent({ event_code: "SE_CAP_A" })],
    maxPendingEventsPerSession: 1,
    persistence,
  });
  const second = await applySocialGmDeltas({
    sessionId: "S-1",
    turnIndex: 20,
    dedupKey: "turn-20",
    playerLocationId: "3F_Corridor",
    directorSocialEvents: [
      directorEvent({
        event_code: "SE_CAP_B",
        actor_npc_ids: ["N-003"],
        target_npc_ids: ["N-004"],
      }),
    ],
    maxPendingEventsPerSession: 1,
    persistence,
  });

  assert.equal(first.eventWrite.inserted, 1);
  assert.deepEqual(second.acceptedEventCodes, []);
  assert.ok(second.issues.some((issue) => issue.code === "social_pending_limit_reached"));
});
