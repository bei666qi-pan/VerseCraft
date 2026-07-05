import test from "node:test";
import assert from "node:assert/strict";
import { stripDeveloperFacingFragments } from "./playerFacingText";

test("stripDeveloperFacingFragments 去掉文档指针", () => {
  const s = stripDeveloperFacingFragments("表层登记。详情见 majorNpcDeepCanon。辅锚之三收尾。");
  assert.ok(!s.includes("majorNpcDeepCanon"));
  assert.ok(!s.includes("详情见"));
  assert.ok(!s.includes("辅锚"));
});

test("stripDeveloperFacingFragments 去掉已知内部字段名（带取值或裸词）", () => {
  const withValue = stripDeveloperFacingFragments("他提醒你 guidanceLevel:strong 要小心。");
  assert.ok(!withValue.includes("guidanceLevel"));
  const bare = stripDeveloperFacingFragments("系统记录了 visited 与 talked_to 两项。");
  assert.ok(!bare.includes("visited"));
  assert.ok(!bare.includes("talked_to"));
});

test("stripDeveloperFacingFragments 兜底清掉未知的 snake_case / 多段 camelCase 泄漏", () => {
  const snake = stripDeveloperFacingFragments("触发了 b1_guidance_seeded，别在意。");
  assert.ok(!snake.includes("b1_guidance_seeded"));
  const camel = stripDeveloperFacingFragments("这属于 issuerSoftRevealMode 的范畴。");
  assert.ok(!camel.includes("issuerSoftRevealMode"));
});

test("stripDeveloperFacingFragments 不误伤正常中文叙事与专名", () => {
  const s = stripDeveloperFacingFragments("老刘看了你一眼，说：先把灯修好，再谈别的。");
  assert.equal(s, "老刘看了你一眼，说：先把灯修好，再谈别的。");
});
