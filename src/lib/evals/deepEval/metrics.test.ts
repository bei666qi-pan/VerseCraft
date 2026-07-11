/**
 * DeepEval 叙事质量指标测试
 *
 * 验证 5 个核心叙事质量维度的定义：
 * - coherence（连贯性）
 * - characterVoice（角色口吻一致性）
 * - plotLogic（剧情逻辑）
 * - immersion（代入感）
 * - factConsistency（事实一致性）
 *
 * 运行: pnpm dlx tsx --test src/lib/evals/deepEval/metrics.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  NARRATIVE_METRICS,
  METRICS_BY_ID,
  COHERENCE,
  CHARACTER_VOICE,
  PLOT_LOGIC,
  IMMERSION,
  FACT_CONSISTENCY,
  toDeepEvalResult,
} from "./metrics";
import type { NarrativeMetric } from "./metrics";

describe("DeepEval 叙事质量指标", () => {
  describe("指标注册表完整性", () => {
    it("应有 5 个核心指标", () => {
      assert.equal(NARRATIVE_METRICS.length, 5, `应有 5 个指标，实际 ${NARRATIVE_METRICS.length}`);
    });

    it("所有指标应有唯一 id", () => {
      const ids = NARRATIVE_METRICS.map((m) => m.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, ids.length, "所有指标 id 应唯一");
    });

    it("所有指标权重之和应接近 1.0", () => {
      const totalWeight = NARRATIVE_METRICS.reduce((sum, m) => sum + m.weight, 0);
      assert.ok(Math.abs(totalWeight - 1.0) < 0.01, `权重总和应接近 1.0，实际 ${totalWeight}`);
    });

    it("METRICS_BY_ID 应能通过 id 查找指标", () => {
      for (const metric of NARRATIVE_METRICS) {
        const found = METRICS_BY_ID[metric.id];
        assert.ok(found, `应能找到指标 ${metric.id}`);
        assert.equal(found.id, metric.id);
      }
    });
  });

  describe("各维度定义验证", () => {
    it("coherence 应有正确的属性", () => {
      assert.equal(COHERENCE.id, "coherence");
      assert.equal(COHERENCE.weight, 0.20);
      assert.equal(COHERENCE.hardFloor, 2);
      assert.ok(COHERENCE.rubric.length === 5, "应有 5 个锚点 (1-5)");
      assert.ok(COHERENCE.judgingHints.length >= 3, "应有至少 3 个评分提示");
    });

    it("characterVoice 应有正确的属性", () => {
      assert.equal(CHARACTER_VOICE.id, "characterVoice");
      assert.equal(CHARACTER_VOICE.weight, 0.20);
      assert.equal(CHARACTER_VOICE.hardFloor, 2);
      assert.ok(CHARACTER_VOICE.rubric.length === 5, "应有 5 个锚点");
    });

    it("plotLogic 应有正确的属性", () => {
      assert.equal(PLOT_LOGIC.id, "plotLogic");
      assert.equal(PLOT_LOGIC.weight, 0.20);
      assert.equal(PLOT_LOGIC.hardFloor, 2);
      assert.ok(PLOT_LOGIC.rubric.length === 5, "应有 5 个锚点");
    });

    it("immersion 应有正确的属性", () => {
      assert.equal(IMMERSION.id, "immersion");
      assert.equal(IMMERSION.weight, 0.15);
      assert.equal(IMMERSION.hardFloor, undefined, "immersion 不应有硬性底线");
      assert.ok(IMMERSION.rubric.length === 5, "应有 5 个锚点");
    });

    it("factConsistency 应有最严格的硬性底线", () => {
      assert.equal(FACT_CONSISTENCY.id, "factConsistency");
      assert.equal(FACT_CONSISTENCY.weight, 0.25, "factConsistency 应有最高权重");
      assert.equal(FACT_CONSISTENCY.hardFloor, 3, "factConsistency 硬性底线应为 3");
      assert.ok(FACT_CONSISTENCY.rubric.length === 5, "应有 5 个锚点");
    });
  });

  describe("Rubric 锚点完整性", () => {
    it("每个指标的 rubric 应有 1-5 分锚点", () => {
      for (const metric of NARRATIVE_METRICS) {
        const scores = metric.rubric.map((a) => a.score).sort((a, b) => a - b);
        assert.deepEqual(scores, [1, 2, 3, 4, 5], `${metric.id} 应有 1-5 分锚点`);
      }
    });

    it("每个锚点应有 label 和 description", () => {
      for (const metric of NARRATIVE_METRICS) {
        for (const anchor of metric.rubric) {
          assert.ok(anchor.label, `${metric.id} 锚点 ${anchor.score} 应有 label`);
          assert.ok(anchor.description, `${metric.id} 锚点 ${anchor.score} 应有 description`);
          assert.ok(anchor.label.length > 0, `${metric.id} 锚点 ${anchor.score} label 不应为空`);
          assert.ok(anchor.description.length > 10, `${metric.id} 锚点 ${anchor.score} description 应足够详细`);
        }
      }
    });

    it("锚点描述应使用中文", () => {
      for (const metric of NARRATIVE_METRICS) {
        for (const anchor of metric.rubric) {
          // 简单检测：中文字符占比应较高
          const chineseChars = anchor.description.match(/[一-鿿]/g) ?? [];
          const totalChars = anchor.description.length;
          const chineseRatio = chineseChars.length / totalChars;
          assert.ok(chineseRatio > 0.3, `${metric.id} 锚点 ${anchor.score} 描述应主要使用中文`);
        }
      }
    });
  });

  describe("指标结构约束", () => {
    it("所有指标应有 judgingHints", () => {
      for (const metric of NARRATIVE_METRICS) {
        assert.ok(metric.judgingHints.length >= 2, `${metric.id} 应有至少 2 个评分提示`);
      }
    });

    it("评分提示应使用中文", () => {
      for (const metric of NARRATIVE_METRICS) {
        for (const hint of metric.judgingHints) {
          const chineseChars = hint.match(/[一-鿿]/g) ?? [];
          assert.ok(chineseChars.length > 0, `${metric.id} 评分提示应包含中文: ${hint}`);
        }
      }
    });

    it("权重应为正数且合理", () => {
      for (const metric of NARRATIVE_METRICS) {
        assert.ok(metric.weight > 0, `${metric.id} 权重应为正数`);
        assert.ok(metric.weight <= 0.5, `${metric.id} 权重不应超过 0.5`);
      }
    });

    it("hardFloor 应为 0-5 或 undefined", () => {
      for (const metric of NARRATIVE_METRICS) {
        if (metric.hardFloor !== undefined) {
          assert.ok(metric.hardFloor >= 1 && metric.hardFloor <= 5, `${metric.id} hardFloor 应在 1-5 之间`);
        }
      }
    });
  });

  describe("toDeepEvalResult 转换", () => {
    it("应生成合法的 DeepEval 兼容结果", () => {
      const result = toDeepEvalResult({
        caseId: "test-001",
        dimensionScores: { coherence: 4, characterVoice: 3, plotLogic: 4, immersion: 5, factConsistency: 4 },
        overallScore: 4,
        passed: true,
        reasoning: "测试推理",
        narrativeChars: 100,
        turnCount: 3,
      });

      assert.equal(result.testCase, "test-001");
      assert.equal(result.success, true);
      assert.equal(result.score, 4);
      assert.equal(result.threshold, 3);
      assert.ok(result.metrics.length === 5, `应有 5 个指标结果，实际 ${result.metrics.length}`);
      assert.equal(result.metadata.narrativeChars, 100);
      assert.equal(result.metadata.turnCount, 3);
    });

    it("每个指标结果应有 success 字段", () => {
      const result = toDeepEvalResult({
        caseId: "test-002",
        dimensionScores: { coherence: 1, characterVoice: 2, plotLogic: 3, immersion: 4, factConsistency: 2 },
        overallScore: 2,
        passed: false,
        reasoning: "测试推理",
        narrativeChars: 80,
        turnCount: 2,
      });

      for (const metric of result.metrics) {
        assert.ok(typeof metric.success === "boolean", `${metric.metric} 应有 success 字段`);
        assert.ok(typeof metric.score === "number", `${metric.metric} 应有 score 字段`);
        assert.ok(typeof metric.threshold === "number", `${metric.metric} 应有 threshold 字段`);
        assert.ok(metric.reason.length > 0, `${metric.metric} 应有 reason`);
      }
    });

    it("低于 hardFloor 的分数应标记为 success=false", () => {
      const result = toDeepEvalResult({
        caseId: "test-003",
        dimensionScores: { coherence: 1, characterVoice: 1, plotLogic: 1, immersion: 1, factConsistency: 2 },
        overallScore: 1,
        passed: false,
        reasoning: "测试推理",
        narrativeChars: 50,
        turnCount: 1,
      });

      // coherence hardFloor=2, score=1 → fail
      const coherenceMetric = result.metrics.find((m) => m.metric === "coherence");
      assert.ok(coherenceMetric, "应找到 coherence 指标");
      assert.equal(coherenceMetric!.success, false, "coherence score=1 < hardFloor=2 应 fail");

      // factConsistency hardFloor=3, score=2 → fail
      const factMetric = result.metrics.find((m) => m.metric === "factConsistency");
      assert.ok(factMetric, "应找到 factConsistency 指标");
      assert.equal(factMetric!.success, false, "factConsistency score=2 < hardFloor=3 应 fail");
    });

    it("应包含 timestamp 和 evaluator", () => {
      const result = toDeepEvalResult({
        caseId: "test-004",
        dimensionScores: {},
        overallScore: 3,
        passed: true,
        reasoning: "测试",
        narrativeChars: 80,
        turnCount: 1,
      });

      assert.ok(result.metadata.timestamp, "应有 timestamp");
      assert.ok(result.metadata.evaluator, "应有 evaluator");
    });
  });
});
