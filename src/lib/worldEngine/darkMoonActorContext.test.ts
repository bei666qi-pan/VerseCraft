import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyNpcAgentState, normalizeNpcRelationEdge } from "@/lib/socialWorld/state";
import { buildActorSimulationInput } from "./actorSimulation/buildActorInput";
import { buildDarkMoonActorSimulationContext } from "./darkMoonActorContext";

test("Dark Moon Actor context isolates registered NPC facts and relations per actor", () => {
  const context = buildDarkMoonActorSimulationContext({
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

  const state = context.npcStates.find((item) => item.npcId === "N-001");
  const input = buildActorSimulationInput({
    castActor: { npcId: "N-001", priority: "high", selectionReasonCode: "scene_present" },
    npcState: state,
    allFacts: context.worldFacts,
    scenePublicFactIds: new Set(),
    actorKnownFactIds: context.epistemicIndex.knownFactIdsByNpc.get("N-001") ?? new Set(),
    actorSuspectedFactIds: context.epistemicIndex.suspectedFactIdsByNpc.get("N-001") ?? new Set(),
    forbiddenFactIds: context.epistemicIndex.forbiddenFactIds,
    relationEdges: context.relationEdgesByNpc?.get("N-001") ?? [],
    horizonTurns: 2,
    simulationId: "sim-4-N-001",
  });
  assert.ok(input);
  assert.ok(input.knownFactIds.includes("dm:npc:N-001:lore"));
  assert.equal(input.knownFactIds.includes("dm:npc:N-002:lore"), false);
  assert.deepEqual(input.relationEdges.map((edge) => edge.targetNpcId), ["N-002"]);
});

test("Dark Moon Actor context excludes dead NPCs and supplies deterministic state for present NPCs", () => {
  const context = buildDarkMoonActorSimulationContext({
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
