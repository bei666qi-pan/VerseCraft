import assert from "node:assert/strict";
import test from "node:test";
import { createInMemorySocialWorldPersistence, createSocialWorldPersistence } from "@/lib/socialWorld/persistence";
import { createEmptyNpcAgentState, normalizeNpcRelationEdge, normalizeSocialEvent } from "@/lib/socialWorld/state";
import type { SocialEvent } from "@/lib/socialWorld/types";

function event(partial: Partial<SocialEvent> = {}): SocialEvent {
  return normalizeSocialEvent({
    id: "SE-1",
    turn: 10,
    dueTurn: 10,
    expiresTurn: 12,
    type: "rumor_spread",
    actorNpcIds: ["N-001"],
    targetNpcIds: ["N-002"],
    locationId: "三楼走廊",
    visibility: "rumor",
    causeFactIds: ["F-1"],
    producedFactIds: ["F-2"],
    relationDeltas: [],
    playerRelevance: "medium",
    escapeRelevance: "none",
    knowledgeScope: "rumor_network",
    mustNotReveal: [],
    summaryForModel: "N-001 向 N-002 传递未证实说法。",
    summaryForPlayer: "有人低声提到三楼走廊不太对劲。",
    status: "committed",
    ...partial,
  });
}

test("agent states and relation edges roundtrip by session", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const state = {
    ...createEmptyNpcAgentState("N-001", 3),
    currentGoal: "确认楼梯口动静",
    socialEnergy: 0.8,
  };
  const edge = normalizeNpcRelationEdge({
    fromNpcId: "N-001",
    toNpcId: "N-002",
    trust: 0.2,
    suspicion: 0.4,
    knownSharedFactIds: ["F-1"],
    publicLabel: "邻居",
  });

  await persistence.upsertNpcAgentStates("S-1", [state]);
  await persistence.upsertNpcRelationEdges("S-1", [edge]);

  assert.equal((await persistence.loadNpcAgentStates("S-1"))[0]?.npcId, "N-001");
  assert.equal((await persistence.loadNpcRelationEdges("S-1"))[0]?.publicLabel, "邻居");
  assert.deepEqual(await persistence.loadNpcAgentStates("S-2"), []);
});

test("duplicate social events are idempotent per session, type, actors, targets, and dedup key", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  const result = await persistence.insertSocialEvents(
    "S-1",
    [event({ id: "SE-A" }), event({ id: "SE-B" })],
    "turn-10"
  );

  assert.deepEqual(result, { inserted: 1, updated: 0, skipped: 1 });
  const due = await persistence.loadDueSocialEventsForPrompt("S-1", 10, 4);
  assert.equal(due.length, 1);
});

test("private events are not returned for prompt projection", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  await persistence.insertSocialEvents(
    "S-1",
    [event({ id: "SE-PRIVATE", visibility: "private", knowledgeScope: "actor_private" })],
    "turn-10"
  );

  assert.deepEqual(await persistence.loadDueSocialEventsForPrompt("S-1", 10, 4), []);
});

test("expired events are not returned", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  await persistence.insertSocialEvents("S-1", [event({ id: "SE-OLD", dueTurn: 4, expiresTurn: 5 })], "turn-4");
  const expired = await persistence.expireOldSocialEvents("S-1", 8);

  assert.equal(expired, 1);
  assert.deepEqual(await persistence.loadDueSocialEventsForPrompt("S-1", 8, 4), []);
});

test("high player relevance is returned first", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  await persistence.insertSocialEvents(
    "S-1",
    [
      event({ id: "SE-LOW", playerRelevance: "low", actorNpcIds: ["N-001"], targetNpcIds: ["N-002"] }),
      event({ id: "SE-HIGH", playerRelevance: "high", actorNpcIds: ["N-003"], targetNpcIds: ["N-004"] }),
      event({ id: "SE-MED", playerRelevance: "medium", actorNpcIds: ["N-005"], targetNpcIds: ["N-006"] }),
    ],
    "turn-10"
  );

  const due = await persistence.loadDueSocialEventsForPrompt("S-1", 10, 3);
  assert.deepEqual(
    due.map((item) => item.id),
    ["SE-HIGH", "SE-MED", "SE-LOW"]
  );
});

test("session isolation is preserved", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  await persistence.insertSocialEvents("S-1", [event({ id: "SE-S1" })], "turn-10");
  await persistence.insertSocialEvents("S-2", [event({ id: "SE-S2" })], "turn-10");

  assert.deepEqual(
    (await persistence.loadDueSocialEventsForPrompt("S-1", 10, 4)).map((item) => item.id),
    ["SE-S1"]
  );
});

test("empty and failing stores fail open with empty arrays", async () => {
  const empty = createInMemorySocialWorldPersistence();
  assert.deepEqual(await empty.loadNpcAgentStates("S-EMPTY"), []);
  assert.deepEqual(await empty.loadNpcRelationEdges("S-EMPTY"), []);
  assert.deepEqual(await empty.loadDueSocialEventsForPrompt("S-EMPTY", 10, 2), []);

  const failing = createSocialWorldPersistence(
    {
      loadNpcAgentStates: async () => {
        throw new Error("table missing");
      },
      upsertNpcAgentStates: async () => {
        throw new Error("table missing");
      },
      loadNpcRelationEdges: async () => {
        throw new Error("table missing");
      },
      upsertNpcRelationEdges: async () => {
        throw new Error("table missing");
      },
      insertSocialEvents: async () => {
        throw new Error("table missing");
      },
      loadDueSocialEventsForPrompt: async () => {
        throw new Error("table missing");
      },
      markSocialEventsProjected: async () => {
        throw new Error("table missing");
      },
      expireOldSocialEvents: async () => {
        throw new Error("table missing");
      },
    },
    { warn: () => undefined }
  );

  assert.deepEqual(await failing.loadDueSocialEventsForPrompt("S-1", 10, 2), []);
  assert.deepEqual(await failing.insertSocialEvents("S-1", [event()], "turn-10"), {
    inserted: 0,
    updated: 0,
    skipped: 0,
  });
});
