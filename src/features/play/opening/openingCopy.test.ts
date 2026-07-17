import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXED_OPENING_NARRATIVE,
  FIXED_OPENING_NARRATIVE_EN,
  getFixedOpeningNarrative,
  getOpeningSystemPrompt,
  isOpeningSystemUserMessage,
  OPENING_SYSTEM_PROMPT,
  OPENING_SYSTEM_PROMPT_EN,
} from "./openingCopy";

test("OPENING_SYSTEM_PROMPT：要求主笔产出非空四条 options，与固定前文协议一致", () => {
  assert.ok(OPENING_SYSTEM_PROMPT.includes("禁止输出空数组"));
  assert.ok(OPENING_SYSTEM_PROMPT.includes("恰好 4 条") || OPENING_SYSTEM_PROMPT.includes("必须恰好 4 条"));
  assert.ok(!OPENING_SYSTEM_PROMPT.includes("options 填空数组 []"));
});

test("isOpeningSystemUserMessage：trim 后与 OPENING_SYSTEM_PROMPT 对齐", () => {
  assert.equal(isOpeningSystemUserMessage(`  ${OPENING_SYSTEM_PROMPT}  `), true);
  assert.equal(isOpeningSystemUserMessage(`  ${OPENING_SYSTEM_PROMPT_EN}  `), true);
  assert.equal(isOpeningSystemUserMessage("玩家行动：观察"), false);
});

test("英文开场与 system prompt 使用英文版本", () => {
  assert.equal(getFixedOpeningNarrative("en-US"), FIXED_OPENING_NARRATIVE_EN);
  assert.equal(getOpeningSystemPrompt("en-US"), OPENING_SYSTEM_PROMPT_EN);
  assert.ok(FIXED_OPENING_NARRATIVE_EN.includes("Kisaragi Apartments"));
  assert.ok(OPENING_SYSTEM_PROMPT_EN.includes("exactly four"));
});

test("FIXED_OPENING_NARRATIVE：非空固定开场", () => {
  // Phase-3: 旧版 2026 字含 29 处比喻，新 v3 终版 1435 字、2 处比喻、styleValidator issues=0
  assert.ok(FIXED_OPENING_NARRATIVE.length > 100);
  assert.ok(FIXED_OPENING_NARRATIVE.includes("如月公寓"));
  // 新开场 v3 新增断言：十日出口钩子、走廊关键词、"我"的声音（贴吧写过两篇烂尾小说）
  assert.ok(FIXED_OPENING_NARRATIVE.includes("十日"));
  assert.ok(FIXED_OPENING_NARRATIVE.includes("走廊"));
  assert.ok(FIXED_OPENING_NARRATIVE.includes("我以前在贴吧"));
});

test("opening copy exports no local preset option fallback", async () => {
  const openingCopy = await import("./openingCopy");
  assert.equal("DEFAULT_FOUR_ACTION_OPTIONS" in openingCopy, false);
});

test("OPENING_SYSTEM_PROMPT：不再硬编码字数与动作模板，确保选项实时由模型生成", () => {
  // 防回归：删除的"约 5–20 字"硬性字数约束不应再回潮。
  assert.ok(!OPENING_SYSTEM_PROMPT.includes("约 5–20 字"));
  assert.ok(!OPENING_SYSTEM_PROMPT.includes("5-20 字"));
  // 防回归：删除的"优先稳住呼吸/辨认墙角/听人声脚步/循微光或声源/背靠墙摸清退路"动作模板列举不应再回潮。
  for (const banned of [
    "优先稳住呼吸",
    "辨认墙角地面",
    "听人声脚步",
    "循微光或声源挪半步",
    "背靠墙摸清退路",
  ]) {
    assert.ok(!OPENING_SYSTEM_PROMPT.includes(banned), `OPENING_SYSTEM_PROMPT 不应包含模板片段："${banned}"`);
  }
  // 关键合理性硬约束仍保留。
  assert.ok(OPENING_SYSTEM_PROMPT.includes("第一人称"));
  assert.ok(OPENING_SYSTEM_PROMPT.includes("互不相同"));
  assert.ok(OPENING_SYSTEM_PROMPT.includes("禁止套用任何提前写好的模板"));
});
