import assert from "node:assert/strict";
import test from "node:test";
import { buildRunSnapshotV2 } from "./builder";

test("buildRunSnapshotV2 creates required stage-1 sections", () => {
  const snapshot = buildRunSnapshotV2({
    player: { name: "C", gender: "男", height: 180, personality: "冷静" },
    stats: { sanity: 10, agility: 1, luck: 2, charm: 3, background: 4 },
    originium: 20,
    inventory: [],
    warehouse: [],
    codex: {
      "N-001": { id: "N-001", name: "陈婆婆", type: "npc", favorability: 10 },
    },
    currentLocation: "1F_Lobby",
    alive: true,
    day: 1,
    hour: 5,
    dynamicNpcStates: { "N-001": { currentLocation: "1F_Lobby", isAlive: true } },
    homeSeed: { "N-001": "1F_Lobby", "N-002": "2F_Clinic201" },
    tasks: [
      {
        id: "t1",
        title: "初始任务",
        desc: "desc",
        issuer: "N-020",
        reward: "1原石",
        status: "active",
      },
    ],
  });
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.player.currentLocation, "1F_Lobby");
  assert.equal(snapshot.tasks.active.length, 1);
  assert.equal(snapshot.tasks.completed.length, 0);
  assert.equal(snapshot.npcs["N-001"]?.discoveredByPlayer, true);
  assert.equal(snapshot.npcs["N-002"]?.alive, true);
  assert.equal(snapshot.time.darkMoonStarted, false);
});
