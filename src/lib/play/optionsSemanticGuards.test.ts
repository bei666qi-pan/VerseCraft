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

test("semantic guards: visible recovery scene anchors prevent literal-anchor false negatives", () => {
  const result = evaluateOptionsSemanticQuality({
    options: ["我检查电源室的其他设备", "我询问老刘下一步计划", "我握紧武器警戒门口", "我去北门打篮球"],
    currentOptions: [],
    recentOptions: [],
    latestNarrative: "我完成修复，稳定度已经恢复。",
    playerLocation: "B1_PowerRoom",
    sceneAnchors: ["配电间", "电源室", "电工老刘", "老刘", "武器"],
  });
  assert.equal(result.accepted.includes("我检查电源室的其他设备"), true);
  assert.equal(result.accepted.includes("我询问老刘下一步计划"), true);
  assert.equal(result.accepted.includes("我握紧武器警戒门口"), true);
  assert.equal(result.accepted.includes("我去北门打篮球"), false);
});

test("semantic guards: concrete combat aftermath actions keep their visible narrative anchors", () => {
  const result = evaluateOptionsSemanticQuality({
    options: ["我后退两步，与黑影保持安全距离", "我检查铁管受损程度，并摸出绷带准备应急", "我向欣蓝点头示意，问她是否知道更多"],
    currentOptions: [],
    recentOptions: [],
    latestNarrative: "走廊尽头那团黑影被铁管压退，空气里还残留着潮湿的铁锈味。",
  });
  assert.deepEqual(result.accepted, ["我后退两步，与黑影保持安全距离", "我检查铁管受损程度，并摸出绷带准备应急"]);
  assert.equal(result.rejected[0]?.option, "我向欣蓝点头示意，问她是否知道更多");
  assert.equal(result.rejected[0]?.reason, "missing_story_anchor");
});

test("semantic guards: shadow variants and live scene details anchor distinct real actions", () => {
  const result = evaluateOptionsSemanticQuality({
    options: ["我朝那团黑影喊话，试探它是否有反应", "我用绷带缠紧虎口，准备下一轮", "我朝电视方向喊一声，看有无回应"],
    currentOptions: [],
    recentOptions: [],
    latestNarrative: "电视静噪从走廊尽头传来，漆黑的轮廓还在缓慢蠕动。",
    sceneAnchors: ["绷带"],
  });
  assert.deepEqual(result.accepted, ["我朝那团黑影喊话，试探它是否有反应", "我用绷带缠紧虎口，准备下一轮", "我朝电视方向喊一声，看有无回应"]);
});
