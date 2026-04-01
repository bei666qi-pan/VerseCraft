import assert from "node:assert/strict";
import test from "node:test";
import { guardOptionsQualityToFour, padOptionsFallbackToFour, parseOptionsArrayFromAiJson } from "./logicalTasks";

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

test("guardOptionsQualityToFour: high-duplicate outputs should be deduped and padded", () => {
  const ctx = "用户位置[B1_SafeZone]。主威胁状态：B1[A-001|active|30]。NPC当前位置：走廊尽头的保安室。";
  const out = guardOptionsQualityToFour({
    options: ["我先看看门。", "我先看看门。", "我先看看周围。", "我先看看周围。"],
    playerContext: ctx,
    recentActionHint: "我拿出手机照明",
  });
  assert.equal(out.length, 4);
  // 至少包含一个规避/退路类（威胁存在）
  assert.equal(out.some((s) => /退路|后撤|避开|掩体|遮蔽|拉开距离/.test(s)), true);
  // 至少包含一个交涉/确认类（NPC 在场）
  assert.equal(out.some((s) => /问|确认|交涉|对话|喊话|打听/.test(s)), true);
});

test("padOptionsFallbackToFour: npc present -> should include a dialogue/confirm hint", () => {
  const out = padOptionsFallbackToFour([], "用户位置[B1_SafeZone]。NPC当前位置：楼梯口的女生。");
  assert.equal(out.length, 4);
  assert.equal(out.some((s) => /确认情况|确认|问|交涉|对话/.test(s)), true);
});

test("padOptionsFallbackToFour: threat present -> should include an avoid/retreat hint", () => {
  const out = padOptionsFallbackToFour([], "用户位置[B1_SafeZone]。主威胁状态：B1[A-001|active|30]。");
  assert.equal(out.length, 4);
  assert.equal(out.some((s) => /退路|后撤|避开|掩体|遮蔽|拉开距离/.test(s)), true);
});
