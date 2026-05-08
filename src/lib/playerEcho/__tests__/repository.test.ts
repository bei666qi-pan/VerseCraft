import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPlayerEchoCanonUpsertPayload,
  buildPlayerEchoEventInsertValues,
  createPlayerEchoRepository,
  normalizePlayerEchoCanonRow,
  readPlayerEchoCanon,
  upsertPlayerEchoCanon,
  insertPlayerEchoEvents,
  type PlayerEchoCanonDbRow,
  type PlayerEchoRepositoryDb,
} from "@/lib/playerEcho/repository";
import { normalizePlayerEchoCanon } from "@/lib/playerEcho/reducer";
import type { EchoFragment } from "@/lib/playerEcho/types";

function fragment(overrides: Partial<EchoFragment> = {}): EchoFragment {
  return {
    id: "f1",
    type: "promise",
    targetType: "npc",
    targetId: "N-010",
    summary: "registered echo",
    safetyLevel: 2,
    emotionalWeight: 0.72,
    salience: 0.8,
    confidence: 0.7,
    status: "active",
    ...overrides,
  };
}

class MockDb implements PlayerEchoRepositoryDb {
  readonly insertedTables: unknown[] = [];
  readonly insertedValues: unknown[] = [];
  readonly conflictArgs: unknown[] = [];

  constructor(private readonly rows: PlayerEchoCanonDbRow[] = []) {}

  select() {
    return {
      from: () => ({
        where: () => ({
          limit: async () => this.rows,
        }),
      }),
    };
  }

  insert(table: unknown) {
    this.insertedTables.push(table);
    return {
      values: (value: unknown) => {
        this.insertedValues.push(value);
        return {
          onConflictDoUpdate: async (args: unknown) => {
            this.conflictArgs.push(args);
          },
        };
      },
    };
  }
}

test("playerEcho repository normalizes row with missing json fields", () => {
  const canon = normalizePlayerEchoCanonRow({
    user_id: "u1",
    total_runs: 3,
    recurring_npc_bonds: {
      "N-010": {
        memoryPrivilege: "xinlan",
        recognitionMode: "familiar_pull",
        bondScore: 0.9,
        fragmentIds: ["f1"],
      },
    },
    updated_at: new Date("2026-01-02T03:04:05.000Z"),
  });

  assert.equal(canon.playerKey, "u1");
  assert.equal(canon.loopCount, 3);
  assert.deepEqual(canon.strongestChoices, []);
  assert.deepEqual(canon.unresolvedRegrets, []);
  assert.deepEqual(canon.repeatedDeathCauses, []);
  assert.equal(canon.npcBonds[0]?.npcId, "N-010");
  assert.equal(canon.updatedAt, "2026-01-02T03:04:05.000Z");
});

test("playerEcho repository upsert payload clamps long strings and lists", () => {
  const payload = buildPlayerEchoCanonUpsertPayload(
    "u1",
    normalizePlayerEchoCanon({
      loopCount: 4,
      strongestChoices: Array.from({ length: 12 }, (_, i) => `choice-${i}`),
      unresolvedRegrets: Array.from({ length: 12 }, (_, i) => `regret-${i}`),
      repeatedDeathCauses: Array.from({ length: 12 }, (_, i) => `death-${i}`),
      stableEchoSummary: "s".repeat(400),
      lastRunSummary: "l".repeat(400),
      npcBonds: [
        {
          npcId: "N-010",
          memoryPrivilege: "xinlan",
          recognitionMode: "familiar_pull",
          bondScore: 1.2,
          fragmentIds: Array.from({ length: 20 }, (_, i) => `fragment-${i}`),
        },
      ],
      fragments: [fragment({ emotionalWeight: 0.91 })],
    })
  );

  assert.equal(payload.insert.totalRuns, 4);
  assert.equal(payload.insert.totalDeaths, 0);
  assert.equal(payload.insert.strongestChoices.length, 8);
  assert.equal(payload.insert.unresolvedRegrets.length, 8);
  assert.equal(payload.insert.repeatedDeathCauses.length, 6);
  assert.equal(payload.insert.stableEchoSummary.length, 240);
  assert.equal(payload.insert.lastRunSummary.length, 240);
  assert.equal(payload.insert.echoIntensity, 100);
  const bond = payload.insert.recurringNpcBonds["N-010"] as { fragmentIds: string[]; bondScore: number };
  assert.equal(bond.fragmentIds.length, 12);
  assert.equal(bond.bondScore, 1);
});

test("playerEcho repository insert ignores empty fragment summaries", async () => {
  const rows = buildPlayerEchoEventInsertValues("u1", "run-1", [
    fragment({ id: "empty", summary: "   " }),
    fragment({ id: "valid", summary: "valid event", emotionalWeight: 0.66, safetyLevel: 3 }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.summary, "valid event");
  assert.equal(rows[0]?.emotionalWeight, 66);
  assert.equal(rows[0]?.safetyLevel, 3);

  const db = new MockDb();
  const repo = createPlayerEchoRepository(db);
  const count = await repo.insertPlayerEchoEvents("u1", "run-1", [
    fragment({ id: "empty", summary: "   " }),
    fragment({ id: "valid", summary: "valid event" }),
  ]);

  assert.equal(count, 1);
  assert.equal((db.insertedValues[0] as unknown[]).length, 1);
});

test("playerEcho repository functions typecheck with a mock db", async () => {
  const db = new MockDb([{ userId: "u1", totalRuns: 2, stableEchoSummary: "summary" }]);
  const repo = createPlayerEchoRepository(db);

  const canon = await repo.readPlayerEchoCanon("u1");
  assert.equal(canon?.playerKey, "u1");
  assert.equal(canon?.stableEchoSummary, "summary");

  await repo.upsertPlayerEchoCanon("u1", normalizePlayerEchoCanon({ stableEchoSummary: "next" }));
  const inserted = await repo.insertPlayerEchoEvents("u1", null, [fragment()]);

  assert.equal(inserted, 1);
  assert.equal(db.conflictArgs.length, 1);

  assert.equal(typeof readPlayerEchoCanon, "function");
  assert.equal(typeof upsertPlayerEchoCanon, "function");
  assert.equal(typeof insertPlayerEchoEvents, "function");
});
