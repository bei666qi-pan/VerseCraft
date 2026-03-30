import test from "node:test";
import assert from "node:assert/strict";
import { applyGenderPronounPostGeneration } from "./genderPronounValidator";

test("gender：灵伤(N-020) female — 含名句子内‘他’应被纠正为‘她’", () => {
  const r = applyGenderPronounPostGeneration({
    narrative: "灵伤抬起头，他的笑像灯泡一样亮，却有一瞬空白。",
    focusNpcId: "N-020",
    presentNpcIds: ["N-020"],
  });
  assert.equal(r.triggered, true);
  assert.equal(r.narrative.includes("灵伤抬起头，她的笑"), true);
});

test("gender：欣蓝(N-010) female — 不应写成‘他’（窗口纠错）", () => {
  const r = applyGenderPronounPostGeneration({
    narrative: "欣蓝把登记表推过来，他的指尖压着纸边。",
    focusNpcId: "N-010",
    presentNpcIds: ["N-010"],
  });
  assert.equal(r.triggered, true);
  assert.ok(r.narrative.includes("她的指尖"));
});

test("gender：叶(N-007) female — 不修复引号对白中的‘他’（对白不动），但可修复叙事描述", () => {
  const r = applyGenderPronounPostGeneration({
    narrative: "叶说：“他不重要。”叶转开视线，他的手指扣住门框。",
    focusNpcId: "N-007",
    presentNpcIds: ["N-007"],
  });
  // 引号内不改，叙事层应改
  assert.ok(r.narrative.includes("叶说：“他不重要。”"));
  assert.ok(r.narrative.includes("她的手指"));
});

test("gender：男性角色不应被误改（北夏 N-018 male）", () => {
  const r = applyGenderPronounPostGeneration({
    narrative: "北夏笑了一声，他把价码写得很轻。",
    focusNpcId: "N-018",
    presentNpcIds: ["N-018"],
  });
  assert.equal(r.triggered, false);
  assert.equal(r.narrative, "北夏笑了一声，他把价码写得很轻。");
});

test("gender：unknown/ambiguous 不做他她纠错（安全不猜）", () => {
  const r = applyGenderPronounPostGeneration({
    narrative: "未知实体靠近，他的影子像被水泡过。",
    focusNpcId: "N-999",
    presentNpcIds: ["N-999"],
  });
  assert.equal(r.triggered, false);
});

