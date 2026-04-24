import test from "node:test";
import assert from "node:assert/strict";
import { buildOptionsRegenSystemPrompt } from "@/lib/play/optionsRegenPrompt";

test("options regen prompt should contain anti-reuse and narrative anchoring constraints", () => {
  const prompt = buildOptionsRegenSystemPrompt();
  assert.equal(prompt.includes("严禁复用或改写复用【当前屏幕选项】与【最近出现选项】"), true);
  assert.equal(prompt.includes("至少 2 条必须直接锚定最近叙事中的具体实体或场景对象"), true);
  assert.equal(prompt.includes("不允许泛化动作"), true);
});

