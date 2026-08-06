// src/lib/worldKnowledge/retrieval/diversityReranker.test.ts
// Tests for MMR diversity re-ranking and dynamic topK.

import { describe, it, expect } from "vitest";
import { mmrRerank, dynamicTopK } from "./diversityReranker";
import type { RetrievalCandidate } from "../types";

// ── Helpers ───────────────────────────────────────────────

function mkCandidate(
  factKey: string,
  factType: string,
  canonicalText: string,
  score: number,
): RetrievalCandidate {
  return {
    fact: {
      identity: { factKey },
      layer: "shared_public_lore",
      factType: factType as RetrievalCandidate["fact"]["factType"],
      canonicalText,
      source: { kind: "db" },
    },
    score,
    debug: { from: "fts" },
  };
}

// ── 1. MMR deduplication keeps highest score ──────────────

describe("mmrRerank", () => {
  it("deduplicates near-duplicate candidates and keeps the highest-scored entry", () => {
    // Two candidates sharing the same entity, factType, and highly similar text
    // (contentSimilarity ≈ 0.91 > 0.85 threshold) → detected as near-duplicates.
    const duplicateA = mkCandidate(
      "npc:wang:chunk:0",
      "npc",
      "邮差老王在公寓送信",
      1.0,
    );
    const duplicateB = mkCandidate(
      "npc:wang:chunk:1",
      "npc",
      "邮差老王在公寓送信多年",
      0.5,
    );
    // A distinct third candidate that should survive dedup
    const distinctC = mkCandidate(
      "loc:park:chunk:0",
      "location",
      "中心公园有一座古老的钟楼和喷泉",
      0.7,
    );

    const result = mmrRerank([duplicateA, duplicateB, distinctC], 3, {
      lambda: 0.7,
      enabled: true,
      minDiversityScore: 0.3,
    });

    // duplicateA (score 1.0) should be kept, duplicateB (score 0.5) dropped
    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys).toContain("npc:wang:chunk:0");
    expect(keys).not.toContain("npc:wang:chunk:1");
    expect(keys).toContain("loc:park:chunk:0");
    expect(result).toHaveLength(2);
  });

  // ── 2. Diversity promotion when lambda < 1 ──────────────

  it("promotes diverse candidates over similar higher-scored ones when lambda < 1", () => {
    // A: high score, about NPC Wang
    const candidateA = mkCandidate(
      "npc:wang:chunk:0",
      "npc",
      "邮差老王每天在公寓送信",
      1.0,
    );
    // B: slightly lower score, still about NPC Wang but with different text
    // (contentSimilarity ≈ 0.63 — different enough to NOT be a near-duplicate,
    //  but similar enough that MMR penalises it)
    const candidateB = mkCandidate(
      "npc:wang:chunk:1",
      "npc",
      "邮差老王认识很多住户",
      0.9,
    );
    // C: lowest score, but totally different entity/type/text → diverse
    const candidateC = mkCandidate(
      "loc:park:chunk:0",
      "location",
      "中心公园有古老的喷泉和梧桐树",
      0.7,
    );

    const result = mmrRerank([candidateA, candidateB, candidateC], 2, {
      lambda: 0.7,
      enabled: true,
      minDiversityScore: 0.3,
    });

    const keys = result.map((c) => c.fact.identity.factKey);
    // A gets picked first (highest score).
    // Then MMR: C (diverse, MMR ≈ 0.49) beats B (similar to A, MMR ≈ 0.44).
    expect(keys[0]).toBe("npc:wang:chunk:0");
    expect(keys[1]).toBe("loc:park:chunk:0");
    expect(result).toHaveLength(2);
  });

  // ── 3. Pure relevance when lambda = 1 ───────────────────

  it("returns pure relevance ranking when lambda = 1", () => {
    const candidateA = mkCandidate(
      "npc:wang:chunk:0",
      "npc",
      "邮差老王负责三栋楼的信件",
      1.0,
    );
    const candidateB = mkCandidate(
      "loc:lobby:chunk:0",
      "location",
      "一楼大厅有前台和信箱",
      0.9,
    );
    const candidateC = mkCandidate(
      "item:key:chunk:0",
      "item",
      "302室的备用钥匙在前台抽屉里",
      0.7,
    );

    const result = mmrRerank([candidateA, candidateB, candidateC], 3, {
      lambda: 1.0,
      enabled: true,
      minDiversityScore: 0.3,
    });

    // All three are distinct enough to survive dedup.
    // With λ=1, MMR = pure relevance → top-3 by descending score.
    expect(result).toHaveLength(3);
    expect(result[0].fact.identity.factKey).toBe("npc:wang:chunk:0");
    expect(result[1].fact.identity.factKey).toBe("loc:lobby:chunk:0");
    expect(result[2].fact.identity.factKey).toBe("item:key:chunk:0");
  });

  // ── 4. Early stop on low diversity ──────────────────────

  it("stops selecting when best MMR falls below minDiversityScore", () => {
    // All three candidates share the same entity and factType, with
    // text that is distinct enough to avoid dedup but similar enough
    // to produce low MMR scores with a low lambda.
    const candidateA = mkCandidate(
      "npc:wang:chunk:0",
      "npc",
      "邮差老王在公寓工作",
      0.95,
    );
    const candidateB = mkCandidate(
      "npc:wang:chunk:1",
      "npc",
      "邮差老王认识所有住户",
      0.85,
    );
    const candidateC = mkCandidate(
      "npc:wang:chunk:2",
      "npc",
      "邮差老王每天六点送信",
      0.75,
    );

    // λ=0.2 heavily penalises similarity → MMR scores become negative.
    // minDiversityScore=0.3 means the MMR loop stops after selecting A
    // because B and C both score below the threshold.
    // Use topK=2 so the MMR loop runs (deduped=3 > topK=2).
    const result = mmrRerank([candidateA, candidateB, candidateC], 2, {
      lambda: 0.2,
      enabled: true,
      minDiversityScore: 0.3,
    });

    // Only A is selected; B and C are too similar (MMR < 0.3) → early stop
    // gives fewer results than requested topK.
    expect(result).toHaveLength(1);
    expect(result[0].fact.identity.factKey).toBe("npc:wang:chunk:0");
  });

  // ── 5. Empty input handling ─────────────────────────────

  it("handles empty candidate list gracefully", () => {
    const result = mmrRerank([], 5);
    expect(result).toEqual([]);
  });

  it("returns single candidate unchanged", () => {
    const single = mkCandidate(
      "npc:wang:chunk:0",
      "npc",
      "邮差老王",
      0.8,
    );
    const result = mmrRerank([single], 5);
    expect(result).toHaveLength(1);
    expect(result[0].fact.identity.factKey).toBe("npc:wang:chunk:0");
  });
});

// ── 6. dynamicTopK for simple vs complex queries ──────────

describe("dynamicTopK", () => {
  it("returns baseTopK for a minimal query", () => {
    // inputLength=0, intentCount=0, entityCount=0 → complexity=0
    const result = dynamicTopK({
      inputLength: 0,
      intentCount: 0,
      entityCount: 0,
      baseTopK: 5,
      maxTopK: 20,
    });
    expect(result).toBe(5);
  });

  it("returns a moderate topK for a simple query", () => {
    // Short input, single intent, single entity
    const result = dynamicTopK({
      inputLength: 10,
      intentCount: 1,
      entityCount: 1,
      baseTopK: 5,
      maxTopK: 20,
    });
    // complexity ≈ 0.23, extra = round(0.23 * 15) = 3 → topK = 8
    expect(result).toBe(8);
  });

  it("returns maxTopK for a complex query", () => {
    // Long input, many intents, many entities → complexity=1.0
    const result = dynamicTopK({
      inputLength: 200,
      intentCount: 5,
      entityCount: 10,
      baseTopK: 5,
      maxTopK: 20,
    });
    expect(result).toBe(20);
  });

  it("is strictly increasing with complexity", () => {
    const simple = dynamicTopK({
      inputLength: 5,
      intentCount: 1,
      entityCount: 1,
      baseTopK: 5,
      maxTopK: 20,
    });
    const medium = dynamicTopK({
      inputLength: 40,
      intentCount: 2,
      entityCount: 3,
      baseTopK: 5,
      maxTopK: 20,
    });
    const complex = dynamicTopK({
      inputLength: 120,
      intentCount: 4,
      entityCount: 8,
      baseTopK: 5,
      maxTopK: 20,
    });

    expect(simple).toBeLessThan(medium);
    expect(medium).toBeLessThan(complex);
  });

  it("never exceeds maxTopK", () => {
    const result = dynamicTopK({
      inputLength: 999,
      intentCount: 99,
      entityCount: 99,
      baseTopK: 5,
      maxTopK: 12,
    });
    expect(result).toBe(12);
  });
});
