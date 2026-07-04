import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeSanityRatio,
  computeSanityBand,
  buildSanityNarrativeHintBlock,
  getSanityBandTitle,
  SANITY_BAND_RANK,
} from "./sanityStateRegistry";

test("computeSanityRatio：正常输入裁剪到 [0,1]", () => {
  assert.equal(computeSanityRatio(10, 50), 0.2);
  assert.equal(computeSanityRatio(50, 50), 1);
  assert.equal(computeSanityRatio(0, 50), 0);
});

test("computeSanityRatio：current 超过 historicalMax 时裁剪至 1（防御性，理论上不应发生）", () => {
  assert.equal(computeSanityRatio(60, 50), 1);
});

test("computeSanityRatio：任一输入缺失或历史峰值 <= 0 时返回 null（安全默认）", () => {
  assert.equal(computeSanityRatio(null, 50), null);
  assert.equal(computeSanityRatio(10, null), null);
  assert.equal(computeSanityRatio(10, 0), null);
  assert.equal(computeSanityRatio(10, -5), null);
  assert.equal(computeSanityRatio(Number.NaN, 50), null);
});

test("computeSanityBand：四档边界（含边界值本身）", () => {
  assert.equal(computeSanityBand(null), "unknown");
  assert.equal(computeSanityBand(1), "stable");
  assert.equal(computeSanityBand(0.71), "stable");
  assert.equal(computeSanityBand(0.7), "strained");
  assert.equal(computeSanityBand(0.41), "strained");
  assert.equal(computeSanityBand(0.4), "fractured");
  assert.equal(computeSanityBand(0.21), "fractured");
  assert.equal(computeSanityBand(0.2), "critical");
  assert.equal(computeSanityBand(0), "critical");
});

test("SANITY_BAND_RANK：严重程度单调递增，unknown 恒最低", () => {
  assert.ok(SANITY_BAND_RANK.unknown < SANITY_BAND_RANK.stable);
  assert.ok(SANITY_BAND_RANK.stable < SANITY_BAND_RANK.strained);
  assert.ok(SANITY_BAND_RANK.strained < SANITY_BAND_RANK.fractured);
  assert.ok(SANITY_BAND_RANK.fractured < SANITY_BAND_RANK.critical);
});

test("buildSanityNarrativeHintBlock：stable/unknown 不产生提示（不占用 prompt 篇幅）", () => {
  assert.equal(buildSanityNarrativeHintBlock("unknown"), "");
  assert.equal(buildSanityNarrativeHintBlock("stable"), "");
});

test("buildSanityNarrativeHintBlock：strained/fractured/critical 产生提示且声明「仅影响叙事风格，不是新增事实」", () => {
  for (const band of ["strained", "fractured", "critical"] as const) {
    const hint = buildSanityNarrativeHintBlock(band);
    assert.ok(hint.length > 0, `${band} 应产生非空提示`);
    assert.ok(hint.includes("不是新增事实"), `${band} 提示必须声明不改变事实`);
  }
});

test("getSanityBandTitle：中文档位标题", () => {
  assert.equal(getSanityBandTitle("unknown"), "未知");
  assert.equal(getSanityBandTitle("stable"), "平稳");
  assert.equal(getSanityBandTitle("strained"), "紧绷");
  assert.equal(getSanityBandTitle("fractured"), "裂隙");
  assert.equal(getSanityBandTitle("critical"), "濒崩");
});
