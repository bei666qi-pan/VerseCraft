// src/lib/worldKnowledge/retrieval/queryPlanner.test.ts
// Tests for planWorldKnowledgeQuery: floor/entity hints, intent detection,
// query expansion integration, fingerprint uniqueness, and budget scaling.

import { describe, it, expect, vi } from "vitest";

// ── Mock registry imports with minimal test data ──────────────

vi.mock("@/lib/registry/npcs", () => ({
  NPCS: [
    { id: "N-001", name: "陈婆婆", floor: "1", location: "1 楼门厅", personality: "温和", specialty: "后勤补给", combatPower: 3, appearance: "", taboo: "", defaultFavorability: 40, lore: "" },
    { id: "N-003", name: "邮差老王", floor: "1", location: "1 楼门厅", personality: "温和", specialty: "后勤补给", combatPower: 3, appearance: "", taboo: "", defaultFavorability: 40, lore: "" },
    { id: "N-012", name: "张先生", floor: "4", location: "4 楼 401 室", personality: "冷漠", specialty: "情报提供", combatPower: 4, appearance: "", taboo: "", defaultFavorability: 30, lore: "" },
  ],
}));

vi.mock("@/lib/registry/anomalies", () => ({
  ANOMALIES: [
    { id: "A-001", name: "时差症候群", floor: "1", combatName: "窃时者", combatPower: 4, displayDangerLevel: "中", threatRating: 4, appearance: "", triggerCondition: "", escalationPattern: "", counterWindow: "", narrativeRole: "", floorMechanismTheme: "", killingRule: "", survivalMethod: "", sanityDamage: 8 },
    { id: "A-002", name: "无头猎犬", floor: "2", combatName: "无头猎犬", combatPower: 5, displayDangerLevel: "高", threatRating: 6, appearance: "", triggerCondition: "", escalationPattern: "", counterWindow: "", narrativeRole: "", floorMechanismTheme: "", killingRule: "", survivalMethod: "", sanityDamage: 10 },
  ],
}));

vi.mock("@/lib/registry/world", () => ({
  MAP_ROOMS: {
    B1: ["B1_SafeZone", "B1_Storage"],
    "1": ["1F_Lobby", "1F_Mailboxes"],
    "2": ["2F_Clinic201", "2F_Corridor"],
  },
}));

vi.mock("@/lib/registry/rules", () => ({
  APARTMENT_RULES: [
    "红水静置：自来水若呈红色，不要直接饮用。",
    "深夜巡楼：午夜后勿独自上下楼梯。",
  ],
}));

// mock envRaw / langfuse for queryRewriter module-level deps
vi.mock("@/lib/config/envRaw", () => ({
  envBoolean: vi.fn(() => false),
  envRaw: vi.fn(() => ""),
}));
vi.mock("@/lib/observability/langfuse", () => ({
  startGeneration: vi.fn(() => ({ end: vi.fn() })),
}));

// ── Mock inferMaxRevealRank to return a controlled value ─────

vi.mock("../reveal/revealGate", () => ({
  inferMaxRevealRank: vi.fn(() => 2),
  REVEAL_TIER_RANK: { surface: 0, shallow: 1, deep: 2, abyss: 3 },
}));

// ── Import under test ────────────────────────────────────────

import { planWorldKnowledgeQuery } from "./queryPlanner";
import type { RuntimeLoreRequest } from "../types";

// ── Helper: build a minimal RuntimeLoreRequest ────────────────

function mkReq(overrides: Partial<RuntimeLoreRequest> = {}): RuntimeLoreRequest {
  return {
    latestUserInput: "调查房间",
    userId: "u_test",
    sessionId: "s_test",
    playerLocation: "1F_Lobby",
    recentlyEncounteredEntities: [],
    taskType: "PLAYER_CHAT",
    tokenBudget: 420,
    worldScope: ["shared"],
    ...overrides,
  };
}

// ── 1. Floor hint extraction ─────────────────────────────────

describe("floor hint extraction", () => {
  it("detects Chinese floor markers like 2楼", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "去2楼看看" }));
    expect(plan.floorHints).toContain("2楼");
  });

  it("detects 1F-style floor markers", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "去1f门厅" }));
    expect(plan.floorHints).toContain("1f");
  });

  it("detects B1/B2 basement markers", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "b1好像有动静" }));
    expect(plan.floorHints).toContain("b1");
  });

  it("returns empty floor hints when no floor mentioned", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "谁在走廊里" }));
    expect(plan.floorHints).toEqual([]);
  });

  it("adds stripped floor to tagHints (楼/f suffix removed)", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "3楼有人吗" }));
    expect(plan.tagHints).toContain("3");
  });
});

// ── 2. Entity hint extraction from NPC and anomaly names ─────

describe("entity hint extraction", () => {
  it("extracts NPC by name", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "陈婆婆在哪" }));
    expect(plan.exactCodes).toContain("npc:N-001");
    expect(plan.exactCanonicalNames).toContain("n-001");
    expect(plan.tagHints).toContain("npc");
  });

  it("extracts NPC by id", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "n-003好像有问题" }));
    expect(plan.exactCodes).toContain("npc:N-003");
    expect(plan.exactCanonicalNames).toContain("n-003");
  });

  it("extracts anomaly by name", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "时差症候群出现了" }));
    expect(plan.exactCodes).toContain("anomaly:A-001");
    expect(plan.exactCanonicalNames).toContain("a-001");
    expect(plan.tagHints).toContain("anomaly");
  });

  it("extracts anomaly by id", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "a-002是什么" }));
    expect(plan.exactCodes).toContain("anomaly:A-002");
  });

  it("adds floor tag from matched entity", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "无头猎犬在2楼" }));
    expect(plan.tagHints).toContain("2"); // from anomaly floor
  });

  it("detects multiple entities in same input", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "陈婆婆和邮差老王都不在" }));
    expect(plan.exactCodes).toContain("npc:N-001");
    expect(plan.exactCodes).toContain("npc:N-003");
  });
});

// ── 3. Intent detection ──────────────────────────────────────

describe("intent detection", () => {
  it("detects rule intent via keywords like 规则/守则/禁忌", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "公寓有什么规则" }));
    expect(plan.intents).toContain("rule");
  });

  it("detects rule intent via 残页/传闻/入住须知/暗月", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "入住须知上说不能喝红水" }));
    expect(plan.intents).toContain("rule");
  });

  it("detects rule intent via 出口/真相/13楼", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "13楼的真相是什么" }));
    expect(plan.intents).toContain("rule");
  });

  it("detects character intent via 谁/NPC/诡异/关系/角色", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "这个NPC是谁" }));
    expect(plan.intents).toContain("character");
  });

  it("detects character intent via 居民/老人/经理/医生/保安", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "居民们的关系怎么样" }));
    expect(plan.intents).toContain("character");
  });

  it("detects scene intent via 房间/楼层/走廊/门厅/地点", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "这个房间在哪" }));
    expect(plan.intents).toContain("scene");
  });

  it("detects scene intent via 在哪/位置/去/地图", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "门厅的位置" }));
    expect(plan.intents).toContain("scene");
  });

  it("detects private intent via 我/我的/记得/之前/曾经/私有/个人", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "我之前好像来过" }));
    expect(plan.intents).toContain("private");
  });

  it("detects shared intent via 传闻/共享/大家/公共/世界观/设定", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "大家知道什么传闻" }));
    expect(plan.intents).toContain("shared");
  });

  it("defaults to shared when no other intent matched", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "你好" }));
    expect(plan.intents).toEqual(["shared"]);
  });

  it("detects multiple intents simultaneously", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "门厅里的居民在讲什么规则" }));
    expect(plan.intents).toContain("scene");
    expect(plan.intents).toContain("character");
    expect(plan.intents).toContain("rule");
  });

  it("adds survival_note and rumor tags for rule intent", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "公寓的禁忌是什么" }));
    expect(plan.tagHints).toContain("survival_note");
    expect(plan.tagHints).toContain("rumor");
  });

  it("adds location tag for scene intent", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "门厅在哪" }));
    expect(plan.tagHints).toContain("location");
  });

  it("adds npc tag for character intent", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "谁是邮差" }));
    expect(plan.tagHints).toContain("npc");
  });

  it("adds core tag for shared intent", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "世界观设定" }));
    expect(plan.tagHints).toContain("core");
  });
});

// ── 4. Query expansion integration ───────────────────────────

describe("query expansion integration", () => {
  it("produces non-empty ftsQuery", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查走廊里的血迹" }));
    expect(plan.ftsQuery.length).toBeGreaterThan(0);
  });

  it("produces non-empty semanticQuery", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "寻找失踪的钥匙" }));
    expect(plan.semanticQuery.length).toBeGreaterThan(0);
  });

  it("produces non-empty entityQuery when entities are detected", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "陈婆婆在门厅吗" }));
    expect(plan.entityQuery.length).toBeGreaterThan(0);
    expect(plan.entityQuery).toContain("陈婆婆");
  });

  it("produces compositeQuery as a fallback", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "探索房间寻找线索" }));
    expect(plan.compositeQuery.length).toBeGreaterThan(0);
  });

  it("ftsQuery respects 512-char slice (upper bound)", () => {
    const longInput = "调查" + "房间".repeat(100);
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: longInput }));
    expect(plan.ftsQuery.length).toBeLessThanOrEqual(512);
  });

  it("semanticQuery respects 512-char slice (upper bound)", () => {
    const longInput = "我想知道那里有什么" + "东西".repeat(100);
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: longInput }));
    expect(plan.semanticQuery.length).toBeLessThanOrEqual(512);
  });

  it("incorporates expanded CJK tokens into tagHints", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "探索图书馆管理员办公室" }));
    // enhancedSegmentCJK should produce tokens like 图书馆, 管理员, 图书, 馆管, 管理, 理员
    expect(plan.tagHints).toContain("图书");
    expect(plan.tagHints).toContain("管理");
  });
});

// ── 5. Fingerprint generation uniqueness ─────────────────────

describe("fingerprint generation", () => {
  it("produces a non-empty fingerprint string", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "测试输入" }));
    expect(plan.fingerprint.length).toBeGreaterThan(0);
    expect(typeof plan.fingerprint).toBe("string");
  });

  it("produces a non-empty entitiesFingerprint", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "陈婆婆在吗" }));
    expect(plan.entitiesFingerprint.length).toBeGreaterThan(0);
  });

  it("produces different fingerprints for different inputs", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查房间" }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查走廊" }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("produces different fingerprints for different sessionIds", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", sessionId: "s1" }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", sessionId: "s2" }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("produces different fingerprints for different userIds", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", userId: "u1" }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", userId: "u2" }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("produces different fingerprints for different player locations", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", playerLocation: "1F_Lobby" }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", playerLocation: "2F_Corridor" }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("produces different fingerprints when metadata differs", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", threatLevel: "low" }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", threatLevel: "high" }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("fingerprint is stable (deterministic) for identical inputs", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查房间" }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查房间" }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("entitiesFingerprint changes when encountered entities differ", () => {
    const a = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", recentlyEncounteredEntities: ["N-001"] }));
    const b = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查", recentlyEncounteredEntities: ["N-003"] }));
    expect(a.entitiesFingerprint).not.toBe(b.entitiesFingerprint);
  });
});

// ── 6. Retrieval budget scaling with token budget ─────────────

describe("retrieval budget scaling", () => {
  it("uses default maxFacts when tokenBudget is large", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ tokenBudget: 420 }));
    // DEFAULT_RETRIEVAL_BUDGET.maxFacts = 16, floor(420/35) = 12 → max(6, min(16, 12)) = min(16,12) = 12, max(6, 12) = 12
    expect(plan.retrievalBudget.maxFacts).toBe(12);
  });

  it("scales down maxFacts for small token budgets", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ tokenBudget: 210 }));
    // floor(210/35) = 6, max(6, min(16, 6)) = max(6, 6) = 6
    expect(plan.retrievalBudget.maxFacts).toBe(6);
  });

  it("clamps maxFacts to a minimum of 6", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ tokenBudget: 35 }));
    // floor(35/35) = 1, max(6, min(16, 1)) = max(6, 1) = 6
    expect(plan.retrievalBudget.maxFacts).toBe(6);
  });

  it("clamps maxFacts to DEFAULT_RETRIEVAL_BUDGET.maxFacts ceiling", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ tokenBudget: 9999 }));
    // floor(9999/35) = 285, max(6, min(16, 285)) = 16
    expect(plan.retrievalBudget.maxFacts).toBe(16);
  });

  it("preserves other budget fields unchanged", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ tokenBudget: 420 }));
    expect(plan.retrievalBudget.keyTopN).toBe(6);
    expect(plan.retrievalBudget.ftsTopN).toBe(8);
    expect(plan.retrievalBudget.vectorTopN).toBe(7);
    expect(plan.retrievalBudget.minSimilarity).toBe(0.72);
  });

  it("uses token budget of 0 without crashing", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ tokenBudget: 0 }));
    // floor(0/35) = 0, max(6, min(16, 0)) = max(6, 0) = 6
    expect(plan.retrievalBudget.maxFacts).toBe(6);
  });
});

// ── 7. Location hints ────────────────────────────────────────

describe("location hint extraction", () => {
  it("detects known room names in input", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "去B1_SafeZone" }));
    expect(plan.locationHints).toContain("b1_safezone");
  });

  it("detects Chinese location names from MAP_ROOMS", () => {
    // MAP_ROOMS doesn't have Chinese names in our mock, so fall back to nothing extra
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "调查1F_Lobby" }));
    expect(plan.locationHints).toContain("1f_lobby");
  });

  it("returns empty location hints when no room matched", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "随便说点什么" }));
    expect(plan.locationHints).toEqual([]);
  });
});

// ── 8. Edge cases ────────────────────────────────────────────

describe("edge cases and robustness", () => {
  it("handles empty input string", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "" }));
    expect(plan.intents).toBeDefined();
    expect(plan.floorHints).toEqual([]);
    expect(plan.exactCodes).toEqual([]);
  });

  it("handles null userId and sessionId", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ userId: null, sessionId: null }));
    expect(plan.fingerprint.length).toBeGreaterThan(0);
  });

  it("handles null playerLocation", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ playerLocation: null }));
    expect(plan.locationId).toBeNull();
  });

  it("passes through presentNpcIds when explicitly provided", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ presentNpcIds: ["N-001", "N-005"] }));
    expect(plan.presentNpcIds).toEqual(["N-001", "N-005"]);
  });

  it("collects N-xxx ids from playerContext when presentNpcIds not given", () => {
    const plan = planWorldKnowledgeQuery(mkReq({
      latestUserInput: "调查",
      playerContext: "玩家在 N-001 和 N-003 身边",
      presentNpcIds: undefined,
      recentlyEncounteredEntities: [],
    }));
    expect(plan.presentNpcIds).toContain("N-001");
    expect(plan.presentNpcIds).toContain("N-003");
  });

  it("collects activeTaskIds from playerContext when not explicitly given", () => {
    const plan = planWorldKnowledgeQuery(mkReq({
      playerContext: "task:find_key 进行中，taskId: deliver_mail 也进行中",
      activeTaskIds: undefined,
    }));
    expect(plan.activeTaskIds.length).toBeGreaterThan(0);
  });

  it("passes through activeTaskIds when explicitly provided", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ activeTaskIds: ["task_a", "task_b"] }));
    expect(plan.activeTaskIds).toEqual(["task_a", "task_b"]);
  });

  it("passes through metadata fields (threatLevel, scenePressure, playerKnownFactIds)", () => {
    const plan = planWorldKnowledgeQuery(mkReq({
      threatLevel: "high",
      scenePressure: "tense",
      playerKnownFactIds: ["fact_1"],
      actorNpcId: "N-003",
    }));
    expect(plan.threatLevel).toBe("high");
    expect(plan.scenePressure).toBe("tense");
    expect(plan.playerKnownFactIds).toEqual(["fact_1"]);
    expect(plan.actorNpcId).toBe("N-003");
  });

  it("detects survival_note tag when input matches APARTMENT_RULES prefix", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "红水静置的意思是什么" }));
    expect(plan.tagHints).toContain("survival_note");
  });

  it("maxRevealRank matches mocked inferMaxRevealRank", () => {
    const plan = planWorldKnowledgeQuery(mkReq({ latestUserInput: "随便" }));
    expect(plan.maxRevealRank).toBe(2);
  });
});
