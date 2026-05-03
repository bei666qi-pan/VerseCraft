import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNpcMemoryInsertRow,
  readRecentNpcMemoriesBestEffort,
  writeNpcMemoryBestEffort,
  type NpcMemoryInsertRow,
} from "./npcMemoryRepository";

test("buildNpcMemoryInsertRow applies memory defaults", () => {
  const row = buildNpcMemoryInsertRow({
    npcId: "lin_zhiyu",
    scope: "session",
    kind: "observation",
    summary: "Player warned Lin about the stairwell.",
  });

  assert.equal(row.sessionId, null);
  assert.equal(row.userId, null);
  assert.deepEqual(row.factIds, []);
  assert.deepEqual(row.relatedEventIds, []);
  assert.equal(row.salience, 50);
  assert.equal(row.confidence, 80);
  assert.deepEqual(row.emotion, {});
  assert.equal(row.expiresAt, null);
});

test("writeNpcMemoryBestEffort delegates insert without touching real DB", async () => {
  const inserted: NpcMemoryInsertRow[] = [];
  const expiresAt = new Date("2026-05-03T12:00:00.000Z");

  const result = await writeNpcMemoryBestEffort(
    {
      npcId: "lin_zhiyu",
      sessionId: "sess_3",
      userId: "user_3",
      scope: "session",
      kind: "emotion",
      summary: "Lin trusts the player slightly more.",
      factIds: ["fact_1"],
      relatedEventIds: [101, "evt_102"],
      salience: 75.8,
      confidence: 91.2,
      emotion: { trust: 1 },
      expiresAt,
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
  assert.equal(row.npcId, "lin_zhiyu");
  assert.equal(row.salience, 75);
  assert.equal(row.confidence, 91);
  assert.equal(row.expiresAt, expiresAt);
  assert.deepEqual(row.relatedEventIds, [101, "evt_102"]);
});

test("writeNpcMemoryBestEffort returns failure instead of throwing", async () => {
  const error = new Error("table missing");
  const warnings: Array<{ reason: string; error: unknown }> = [];

  const result = await writeNpcMemoryBestEffort(
    {
      npcId: "lin_zhiyu",
      scope: "session",
      kind: "observation",
      summary: "Memory write failed.",
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

  assert.deepEqual(result, { ok: false, reason: "table missing" });
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.error, error);
});

test("readRecentNpcMemoriesBestEffort delegates read and stays best-effort", async () => {
  const ok = await readRecentNpcMemoriesBestEffort(
    { npcId: "N-010", sessionId: "sess_1", limit: 3 },
    {
      readRecent: async (input) => {
        assert.equal(input.npcId, "N-010");
        assert.equal(input.sessionId, "sess_1");
        assert.equal(input.limit, 3);
        return [
          {
            id: 2,
            npcId: "N-010",
            scope: "session",
            kind: "observation",
            summary: "Xinlan noticed a hesitation.",
            salience: 70,
            confidence: 85,
          },
        ];
      },
    }
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.memories.length, 1);

  const failed = await readRecentNpcMemoriesBestEffort(
    { npcId: "N-010" },
    {
      readRecent: async () => {
        throw new Error("read failed");
      },
      warn: () => undefined,
    }
  );
  assert.deepEqual(failed, { ok: false, memories: [], reason: "read failed" });
});

test("writeNpcMemoryBestEffort returns inserted id when repository provides one", async () => {
  const result = await writeNpcMemoryBestEffort(
    {
      npcId: "N-010",
      scope: "short_term",
      kind: "dialogue",
      summary: "Xinlan noticed the player waited.",
    },
    {
      insert: async () => ({ id: 55 }),
    }
  );

  assert.deepEqual(result, { ok: true, id: 55 });
});
