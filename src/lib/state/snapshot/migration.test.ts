import assert from "node:assert/strict";
import test from "node:test";
import { buildRunSnapshotV2 } from "./builder";
import {
  migrateLegacySaveToSnapshot,
  normalizeRunSnapshotV2,
  projectSnapshotToLegacy,
} from "./migration";

test("legacy save can migrate to RunSnapshotV2 without crashing", () => {
  const snapshot = migrateLegacySaveToSnapshot({
    playerName: "测试玩家",
    gender: "其他",
    height: 168,
    personality: "谨慎",
    stats: { sanity: 12, agility: 3, luck: 4, charm: 5, background: 6 },
    time: { day: 2, hour: 22 },
    originium: 17,
    playerLocation: "1F_Lobby",
  });
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.player.profile.name, "测试玩家");
  assert.equal(snapshot.time.day, 2);
  assert.equal(snapshot.player.currentLocation, "1F_Lobby");
});

test("normalizeRunSnapshotV2 fills defaults for partial snapshot", () => {
  const normalized = normalizeRunSnapshotV2({
    schemaVersion: 2,
    meta: { runId: "run_x", worldVersion: 2, startedAt: "2026-01-01T00:00:00.000Z" },
    player: { profile: { name: "A", gender: "男", height: 170, personality: "冷静" } },
    time: { day: 3, hour: 0 },
  });
  assert.equal(normalized.meta.runId, "run_x");
  assert.equal(normalized.time.darkMoonStarted, true);
  assert.ok(Array.isArray(normalized.world.discoveredSecrets));
  assert.ok(typeof normalized.services.anchorUnlocked === "boolean");
});

test("snapshot projection keeps legacy surface usable", () => {
  const snapshot = buildRunSnapshotV2({
    player: { name: "B", gender: "女", height: 165, personality: "稳重" },
    stats: { sanity: 9, agility: 2, luck: 2, charm: 2, background: 2 },
    originium: 10,
    inventory: [],
    warehouse: [],
    codex: {},
    currentLocation: "B1_SafeZone",
    alive: true,
    day: 0,
    hour: 1,
    dynamicNpcStates: { "N-001": { currentLocation: "1F_Lobby", isAlive: true } },
    homeSeed: { "N-001": "1F_Lobby" },
    tasks: [],
  });
  const legacy = projectSnapshotToLegacy(snapshot);
  assert.equal(legacy.playerName, "B");
  assert.equal(legacy.playerLocation, "B1_SafeZone");
  assert.equal(legacy.stats?.sanity, 9);
  assert.equal(legacy.dynamicNpcStates?.["N-001"]?.isAlive, true);
});
