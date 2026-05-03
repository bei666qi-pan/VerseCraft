import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStoryEventInsertRow,
  readRecentStoryEventsBestEffort,
  writeStoryEventBestEffort,
  type StoryEventInsertRow,
} from "./storyEventRepository";

test("buildStoryEventInsertRow applies ledger defaults", () => {
  const row = buildStoryEventInsertRow({
    requestId: "req_story_1",
    actorType: "player",
    eventType: "player_action",
    summary: "Player knocked on room 302.",
  });

  assert.equal(row.sessionId, null);
  assert.equal(row.userId, null);
  assert.equal(row.turnIndex, 0);
  assert.equal(row.worldId, "base_apartment");
  assert.equal(row.actorId, null);
  assert.equal(row.committed, false);
  assert.deepEqual(row.payload, {});
});

test("writeStoryEventBestEffort delegates insert without touching real DB", async () => {
  const inserted: StoryEventInsertRow[] = [];
  const result = await writeStoryEventBestEffort(
    {
      requestId: "req_story_2",
      sessionId: "sess_1",
      userId: "user_1",
      turnIndex: 3,
      worldId: "darkmoon",
      chapterId: "chapter_1",
      sceneId: "corridor_3f",
      actorType: "npc",
      actorId: "lin_zhiyu",
      eventType: "npc_observed",
      summary: "Lin heard footsteps at the far end of the corridor.",
      payload: { clueId: "footsteps" },
      committed: true,
    },
    {
      insert: async (row) => {
        inserted.push(row);
      },
    }
  );

  const row = inserted[0];
  assert.ok(row);
  assert.deepEqual(result, { ok: true });
  assert.equal(row.requestId, "req_story_2");
  assert.equal(row.turnIndex, 3);
  assert.equal(row.committed, true);
  assert.deepEqual(row.payload, { clueId: "footsteps" });
});

test("writeStoryEventBestEffort returns failure instead of throwing", async () => {
  const error = new Error("db unavailable");
  const warnings: Array<{ reason: string; error: unknown }> = [];

  const result = await writeStoryEventBestEffort(
    {
      requestId: "req_story_3",
      actorType: "system",
      eventType: "turn_commit_failed",
      summary: "Commit failure recorded.",
    },
    {
      insert: async () => {
        throw error;
      },
      warn: (reason, caught) => {
        warnings.push({ reason, error: caught });
      },
    }
  );

  assert.deepEqual(result, { ok: false, reason: "db unavailable" });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.error, error);
});

test("readRecentStoryEventsBestEffort delegates read and stays best-effort", async () => {
  const ok = await readRecentStoryEventsBestEffort(
    { sessionId: "sess_1", limit: 2 },
    {
      readRecent: async (input) => {
        assert.equal(input.sessionId, "sess_1");
        assert.equal(input.limit, 2);
        return [
          {
            id: 1,
            turnIndex: 4,
            actorType: "player",
            actorId: "player",
            eventType: "player_action",
            summary: "Player looked around.",
          },
        ];
      },
    }
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.events.length, 1);

  const failed = await readRecentStoryEventsBestEffort(
    { sessionId: "sess_1" },
    {
      readRecent: async () => {
        throw new Error("read failed");
      },
      warn: () => undefined,
    }
  );
  assert.deepEqual(failed, { ok: false, events: [], reason: "read failed" });
});

test("writeStoryEventBestEffort returns inserted id when repository provides one", async () => {
  const result = await writeStoryEventBestEffort(
    {
      requestId: "req_story_4",
      actorType: "player",
      eventType: "player_action",
      summary: "Player waited.",
    },
    {
      insert: async () => ({ id: 44 }),
    }
  );

  assert.deepEqual(result, { ok: true, id: 44 });
});
