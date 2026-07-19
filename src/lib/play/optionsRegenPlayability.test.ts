import assert from "node:assert/strict";
import test from "node:test";
import { isCompleteRegeneratedOptions, isPlayableRegeneratedOptions } from "./optionsRegenPlayability";

test("options-only treats two through four real model actions as playable", () => {
  assert.equal(isPlayableRegeneratedOptions([]), false);
  assert.equal(isPlayableRegeneratedOptions(["检查门缝"]), false);
  assert.equal(isPlayableRegeneratedOptions(["检查门缝", "沿走廊撤退"]), true);
  assert.equal(isPlayableRegeneratedOptions(["检查门缝", "沿走廊撤退", "照亮墙角"]), true);
  assert.equal(isPlayableRegeneratedOptions(["检查门缝", "沿走廊撤退", "照亮墙角", "呼叫老刘"]), true);
  assert.equal(isPlayableRegeneratedOptions(["一", "二", "三", "四", "五"]), false);
  assert.equal(isCompleteRegeneratedOptions(["检查门缝", "沿走廊撤退", "照亮墙角"]), false);
  assert.equal(isCompleteRegeneratedOptions(["检查门缝", "沿走廊撤退", "照亮墙角", "呼叫老刘"]), true);
});
