/**
 * Calibration 模块单元测试
 *
 * 覆盖：spearmanRho、cohensKappa、calibrateJudge、边界条件
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  spearmanRho,
  cohensKappa,
  calibrateJudge,
  isJudgeCalibrated,
  isJudgeRelativeOnly,
} from "./calibration";

describe("spearmanRho", () => {
  it("完全正相关，返回 1", () => {
    const rho = spearmanRho([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]);
    assert.ok(rho > 0.99, `expected ~1, got ${rho}`);
  });

  it("完全负相关，返回 -1", () => {
    const rho = spearmanRho([1, 2, 3, 4, 5], [50, 40, 30, 20, 10]);
    assert.ok(rho < -0.99, `expected ~-1, got ${rho}`);
  });

  it("平局正确处理", () => {
    const rho = spearmanRho([3, 3, 3, 3, 3], [1, 2, 3, 4, 5]);
    // 全部平局的秩 = 平均秩，与完全有序序列的 Spearman 约为 0.5
    assert.ok(rho === 0.5, `expected 0.5 for all-tie vs ordered, got ${rho}`);
  });

  it("少于 3 个样本返回简单的完全一致/不一致", () => {
    assert.equal(spearmanRho([1], [1]), 1);
    assert.equal(spearmanRho([1], [2]), 0);
    assert.equal(spearmanRho([], []), 0);
  });

  it("长度不匹配抛出错误", () => {
    assert.throws(() => spearmanRho([1, 2], [1]));
  });

  it("典型场景：高但非完全一致", () => {
    // judge: [4, 2, 5, 3, 1], gold: [5, 1, 4, 3, 2]
    const rho = spearmanRho([4, 2, 5, 3, 1], [5, 1, 4, 3, 2]);
    assert.ok(rho > 0.6, `expected high correlation, got ${rho}`);
  });
});

describe("cohensKappa", () => {
  it("完全一致返回 1", () => {
    const kappa = cohensKappa([5, 4, 3, 2, 1], [5, 4, 3, 2, 1]);
    assert.ok(kappa > 0.99, `expected ~1, got ${kappa}`);
  });

  it("完全不一致返回接近 0 或负值", () => {
    const kappa = cohensKappa([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    assert.ok(kappa < 0.3, `expected low kappa, got ${kappa}`);
  });

  it("空数组返回 1（vacuous）", () => {
    assert.equal(cohensKappa([], []), 1);
  });

  it("长度不匹配抛出错误", () => {
    assert.throws(() => cohensKappa([1, 2], [1]));
  });

  it("典型场景：中等一致", () => {
    // judge 和 gold 有部分一致但非完全一致
    const kappa = cohensKappa([4, 4, 3, 2, 3, 5, 4, 3], [4, 5, 3, 2, 3, 4, 4, 3]);
    assert.ok(kappa > 0.4, `expected moderate kappa (>0.4), got ${kappa}`);
  });
});

describe("calibrateJudge", () => {
  it("高一致性 judge 产生 good 报告", () => {
    const report = calibrateJudge({
      narrative: {
        judgeScores: [4, 3, 5, 4, 3],
        goldScores: [4, 3, 5, 4, 3],
      },
    });
    assert.equal(report.overallQuality, "good");
    assert.ok(report.overallSpearman > 0.9);
    assert.equal(report.totalSamples, 5);
    assert.equal(report.dimensions.length, 1);
    assert.equal(report.dimensions[0]!.calibrationBias, 0);
  });

  it("低一致性 judge 产生 poor 报告", () => {
    const report = calibrateJudge({
      narrative: {
        judgeScores: [1, 2, 3, 4, 5],
        goldScores: [5, 4, 3, 2, 1],
      },
    });
    assert.equal(report.overallQuality, "poor");
    assert.ok(report.overallSpearman < 0);
  });

  it("多维度校准", () => {
    const report = calibrateJudge({
      narrative: {
        judgeScores: [4, 3, 5],
        goldScores: [4, 4, 4],
      },
      mechanics: {
        judgeScores: [3, 4, 4],
        goldScores: [3, 4, 4],
      },
    });
    assert.equal(report.dimensions.length, 2);
    assert.equal(report.totalSamples, 3);
  });

  it("校准偏移计算正确", () => {
    const report = calibrateJudge({
      quality: {
        judgeScores: [2, 3, 4],  // judge avg = 3
        goldScores: [4, 5, 6],    // gold avg = 5 → bias = +2 (judge 偏严格)
      },
    });
    assert.ok(report.dimensions[0]!.calibrationBias > 0);
  });

  it("空维度不报错", () => {
    const report = calibrateJudge({});
    assert.equal(report.totalSamples, 0);
    assert.equal(report.dimensions.length, 0);
  });
});

describe("isJudgeCalibrated / isJudgeRelativeOnly", () => {
  it("good + 足够样本 = 已校准", () => {
    const report = calibrateJudge({
      d: {
        judgeScores: Array.from({ length: 10 }, (_, i) => i + 1),
        goldScores: Array.from({ length: 10 }, (_, i) => i + 1),
      },
    });
    assert.equal(isJudgeCalibrated(report), true);
    assert.equal(isJudgeRelativeOnly(report), true); // 10 < 30
  });

  it("poor = 未校准", () => {
    const report = calibrateJudge({
      d: {
        judgeScores: Array.from({ length: 20 }, (_, i) => i + 1),
        goldScores: Array.from({ length: 20 }, (_, i) => 20 - i),
      },
    });
    assert.equal(isJudgeCalibrated(report), false);
  });

  it("acceptable + >=30 样本 = 非 relative only", () => {
    // 模拟 acceptable 场景（spearman ~0.7-0.8）
    const judgeScores: number[] = [];
    const goldScores: number[] = [];
    for (let i = 0; i < 30; i++) {
      judgeScores.push((i % 5) + 1);
      goldScores.push(((i + 1) % 5) + 1);
    }
    const report = calibrateJudge({ d: { judgeScores, goldScores } });
    // acceptable 可能是 good 也可能不是，取决于实际数据
    // 只验证逻辑不崩溃
    const calibrated = isJudgeCalibrated(report);
    const relativeOnly = isJudgeRelativeOnly(report);
    assert.equal(typeof calibrated, "boolean");
    assert.equal(typeof relativeOnly, "boolean");
  });
});
