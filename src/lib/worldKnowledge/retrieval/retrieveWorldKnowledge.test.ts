import assert from "node:assert/strict";
import { test } from "node:test";
import { rerankCandidates } from "./rerank";
import { mergeScopeFilterSql } from "./retrieveWorldKnowledge";
import { planWorldKnowledgeQuery } from "./queryPlanner";
import type { RetrievalCandidate, RuntimeLoreRequest } from "../types";

function mkCandidate(key: string, text: string, score: number): RetrievalCandidate {
  return {
    fact: {
      identity: { factKey: key },
      layer: "shared_public_lore",
      factType: "npc",
      canonicalText: text,
      source: { kind: "db" },
    },
    score,
    debug: { from: "fts" },
  };
}

test("精确命中优先级：当前位置与近期实体会被提升", () => {
  const input = [
    mkCandidate("npc:N-003:chunk:0", "邮差老王在 1F_Lobby", 30),
    mkCandidate("location:room:1F_Lobby:chunk:0", "门厅环境", 20),
    mkCandidate("rule:apartment:chunk:1", "规则一", 40),
  ];
  const out = rerankCandidates(input, {
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: ["N-003"],
  });
  assert.equal(out[0]?.fact.identity.factKey, "npc:N-003:chunk:0");
});

test("私有世界观只对 owner 生效：scope SQL 含 owner 约束", () => {
  const req: RuntimeLoreRequest = {
    latestUserInput: "我记得上次遇见 N-001",
    userId: "u_1",
    sessionId: "s_1",
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: 300,
    worldScope: ["user"],
  };
  const filter = mergeScopeFilterSql(req);
  assert.ok(filter.sql.includes("owner_user_id"));
  assert.equal(filter.params[0], "u_1");
});

test("session facts 仅对应会话可见：scope SQL 含 session key 前缀", () => {
  const req: RuntimeLoreRequest = {
    latestUserInput: "继续上一回合",
    userId: "u_1",
    sessionId: "s_9",
    playerLocation: null,
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: 180,
    worldScope: ["session"],
  };
  const filter = mergeScopeFilterSql(req);
  assert.ok(filter.sql.includes("retrieval_key LIKE"));
  assert.ok(String(filter.params[1]).startsWith("session:s_9:"));
});

test("热点地点检索结果稳定：同输入 fingerprint 一致", () => {
  const req: RuntimeLoreRequest = {
    latestUserInput: "我在 1F_Lobby 想找 N-010",
    userId: "u_2",
    sessionId: "s_2",
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: ["N-010"],
    taskType: "PLAYER_CHAT",
    tokenBudget: 280,
    worldScope: ["core", "shared", "user"],
  };
  const p1 = planWorldKnowledgeQuery(req);
  const p2 = planWorldKnowledgeQuery(req);
  assert.equal(p1.fingerprint, p2.fingerprint);
  assert.equal(p1.entitiesFingerprint, p2.entitiesFingerprint);
});
