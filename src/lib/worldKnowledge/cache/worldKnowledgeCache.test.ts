import assert from "node:assert/strict";
import { test } from "node:test";
import { buildLorePacket } from "@/lib/worldKnowledge/retrieval/buildLorePacket";
import { writeWorldLoreCache } from "./worldKnowledgeCache";
import type { RetrievalCandidate, RuntimeLoreRequest } from "../types";
import { WORLD_KNOWLEDGE_MAX_PACKET_CHARS } from "../constants";

function mkInput(worldScope: RuntimeLoreRequest["worldScope"]): RuntimeLoreRequest {
  return {
    latestUserInput: "测试输入",
    userId: "u_1",
    sessionId: "s_1",
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: 120,
    worldScope,
  };
}

function mkCandidate(text: string, score = 10): RetrievalCandidate {
  return {
    fact: {
      identity: { factKey: `k:${score}:${text.slice(0, 8)}` },
      layer: "shared_public_lore",
      factType: "rule",
      canonicalText: text,
      source: { kind: "db" },
    },
    score,
    debug: { from: "fts" },
  };
}

test("tokenBudget 裁剪：低预算下会触发 trimmedByBudget", () => {
  const packet = buildLorePacket({
    input: mkInput(["shared"]),
    candidates: [
      mkCandidate("A".repeat(800), 30),
      mkCandidate("B".repeat(800), 20),
      mkCandidate("C".repeat(800), 10),
    ],
    queryFingerprint: "fp",
    cache: { level0MemoHit: false, redisHit: false, postgresHit: true, writtenToRedis: false },
    dbRoundTrips: 2,
  });
  assert.equal(packet.debugMeta.trimmedByBudget, true);
  assert.ok(packet.retrievedFacts.length >= 1);
});

test("冲突/高风险数据不进入长缓存", async () => {
  const riskyPacket = buildLorePacket({
    input: mkInput(["core", "shared"]),
    candidates: [mkCandidate("这是冲突事实，待确认，存在矛盾", 50)],
    queryFingerprint: "fp2",
    cache: { level0MemoHit: false, redisHit: false, postgresHit: true, writtenToRedis: false },
    dbRoundTrips: 1,
  });
  const wrote = await writeWorldLoreCache({
    key: "wk:test:risk",
    input: mkInput(["core", "shared"]),
    packet: riskyPacket,
  });
  assert.ok(wrote.ttlSec <= 60);
});

test("lore packet 字符数受硬上限约束", () => {
  const packet = buildLorePacket({
    input: mkInput(["shared"]),
    candidates: [mkCandidate("Z".repeat(4000), 90), mkCandidate("Y".repeat(4000), 80)],
    queryFingerprint: "fp3",
    cache: { level0MemoHit: false, redisHit: false, postgresHit: true, writtenToRedis: false },
    dbRoundTrips: 1,
  });
  assert.ok(packet.compactPromptText.length <= WORLD_KNOWLEDGE_MAX_PACKET_CHARS);
});
