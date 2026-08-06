// src/lib/worldKnowledge/retrieval/factValidator.test.ts
// Unit tests for factValidator — post-retrieval fact validation

import { describe, it, expect } from "vitest";
import { validateRetrievedFacts } from "./factValidator";
import type { RetrievalCandidate, LoreFact } from "../types";

function makeFact(overrides: Partial<LoreFact> = {}): LoreFact {
  const key = overrides.identity?.factKey ?? `test:${Math.random().toString(36).slice(2, 8)}`;
  return {
    identity: { factKey: key },
    layer: "core_canon",
    factType: "npc",
    canonicalText: "NPC张三是如月公寓的管理员，负责登记和秩序维护。",
    source: { kind: "db", entityId: "npc:N-011" },
    isHot: false,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<RetrievalCandidate> = {}, factOverrides: Partial<LoreFact> = {}): RetrievalCandidate {
  return {
    fact: makeFact(factOverrides),
    score: 0.85,
    debug: { from: "fts" },
    ...overrides,
  };
}

describe("validateRetrievedFacts", () => {
  it("returns all candidates when no issues found", () => {
    const candidates = [
      makeCandidate({}, { identity: { factKey: "entityA:0" }, canonicalText: "张三住在3楼401室" }),
      makeCandidate({}, { identity: { factKey: "entityB:0" }, canonicalText: "李四负责B1区域的巡逻" }),
      makeCandidate({}, { identity: { factKey: "entityC:0" }, canonicalText: "5楼的诡异会在午夜出现" }),
    ];

    const result = validateRetrievedFacts(candidates, { detectContradictions: false });
    expect(result.valid.length).toBe(3);
    expect(result.filtered.length).toBe(0);
    expect(result.issues.length).toBe(0);
  });

  it("detects and filters near-duplicate content", () => {
    const candidates = [
      makeCandidate({}, { canonicalText: "张三住在3楼401室，他是公寓的管理员" }),
      makeCandidate({}, { canonicalText: "张三住在3楼401室" }), // near-dup
      makeCandidate({}, { canonicalText: "李四负责巡逻" }),
    ];

    const result = validateRetrievedFacts(candidates, { filterDuplicates: true });
    expect(result.filtered.length).toBe(1);
    expect(result.valid.length).toBe(2);
    expect(result.issues.some((i) => i.code === "near_duplicate")).toBe(true);
  });

  it("does not filter duplicates when filterDuplicates is false", () => {
    const candidates = [
      makeCandidate({}, { canonicalText: "张三住在3楼401室，他是公寓的管理员" }),
      makeCandidate({}, { canonicalText: "张三住在3楼401室" }),
    ];

    const result = validateRetrievedFacts(candidates, { filterDuplicates: false });
    expect(result.filtered.length).toBe(0);
    expect(result.valid.length).toBe(2);
    expect(result.issues.some((i) => i.code === "near_duplicate")).toBe(true);
  });

  it("detects scope-source mismatch for session facts", () => {
    const candidates = [
      makeCandidate({}, {
        layer: "session_ephemeral_facts",
        source: { kind: "db", entityId: "test" },
      }),
    ];

    const result = validateRetrievedFacts(candidates);
    expect(result.issues.some((i) => i.code === "scope_source_mismatch")).toBe(true);
  });

  it("detects bootstrap facts without source reference", () => {
    const candidates = [
      makeCandidate({}, {
        source: { kind: "bootstrap" },
      }),
    ];

    const result = validateRetrievedFacts(candidates);
    expect(result.issues.some((i) => i.code === "bootstrap_no_source")).toBe(true);
  });

  it("detects low-relevance noise", () => {
    const candidates = [
      makeCandidate({ score: 0.15 }, { factType: "npc" }),
      makeCandidate({ score: 0.05 }, { factType: "location" }),
    ];

    const result = validateRetrievedFacts(candidates);
    expect(result.issues.filter((i) => i.code === "low_relevance_noise").length).toBe(2);
  });

  it("detects potential contradictions between same-entity facts", () => {
    const candidates = [
      makeCandidate({}, {
        identity: { factKey: "123:0" },
        canonicalText: "房间里有明亮的灯光，温暖舒适",
        factType: "location",
      }),
      makeCandidate({}, {
        identity: { factKey: "123:1" },
        canonicalText: "变异怪物盘踞在黑暗冰冷的角落",
        factType: "location",
      }),
    ];

    const result = validateRetrievedFacts(candidates, { detectContradictions: true });
    expect(result.issues.some((i) => i.code === "potential_contradiction")).toBe(true);
  });

  it("handles empty candidate list", () => {
    const result = validateRetrievedFacts([]);
    expect(result.valid.length).toBe(0);
    expect(result.filtered.length).toBe(0);
    expect(result.summary.totalChecked).toBe(0);
  });

  it("respects maxWarnings limit", () => {
    const candidates = Array.from({ length: 30 }, (_, i) =>
      makeCandidate({ score: 0.1 }, { canonicalText: `test fact ${i}` })
    );

    const result = validateRetrievedFacts(candidates, { maxWarnings: 10 });
    expect(result.issues.length).toBeLessThanOrEqual(10);
  });

  it("returns correct summary counts", () => {
    const candidates = [
      makeCandidate({}, { identity: { factKey: "a:0" }, canonicalText: "NPC张三住在3楼并负责管理公寓" }),
      makeCandidate({}, { identity: { factKey: "a:1" }, canonicalText: "NPC张三住在3楼" }),
      makeCandidate({}, { identity: { factKey: "b:0" }, canonicalText: "李四是B1区域的巡逻保安" }),
    ];

    const result = validateRetrievedFacts(candidates, { detectContradictions: false });
    expect(result.summary.totalChecked).toBe(3);
    expect(result.summary.passed).toBe(2);
    expect(result.summary.filtered).toBe(1);
  });
});
