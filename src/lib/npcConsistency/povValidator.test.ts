import test from "node:test";
import assert from "node:assert/strict";
import { applyPovPostGeneration } from "./povValidator";

test("POV：叙事描述层不允许第二人称旁白（句首你→我）", () => {
  const r = applyPovPostGeneration("你走向门口，灯管在你头顶抽搐。我攥紧掌心。");
  assert.equal(r.severity === "none", false);
  assert.equal(/(^|[。！？\n\r])\s*你走向/.test(r.narrative), false);
  assert.ok(r.narrative.includes("我走向") || r.narrative.includes("我——"));
});

test("POV：对白引号内允许‘你’，不应被替换", () => {
  const src = "她说：“你别动。”你听见自己的呼吸声像刮擦。";
  const r = applyPovPostGeneration(src);
  assert.ok(r.narrative.includes("她说：“你别动。”"));
  // 引号外的叙事“你听见”应被修复为“我听见”
  assert.equal(r.narrative.includes("你听见"), false);
  assert.ok(r.narrative.includes("我听见") || r.narrative.includes("我——"));
});

test("POV：空 narrative 不触发", () => {
  const r = applyPovPostGeneration("");
  assert.equal(r.triggered, false);
  assert.equal(r.narrative, "");
});

