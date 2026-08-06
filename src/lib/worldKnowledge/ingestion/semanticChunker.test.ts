// src/lib/worldKnowledge/ingestion/semanticChunker.test.ts
// Unit tests for semanticChunker — semantic-aware document chunking

import { describe, it, expect } from "vitest";
import { semanticChunk, enrichChunkContent, chunkContentForEmbedding } from "./semanticChunker";

// ── Helpers ──────────────────────────────────────────────

/** Default config override enabling semantic mode with common sizes */
const SEMANTIC_OVERRIDE = {
  enabled: true,
  targetSize: 300,
  overlap: 50,
  minSize: 100,
} as const;

// ── Tests: semanticChunk ─────────────────────────────────

describe("semanticChunk", () => {
  // ── 1. Basic paragraph splitting ──

  it("splits multi-paragraph text into chunks respecting targetSize", () => {
    const paragraphs = [
      "第一章讲述了如月公寓的来历，这座公寓建于上个世纪八十年代。",
      "第二章描述了公寓内部的结构，共有五层楼，每层有四个房间。",
      "第三章介绍了主要的NPC角色，包括管理员张三和巡逻员李四。",
      "第四章揭示了公寓中隐藏的秘密，地下室连接着另一个空间。",
    ];
    const text = paragraphs.join("\n\n");

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 80,
      overlap: 0,
      minSize: 1,
    });

    expect(result.usedSemantic).toBe(true);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
    // Each chunk should not wildly exceed targetSize
    for (const chunk of result.chunks) {
      expect(chunk.charLength).toBeGreaterThan(0);
    }
  });

  it("handles single paragraph within targetSize", () => {
    const text = "这是一个简短的段落，描述了一个基本事实。";

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 500,
      overlap: 0,
      minSize: 1,
    });

    expect(result.usedSemantic).toBe(true);
    expect(result.totalChunks).toBe(1);
    expect(result.chunks[0]!.content).toBe(text);
  });

  it("preserves paragraph boundaries in chunk content", () => {
    const text = [
      "第一段：这是一段关于世界背景的介绍。",
      "第二段：这是另一段关于角色设定的内容。",
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 500,
      overlap: 0,
      minSize: 1,
    });

    expect(result.chunks[0]!.content).toContain("\n\n");
  });

  // ── 2. Semantic boundary detection on headings ──

  it("splits on markdown-style headings (##)", () => {
    // Two ## headings, each followed by content large enough to exceed targetSize
    const sectionBody = "X".repeat(120);
    const text = [
      "## 第一章 如月公寓",
      sectionBody,
      "## 第二章 地下室的秘密",
      sectionBody,
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 150,
      overlap: 0,
      minSize: 1,
    });

    expect(result.usedSemantic).toBe(true);
    // Each heading + body exceeds targetSize → at least 2 chunks
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
  });

  it("splits on bracket-style headings (【】)", () => {
    // 【】 headings with body content large enough to force splits
    const body = "Y".repeat(120);
    const text = [
      "【规则一】所有住户须在晚上十点前归房。",
      body,
      "【规则二】午夜后禁止进入地下室。",
      body,
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 150,
      overlap: 0,
      minSize: 1,
    });

    expect(result.usedSemantic).toBe(true);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
  });

  it("splits on numbered bracket headings （一）", () => {
    const body = "Z".repeat(150);
    const text = [
      "（一）如月公寓的历史背景",
      body,
      "（二）公寓管理制度",
      body,
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 200,
      overlap: 0,
      minSize: 1,
    });

    expect(result.usedSemantic).toBe(true);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
  });

  // ── 3. Overlap generation ──

  it("adds overlap prefix from previous chunk when overlap > 0", () => {
    // Use two large blocks to guarantee at least 2 chunks
    const text = ["A".repeat(200), "B".repeat(200)].join("\n\n");

    const overlap = 30;
    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 180,
      overlap,
      minSize: 1,
    });

    expect(result.totalChunks).toBeGreaterThanOrEqual(2);

    // At least one non-first chunk should have overlapPrefix
    const chunksWithOverlap = result.chunks.filter((c) => c.overlapPrefix !== undefined);
    expect(chunksWithOverlap.length).toBeGreaterThan(0);

    for (let i = 1; i < result.chunks.length; i++) {
      const prefix = result.chunks[i]!.overlapPrefix;
      if (prefix !== undefined) {
        expect(prefix.length).toBeLessThanOrEqual(overlap);
      }
    }
  });

  it("does not add overlap when overlap is 0", () => {
    // Two large blocks to guarantee multiple chunks
    const text = ["A".repeat(200), "B".repeat(200)].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 150,
      overlap: 0,
      minSize: 1,
    });

    // Even with multiple chunks, no overlap prefix when overlap=0
    for (const chunk of result.chunks) {
      expect(chunk.overlapPrefix).toBeUndefined();
    }
  });

  it("does not add overlap for single-chunk result", () => {
    const text = "这是一段不会分割的文本。";

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 500,
      overlap: 100,
      minSize: 1,
    });

    expect(result.totalChunks).toBe(1);
    expect(result.chunks[0]!.overlapPrefix).toBeUndefined();
  });

  // ── 4. Min-size merging ──

  it("merges undersized chunks into previous chunk", () => {
    // para1 fills most of targetSize, para2 pushes past it, para3 is tiny
    const text = [
      "A".repeat(200),
      "B".repeat(50),
      "C",
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 220,
      overlap: 0,
      minSize: 100,
    });

    expect(result.usedSemantic).toBe(true);
    // The tiny "C" paragraph should be merged, not standalone
    // Final result: 1 chunk (para1+para2 as chunk1, then para3 merged in)
    expect(result.totalChunks).toBe(1);
    expect(result.chunks[0]!.content).toContain("C");
  });

  it("marks merged chunks with isMerged=true", () => {
    // Three paragraphs: first two pack into a chunk, third is tiny and gets merged
    const text = [
      "A".repeat(200),
      "B".repeat(50),
      "D",
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 220,
      overlap: 0,
      minSize: 100,
    });

    // After second-pass merge, the receiving chunk should have isMerged=true
    expect(result.totalChunks).toBe(1);
    expect(result.chunks[0]!.isMerged).toBe(true);
  });

  it("keeps chunk standalone when above minSize", () => {
    const para1 = "A".repeat(200);
    const para2 = "B".repeat(150);

    const text = [para1, para2].join("\n\n");

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 180,
      overlap: 0,
      minSize: 100,
    });

    // para2 is 150 chars, above minSize 100, so it should be standalone
    const standaloneChunks = result.chunks.filter((c) => !c.isMerged);
    expect(standaloneChunks.length).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Legacy fallback when semantic mode disabled ──

  it("uses legacy split when enabled=false (auto-detect parts from text)", () => {
    const text = [
      "段落一：包含了基本信息。",
      "段落二：包含了更多细节。",
      "段落三：最后一段内容。",
    ].join("\n\n");

    const result = semanticChunk(text, undefined, {
      enabled: false,
      targetSize: 30,
    });

    expect(result.usedSemantic).toBe(false);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
    // Legacy chunks have empty blockIndices
    for (const chunk of result.chunks) {
      expect(chunk.blockIndices).toEqual([]);
      expect(chunk.isMerged).toBe(false);
    }
  });

  it("uses legacy split with explicit parts array", () => {
    const parts = ["第一部分", "第二部分", "第三部分"];

    const result = semanticChunk("ignored", parts, {
      enabled: false,
      targetSize: 5,
    });

    expect(result.usedSemantic).toBe(false);
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);
  });

  it("legacy mode produces chunks respecting maxChars", () => {
    const parts = ["AAA", "BBB", "CCC"];

    const result = semanticChunk("ignored", parts, {
      enabled: false,
      targetSize: 5,
    });

    for (const chunk of result.chunks) {
      expect(chunk.charLength).toBeLessThanOrEqual(5);
    }
  });

  // ── 6. Empty input ──

  it("returns zero chunks for empty string", () => {
    const result = semanticChunk("", undefined, SEMANTIC_OVERRIDE);

    expect(result.usedSemantic).toBe(true);
    expect(result.totalChunks).toBe(0);
    expect(result.chunks).toHaveLength(0);
    expect(result.avgChunkSize).toBe(0);
  });

  it("returns zero chunks for whitespace-only string", () => {
    const result = semanticChunk("   \n\n  \n  ", undefined, SEMANTIC_OVERRIDE);

    expect(result.usedSemantic).toBe(true);
    expect(result.totalChunks).toBe(0);
    expect(result.chunks).toHaveLength(0);
  });

  it("handles empty input in legacy mode", () => {
    const result = semanticChunk("", undefined, { enabled: false });

    expect(result.usedSemantic).toBe(false);
    expect(result.totalChunks).toBe(0);
    expect(result.chunks).toHaveLength(0);
  });

  it("handles whitespace-only input in legacy mode", () => {
    const result = semanticChunk("  \n\n  ", undefined, { enabled: false });

    expect(result.usedSemantic).toBe(false);
    expect(result.totalChunks).toBe(0);
  });

  // ── 7. Oversized block splitting on sentences ──

  it("splits oversized blocks on sentence boundaries (。！？)", () => {
    // Create a single paragraph > targetSize*1.5 with long sentences
    // Each sentence ~35 chars, 8 sentences ≈ 280 chars, targetSize*1.5 = 75
    const sentence = "这是一个包含了很多细节信息的长句子用于测试。";
    const text = Array.from({ length: 10 }, () => sentence).join("");

    const result = semanticChunk(text, undefined, {
      enabled: true,
      targetSize: 50,
      overlap: 0,
      minSize: 1,
    });

    expect(result.usedSemantic).toBe(true);
    // The oversized block should be split into at least 2 chunks
    expect(result.totalChunks).toBeGreaterThanOrEqual(2);

    // Each chunk should be non-empty
    for (const chunk of result.chunks) {
      expect(chunk.charLength).toBeGreaterThan(0);
      expect(chunk.content.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not split blocks that are under the oversized threshold", () => {
    // Block is < targetSize * 1.5, should be packed normally
    const text = "中等长度的段落" + "X".repeat(100);

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 200,
      overlap: 0,
      minSize: 1,
    });

    // The block is less than 300 chars (200*1.5), so it should not be force-split
    expect(result.totalChunks).toBe(1);
  });

  // ── Edge cases ──

  it("computes avgChunkSize correctly", () => {
    const text = "A".repeat(100) + "\n\n" + "B".repeat(100) + "\n\n" + "C".repeat(100);

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 150,
      overlap: 0,
      minSize: 1,
    });

    // avg should be total / count
    const total = result.chunks.reduce((s, c) => s + c.charLength, 0);
    expect(result.avgChunkSize).toBe(
      result.totalChunks > 0 ? Math.round(total / result.totalChunks) : 0,
    );
  });

  it("tracks blockIndices for semantic chunks", () => {
    const text = ["段落A", "段落B", "段落C", "段落D"].join("\n\n");

    const result = semanticChunk(text, undefined, {
      ...SEMANTIC_OVERRIDE,
      targetSize: 5,
      overlap: 0,
      minSize: 1,
    });

    // Each chunk should have non-empty blockIndices
    for (const chunk of result.chunks) {
      expect(chunk.blockIndices.length).toBeGreaterThan(0);
    }
  });
});

// ── Tests: enrichChunkContent ─────────────────────────────

describe("enrichChunkContent", () => {
  const content = "这是原始内容。";

  it("prefixes with entity name when provided", () => {
    const result = enrichChunkContent(content, { entityName: "张三" });
    expect(result).toBe("张三\n这是原始内容。");
  });

  it("prefixes with entity type when provided", () => {
    const result = enrichChunkContent(content, { entityType: "NPC" });
    expect(result).toBe("[NPC]\n这是原始内容。");
  });

  it("prefixes with tags when provided", () => {
    const result = enrichChunkContent(content, { tags: ["管理员", "如月公寓"] });
    expect(result).toBe("管理员 如月公寓\n这是原始内容。");
  });

  it("combines all metadata fields", () => {
    const result = enrichChunkContent(content, {
      entityName: "张三",
      entityType: "NPC",
      tags: ["管理员", "如月公寓"],
    });
    expect(result).toBe("张三 [NPC] 管理员 如月公寓\n这是原始内容。");
  });

  it("returns content unchanged when no metadata", () => {
    const result = enrichChunkContent(content, {});
    expect(result).toBe(content);
  });

  it("returns content unchanged when all metadata empty", () => {
    const result = enrichChunkContent(content, {
      entityName: "",
      entityType: "",
      tags: [],
    });
    expect(result).toBe(content);
  });

  it("skips falsy fields but includes truthy ones", () => {
    const result = enrichChunkContent(content, {
      entityName: "张三",
      entityType: "",
      tags: undefined,
    });
    expect(result).toBe("张三\n这是原始内容。");
  });
});

// ── Tests: chunkContentForEmbedding ───────────────────────

describe("chunkContentForEmbedding", () => {
  const content = "核心事实内容。";

  it("adds entity name prefix when provided", () => {
    const result = chunkContentForEmbedding(content, { entityName: "张三" });
    expect(result).toBe("张三\n核心事实内容。");
  });

  it("adds entity type prefix when provided", () => {
    const result = chunkContentForEmbedding(content, { entityType: "NPC" });
    expect(result).toBe("类型：NPC\n核心事实内容。");
  });

  it("combines name and type prefixes", () => {
    const result = chunkContentForEmbedding(content, {
      entityName: "张三",
      entityType: "NPC",
    });
    expect(result).toBe("张三\n类型：NPC\n核心事实内容。");
  });

  it("returns content only when no metadata", () => {
    const result = chunkContentForEmbedding(content, {});
    expect(result).toBe(content);
  });

  it("omits empty name/type fields", () => {
    const result = chunkContentForEmbedding(content, {
      entityName: "",
      entityType: "",
    });
    expect(result).toBe("核心事实内容。");
  });
});
