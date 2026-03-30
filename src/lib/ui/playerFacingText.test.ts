import test from "node:test";
import assert from "node:assert/strict";
import { stripDeveloperFacingFragments } from "./playerFacingText";

test("stripDeveloperFacingFragments 去掉文档指针", () => {
  const s = stripDeveloperFacingFragments("表层登记。详情见 majorNpcDeepCanon。辅锚之三收尾。");
  assert.ok(!s.includes("majorNpcDeepCanon"));
  assert.ok(!s.includes("详情见"));
  assert.ok(!s.includes("辅锚"));
});
