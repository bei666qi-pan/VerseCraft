import test from "node:test";
import assert from "node:assert/strict";
import { evaluateOptionsSemanticQuality } from "@/lib/play/optionsSemanticGuards";

test("semantic guards: should filter high-similarity actions against current/recent options", () => {
  const result = evaluateOptionsSemanticQuality({
    options: ["贴近门缝听动静", "前往楼道尽头", "用手电照门缝"],
    currentOptions: ["观察门缝"],
    recentOptions: ["检查门缝"],
    latestNarrative: "我刚听到门缝后传来细碎脚步，楼道尽头忽明忽暗。",
    playerLocation: "B1走廊",
  });
  assert.equal(result.accepted.includes("前往楼道尽头"), true);
  assert.equal(result.accepted.includes("贴近门缝听动静"), false);
  assert.equal(result.accepted.includes("用手电照门缝"), false);
});

test("semantic guards: should reject generic and unanchored actions in versecraft scene", () => {
  const result = evaluateOptionsSemanticQuality({
    options: ["我先观察四周", "我思考下一步", "我敲三下门缝试探回声", "我去北门打篮球"],
    currentOptions: [],
    recentOptions: [],
    latestNarrative: "老刘压低声音说，门缝后有拖拽声，别站在走廊正中。",
    playerLocation: "旧公寓B1走廊",
  });
  assert.equal(result.accepted.includes("我敲三下门缝试探回声"), true);
  assert.equal(result.accepted.includes("我先观察四周"), false);
  assert.equal(result.accepted.includes("我思考下一步"), false);
  assert.equal(result.accepted.includes("我去北门打篮球"), false);
});

test("semantic guards: should detect over-homogeneous categories and keep diversity", () => {
  const result = evaluateOptionsSemanticQuality({
    options: ["我观察门缝里的影子", "我查看楼梯拐角血迹", "我检查走廊天花板水渍", "我用手电照电梯按钮"],
    currentOptions: [],
    recentOptions: [],
    latestNarrative: "楼梯拐角有血迹，电梯按钮有湿痕，门缝里像有人影。",
    playerLocation: "旧公寓一层",
  });
  assert.equal(result.accepted.length >= 2, true);
  assert.equal(result.accepted.includes("我用手电照电梯按钮"), true);
  // 前三条均偏 investigate，质量门会压制同质化过高的候选。
  assert.equal(
    result.accepted.filter((x) => /观察|查看|检查/.test(x)).length <= 2,
    true
  );
});

