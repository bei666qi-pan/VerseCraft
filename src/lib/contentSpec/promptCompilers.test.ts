import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_APARTMENT_NPCS, BASE_APARTMENT_TASK_SPECS } from "./packs/baseApartmentPack";
import { compileNpcRuntimePromptBlock, compileTaskRuntimePromptBlock } from "./promptCompilers";

test("phase6: npc runtime prompt block is short", () => {
  const spec = BASE_APARTMENT_NPCS[0]!;
  const text = compileNpcRuntimePromptBlock({ spec, maxChars: 120 });
  assert.ok(text.includes("NPC["));
  assert.ok(text.length <= 120);
});

test("phase6: task runtime prompt block is short", () => {
  const spec = BASE_APARTMENT_TASK_SPECS[0]!;
  const text = compileTaskRuntimePromptBlock({ spec, maxChars: 140 });
  assert.ok(text.includes("任务["));
  assert.ok(text.length <= 140);
});

