// src/lib/worldKnowledge/retrieval/hybridFusion.test.ts
// Tests for RRF-based hybrid fusion and weighted score fusion.

import { describe, it, expect } from "vitest";
import { fuseResults, weightedScoreFusion, getHybridConfig } from "./hybridFusion";
import type { RetrievalCandidate } from "../types";

// ── Helpers ───────────────────────────────────────────────

function mkCandidate(
  factKey: string,
  score: number,
  from: RetrievalCandidate["debug"] extends { from?: infer F } ? NonNullable<F> : string,
  opts?: { factType?: string; canonicalText?: string; layer?: RetrievalCandidate["fact"]["layer"] },
): RetrievalCandidate {
  return {
    fact: {
      identity: { factKey },
      layer: opts?.layer ?? "shared_public_lore",
      factType: (opts?.factType as RetrievalCandidate["fact"]["factType"]) ?? "npc",
      canonicalText: opts?.canonicalText ?? `事实: ${factKey}`,
      source: { kind: "db" },
    },
    score,
    debug: { from },
  };
}

// ── 1. RRF fusion with equal weights ─────────────────────

describe("fuseResults — RRF fusion", () => {
  it("fuses FTS and vector results via RRF with equal weights", () => {
    // FTS results in descending score order
    const ftsA = mkCandidate("npc:wang", 0.9, "fts");
    const ftsB = mkCandidate("loc:park", 0.7, "fts");
    const ftsC = mkCandidate("item:key", 0.5, "fts");

    // Vector results in descending score order
    const vecA = mkCandidate("npc:wang", 0.85, "vector");
    const vecD = mkCandidate("loc:lobby", 0.8, "vector");
    const vecE = mkCandidate("event:fire", 0.6, "vector");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([ftsA, ftsB, ftsC, vecA, vecD, vecE], config);

    // npc:wang appears in both layers → scores sum: 1/(60+1) + 1/(60+1) ≈ 0.0328
    // loc:lobby only in vector rank 2 → 1/(60+2) ≈ 0.0161
    // loc:park only in FTS rank 2 → 1/(60+2) ≈ 0.0161
    // event:fire only in vector rank 3 → 1/(60+3) ≈ 0.0159
    // item:key only in FTS rank 3 → 1/(60+3) ≈ 0.0159
    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys[0]).toBe("npc:wang"); // highest RRF score (two layers)
    expect(result).toHaveLength(5); // all candidates included
  });

  // ── 2. Weighted RRF with different FTS/vector weights ───

  it("applies layer-specific weights in RRF scoring", () => {
    // Vector has a high-score candidate that would outrank FTS with equal weights
    const ftsA = mkCandidate("npc:wang", 0.9, "fts");
    const ftsB = mkCandidate("loc:park", 0.7, "fts");
    const vecC = mkCandidate("loc:lobby", 0.95, "vector");

    // With FTS weight = 3.0, vector = 1.0:
    // npc:wang RRF = 3.0 / (60+1) ≈ 0.0492
    // loc:lobby RRF = 1.0 / (60+1) ≈ 0.0164
    // loc:park RRF = 3.0 / (60+2) ≈ 0.0484
    const config = {
      ftsWeight: 3.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([ftsA, ftsB, vecC], config);

    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys[0]).toBe("npc:wang");
    expect(keys[1]).toBe("loc:park");
    expect(keys[2]).toBe("loc:lobby");
  });

  // ── 3. Exact/tag matches bypass fusion and appear first ─

  it("places exact and tag matches before fused results", () => {
    const exactA = mkCandidate("npc:boss", 1.0, "exact");
    const tagB = mkCandidate("loc:vault", 0.95, "tag");
    const ftsC = mkCandidate("npc:wang", 0.9, "fts");
    const vecD = mkCandidate("item:sword", 0.85, "vector");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([exactA, tagB, ftsC, vecD], config);

    const keys = result.map((c) => c.fact.identity.factKey);
    // Exact and tag must appear first
    expect(keys[0]).toBe("npc:boss");
    expect(keys[1]).toBe("loc:vault");
    // Then fused results
    expect(keys.slice(2)).toContain("npc:wang");
    expect(keys.slice(2)).toContain("item:sword");
    expect(result).toHaveLength(4);
  });

  it("always includes exact/tag matches even when topK is very small", () => {
    const exactA = mkCandidate("npc:boss", 1.0, "exact");
    const exactB = mkCandidate("loc:vault", 1.0, "exact");
    const tagC = mkCandidate("item:amulet", 0.9, "tag");
    const ftsD = mkCandidate("npc:wang", 0.95, "fts");
    const vecE = mkCandidate("event:ritual", 0.8, "vector");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 3, // Only room for exact + tag
    };

    const result = fuseResults([exactA, exactB, tagC, ftsD, vecE], config);

    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys).toContain("npc:boss");
    expect(keys).toContain("loc:vault");
    expect(keys).toContain("item:amulet");
    expect(result).toHaveLength(3);
  });

  // ── 4. Deduplication by factKey across layers ───────────

  it("deduplicates by factKey and keeps highest score per key", () => {
    // npc:wang appears in both FTS and vector with different scores
    const ftsA = mkCandidate("npc:wang", 0.9, "fts");
    const ftsB = mkCandidate("loc:park", 0.7, "fts");
    const vecC = mkCandidate("npc:wang", 0.85, "vector"); // same factKey
    const vecD = mkCandidate("item:key", 0.6, "vector");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([ftsA, ftsB, vecC, vecD], config);

    // npc:wang appears only once, and its individual score is the max of the two (0.9)
    const wangResults = result.filter((c) => c.fact.identity.factKey === "npc:wang");
    expect(wangResults).toHaveLength(1);
    expect(wangResults[0].score).toBe(0.9);
    expect(result).toHaveLength(3); // npc:wang, loc:park, item:key
  });

  it("deduplicates exact/tag matches by factKey keeping highest score", () => {
    const exactA = mkCandidate("npc:boss", 1.0, "exact");
    const tagB = mkCandidate("npc:boss", 0.8, "tag"); // same factKey dupe
    const ftsC = mkCandidate("loc:park", 0.7, "fts");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([exactA, tagB, ftsC], config);

    // npc:boss deduplicated: keeps exact (score 1.0 > 0.8)
    const bossResults = result.filter((c) => c.fact.identity.factKey === "npc:boss");
    expect(bossResults).toHaveLength(1);
    expect(bossResults[0].score).toBe(1.0);
  });

  it("excludes exact-covered keys from RRF fusion", () => {
    // exact already covers npc:wang → FTS version of npc:wang must not appear
    const exactA = mkCandidate("npc:wang", 1.0, "exact");
    const ftsB = mkCandidate("npc:wang", 0.9, "fts");
    const ftsC = mkCandidate("loc:park", 0.7, "fts");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([exactA, ftsB, ftsC], config);

    // npc:wang from exact only; FTS duplicate excluded
    const wangResults = result.filter((c) => c.fact.identity.factKey === "npc:wang");
    expect(wangResults).toHaveLength(1);
    // The surviving copy should be the exact one
    expect(wangResults[0].debug?.from).toBe("exact");
    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys).toEqual(["npc:wang", "loc:park"]);
  });

  // ── 5. topK truncation ──────────────────────────────────

  it("truncates results to config.topK", () => {
    const candidates: RetrievalCandidate[] = [];
    for (let i = 0; i < 20; i++) {
      candidates.push(mkCandidate(`fact:${i}`, 1.0 - i * 0.05, "fts"));
    }

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 5,
    };

    const result = fuseResults(candidates, config);
    expect(result).toHaveLength(5);
  });

  // ── 6. Empty input handling ─────────────────────────────

  it("returns empty array for empty candidate list", () => {
    const result = fuseResults([]);
    expect(result).toEqual([]);
  });

  // ── 7. weightedScoreFusion alternative path ─────────────

  describe("weightedScoreFusion", () => {
    it("combines FTS and vector scores via weighted normalization", () => {
      const ftsCandidates = [
        mkCandidate("npc:wang", 0.9, "fts"),
        mkCandidate("loc:park", 0.6, "fts"),
      ];
      const vecCandidates = [
        mkCandidate("npc:wang", 0.8, "vector"),
        mkCandidate("item:sword", 0.7, "vector"),
      ];

      const config = {
        ftsWeight: 1.2,
        vectorWeight: 1.0,
        rrfK: 60,
        topK: 10,
      };

      const result = weightedScoreFusion(ftsCandidates, vecCandidates, config);

      // npc:wang appears in both → normalized FTS (0.9/0.9=1.0) * (1.2/2.2) + vector (0.8/0.8=1.0) * (1.0/2.2)
      // ≈ 0.545 + 0.455 = 1.0
      // loc:park FTS only → 0.273, item:sword vector only → 0.318
      const keys = result.map((c) => c.fact.identity.factKey);
      expect(keys[0]).toBe("npc:wang"); // highest fused score
      expect(result).toHaveLength(3);
    });

    it("returns empty array for both empty inputs", () => {
      const result = weightedScoreFusion([], []);
      expect(result).toEqual([]);
    });

    it("handles single-layer input (FTS only)", () => {
      const ftsCandidates = [
        mkCandidate("npc:wang", 0.9, "fts"),
        mkCandidate("loc:park", 0.7, "fts"),
      ];

      const result = weightedScoreFusion(ftsCandidates, []);

      // Scores normalized then weighted by FTS only
      // npc:wang = (0.9/0.9) * (1.2/2.2) ≈ 0.545
      // loc:park = (0.7/0.9) * (1.2/2.2) ≈ 0.424
      const keys = result.map((c) => c.fact.identity.factKey);
      expect(keys[0]).toBe("npc:wang");
      expect(keys[1]).toBe("loc:park");
      expect(result).toHaveLength(2);
    });

    it("handles single-layer input (vector only)", () => {
      const vecCandidates = [
        mkCandidate("item:sword", 0.8, "vector"),
        mkCandidate("loc:lobby", 0.5, "vector"),
      ];

      const result = weightedScoreFusion([], vecCandidates);
      expect(result).toHaveLength(2);
      expect(result[0].fact.identity.factKey).toBe("item:sword");
    });

    it("respects topK truncation", () => {
      const ftsCandidates = [
        mkCandidate("npc:wang", 0.9, "fts"),
        mkCandidate("loc:park", 0.8, "fts"),
        mkCandidate("item:key", 0.7, "fts"),
        mkCandidate("event:fire", 0.6, "fts"),
        mkCandidate("npc:li", 0.5, "fts"),
      ];

      const config = {
        ftsWeight: 1.0,
        vectorWeight: 1.0,
        rrfK: 60,
        topK: 3,
      };

      const result = weightedScoreFusion(ftsCandidates, [], config);
      expect(result).toHaveLength(3);
    });
  });

  // ── 8. Single-layer-only input for fuseResults ──────────

  it("handles FTS-only candidates (no vector layer)", () => {
    const ftsA = mkCandidate("npc:wang", 0.9, "fts");
    const ftsB = mkCandidate("loc:park", 0.7, "fts");
    const ftsC = mkCandidate("item:key", 0.5, "fts");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([ftsA, ftsB, ftsC], config);

    // Pure FTS → RRF degenerates to single-layer scoring:
    // npc:wang = 1/(60+1), loc:park = 1/(60+2), item:key = 1/(60+3)
    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys).toEqual(["npc:wang", "loc:park", "item:key"]);
    expect(result).toHaveLength(3);
  });

  it("handles vector-only candidates (no FTS layer)", () => {
    const vecA = mkCandidate("npc:wang", 0.85, "vector");
    const vecB = mkCandidate("loc:lobby", 0.75, "vector");
    const vecC = mkCandidate("event:fire", 0.6, "vector");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([vecA, vecB, vecC], config);
    expect(result).toHaveLength(3);
    expect(result[0].fact.identity.factKey).toBe("npc:wang");
    expect(result[1].fact.identity.factKey).toBe("loc:lobby");
    expect(result[2].fact.identity.factKey).toBe("event:fire");
  });

  it("handles exact-only candidates (no FTS/vector layers)", () => {
    const exactA = mkCandidate("npc:boss", 1.0, "exact");
    const exactB = mkCandidate("loc:vault", 0.95, "exact");

    const config = {
      ftsWeight: 1.0,
      vectorWeight: 1.0,
      rrfK: 60,
      topK: 10,
    };

    const result = fuseResults([exactA, exactB], config);

    // Exact only, no fusion → just return them (deduped)
    expect(result).toHaveLength(2);
    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys).toEqual(["npc:boss", "loc:vault"]);
  });

  it("handles tag-only candidates (no FTS/vector layers)", () => {
    const tagA = mkCandidate("item:amulet", 0.9, "tag");
    const tagB = mkCandidate("event:ritual", 0.8, "tag");

    const result = fuseResults([tagA, tagB]);
    expect(result).toHaveLength(2);
    const keys = result.map((c) => c.fact.identity.factKey);
    expect(keys).toEqual(["item:amulet", "event:ritual"]);
  });
});

// ── getHybridConfig defaults ──────────────────────────────

describe("getHybridConfig", () => {
  it("returns default config values", () => {
    const cfg = getHybridConfig();
    expect(cfg.ftsWeight).toBe(1.2);
    expect(cfg.vectorWeight).toBe(1.0);
    expect(cfg.rrfK).toBe(60);
    expect(cfg.topK).toBe(14);
  });
});
