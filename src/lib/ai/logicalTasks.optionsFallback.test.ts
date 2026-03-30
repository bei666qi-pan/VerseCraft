import assert from "node:assert/strict";
import test from "node:test";
import { padOptionsFallbackToFour, parseOptionsArrayFromAiJson } from "./logicalTasks";

test("parseOptionsArrayFromAiJson: keeps 2–4 valid strings and dedupes", () => {
  assert.deepEqual(parseOptionsArrayFromAiJson(["a", "我走一步", "我走一步", "我停一下"]), ["我走一步", "我停一下"]);
});

test("parseOptionsArrayFromAiJson: skips too-short and too-long", () => {
  assert.deepEqual(parseOptionsArrayFromAiJson(["x", "我走一步", "x".repeat(50)]), ["我走一步"]);
});

test("padOptionsFallbackToFour: fills from generics when empty", () => {
  const out = padOptionsFallbackToFour([], "用户位置[B1_SafeZone]。主威胁状态：B1[A-001|active|30]。");
  assert.equal(out.length, 4);
  assert.ok(out.every((s) => s.length >= 2));
});

test("padOptionsFallbackToFour: preserves model options and pads to four", () => {
  const out = padOptionsFallbackToFour(["我查看门锁是否完好。", "我侧耳听走廊动静。"]);
  assert.equal(out.length, 4);
  assert.equal(out[0], "我查看门锁是否完好。");
  assert.equal(out[1], "我侧耳听走廊动静。");
});

test("padOptionsFallbackToFour: four model options unchanged length", () => {
  const four = ["我一", "我二", "我三", "我四"].map((s) => `${s}继续试探。`);
  const out = padOptionsFallbackToFour(four);
  assert.deepEqual(out, four);
});
