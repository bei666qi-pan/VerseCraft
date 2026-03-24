import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveNearestAnchor, runReviveSyncPipeline, selectLootLooter } from "./pipeline";

describe("revive pipeline", () => {
  it("resolves nearest unlocked anchor by graph distance", () => {
    const anchor = resolveNearestAnchor("6F_Room602", { B1: true, "1": true, "7": true });
    assert.equal(anchor.nodeId, "7F_Bench");
  });

  it("selects deterministic looter fallback order", () => {
    const looter = selectLootLooter({
      deathLocation: "3F_Room301",
      dynamicNpcStates: {
        "N-001": { currentLocation: "1F_Lobby", isAlive: true },
        "N-009": { currentLocation: "3F_Room301", isAlive: true },
      },
    });
    assert.equal(looter, "N-009");
  });

  it("applies 12h fast forward and loot transfer", () => {
    const out = runReviveSyncPipeline({
      death: {
        deathLocation: "1F_Mailboxes",
        deathCause: "test",
        inventory: [{ id: "I-1", name: "x", tier: "D", description: "", tags: "", ownerId: "N-001" }],
        hourIndex: 1,
      },
      anchorUnlocks: { B1: true, "1": true, "7": false },
      currentTime: { day: 0, hour: 18 },
      tasks: [],
      dynamicNpcStates: { "N-003": { currentLocation: "1F_Mailboxes", isAlive: true } },
    });
    assert.deepEqual(out.nextTime, { day: 1, hour: 6 });
    assert.equal(out.respawnAnchor.nodeId, "1F_Lobby");
    assert.equal(out.droppedLootOwnership[0]?.looterId, "N-003");
  });
});
