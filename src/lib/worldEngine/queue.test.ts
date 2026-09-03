import assert from "node:assert/strict";
import test from "node:test";
import { enqueueWorldEngineTickWithDeps } from "./queueCore";

const payload = {
  version: 2 as const,
  requestId: "req-queue",
  userId: null,
  sessionId: "session-queue",
  worldId: "dark_moon_prologue" as const,
  mapId: "dark_moon_apartment" as const,
  triggerSignals: ["key_story_node_hit" as const],
  controlRiskTags: [],
  playerLocationBefore: "B1_SafeZone",
  playerLocationAfter: "1F_Lobby",
  presentNpcIds: [],
  deadNpcIds: [],
  changedTaskIds: [],
  changedClueIds: [],
  pacingChapterSignals: { phase: "opening" as const, tension: 2 as const, chapterId: "chapter-1", completedBeatIds: [], turnsInChapter: 1 },
  worldStateSummary: { day: 0, timeSlot: "unknown" as const, danger: "low" as const, stateCodes: [] },
  latestTurnSignals: { actionKinds: ["movement" as const], legal: true, death: false, riskTags: [] },
  npcLocationUpdateCount: 0,
  turnIndex: 1,
};

test("queue insertion failure never reports enqueued", async () => {
  const result = await enqueueWorldEngineTickWithDeps(payload, {
    persistJob: async (_payload, dedupKey) => ({
      persisted: false,
      inserted: false,
      jobId: null,
      idempotencyKey: dedupKey,
      errorCode: "insert_failed",
    }),
  });
  assert.equal(result.enqueued, false);
  assert.equal(result.jobId, null);
});

test("database-resolved duplicate returns the one real job", async () => {
  const seen = new Map<string, number>();
  const persistJob = async (_payload: Parameters<Parameters<typeof enqueueWorldEngineTickWithDeps>[1]["persistJob"]>[0], dedupKey: string) => {
    const existing = seen.get(dedupKey);
    if (existing) return { persisted: true, inserted: false, jobId: existing, idempotencyKey: dedupKey };
    seen.set(dedupKey, 42);
    return { persisted: true, inserted: true, jobId: 42, idempotencyKey: dedupKey };
  };
  const first = await enqueueWorldEngineTickWithDeps(payload, { persistJob });
  const duplicate = await enqueueWorldEngineTickWithDeps(payload, { persistJob });
  assert.equal(first.enqueued, true);
  assert.equal(duplicate.enqueued, true);
  assert.equal(first.jobId, 42);
  assert.equal(duplicate.jobId, 42);
  assert.equal(first.dedupKey, duplicate.dedupKey);
  assert.equal(seen.size, 1);
});

test("different triggers for the same committed turn resolve to one Director job", async () => {
  const keys: string[] = [];
  const persistJob = async (
    _payload: Parameters<Parameters<typeof enqueueWorldEngineTickWithDeps>[1]["persistJob"]>[0],
    dedupKey: string,
  ) => {
    keys.push(dedupKey);
    return { persisted: true, inserted: keys.length === 1, jobId: 9, idempotencyKey: dedupKey };
  };

  const first = await enqueueWorldEngineTickWithDeps(payload, { persistJob });
  const replay = await enqueueWorldEngineTickWithDeps({
    ...payload,
    requestId: "req-queue-replay",
    triggerSignals: ["npc_agenda_due"],
  }, { persistJob });

  assert.equal(first.dedupKey, replay.dedupKey);
});
