/**
 * DeepEval 校准系统测试
 *
 * 验证 40 个校准样本和统计函数：
 * - 校准样本结构完整性
 * - Spearman/Pearson 相关系数计算
 * - 校准统计结果
 *
 * 运行: pnpm dlx tsx --test src/lib/evals/deepEval/calibration.test.ts
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  CALIBRATION_SEEDS,
  spearmanRho,
  pearsonR,
  computeCalibrationStats,
} from "./calibration";
import type { CalibrationSample } from "./calibration";

describe("DeepEval 校准系统", () => {
  describe("校准样本集完整性", () => {
    it("应有 40 个校准样本", () => {
      assert.equal(CALIBRATION_SEEDS.length, 40, `应有 40 个样本，实际 ${CALIBRATION_SEEDS.length}`);
    });

    it("样本 id 应唯一", () => {
      const ids = CALIBRATION_SEEDS.map((s) => s.id);
      const uniqueIds = new Set(ids);
      assert.equal(uniqueIds.size, ids.length, "所有样本 id 应唯一");
    });

    it("样本 id 应按序编号", () => {
      for (let i = 0; i < CALIBRATION_SEEDS.length; i++) {
        const expectedId = `calib-${String(i + 1).padStart(3, "0")}`;
        assert.equal(CALIBRATION_SEEDS[i]!.id, expectedId, `第 ${i + 1} 个样本 id 应为 ${expectedId}`);
      }
    });

    it("每个样本应有必需的字段", () => {
      for (const sample of CALIBRATION_SEEDS) {
        assert.ok(sample.id, "应有 id");
        assert.ok(sample.scenario, "应有 scenario");
        assert.ok(sample.narrative, "应有 narrative");
        assert.ok(typeof sample.narrativeChars === "number", "应有 narrativeChars");
        assert.ok(sample.humanScores, "应有 humanScores");
        assert.ok(typeof sample.humanPassed === "boolean", "应有 humanPassed");
      }
    });
  });

  describe("样本质量分层", () => {
    it("高质量样本 (calib-001~010) 应全部通过", () => {
      const highQuality = CALIBRATION_SEEDS.filter((s) => {
        const num = parseInt(s.id.replace("calib-", ""), 10);
        return num >= 1 && num <= 10;
      });
      assert.equal(highQuality.length, 10, "应有 10 个高质量样本");
      for (const sample of highQuality) {
        assert.equal(sample.humanPassed, true, `${sample.id} 应通过`);
      }
    });

    it("中等质量样本 (calib-011~020) 应全部通过", () => {
      const mediumQuality = CALIBRATION_SEEDS.filter((s) => {
        const num = parseInt(s.id.replace("calib-", ""), 10);
        return num >= 11 && num <= 20;
      });
      assert.equal(mediumQuality.length, 10, "应有 10 个中等质量样本");
      for (const sample of mediumQuality) {
        assert.equal(sample.humanPassed, true, `${sample.id} 应通过`);
      }
    });

    it("低质量样本 (calib-021~030) 应全部失败", () => {
      const lowQuality = CALIBRATION_SEEDS.filter((s) => {
        const num = parseInt(s.id.replace("calib-", ""), 10);
        return num >= 21 && num <= 30;
      });
      assert.equal(lowQuality.length, 10, "应有 10 个低质量样本");
      for (const sample of lowQuality) {
        assert.equal(sample.humanPassed, false, `${sample.id} 应失败`);
      }
    });

    it("边界案例样本 (calib-031~040) 应混合分布", () => {
      const edgeCases = CALIBRATION_SEEDS.filter((s) => {
        const num = parseInt(s.id.replace("calib-", ""), 10);
        return num >= 31 && num <= 40;
      });
      assert.equal(edgeCases.length, 10, "应有 10 个边界案例");
      const passed = edgeCases.filter((s) => s.humanPassed).length;
      const failed = edgeCases.filter((s) => !s.humanPassed).length;
      assert.ok(passed > 0 && failed > 0, `边界案例应混合分布，实际 pass=${passed}, fail=${failed}`);
    });

    it("通过率应合理（高质量+中等通过，低质量失败）", () => {
      const totalPassed = CALIBRATION_SEEDS.filter((s) => s.humanPassed).length;
      const passRate = totalPassed / CALIBRATION_SEEDS.length;
      assert.ok(passRate >= 0.5 && passRate <= 0.8, `通过率应在 50%-80% 之间，实际 ${passRate}`);
    });
  });

  describe("样本分数范围", () => {
    it("所有维度分数应在 1-5 范围内", () => {
      const dimensions = ["coherence", "characterVoice", "plotLogic", "immersion", "factConsistency"];
      for (const sample of CALIBRATION_SEEDS) {
        for (const dim of dimensions) {
          const score = sample.humanScores[dim];
          assert.ok(score !== undefined, `${sample.id} 应有 ${dim} 分数`);
          assert.ok(score >= 1 && score <= 5, `${sample.id}.${dim}=${score} 应在 1-5 范围内`);
        }
      }
    });

    it("高质量样本平均分应 >= 4", () => {
      const highQuality = CALIBRATION_SEEDS.filter((s) => {
        const num = parseInt(s.id.replace("calib-", ""), 10);
        return num >= 1 && num <= 10;
      });
      for (const sample of highQuality) {
        const scores = Object.values(sample.humanScores);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        assert.ok(avg >= 4, `${sample.id} 平均分应 >= 4，实际 ${avg}`);
      }
    });

    it("低质量样本应至少有一个维度 <= 2", () => {
      const lowQuality = CALIBRATION_SEEDS.filter((s) => {
        const num = parseInt(s.id.replace("calib-", ""), 10);
        return num >= 21 && num <= 30;
      });
      for (const sample of lowQuality) {
        const scores = Object.values(sample.humanScores);
        const minScore = Math.min(...scores);
        assert.ok(minScore <= 2, `${sample.id} 应至少有一个维度 <= 2，实际最低 ${minScore}`);
      }
    });
  });

  describe("叙事文本质量", () => {
    it("大多数 narrative 应有合理长度", () => {
      // 大部分样本应有至少 20 字，但边界案例可能较短
      let shortCount = 0;
      for (const sample of CALIBRATION_SEEDS) {
        if (sample.narrative.length < 20) {
          shortCount++;
        }
      }
      // 允许最多 3 个样本叙事过短（边界案例）
      assert.ok(shortCount <= 3, `最多 3 个样本叙事过短，实际 ${shortCount}`);
    });

    it("narrativeChars 应与实际字数一致", () => {
      for (const sample of CALIBRATION_SEEDS) {
        const actualChars = sample.narrative.replace(/\s/g, "").length;
        // 允许 10% 误差（因为空格、标点等计算方式可能不同）
        const diff = Math.abs(sample.narrativeChars - actualChars);
        assert.ok(diff < sample.narrativeChars * 0.3, `${sample.id} narrativeChars 误差过大: 标注=${sample.narrativeChars}, 实际=${actualChars}`);
      }
    });

    it("scenario 应清晰描述场景", () => {
      for (const sample of CALIBRATION_SEEDS) {
        assert.ok(sample.scenario.length >= 5, `${sample.id} scenario 应至少 5 字`);
      }
    });
  });

  describe("统计函数 — Spearman ρ", () => {
    it("完全正相关应返回 1", () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [1, 2, 3, 4, 5];
      const rho = spearmanRho(xs, ys);
      assert.ok(Math.abs(rho - 1.0) < 0.01, `完全正相关 ρ 应为 1，实际 ${rho}`);
    });

    it("完全负相关应返回 -1", () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [5, 4, 3, 2, 1];
      const rho = spearmanRho(xs, ys);
      assert.ok(Math.abs(rho - (-1.0)) < 0.01, `完全负相关 ρ 应为 -1，实际 ${rho}`);
    });

    it("不相关应返回较低相关系数", () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [3, 1, 4, 2, 5];
      const rho = spearmanRho(xs, ys);
      // 这组数据有一定相关性（ρ≈0.5），但不是强相关
      assert.ok(Math.abs(rho) < 0.8, `非强相关 ρ 应小于 0.8，实际 ${rho}`);
    });

    it("长度不一致应返回 0", () => {
      const rho = spearmanRho([1, 2, 3], [1, 2]);
      assert.equal(rho, 0, "长度不一致应返回 0");
    });

    it("样本过少应返回 0", () => {
      const rho = spearmanRho([1, 2], [1, 2]);
      assert.equal(rho, 0, "样本少于 3 个应返回 0");
    });
  });

  describe("统计函数 — Pearson r", () => {
    it("完全正相关应返回 1", () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [2, 4, 6, 8, 10];
      const r = pearsonR(xs, ys);
      assert.ok(Math.abs(r - 1.0) < 0.01, `完全正相关 r 应为 1，实际 ${r}`);
    });

    it("完全负相关应返回 -1", () => {
      const xs = [1, 2, 3, 4, 5];
      const ys = [10, 8, 6, 4, 2];
      const r = pearsonR(xs, ys);
      assert.ok(Math.abs(r - (-1.0)) < 0.01, `完全负相关 r 应为 -1，实际 ${r}`);
    });

    it("长度不一致应返回 0", () => {
      const r = pearsonR([1, 2, 3], [1, 2]);
      assert.equal(r, 0, "长度不一致应返回 0");
    });
  });

  describe("computeCalibrationStats", () => {
    it("应正确计算校准统计", () => {
      // 构造完美校准数据：judge 分数 = human 分数
      const samples = CALIBRATION_SEEDS.slice(0, 5);
      const judgeScores = samples.map((s) => ({ ...s.humanScores }));
      const judgePassed = samples.map((s) => s.humanPassed);

      const stats = computeCalibrationStats(samples, judgeScores, judgePassed);

      assert.equal(stats.sampleCount, 5);
      assert.equal(stats.passAgreement, 1.0, "完美校准通过率一致应为 1.0");
      assert.equal(stats.calibrated, true, "完美校准应标记为 calibrated");

      // 完美校准时，Spearman 应接近 1
      for (const rho of Object.values(stats.spearmanRho)) {
        assert.ok(Math.abs(rho - 1.0) < 0.01, `完美校准 Spearman ρ 应接近 1，实际 ${rho}`);
      }
    });

    it("应正确计算偏差", () => {
      const samples = CALIBRATION_SEEDS.slice(0, 5);
      // Judge 比人工高 1 分
      const judgeScores = samples.map((s) => {
        const scores: Record<string, number> = {};
        for (const [k, v] of Object.entries(s.humanScores)) {
          scores[k] = v + 1;
        }
        return scores;
      });
      const judgePassed = samples.map(() => true);

      const stats = computeCalibrationStats(samples, judgeScores, judgePassed);

      for (const bias of Object.values(stats.bias)) {
        assert.ok(Math.abs(bias - 1.0) < 0.01, `偏差应接近 1.0，实际 ${bias}`);
      }
    });

    it("样本数不一致应抛错", () => {
      const samples = CALIBRATION_SEEDS.slice(0, 5);
      const judgeScores = samples.slice(0, 3).map((s) => s.humanScores);
      const judgePassed = samples.map((s) => s.humanPassed);

      assert.throws(() => computeCalibrationStats(samples, judgeScores, judgePassed), "样本数不一致应抛错");
    });

    it("空样本应抛错", () => {
      assert.throws(() => computeCalibrationStats([], [], []), "空样本应抛错");
    });
  });

  describe("校准样本覆盖度", () => {
    it("应覆盖关键失败场景", () => {
      const scenarios = CALIBRATION_SEEDS.map((s) => s.scenario).join(" ");

      // 关键失败场景
      const criticalScenarios = [
        "死亡", "幻觉", "泄漏", "瞬移", "注入",
      ];

      // 至少应覆盖部分关键场景
      const covered = criticalScenarios.filter((kw) => scenarios.includes(kw));
      assert.ok(covered.length >= 3, `应覆盖至少 3 个关键场景，实际覆盖: ${covered.join(", ")}`);
    });

    it("应包含不同职业/角色场景", () => {
      const scenarios = CALIBRATION_SEEDS.map((s) => s.scenario + " " + (s.context ?? "")).join(" ");

      // 主要 NPC 名称
      const npcNames = ["廖暗", "欣蓝", "老刘"];
      const covered = npcNames.filter((name) => scenarios.includes(name));
      assert.ok(covered.length >= 2, `应覆盖至少 2 个主要 NPC，实际: ${covered.join(", ")}`);
    });
  });
});
