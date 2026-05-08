import test from "node:test";
import assert from "node:assert/strict";

import {
  maybePersistPlayerEchoFromResolvedTurn,
  schedulePlayerEchoPersistFromTurn,
  type PlayerEchoPersistRepository,
} from "@/lib/playerEcho/persistFromTurn";
import { normalizePlayerEchoCanon } from "@/lib/playerEcho/reducer";
import type { EchoFragment, PlayerEchoCanon } from "@/lib/playerEcho/types";

const FLAGS_ON = {
  enablePlayerEchoCanon: true,
  enablePlayerEchoPersistence: true,
};

const FLAGS_OFF = {
  enablePlayerEchoCanon: false,
  enablePlayerEchoPersistence: false,
};

class MockRepo implements PlayerEchoPersistRepository {
  readCalls = 0;
  upsertCalls = 0;
  insertCalls = 0;
  insertedFragments: readonly EchoFragment[] = [];
  canon: PlayerEchoCanon | null = normalizePlayerEchoCanon(null);
  throwOnRead = false;

  async readPlayerEchoCanon(): Promise<PlayerEchoCanon | null> {
    this.readCalls += 1;
    if (this.throwOnRead) throw new Error("db unavailable");
    return this.canon;
  }

  async upsertPlayerEchoCanon(_userId: string, canon: PlayerEchoCanon): Promise<void> {
    this.upsertCalls += 1;
    this.canon = canon;
  }

  async insertPlayerEchoEvents(
    _userId: string,
    _runId: string | null | undefined,
    fragments: readonly EchoFragment[]
  ): Promise<number> {
    this.insertCalls += 1;
    this.insertedFragments = fragments;
    return fragments.length;
  }
}

test("playerEcho persist: no userId no persist", async () => {
  const repo = new MockRepo();
  await maybePersistPlayerEchoFromResolvedTurn({
    flags: FLAGS_ON,
    userId: null,
    dmRecord: { is_death: true },
    repository: repo,
  });

  assert.equal(repo.readCalls, 0);
  assert.equal(repo.upsertCalls, 0);
  assert.equal(repo.insertCalls, 0);
});

test("playerEcho persist: flags off no persist", async () => {
  const repo = new MockRepo();
  await maybePersistPlayerEchoFromResolvedTurn({
    flags: FLAGS_OFF,
    userId: "u1",
    dmRecord: { is_death: true },
    repository: repo,
  });

  assert.equal(repo.readCalls, 0);
  assert.equal(repo.upsertCalls, 0);
  assert.equal(repo.insertCalls, 0);
});

test("playerEcho persist: read reduce upsert insert for death turn", async () => {
  const repo = new MockRepo();
  await maybePersistPlayerEchoFromResolvedTurn({
    flags: FLAGS_ON,
    userId: "u1",
    runId: "run-1",
    dmRecord: { is_death: true, player_location: "B1_SafeZone" },
    nowIso: "2026-01-01T00:00:00.000Z",
    repository: repo,
  });

  assert.equal(repo.readCalls, 1);
  assert.equal(repo.upsertCalls, 1);
  assert.equal(repo.insertCalls, 1);
  assert.equal(repo.insertedFragments[0]?.type, "death");
  assert.equal(repo.canon?.fragments.some((fragment) => fragment.type === "death"), true);
});

test("playerEcho persist: errors are swallowed", async () => {
  const repo = new MockRepo();
  repo.throwOnRead = true;

  await assert.doesNotReject(
    maybePersistPlayerEchoFromResolvedTurn({
      flags: FLAGS_ON,
      userId: "u1",
      dmRecord: { is_death: true },
      repository: repo,
    })
  );
  assert.equal(repo.upsertCalls, 0);
  assert.equal(repo.insertCalls, 0);
});

test("playerEcho persist: schedule helper detaches work", async () => {
  const repo = new MockRepo();
  schedulePlayerEchoPersistFromTurn({
    flags: FLAGS_ON,
    userId: "u1",
    dmRecord: { relationship_updates: [{ npcId: "N-010", trust: 1 }] },
    repository: repo,
  });

  assert.equal(repo.readCalls, 0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(repo.readCalls, 1);
  assert.equal(repo.insertedFragments[0]?.type, "npc_bond");
});
