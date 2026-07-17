/**
 * Phase 4: Gap 1 — Reveal-Tier 驱动用例检测器
 *
 * 离线检测 worldKnowledge reveal-tier 系统是否存在缺口：
 * - 分级是否严格递增
 * - getFactRevealMinRank 对模拟 LoreFact 的 rank 分配正确性
 * - filterCandidatesByRevealTier 过滤行为
 * - inferMaxRevealRank 能否正常返回非负 rank
 */

import type { Detector, DetectorResult, DetectorIssue, DetectorMeta } from "./types";

import { inferMaxRevealRank, filterCandidatesByRevealTier, getFactRevealMinRank } from "@/lib/worldKnowledge/reveal/revealGate";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import type { LoreFact, RetrievalCandidate } from "@/lib/worldKnowledge/types";

const META: DetectorMeta = {
  id: "gap-1-reveal-tier-driven",
  category: "cognitive_reveal",
  label: "Reveal Tier 驱动评测",
  description: "检测 reveal-tier 分级、过滤、推演链是否存在逻辑缺口",
  offlineOnly: true,
};

class Gap1RevealTierDrivenDetector implements Detector<void, DetectorResult> {
  meta: DetectorMeta = META;

  run(): DetectorResult {
    const start = performance.now();
    const issues: DetectorIssue[] = [];

    // ── 1. 检查 REVEAL_TIER_RANK 等级严格递增 ──────────────────
    this.checkRankMonotonic(issues);

    // ── 2. 构造模拟 LoreFact，验证 getFactRevealMinRank ──────────
    this.checkGetFactRevealMinRank(issues);

    // ── 3. 构造 fakeCandidates，验证 filterCandidatesByRevealTier ──
    this.checkFilterCandidates(issues);

    // ── 4. 检查 inferMaxRevealRank ──────────────────────────────
    this.checkInferMaxRevealRank(issues);

    const passed = issues.filter((i) => i.severity === "info" || i.severity === "warning");
    const failed = issues.filter((i) => i.severity === "critical");
    const total = passed.length + failed.length;
    const score = total > 0 ? passed.length / total : 1;

    const latencyMs = Math.round(performance.now() - start);

    return {
      detectorId: "gap-1-reveal-tier-driven",
      score,
      issues,
      pass: failed.length === 0,
      latencyMs,
    };
  }

  private checkRankMonotonic(issues: DetectorIssue[]): void {
    const { surface, fracture, deep, abyss } = REVEAL_TIER_RANK;
    if (surface === 0 && fracture === 1 && deep === 2 && abyss === 3) {
      issues.push({
        severity: "info",
        message: "REVEAL_TIER_RANK 等级严格递增：surface=0, fracture=1, deep=2, abyss=3",
        code: "rank-monotonic",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `REVEAL_TIER_RANK 未严格递增：surface=${surface}, fracture=${fracture}, deep=${deep}, abyss=${abyss}`,
        code: "rank-monotonic",
      });
    }
  }

  private checkGetFactRevealMinRank(issues: DetectorIssue[]): void {
    const facts: LoreFact[] = [
      {
        identity: { factKey: "test:surface" },
        layer: "core_canon",
        factType: "rule",
        canonicalText: "表层可见规则",
        tags: ["reveal_surface"],
        source: { kind: "bootstrap" },
      },
      {
        identity: { factKey: "test:fracture" },
        layer: "core_canon",
        factType: "rule",
        canonicalText: "裂痕级信息",
        tags: ["reveal_fracture"],
        source: { kind: "registry" },
      },
      {
        identity: { factKey: "test:deep" },
        layer: "core_canon",
        factType: "rule",
        canonicalText: "深层真相",
        tags: ["reveal_deep"],
        source: { kind: "registry" },
      },
      {
        identity: { factKey: "test:abyss" },
        layer: "core_canon",
        factType: "rule",
        canonicalText: "深渊级核心机密",
        tags: ["reveal_abyss"],
        source: { kind: "registry" },
      },
      {
        identity: { factKey: "test:no-tag-surface" },
        layer: "core_canon",
        factType: "npc",
        canonicalText: "无名规则，默认 surface",
        tags: [],
        source: { kind: "bootstrap" },
      },
    ];

    const expected: Array<{ key: string; expectedRank: number }> = [
      { key: "test:surface", expectedRank: 0 },
      { key: "test:fracture", expectedRank: 1 },
      { key: "test:deep", expectedRank: 2 },
      { key: "test:abyss", expectedRank: 3 },
      { key: "test:no-tag-surface", expectedRank: 0 },
    ];

    let allMatch = true;
    for (const { key, expectedRank } of expected) {
      const fact = facts.find((f) => f.identity.factKey === key);
      if (!fact) {
        issues.push({
          severity: "critical",
          message: `测试事实 ${key} 缺失`,
          code: "fact-missing",
        });
        allMatch = false;
        continue;
      }
      const rank = getFactRevealMinRank(fact);
      if (rank !== expectedRank) {
        issues.push({
          severity: "critical",
          message: `getFactRevealMinRank("${key}") 返回 ${rank}，期望 ${expectedRank}`,
          code: "rank-mismatch",
          evidence: JSON.stringify({ factKey: key, got: rank, expected: expectedRank }),
        });
        allMatch = false;
      }
    }

    if (allMatch) {
      issues.push({
        severity: "info",
        message: "全部 5 个 LoreFact 的 getFactRevealMinRank 分配正确（surface/fracture/deep/abyss/no-tag）",
        code: "get-fact-reveal-min-rank",
      });
    }
  }

  private checkFilterCandidates(issues: DetectorIssue[]): void {
    const makeCandidate = (factKey: string, rankTag: string): RetrievalCandidate => ({
      fact: {
        identity: { factKey },
        layer: "core_canon",
        factType: "rule",
        canonicalText: `候选 ${factKey}`,
        tags: [rankTag],
        source: { kind: "bootstrap" },
      },
      score: 1.0,
    });

    const candidates: RetrievalCandidate[] = [
      makeCandidate("surface-fact", "reveal_surface"),
      makeCandidate("fracture-fact", "reveal_fracture"),
      makeCandidate("deep-fact", "reveal_deep"),
      makeCandidate("abyss-fact", "reveal_abyss"),
    ];

    // maxRank = local(1)：surface + fracture 保留，deep + abyss 过滤
    const filtered = filterCandidatesByRevealTier(candidates, 1);
    const retainedKeys = filtered.map((c) => c.fact.identity.factKey).sort();

    if (retainedKeys.length === 2 && retainedKeys[0] === "fracture-fact" && retainedKeys[1] === "surface-fact") {
      issues.push({
        severity: "info",
        message: "filterCandidatesByRevealTier 在 maxRank=1 时正确保留 surface+fracture，过滤 deep+abyss",
        code: "filter-by-tier",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `filterCandidatesByRevealTier maxRank=1 结果异常：保留 [${retainedKeys.join(", ")}]，期望 [fracture-fact, surface-fact]`,
        code: "filter-by-tier",
        evidence: JSON.stringify({ retainedKeys }),
      });
    }

    // maxRank=0 (surface)：仅保留 surface
    const filteredSurface = filterCandidatesByRevealTier(candidates, 0);
    const surfaceKeys = filteredSurface.map((c) => c.fact.identity.factKey);
    if (surfaceKeys.length === 1 && surfaceKeys[0] === "surface-fact") {
      issues.push({
        severity: "info",
        message: "filterCandidatesByRevealTier maxRank=0 仅保留 surface",
        code: "filter-by-tier-surface",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `filterCandidatesByRevealTier maxRank=0 结果异常: 保留 [${surfaceKeys.join(", ")}]，期望 [surface-fact]`,
        code: "filter-by-tier-surface",
        evidence: JSON.stringify({ retainedKeys: surfaceKeys }),
      });
    }
  }

  private checkInferMaxRevealRank(issues: DetectorIssue[]): void {
    const rank = inferMaxRevealRank(null, "test-location");
    if (typeof rank === "number" && rank >= 0) {
      issues.push({
        severity: "info",
        message: `inferMaxRevealRank(null, "test-location") 返回非负 rank: ${rank}`,
        code: "infer-max-reveal-rank",
      });
    } else {
      issues.push({
        severity: "critical",
        message: `inferMaxRevealRank(null, "test-location") 返回无效值: ${rank}`,
        code: "infer-max-reveal-rank",
        evidence: JSON.stringify({ rank }),
      });
    }
  }
}

export const gap1RevealTierDrivenDetector = new Gap1RevealTierDrivenDetector();