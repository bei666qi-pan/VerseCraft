import assert from "node:assert/strict";
import test from "node:test";

import { projectActorContext } from "./actorContextProjector";

test("actor projection is deterministic, excludes dead actors and never exposes forbidden facts", () => {
  const input = {
    worldId: "dark_moon_prologue" as const,
    turnIndex: 9,
    presentNpcIds: ["N-001", "N-002"],
    deadNpcIds: ["N-002"],
    npcStates: [
      {
        npcId: "N-001",
        status: "active" as const,
        currentGoal: "守住入口",
        currentFear: null,
        currentNeed: null,
        agenda: [],
        knownFactIds: ["public-1", "private-1"],
        suspectedFactIds: [],
        forbiddenRevealIds: ["private-1"],
        socialEnergy: 0.5,
        volatility: 0.2,
        agencyWeight: 0.5,
        plotRelevance: 1,
        lastActiveTurn: 8,
        nextEligibleTurn: 9,
      },
    ],
    relationEdges: [],
  };

  const first = projectActorContext(input);
  const replay = projectActorContext(input);

  assert.deepEqual(first, replay);
  assert.deepEqual(first.actors.map((actor) => actor.npcId), ["N-001"]);
  assert.deepEqual(first.actors[0]?.knownFactIds, ["public-1"]);
  assert.doesNotMatch(JSON.stringify(first), /private-1|N-002/);
});
