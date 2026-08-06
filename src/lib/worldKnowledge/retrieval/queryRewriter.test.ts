// src/lib/worldKnowledge/retrieval/queryRewriter.test.ts
// Tests for enhancedSegmentCJK, shouldRewriteQuery, and enrichQueryHeuristically.

import { describe, it, expect, vi } from "vitest";

// queryRewriter.ts imports from @/ at module level — mock those so
// vitest can resolve the module under test.
vi.mock("@/lib/config/envRaw", () => ({
  envBoolean: vi.fn(() => false),
  envRaw: vi.fn(() => ""),
}));
vi.mock("@/lib/observability/langfuse", () => ({
  startGeneration: vi.fn(() => ({
    end: vi.fn(),
  })),
}));

import {
  enhancedSegmentCJK,
  shouldRewriteQuery,
  enrichQueryHeuristically,
} from "./queryRewriter";

// ── enhancedSegmentCJK ──────────────────────────────────────

describe("enhancedSegmentCJK", () => {
  it("extracts bigrams from basic Chinese text", () => {
    const tokens = enhancedSegmentCJK("老王在门厅");

    // Bigrams not in the function-word set are preserved.
    // "老王" and "门厅" are meaningful content; "老在", "王在", "在门"
    // are not in the set so they also appear.
    expect(tokens).toContain("老王");
    expect(tokens).toContain("门厅");
    // Trigrams for >= 3-char CJK runs: "老王在", "王在门", "在门厅"
    expect(tokens).toContain("老王在");
  });

  it("extracts trigrams from longer CJK phrases", () => {
    const tokens = enhancedSegmentCJK("图书馆管理员");

    expect(tokens).toContain("图书馆");  // trigram
    expect(tokens).toContain("书馆管");  // trigram
    expect(tokens).toContain("管理员");  // trigram
    expect(tokens).toContain("图书馆管理员"); // full word >= 3 chars
    // Bigrams
    expect(tokens).toContain("图书");
    expect(tokens).toContain("书馆");
    expect(tokens).toContain("馆管");
    expect(tokens).toContain("管理");
    expect(tokens).toContain("理员");
  });

  it("filters out common function words", () => {
    const tokens = enhancedSegmentCJK("你可以找到那个物品");

    // Function words filtered: 可以, 找到, 那个 are in FUNCTION_WORDS set
    expect(tokens).not.toContain("可以");
    expect(tokens).not.toContain("找到");
    expect(tokens).not.toContain("那个");
    // Content words preserved
    expect(tokens).toContain("物品");
    // "你可" is not in the set (only single "你" is), so it stays
    expect(tokens).toContain("你可");
  });

  it("handles sentence boundaries (punctuation)", () => {
    const tokens = enhancedSegmentCJK("老王在门厅。邮差去了二楼");

    // Each CJK run is processed within its sentence chunk
    expect(tokens).toContain("老王");
    expect(tokens).toContain("门厅");
    expect(tokens).toContain("邮差");
    expect(tokens).toContain("二楼");
  });

  it("does not generate cross-sentence bigrams/trigrams", () => {
    // Without sentence boundary, "厅邮" could be a cross-sentence bigram
    const tokens = enhancedSegmentCJK("老王在门厅。邮差去了二楼");

    // "厅邮" should NOT appear (belongs to different sentences)
    expect(tokens).not.toContain("厅邮");
  });

  it("deduplicates tokens across the output", () => {
    const tokens = enhancedSegmentCJK("门厅门厅门厅");

    const bigramCount = tokens.filter((t) => t === "门厅").length;
    expect(bigramCount).toBe(1); // deduped
  });

  it("returns empty array for non-CJK text", () => {
    expect(enhancedSegmentCJK("hello world")).toEqual([]);
    expect(enhancedSegmentCJK("12345")).toEqual([]);
  });

  it("handles mixed CJK and non-CJK text", () => {
    const tokens = enhancedSegmentCJK("暗月NPC在1F_Lobby");

    // Only CJK portions are tokenized
    expect(tokens).toContain("暗月");
  });

  it("skips CJK words shorter than 3 chars when they are not in bigrams", () => {
    // Single CJK chars or 2-char words are captured only as bigrams
    const tokens = enhancedSegmentCJK("老王走了");

    // "老王" is a bigram, "走了" is a bigram
    // "走" is not a function word but is 1 char so no full-word entry
    expect(tokens).not.toContain("走");
  });
});

// ── shouldRewriteQuery ──────────────────────────────────────

describe("shouldRewriteQuery", () => {
  it("returns false for very short inputs (< 4 chars)", () => {
    expect(shouldRewriteQuery("去")).toBe(false);
    expect(shouldRewriteQuery("看")).toBe(false);
    expect(shouldRewriteQuery("走吧")).toBe(false);
  });

  it("returns false for single-word short queries (≤ 6 chars, no spaces)", () => {
    expect(shouldRewriteQuery("暗月")).toBe(false);
    expect(shouldRewriteQuery("门厅探索")).toBe(false);
  });

  it("returns false for commands starting with /", () => {
    expect(shouldRewriteQuery("/help")).toBe(false);
    expect(shouldRewriteQuery("/status")).toBe(false);
  });

  it("returns false for pure punctuation or emoji", () => {
    expect(shouldRewriteQuery("…")).toBe(false);
    expect(shouldRewriteQuery("？。！")).toBe(false);
  });

  it("returns true for longer meaningful queries", () => {
    expect(shouldRewriteQuery("帮忙找一下钥匙")).toBe(true);
    expect(shouldRewriteQuery("我想知道那个NPC的故事")).toBe(true);
  });

  it("returns true for multi-word short queries", () => {
    // 8 chars with a space => len > 4 and has a space, so passes single-word check
    expect(shouldRewriteQuery("钥匙 在哪")).toBe(true);
  });
});

// ── enrichQueryHeuristically ────────────────────────────────

describe("enrichQueryHeuristically", () => {
  it("returns input unchanged when no location provided", () => {
    expect(enrichQueryHeuristically("调查房间")).toBe("调查房间");
  });

  it("appends location when input lacks floor/level markers", () => {
    const result = enrichQueryHeuristically("调查房间", "1F_Lobby");
    expect(result).toContain("调查房间");
    expect(result).toContain("1F_Lobby");
    // Should be space-separated
    expect(result).toBe("调查房间 1F_Lobby");
  });

  it("does not append location when input already contains floor marker", () => {
    const result = enrichQueryHeuristically("去3F看看", "1F_Lobby");
    expect(result).toBe("去3F看看"); // 3F matches the floor regex
  });

  it("does not append location when input already contains a level word", () => {
    expect(enrichQueryHeuristically("上一层楼", "2F")).toBe("上一层楼");
  });

  it("truncates result to 512 characters", () => {
    const longInput = "A".repeat(500);
    const result = enrichQueryHeuristically(longInput, "1F_Lobby");
    expect(result.length).toBeLessThanOrEqual(512);
  });

  it("handles null location gracefully", () => {
    expect(enrichQueryHeuristically("调查房间", null)).toBe("调查房间");
  });

  it("handles undefined/implicit location gracefully", () => {
    expect(enrichQueryHeuristically("调查房间")).toBe("调查房间");
  });
});
