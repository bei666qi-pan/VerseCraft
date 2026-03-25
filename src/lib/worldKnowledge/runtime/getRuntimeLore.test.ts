import assert from "node:assert/strict";
import { test } from "node:test";
import { getRuntimeLore } from "./getRuntimeLore";
import type { LoreFact, LorePacket, RetrievalCandidate, RuntimeLoreRequest } from "../types";

function mkPacket(cacheWritten = false): LorePacket {
  return {
    coreAnchors: [],
    relevantEntities: [],
    retrievedFacts: [],
    privateFacts: [],
    sceneFacts: [],
    compactPromptText: "【RAG-Lore精简片段】",
    debugMeta: {
      queryFingerprint: "qfp",
      cache: {
        level0MemoHit: false,
        redisHit: false,
        postgresHit: true,
        writtenToRedis: cacheWritten,
      },
      hitSources: ["exact"],
      scores: {},
      trimmedByBudget: false,
      dbRoundTrips: 2,
    },
  };
}

test("Redis miss -> PG hit -> Redis write", async () => {
  let writeCalled = false;
  const input: RuntimeLoreRequest = {
    latestUserInput: "查找 N-011",
    userId: "u_1",
    sessionId: "s_1",
    playerLocation: "7F_Bench",
    recentlyEncounteredEntities: ["N-011"],
    taskType: "PLAYER_CHAT",
    tokenBudget: 300,
    worldScope: ["core", "shared", "user"],
  };
  const fact: LoreFact = {
    identity: { factKey: "npc:N-011:chunk:0" },
    layer: "shared_public_lore",
    factType: "npc",
    canonicalText: "夜读老人是关键角色",
    source: { kind: "db", entityId: "1" },
  };
  const cand: RetrievalCandidate = { fact, score: 90, debug: { from: "exact" } };
  const packet = await getRuntimeLore(input, {
    planWorldKnowledgeQuery: () =>
      ({
        intents: ["character"],
        exactCodes: ["npc:N-011"],
        exactCanonicalNames: [],
        floorHints: [],
        locationHints: [],
        tagHints: ["npc"],
        ftsQuery: "n011",
        scope: ["core", "shared", "user"],
        tokenBudget: 300,
        retrievalBudget: { keyTopN: 3, ftsTopN: 3, vectorTopN: 0, maxFacts: 4, minSimilarity: 0.7, probes: 5, k: 5 },
        maxRevealRank: 3,
        fingerprint: "fp",
        entitiesFingerprint: "efp",
      }),
    readWorldLoreCache: async () => ({ key: "k", packet: null, redisHit: false, level0Hit: false }),
    retrieveWorldKnowledge: async () => ({
      facts: [fact],
      used: { keyCount: 1, ftsCount: 0, vectorCount: 0, tagCount: 0 },
      debugCandidates: [cand],
      dbRoundTrips: 1,
    }),
    rerankCandidates: (x) => x,
    buildLorePacket: () => mkPacket(false),
    buildRegistryFallbackLorePacket: () => mkPacket(false),
    writeWorldLoreCache: async () => {
      writeCalled = true;
      return { wroteRedis: true, ttlSec: 120 };
    },
  });
  assert.equal(writeCalled, true);
  assert.equal(packet.debugMeta.cache.writtenToRedis, true);
});

test("检索为空时走 registry fallback", async () => {
  const input: RuntimeLoreRequest = {
    latestUserInput: "查找未知线索",
    userId: "u_1",
    sessionId: "s_1",
    playerLocation: null,
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: 200,
    worldScope: ["core", "shared"],
  };
  const packet = await getRuntimeLore(input, {
    planWorldKnowledgeQuery: () =>
      ({
        intents: ["shared"],
        exactCodes: [],
        exactCanonicalNames: [],
        floorHints: [],
        locationHints: [],
        tagHints: [],
        ftsQuery: "x",
        scope: ["core", "shared"],
        tokenBudget: 200,
        retrievalBudget: { keyTopN: 2, ftsTopN: 2, vectorTopN: 0, maxFacts: 2, minSimilarity: 0.7, probes: 5, k: 5 },
        maxRevealRank: 3,
        fingerprint: "fp",
        entitiesFingerprint: "efp",
      }),
    readWorldLoreCache: async () => ({ key: "k", packet: null, redisHit: false, level0Hit: false }),
    retrieveWorldKnowledge: async () => ({
      facts: [],
      used: { keyCount: 0, ftsCount: 0, vectorCount: 0, tagCount: 0 },
      debugCandidates: [],
      dbRoundTrips: 1,
    }),
    rerankCandidates: (x) => x,
    buildLorePacket: () => mkPacket(false),
    buildRegistryFallbackLorePacket: () => ({
      ...mkPacket(false),
      debugMeta: { ...mkPacket(false).debugMeta, trimReason: "registry_fallback_db_empty" },
    }),
    writeWorldLoreCache: async () => ({ wroteRedis: false, ttlSec: 45 }),
  });
  assert.ok((packet.debugMeta.trimReason ?? "").startsWith("registry_fallback"));
});

test("检索超时会走 registry fallback", async () => {
  const input: RuntimeLoreRequest = {
    latestUserInput: "查询超时场景",
    userId: "u_1",
    sessionId: "s_1",
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: 240,
    worldScope: ["core", "shared"],
  };
  const packet = await getRuntimeLore(input, {
    planWorldKnowledgeQuery: () =>
      ({
        intents: ["scene"],
        exactCodes: [],
        exactCanonicalNames: [],
        floorHints: [],
        locationHints: [],
        tagHints: [],
        ftsQuery: "timeout",
        scope: ["core", "shared"],
        tokenBudget: 240,
        retrievalBudget: { keyTopN: 2, ftsTopN: 2, vectorTopN: 0, maxFacts: 2, minSimilarity: 0.7, probes: 5, k: 5 },
        maxRevealRank: 3,
        fingerprint: "fp_timeout",
        entitiesFingerprint: "efp_timeout",
      }),
    readWorldLoreCache: async () => ({ key: "k2", packet: null, redisHit: false, level0Hit: false }),
    retrieveWorldKnowledge: async () => new Promise(() => {}),
    rerankCandidates: (x) => x,
    buildLorePacket: () => mkPacket(false),
    buildRegistryFallbackLorePacket: () => ({
      ...mkPacket(false),
      debugMeta: { ...mkPacket(false).debugMeta, trimReason: "registry_fallback_db_error" },
    }),
    writeWorldLoreCache: async () => ({ wroteRedis: false, ttlSec: 45 }),
  });
  assert.ok((packet.debugMeta.trimReason ?? "").startsWith("registry_fallback"));
});
