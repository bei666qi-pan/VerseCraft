import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyNpcAgentState, normalizeNpcRelationEdge } from "@/lib/socialWorld/state";
import { buildDarkMoonActorContext } from "./darkMoonActorContext";

test("Dark Moon Actor context isolates registered NPC facts and relations per actor", () => {
  const context = buildDarkMoonActorContext({
    npcStates: [
      { ...createEmptyNpcAgentState("N-001", 4), knownFactIds: ["other-private-fact"] },
      createEmptyNpcAgentState("N-002", 4),
      createEmptyNpcAgentState("foreign-world-npc", 4),
    ],
    relationEdges: [
      normalizeNpcRelationEdge({ fromNpcId: "N-001", toNpcId: "N-002", trust: 0.8, publicLabel: "邻居" }),
      normalizeNpcRelationEdge({ fromNpcId: "foreign-world-npc", toNpcId: "N-001", trust: 1 }),
    ],
    presentNpcIds: ["N-001", "N-002", "foreign-world-npc"],
    deadNpcIds: [],
    turnIndex: 4,
  });

  assert.deepEqual(context.npcStates.map((state) => state.npcId), ["N-001", "N-002"]);
  assert.deepEqual(context.relationEdgesByNpc?.get("N-001")?.map((edge) => edge.targetNpcId), ["N-002"]);
  assert.equal(context.relationEdgesByNpc?.has("foreign-world-npc"), false);

  assert.equal(context.epistemicIndex.knownFactIdsByNpc.get("N-001")?.has("dm:npc:N-001:lore"), true);
  assert.equal(context.epistemicIndex.knownFactIdsByNpc.get("N-001")?.has("dm:npc:N-002:lore"), false);
});

test("Dark Moon Actor context excludes dead NPCs and supplies deterministic state for present NPCs", () => {
  const context = buildDarkMoonActorContext({
    npcStates: [],
    relationEdges: [],
    presentNpcIds: ["N-001", "N-002"],
    deadNpcIds: ["N-002"],
    turnIndex: 7,
  });
  assert.deepEqual(context.sceneNpcIds, ["N-001"]);
  assert.deepEqual(context.npcStates.map((state) => state.npcId), ["N-001"]);
  assert.ok(context.epistemicIndex.knownFactIdsByNpc.get("N-001")?.has("dm:npc:N-001:taboo"));
});
