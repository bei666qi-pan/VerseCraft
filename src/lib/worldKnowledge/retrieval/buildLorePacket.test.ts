// src/lib/worldKnowledge/retrieval/buildLorePacket.test.ts
// Tests for buildLorePacket: fact grouping, char budget trimming,
// compact prompt text generation, evidence bundle, hot markers,
// source citation, and empty candidates.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildLorePacket } from "./buildLorePacket";
import type {
  LoreFact,
  LoreFactType,
  RetrievalCandidate,
  RuntimeLoreRequest,
  WorldKnowledgeLayer,
} from "../types";
import type { LoreGateResultV1 } from "../reveal/revealGate";
import type { VerseCraftRolloutFlagsSnapshot } from "@/lib/rollout/versecraftRolloutFlags";

// ── Helpers ───────────────────────────────────────────────

function mkFact(
  factKey: string,
  overrides: Partial<{
    layer: WorldKnowledgeLayer;
    factType: LoreFactType;
    canonicalText: string;
    sourceEntityId: string;
    isHot: boolean;
    tags: string[];
  }> = {},
): LoreFact {
  return {
    identity: { factKey },
    layer: overrides.layer ?? "shared_public_lore",
    factType: overrides.factType ?? "event",
    canonicalText: overrides.canonicalText ?? `Fact text for ${factKey}`,
    source: {
      kind: "db",
      entityId: overrides.sourceEntityId,
    },
    isHot: overrides.isHot,
    tags: overrides.tags,
  };
}

function mkCandidate(
  factKey: string,
  score: number,
  factOverrides: Parameters<typeof mkFact>[1] = {},
  debugFrom?: "exact" | "tag" | "fts" | "vector",
): RetrievalCandidate {
  return {
    fact: mkFact(factKey, factOverrides),
    score,
    debug: debugFrom ? { from: debugFrom } : undefined,
  };
}

function mkInput(overrides: Partial<RuntimeLoreRequest> = {}): RuntimeLoreRequest {
  return {
    latestUserInput: "玩家走向暗巷深处",
    userId: "user-001",
    sessionId: "session-001",
    playerLocation: "B1-暗巷",
    recentlyEncounteredEntities: ["npc:老王", "loc:公寓大厅"],
    taskType: "PLAYER_CHAT",
    tokenBudget: 1200,
    worldScope: ["core", "shared"],
    ...overrides,
  };
}

// ── Rollout flags mock ────────────────────────────────────

const mockRollout = vi.fn<() => VerseCraftRolloutFlagsSnapshot>();

vi.mock("@/lib/rollout/versecraftRolloutFlags", () => ({
  getVerseCraftRolloutFlags: () => mockRollout(),
}));

beforeEach(() => {
  mockRollout.mockReturnValue({
    enableCanonFactV1: false,
    enableRevealAwareEvidenceBundle: false,
    enableProvenanceVerifierShadow: false,
  } as VerseCraftRolloutFlagsSnapshot);
});

// ── 1. Fact grouping into core / private / scene categories ─

describe("fact grouping into categories", () => {
  it("places core_canon layer facts into coreAnchors", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("core:baseline1", 0.9, {
        layer: "core_canon",
        factType: "event",
        canonicalText: "公寓系统是一个闭环空间，无法从内部打破。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:1",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.coreAnchors).toHaveLength(1);
    expect(packet.coreAnchors[0].identity.factKey).toBe("core:baseline1");
    expect(packet.privateFacts).toHaveLength(0);
    expect(packet.sceneFacts).toHaveLength(0);
  });

  it("places world_mechanism and rule facts into coreAnchors regardless of layer", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("wm:digestion", 0.9, {
        layer: "shared_public_lore",
        factType: "world_mechanism",
        canonicalText: "消化轴每天凌晨重置楼层结构。",
      }),
      mkCandidate("rule:nosleep", 0.8, {
        layer: "session_ephemeral_facts",
        factType: "rule",
        canonicalText: "3楼以上的住客不能在同一地点停留超过1小时。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:2",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.coreAnchors).toHaveLength(2);
    expect(packet.privateFacts).toHaveLength(0);
    expect(packet.sceneFacts).toHaveLength(0);
  });

  it("places user_private_lore layer facts into privateFacts", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("priv:mysecret", 0.7, {
        layer: "user_private_lore",
        factType: "event",
        canonicalText: "你曾在7楼见过一个不该存在的人。",
      }),
      mkCandidate("priv:myitem", 0.6, {
        layer: "user_private_lore",
        factType: "item",
        canonicalText: "你口袋里的铜钥匙始终是温热的。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:3",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.privateFacts).toHaveLength(2);
    expect(packet.coreAnchors).toHaveLength(0);
    expect(packet.sceneFacts).toHaveLength(0);
  });

  it("places location/npc/anomaly facts into sceneFacts", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("loc:darkalley", 0.95, {
        layer: "shared_public_lore",
        factType: "location",
        canonicalText: "暗巷深处有一座废弃的神社。",
      }),
      mkCandidate("npc:postmanwang", 0.85, {
        layer: "shared_public_lore",
        factType: "npc",
        canonicalText: "邮差老王每天傍晚6点准时出现在公寓大厅。",
      }),
      mkCandidate("ano:flicker", 0.75, {
        layer: "shared_public_lore",
        factType: "anomaly",
        canonicalText: "走廊灯光以7秒为周期闪烁，每次都变暗一点。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:4",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.sceneFacts).toHaveLength(3);
    expect(packet.coreAnchors).toHaveLength(0);
    expect(packet.privateFacts).toHaveLength(0);
  });

  it("populates relevantEntities with npc/anomaly/item/location facts", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("npc:A", 0.9, { layer: "shared_public_lore", factType: "npc", canonicalText: "NPC A" }),
      mkCandidate("ano:B", 0.8, { layer: "shared_public_lore", factType: "anomaly", canonicalText: "Anomaly B" }),
      mkCandidate("item:C", 0.7, { layer: "shared_public_lore", factType: "item", canonicalText: "Item C" }),
      mkCandidate("loc:D", 0.6, { layer: "shared_public_lore", factType: "location", canonicalText: "Location D" }),
      mkCandidate("event:E", 0.5, { layer: "shared_public_lore", factType: "event", canonicalText: "Event E" }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:5",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.relevantEntities).toHaveLength(4);
    const keys = packet.relevantEntities.map((f) => f.identity.factKey);
    expect(keys).toContain("npc:A");
    expect(keys).toContain("ano:B");
    expect(keys).toContain("item:C");
    expect(keys).toContain("loc:D");
    expect(keys).not.toContain("event:E");
  });
});

// ── 2. Char budget trimming ───────────────────────────────

describe("char budget trimming", () => {
  it("trims facts when they exceed the token-derived char budget", () => {
    // Use a very small tokenBudget to force aggressive trimming.
    // tokenDerivedCharBudget = max(500, min(1800, 2200, tokenBudget * 4))
    // With tokenBudget = 100 → 400 → clamped to 500
    const candidates: RetrievalCandidate[] = Array.from({ length: 30 }, (_, i) =>
      mkCandidate(`fact:${String(i).padStart(3, "0")}`, 1.0 - i * 0.03, {
        layer: i < 10 ? "core_canon" : i < 20 ? "user_private_lore" : "shared_public_lore",
        factType: i % 7 === 0 ? "world_mechanism"
          : i % 7 === 1 ? "rule"
          : i % 7 === 2 ? "location"
          : i % 7 === 3 ? "npc"
          : i % 7 === 4 ? "anomaly"
          : i % 7 === 5 ? "item"
          : "event",
        canonicalText: `这是第${i}条世界知识，包含一些描述性文字来增加字符数。`.repeat(3),
        sourceEntityId: `entity-${i}`,
        isHot: i < 3,
      }),
    );

    const packet = buildLorePacket({
      input: mkInput({ tokenBudget: 100 }),
      candidates,
      queryFingerprint: "fp:trim",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    // With tokenBudget=100, charBudget=500, and 200+ chars per fact, we get 1-2 facts
    expect(packet.retrievedFacts.length).toBeLessThan(30);
    expect(packet.retrievedFacts.length).toBeGreaterThanOrEqual(1);
    expect(packet.debugMeta.trimmedByBudget).toBe(true);
    expect(packet.debugMeta.trimReason).toBe("char_budget");
  });

  it("does not trim when facts fit within budget", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("core:1", 0.9, {
        layer: "core_canon",
        factType: "rule",
        canonicalText: "简短的事实。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput({ tokenBudget: 1200 }),
      candidates,
      queryFingerprint: "fp:fit",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.retrievedFacts).toHaveLength(1);
    expect(packet.debugMeta.trimmedByBudget).toBe(false);
    expect(packet.debugMeta.trimReason).toBeUndefined();
  });

  it("caps candidate count at WORLD_KNOWLEDGE_MAX_RETRIEVED_FACTS (18)", () => {
    const candidates: RetrievalCandidate[] = Array.from({ length: 25 }, (_, i) =>
      mkCandidate(`fact:${i}`, 1.0 - i * 0.04, {
        layer: "shared_public_lore",
        factType: "event",
        canonicalText: `简短${i}`,
      }),
    );

    const packet = buildLorePacket({
      input: mkInput({ tokenBudget: 5000 }),
      candidates,
      queryFingerprint: "fp:cap",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.retrievedFacts.length).toBeLessThanOrEqual(18);
  });
});

// ── 3. Compact prompt text generation ─────────────────────

describe("compact prompt text generation", () => {
  it("generates structured sections with Chinese headers", () => {
    const candidates: RetrievalCandidate[] = [
      // Core anchors
      mkCandidate("core:digestion", 1.0, {
        layer: "core_canon",
        factType: "world_mechanism",
        canonicalText: "消化轴每天重置楼层。",
      }),
      // Scene facts
      mkCandidate("loc:darkalley", 0.9, {
        layer: "shared_public_lore",
        factType: "location",
        canonicalText: "暗巷深处有一座废弃神社。",
      }),
      mkCandidate("npc:老王", 0.85, {
        layer: "shared_public_lore",
        factType: "npc",
        canonicalText: "邮差老王每天傍晚出现。",
      }),
      // Private facts
      mkCandidate("priv:secret", 0.7, {
        layer: "user_private_lore",
        factType: "event",
        canonicalText: "你在7楼见过不该存在的人。",
      }),
      // Other (event type on shared_public_lore)
      mkCandidate("other:event", 0.5, {
        layer: "shared_public_lore",
        factType: "relationship",
        canonicalText: "老王与管理员关系紧张。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:compact",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    const text = packet.compactPromptText;

    // Header present
    expect(text).toContain("【世界知识检索】");

    // Core section
    expect(text).toContain("▎核心真相 (1条)");
    expect(text).toContain("world_mechanism");
    expect(text).toContain("消化轴每天重置楼层");

    // Scene section
    expect(text).toContain("▎场景事实 (2条)");

    // Private section
    expect(text).toContain("▎私有知识 (1条)");

    // Other section (relationship is not location/npc/anomaly, not private, not core)
    expect(text).toContain("▎其他相关 (1条)");
    expect(text).toContain("老王与管理员关系紧张");
  });

  it("omits empty sections", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("loc:onlyscene", 0.9, {
        layer: "shared_public_lore",
        factType: "location",
        canonicalText: "唯一场景。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:omit",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    const text = packet.compactPromptText;
    expect(text).toContain("【世界知识检索】");
    expect(text).toContain("▎场景事实 (1条)");
    // No core, private, or other sections
    expect(text).not.toContain("▎核心真相");
    expect(text).not.toContain("▎私有知识");
    expect(text).not.toContain("▎其他相关");
  });

  it("truncates compactPromptText at WORLD_KNOWLEDGE_MAX_PACKET_CHARS", () => {
    const longText = "A".repeat(500);
    const candidates: RetrievalCandidate[] = Array.from({ length: 5 }, (_, i) =>
      mkCandidate(`long:${i}`, 0.9, {
        layer: "core_canon",
        factType: "world_mechanism",
        canonicalText: longText,
      }),
    );

    const packet = buildLorePacket({
      input: mkInput({ tokenBudget: 5000 }),
      candidates,
      queryFingerprint: "fp:long",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    // WORLD_KNOWLEDGE_MAX_PACKET_CHARS = 2200
    expect(packet.compactPromptText.length).toBeLessThanOrEqual(2200);
  });
});

// ── 4. Evidence bundle generation ─────────────────────────

describe("evidence bundle generation", () => {
  it("omits evidenceBundle when all relevant rollout flags are off", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("core:1", 0.9, {
        layer: "core_canon",
        factType: "rule",
        canonicalText: "核心事实。",
        sourceEntityId: "src-001",
        tags: ["reveal_surface"],
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:noflag",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.evidenceBundle).toBeUndefined();
  });

  it("includes evidenceBundle when enableCanonFactV1 is on", () => {
    mockRollout.mockReturnValue({
      enableCanonFactV1: true,
      enableRevealAwareEvidenceBundle: false,
      enableProvenanceVerifierShadow: false,
    } as VerseCraftRolloutFlagsSnapshot);

    const candidates: RetrievalCandidate[] = [
      mkCandidate("core:1", 0.9, {
        layer: "core_canon",
        factType: "rule",
        canonicalText: "核心事实。",
        sourceEntityId: "src-001",
        tags: ["reveal_surface"],
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:flag1",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.evidenceBundle).toBeDefined();
    expect(packet.evidenceBundle).toHaveLength(1);
    expect(packet.evidenceBundle![0].factId).toBe("core:1");
    expect(packet.evidenceBundle![0].canonicalText).toBe("核心事实。");
    expect(packet.evidenceBundle![0].gateDecision).toBe("included");
    expect(packet.evidenceBundle![0].gateReason).toBe("included");
    expect(packet.evidenceBundle![0].evidenceRefs).toBeDefined();
    expect(packet.evidenceBundle![0].evidenceRefs).toHaveLength(1);
    expect(packet.evidenceBundle![0].evidenceRefs[0].sourceId).toBe("src-001");
  });

  it("includes evidenceBundle when enableRevealAwareEvidenceBundle is on", () => {
    mockRollout.mockReturnValue({
      enableCanonFactV1: false,
      enableRevealAwareEvidenceBundle: true,
      enableProvenanceVerifierShadow: false,
    } as VerseCraftRolloutFlagsSnapshot);

    const candidates: RetrievalCandidate[] = [
      mkCandidate("npc:老王", 0.85, {
        layer: "shared_public_lore",
        factType: "npc",
        canonicalText: "邮差老王每天傍晚出现。",
        sourceEntityId: "N-001",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:flag2",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.evidenceBundle).toBeDefined();
    expect(packet.evidenceBundle).toHaveLength(1);
    expect(packet.evidenceBundle![0].gateDecision).toBe("included");
  });

  it("uses gateResults decision/reason when provided", () => {
    mockRollout.mockReturnValue({
      enableCanonFactV1: true,
      enableRevealAwareEvidenceBundle: false,
      enableProvenanceVerifierShadow: false,
    } as VerseCraftRolloutFlagsSnapshot);

    const candidate: RetrievalCandidate = mkCandidate("core:blocked", 0.5, {
      layer: "core_canon",
      factType: "rule",
      canonicalText: "被封锁的事实。",
      sourceEntityId: "src-blocked",
    });

    const gateResults: LoreGateResultV1[] = [
      {
        candidate,
        canonFact: {
          factId: "core:blocked",
          canonicalText: "被封锁的事实。",
          truthClass: "hidden",
          audience: ["dm"],
          revealMinRank: 3,
          revealTier: "epilogue",
          evidenceRefs: [],
          sourceType: "registry",
        },
        gateDecision: "blocked",
        gateReason: "reveal_tier_insufficient",
      },
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates: [candidate],
      gateResults,
      queryFingerprint: "fp:gate",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.evidenceBundle).toBeDefined();
    expect(packet.evidenceBundle![0].gateDecision).toBe("blocked");
    expect(packet.evidenceBundle![0].gateReason).toBe("reveal_tier_insufficient");
  });

  it("includes evidenceBundle when enableProvenanceVerifierShadow is on", () => {
    mockRollout.mockReturnValue({
      enableCanonFactV1: false,
      enableRevealAwareEvidenceBundle: false,
      enableProvenanceVerifierShadow: true,
    } as VerseCraftRolloutFlagsSnapshot);

    const candidates: RetrievalCandidate[] = [
      mkCandidate("item:key", 0.6, {
        layer: "shared_public_lore",
        factType: "item",
        canonicalText: "铜钥匙。",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:flag3",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.evidenceBundle).toBeDefined();
  });
});

// ── 5. Hot fact markers ───────────────────────────────────

describe("hot fact markers", () => {
  it("prefixes hot facts with 🔥 in compact prompt text", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("core:hot", 1.0, {
        layer: "core_canon",
        factType: "world_mechanism",
        canonicalText: "热事实。",
        isHot: true,
      }),
      mkCandidate("npc:cold", 0.5, {
        layer: "shared_public_lore",
        factType: "npc",
        canonicalText: "冷事实。",
        isHot: false,
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:hot",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    const text = packet.compactPromptText;

    // Hot fact has 🔥
    expect(text).toContain("🔥");
    // The hot fact line should contain the marker
    expect(text).toContain(`- 🔥[world_mechanism|core_canon]`);

    // Cold fact should not have 🔥
    const lines = text.split("\n");
    const coldLine = lines.find((l) => l.includes("冷事实"));
    expect(coldLine).toBeDefined();
    expect(coldLine).not.toContain("🔥");
  });

  it("shows multiple hot facts with distinct markers", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("hot:1", 1.0, {
        layer: "core_canon",
        factType: "world_mechanism",
        canonicalText: "第一热事实。",
        isHot: true,
      }),
      mkCandidate("hot:2", 0.9, {
        layer: "core_canon",
        factType: "rule",
        canonicalText: "第二热事实。",
        isHot: true,
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:hot2",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    const text = packet.compactPromptText;
    const matches = text.match(/🔥/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });
});

// ── 6. Source citation format ─────────────────────────────

describe("source citation format", () => {
  it("includes [src:<entityId>] when source.entityId is present", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("with:src", 0.9, {
        layer: "shared_public_lore",
        factType: "npc",
        canonicalText: "带来源的事实。",
        sourceEntityId: "N-042",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:src",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.compactPromptText).toContain("[src:N-042]");
  });

  it("omits [src:] when source.entityId is absent", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("nosrc:1", 0.9, {
        layer: "shared_public_lore",
        factType: "npc",
        canonicalText: "无来源的事实。",
        // No sourceEntityId
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:nosrc",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.compactPromptText).not.toContain("[src:]");
  });

  it("formats citations with type tag and layer", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("fmt:1", 0.9, {
        layer: "core_canon",
        factType: "world_mechanism",
        canonicalText: "格式化测试。",
        sourceEntityId: "SRC-007",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:fmt",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    // Line format: - [typeTag|layer][src:entityId] text
    expect(packet.compactPromptText).toMatch(/- \[world_mechanism\|core_canon\]\[src:SRC-007\] 格式化测试/);
  });
});

// ── 7. Empty candidates ───────────────────────────────────

describe("empty candidates", () => {
  it("returns empty arrays and minimal prompt text for empty candidates", () => {
    const packet = buildLorePacket({
      input: mkInput(),
      candidates: [],
      queryFingerprint: "fp:empty",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 0,
    });

    expect(packet.coreAnchors).toEqual([]);
    expect(packet.relevantEntities).toEqual([]);
    expect(packet.retrievedFacts).toEqual([]);
    expect(packet.privateFacts).toEqual([]);
    expect(packet.sceneFacts).toEqual([]);

    // Should still have the header
    expect(packet.compactPromptText).toBe("【世界知识检索】");

    expect(packet.evidenceBundle).toBeUndefined();
    expect(packet.debugMeta.queryFingerprint).toBe("fp:empty");
    expect(packet.debugMeta.trimmedByBudget).toBe(false);
    expect(packet.debugMeta.trimReason).toBeUndefined();
    expect(packet.debugMeta.hitSources).toEqual([]);
    expect(packet.debugMeta.scores).toEqual({});
  });

  it("handles empty gateResults when evidenceBundle is enabled", () => {
    mockRollout.mockReturnValue({
      enableCanonFactV1: true,
      enableRevealAwareEvidenceBundle: false,
      enableProvenanceVerifierShadow: false,
    } as VerseCraftRolloutFlagsSnapshot);

    const packet = buildLorePacket({
      input: mkInput(),
      candidates: [],
      gateResults: [],
      queryFingerprint: "fp:emptygate",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 0,
    });

    expect(packet.evidenceBundle).toEqual([]);
  });
});

// ── 8. Debug metadata correctness ─────────────────────────

describe("debug metadata", () => {
  it("collects hit sources from all candidates", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("a", 1.0, {}, "exact"),
      mkCandidate("b", 0.9, {}, "fts"),
      mkCandidate("c", 0.8, {}, "vector"),
      mkCandidate("d", 0.7, {}, "tag"),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:debug",
      cache: { level0MemoHit: true, redisHit: false, postgresHit: true, writtenToRedis: true },
      dbRoundTrips: 2,
    });

    expect(packet.debugMeta.hitSources).toContain("exact");
    expect(packet.debugMeta.hitSources).toContain("fts");
    expect(packet.debugMeta.hitSources).toContain("vector");
    expect(packet.debugMeta.hitSources).toContain("tag");
    expect(packet.debugMeta.dbRoundTrips).toBe(2);
    expect(packet.debugMeta.cache.level0MemoHit).toBe(true);
    expect(packet.debugMeta.cache.postgresHit).toBe(true);
  });

  it("records scores keyed by factKey", () => {
    const candidates: RetrievalCandidate[] = [
      mkCandidate("score:a", 0.95),
      mkCandidate("score:b", 0.42),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:scores",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    expect(packet.debugMeta.scores).toEqual({ "score:a": 0.95, "score:b": 0.42 });
  });
});

// ── 9. Edge: facts with mixed categorization ──────────────

describe("edge cases", () => {
  it("handles facts that fall into multiple grouping categories correctly", () => {
    // A core_canon fact with type "npc" should be in BOTH coreAnchors and
    // relevantEntities, but only in the "core" category for prompt sections.
    const candidates: RetrievalCandidate[] = [
      mkCandidate("core:npc", 0.9, {
        layer: "core_canon",
        factType: "npc",
        canonicalText: "NPC 管理员是系统的化身。",
        sourceEntityId: "ADMIN-001",
      }),
    ];

    const packet = buildLorePacket({
      input: mkInput(),
      candidates,
      queryFingerprint: "fp:mixed",
      cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
      dbRoundTrips: 1,
    });

    // Appears in both coreAnchors and relevantEntities
    expect(packet.coreAnchors).toHaveLength(1);
    expect(packet.relevantEntities).toHaveLength(1);

    // Appears only in "核心真相" section, not in "场景事实"
    expect(packet.compactPromptText).toContain("▎核心真相 (1条)");
    expect(packet.compactPromptText).not.toContain("▎场景事实");
  });
});
