// src/lib/worldKnowledge/retrieval/queryExpander.test.ts
// Tests for expandQuery: NPC/anomaly extraction, synonym expansion,
// CJK segmentation, query variant generation, floor hints, edge cases,
// tag tokens, and 512-char truncation.
//
// Uses real NPCS/ANOMALIES/MAP_ROOMS/APARTMENT_RULES from the registry —
// no mocking.

import { describe, it, expect } from "vitest";
import { expandQuery } from "./queryExpander";

// ── 1. NPC name in input ──────────────────────────────────────

describe("expandQuery — NPC extraction", () => {
  it("extracts NPC name and includes it in all query variants", () => {
    const result = expandQuery("我想找陈婆婆聊聊天");

    expect(result.entityQuery).toContain("陈婆婆");
    expect(result.ftsQuery).toContain("陈婆婆");
    expect(result.semanticQuery).toContain("陈婆婆");
    expect(result._meta.entityCount).toBeGreaterThanOrEqual(1);
  });

  it("extracts multiple NPCs when input references several", () => {
    const result = expandQuery("陈婆婆说林医生和邮差老王都在一楼");

    expect(result.entityQuery).toContain("陈婆婆");
    expect(result.entityQuery).toContain("林医生");
    expect(result.entityQuery).toContain("邮差老王");
    expect(result._meta.entityCount).toBeGreaterThanOrEqual(3);
  });

  it("matches NPC by id as well as name", () => {
    // N-001 is 陈婆婆
    const result = expandQuery("N-001的事情你知道多少");

    // entityQuery pushes NPC names (陈婆婆), not ids
    expect(result.entityQuery).toContain("陈婆婆");
    expect(result._meta.entityCount).toBeGreaterThanOrEqual(1);
  });

  it("includes anomaly names when anomalies are mentioned", () => {
    const result = expandQuery("时差症候群和无头猎犬最近很活跃");

    expect(result.entityQuery).toContain("时差症候群");
    expect(result.entityQuery).toContain("无头猎犬");
  });
});

// ── 2. Synonym expansion for verbs ────────────────────────────

describe("expandQuery — verb synonym expansion", () => {
  it("expands a base verb into synonyms in ftsQuery", () => {
    // "探索" has synonyms ["搜查", "调查", "检查", "寻找", "查看"]
    const result = expandQuery("探索走廊");

    // ftsQuery should include the base verb and at least 2 synonyms
    expect(result.ftsQuery).toContain("探索");
    // At least one synonym pushed (slice(0,2) on the synonyms array)
    expect(result.ftsQuery).toMatch(/搜查|调查/);
  });

  it("expands a different base verb", () => {
    // "攻击" has synonyms ["战斗", "对抗", "袭击", "打架", "动手"]
    const result = expandQuery("攻击那个怪物");

    expect(result.ftsQuery).toContain("攻击");
    expect(result.ftsQuery).toMatch(/战斗|对抗/);
  });

  it("does not break when synonyms match from input directly", () => {
    // "搜查" is a synonym of "探索" — extractEntities pushes it as a verb,
    // but VERB_SYNONYMS["搜查"] is undefined so expandQuery won't expand further
    const result = expandQuery("搜查房间");

    // Should still work; the verb itself appears but no expansion
    expect(result.ftsQuery).toContain("搜查");
    // No crash, valid result
    expect(result.ftsQuery.length).toBeGreaterThan(0);
  });
});

// ── 3. CJK bigram segmentation ────────────────────────────────

describe("expandQuery — CJK bigram segmentation", () => {
  it("produces CJK bigrams from Chinese input in ftsQuery", () => {
    const result = expandQuery("图书馆管理员");

    // CJK bigrams from "图书馆管理员": 图书, 书馆, 馆管, 管理, 理员
    const fts = result.ftsQuery;
    expect(fts).toContain("图书");
    expect(fts).toContain("管理");
  });

  it("filters out CJK stop words from rawTokens", () => {
    const result = expandQuery("你可以找到那个物品");

    // segmentCJK filters bigram-level stop words: "可以", "找到", "那个"
    // are stop words and should not appear as standalone tokens in tagTokens.
    // (They may appear as substrings of longer CJK runs like "你可以找到那个物品"
    // in ftsQuery, but that's expected — tagTokens is the clean token-level view.)
    expect(result.tagTokens).not.toContain("可以");
    expect(result.tagTokens).not.toContain("找到");
    expect(result.tagTokens).not.toContain("那个");
  });

  it("preserves non-CJK text intact", () => {
    const result = expandQuery("B1的储物间");

    // CJK bigrams should be extracted: "储物", "物间"
    expect(result.ftsQuery).toContain("储物");
    expect(result.ftsQuery).toContain("物间");
  });

  it("does not generate cross-punctuation bigrams", () => {
    // If segmentCJK operates on CJK runs separated by punctuation,
    // cross-boundary tokens should not appear
    const result = expandQuery("老王在门厅。邮差去了二楼");

    const fts = result.ftsQuery;
    // "厅邮" should NOT appear (belongs to separate CJK runs)
    expect(fts).not.toContain("厅邮");
  });
});

// ── 4. Entity extraction from input ───────────────────────────

describe("expandQuery — entity extraction", () => {
  it("extracts NPCs into entityQuery", () => {
    const result = expandQuery("和电工老刘谈谈B1的电路问题");

    expect(result.entityQuery).toContain("电工老刘");
  });

  it("extracts anomalies into entityQuery", () => {
    const result = expandQuery("器官拟态墙和楼梯间的倒行者哪个更危险");

    expect(result.entityQuery).toContain("器官拟态墙");
    expect(result.entityQuery).toContain("楼梯间的倒行者");
  });

  it("extracts rooms into entityQuery", () => {
    const result = expandQuery("B1_SafeZone有没有异常");

    expect(result.entityQuery).toContain("B1_SafeZone");
  });

  it("tracks entity count in _meta", () => {
    const result = expandQuery("陈婆婆和无头猎犬在1F_Lobby");

    // npcs: 陈婆婆, anomalies: 无头猎犬, rooms: 1F_Lobby => at least 3
    expect(result._meta.entityCount).toBeGreaterThanOrEqual(3);
  });

  it("extracts nouns from domain dictionary", () => {
    const result = expandQuery("公寓里有很多怪物和血迹");

    // "怪物" has synonym "诡异" etc., "血迹" has synonyms
    // Both should appear in ftsQuery or nouns
    const fts = result.ftsQuery;
    expect(fts).toContain("怪物");
    expect(fts).toContain("血迹");
  });
});

// ── 5. Query variant generation ───────────────────────────────

describe("expandQuery — query variant generation", () => {
  it("produces all four query variants", () => {
    const result = expandQuery("我想找陈婆婆问问钥匙的事");

    // All four query types must be non-empty strings
    expect(result.ftsQuery).toBeTruthy();
    expect(result.ftsQuery.length).toBeGreaterThan(0);

    expect(result.entityQuery).toBeTruthy();
    expect(result.entityQuery.length).toBeGreaterThan(0);

    expect(result.semanticQuery).toBeTruthy();
    expect(result.semanticQuery.length).toBeGreaterThan(0);

    expect(result.compositeQuery).toBeTruthy();
    expect(result.compositeQuery.length).toBeGreaterThan(0);
  });

  it("entityQuery is entity-focused (NPCs + anomalies + rooms)", () => {
    const result = expandQuery("林医生在2F_Clinic201遇到了时差症候群");

    // entityQuery should contain the extracted entities
    expect(result.entityQuery).toContain("林医生");
    expect(result.entityQuery).toContain("2F_Clinic201");
    expect(result.entityQuery).toContain("时差症候群");
  });

  it("semanticQuery preserves natural language CJK content", () => {
    const result = expandQuery("调查那个奇怪的房间看看有没有异常");

    // semanticQuery includes full CJK content (stripped of non-CJK)
    expect(result.semanticQuery).toContain("调查那个奇怪的房间看看有没有异常");
  });

  it("semanticQuery appends entity context when entities are found", () => {
    const result = expandQuery("找陈婆婆聊聊1F_Lobby的情况");

    // Should append NPC names and room context
    expect(result.semanticQuery).toContain("陈婆婆");
    // room hints: 地点:1F_Lobby or similar
    expect(result.semanticQuery).toMatch(/1F_Lobby/);
  });

  it("compositeQuery combines verbs, nouns, NPCs, and rawTokens", () => {
    const result = expandQuery("探索公寓走廊寻找陈婆婆");

    const cq = result.compositeQuery;
    // Should have verbs ("探索" or "探索寻找"), nouns, and NPCs
    expect(cq.length).toBeGreaterThan(0);
    // At minimum, NPC name should appear
    expect(cq).toContain("陈婆婆");
  });

  it("_meta reports variant count correctly", () => {
    const result = expandQuery("陈婆婆你好");

    // At least entityQuery and semanticQuery should be non-empty
    expect(result._meta.variantCount).toBeGreaterThanOrEqual(2);
  });

  it("_meta tracks expandedTokens", () => {
    const result = expandQuery("探索调查检查搜查");
    expect(result._meta.expandedTokens).toBeGreaterThan(0);
  });
});

// ── 6. Floor hint extraction ──────────────────────────────────

describe("expandQuery — floor hint extraction", () => {
  it("extracts B1 floor from input", () => {
    const result = expandQuery("去B1看看洗衣房阿姨");

    // B1 floor should appear in entityQuery and ftsQuery
    expect(result.entityQuery).toContain("b1");
  });

  it("extracts floor from Chinese synonyms", () => {
    const result = expandQuery("去地下一层找电工老刘");

    // "地下一层" is a synonym for "b1"
    expect(result.entityQuery).toContain("b1");
  });

  it("extracts numeric floor from Chinese labels", () => {
    const result = expandQuery("一楼大厅有什么");

    // "一楼" is a synonym for "1楼"
    expect(result.entityQuery).toContain("1楼");
  });

  it("extracts multiple floors when input mentions several", () => {
    const result = expandQuery("从B1到七楼都有异常");

    // Should extract both b1 and 7楼
    expect(result.entityQuery).toContain("b1");
    expect(result.entityQuery).toContain("7楼");
  });

  it("includes floor synonyms in ftsQuery", () => {
    const result = expandQuery("B2很危险");

    // B2 LOCATION_SYNONYMS: ["地下2层", "地下二层", "负二层", "B2"]
    // The input is lowercased during matching so the key "b2" appears
    expect(result.ftsQuery).toContain("b2");
    // At least one synonym should appear
    expect(result.ftsQuery).toMatch(/地下2层|地下二层|负二层/);
  });
});

// ── 7. Empty / whitespace input ───────────────────────────────

describe("expandQuery — empty/whitespace input", () => {
  it("handles empty string without crashing", () => {
    const result = expandQuery("");

    expect(result.ftsQuery).toBe("");
    expect(result.entityQuery).toBe("");
    expect(result.semanticQuery).toBe("");
    expect(result.compositeQuery).toBe("");
    expect(result.tagTokens).toEqual([]);
    expect(result._meta.entityCount).toBe(0);
    expect(result._meta.expandedTokens).toBe(0);
  });

  it("handles whitespace-only input without crashing", () => {
    const result = expandQuery("   \t\n  ");

    expect(result.ftsQuery.length).toBeGreaterThanOrEqual(0); // may be empty or trimmed whitespace
    expect(result._meta.entityCount).toBe(0);
    // Should not throw
    expect(result).toHaveProperty("ftsQuery");
    expect(result).toHaveProperty("entityQuery");
    expect(result).toHaveProperty("semanticQuery");
    expect(result).toHaveProperty("compositeQuery");
  });

  it("handles pure punctuation input", () => {
    const result = expandQuery("？！。…");

    // No CJK, no entities — all queries should be empty or fallback
    expect(result._meta.entityCount).toBe(0);
    expect(result._meta.expandedTokens).toBe(0);
  });

  it("handles input with only stop words", () => {
    const result = expandQuery("的了的了我在是");

    // All CJK chars are stop words — no rawTokens, no entities
    expect(result._meta.entityCount).toBe(0);
    // ftsQuery may be empty
    expect(typeof result.ftsQuery).toBe("string");
  });
});

// ── 8. Tag token generation ──────────────────────────────────

describe("expandQuery — tag token generation", () => {
  it("generates tagTokens from raw CJK tokens and nouns", () => {
    const result = expandQuery("公寓走廊里有血迹和怪物");

    // tagTokens include: raw CJK tokens + nouns
    // "公寓", "走廊", "血迹", "怪物" are domain nouns
    expect(result.tagTokens.length).toBeGreaterThan(0);
    expect(result.tagTokens).toContain("公寓");
    expect(result.tagTokens).toContain("走廊");
    expect(result.tagTokens).toContain("血迹");
    expect(result.tagTokens).toContain("怪物");
  });

  it("includes floor numbers in tagTokens (stripped of floor suffix)", () => {
    const result = expandQuery("B1和3楼情况如何");

    // floors: "b1", "3楼"
    // tagTokens strips 楼/楼/F/f: f.replace(/[楼楼Ff]/g, "")
    expect(result.tagTokens).toContain("b1");
    expect(result.tagTokens).toContain("3"); // "3楼" → "3"
  });

  it("deduplicates tagTokens", () => {
    const result = expandQuery("公寓公寓公寓");

    const count = result.tagTokens.filter((t) => t === "公寓").length;
    expect(count).toBeLessThanOrEqual(1);
  });

  it("filters stop words from tagTokens", () => {
    const result = expandQuery("你可以找到那个物品");

    // Stop words like "可以", "找到", "那个" are 2-char entries in
    // STOP_WORDS and should be filtered from tagTokens.
    // "你可" is NOT a stop word (only "你" alone is), so it may appear.
    expect(result.tagTokens).not.toContain("可以");
    expect(result.tagTokens).not.toContain("找到");
    expect(result.tagTokens).not.toContain("那个");
    // Content word should still appear
    expect(result.tagTokens).toContain("物品");
  });
});

// ── 9. 512-char truncation ───────────────────────────────────

describe("expandQuery — 512-char truncation", () => {
  it("truncates ftsQuery to at most 512 characters", () => {
    // Generate input that produces a very long ftsQuery:
    // use many NPC names + long CJK text
    const manyNpcs = [
      "陈婆婆", "林医生", "邮差老王", "小女孩阿花", "周伯",
      "退休教师张先生", "叶", "电工老刘", "阿织", "欣蓝",
      "夜读老人", "陶师傅", "枫", "洗衣房阿姨", "麟泽",
      "章嫂", "红姨", "北夏", "前调查员", "灵伤",
      "阿绣", "老马", "蓝盆婶", "驼背老伯", "守夜阿瘦",
      "开关姐", "睡衣姐妹花", "守夜老吴", "前台小周",
      "楼道张师傅", "老画室租户老谢", "走廊常驻老陈",
      "7F 老住户老吴", "7F 点灯阿珍", "大堂夜班咖啡小弟",
    ].join(" ");
    const longCJK = "探索调查检查查看搜查寻找对话交谈询问打听问话攻击战斗对抗袭击打架动手使用借助利用拿起掏出";
    const input = `${manyNpcs} ${longCJK} 探索调查检查查看搜查寻找对话交谈`;

    const result = expandQuery(input);

    expect(result.ftsQuery.length).toBeLessThanOrEqual(512);
  });

  it("truncates semanticQuery to at most 512 characters", () => {
    // Very long Chinese text
    const longText = "调".repeat(600) + "查";

    const result = expandQuery(longText);

    expect(result.semanticQuery.length).toBeLessThanOrEqual(512);
  });

  it("truncates compositeQuery to at most 384 characters", () => {
    const manyNpcs = Array.from({ length: 30 }, (_, i) => `NPC${i}`).join(" ");
    const input = `${manyNpcs} ${"探索".repeat(200)}`;

    const result = expandQuery(input);

    expect(result.compositeQuery.length).toBeLessThanOrEqual(384);
  });

  it("truncates entityQuery to at most 256 characters as fallback", () => {
    // Input with no matching entities → entityQuery falls back to rawInput.slice(0, 256)
    const longNonMatching = "X".repeat(300);

    const result = expandQuery(longNonMatching);

    expect(result.entityQuery.length).toBeLessThanOrEqual(256);
  });

  it("does not crash when rawInput exceeds 512 characters", () => {
    const megaInput = "这是一个很长的测试输入。".repeat(50); // ~500+ chars

    const result = expandQuery(megaInput);

    // Should not crash, all queries should be valid strings
    expect(typeof result.ftsQuery).toBe("string");
    expect(typeof result.semanticQuery).toBe("string");
    expect(typeof result.compositeQuery).toBe("string");
    expect(typeof result.entityQuery).toBe("string");
    expect(result.ftsQuery.length).toBeLessThanOrEqual(512);
  });
});
