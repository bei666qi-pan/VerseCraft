import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("chat route 保持 SSE 终帧与 JSON 契约关键字段", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");
  assert.ok(content.includes("__VERSECRAFT_FINAL__"));
  assert.ok(content.includes("runStreamFinalHooks"));
  const required = ["is_action_legal", "sanity_damage", "narrative", "is_death", "consumes_time"];
  for (const key of required) {
    assert.ok(content.includes(key), `missing contract key marker: ${key}`);
  }
  // Phase-1: 终帧必须经过 resolver 收口为“可提交对象”
  assert.ok(content.includes("resolveDmTurn"), "final envelope resolver must be applied");
  assert.ok(
    content.includes("maxChars: 4000") ||
      content.includes("contextMode === \"minimal\" ? 1400 : 4000"),
    "runtime packet budget must stay aligned with buildRuntimeContextPackets full default (stage2 + 学制子包)"
  );
  assert.ok(content.includes("finalOutputModeration"), "final output safety must be retained");
  assert.ok(content.includes("runStreamFinalHooks"), "final hooks must stay enabled");
  const idxInputSafety = content.indexOf("const inputSafety = await moderateInputOnServer");
  const idxRiskLane = content.indexOf("const laneDecision =");
  assert.equal(idxInputSafety >= 0 && idxRiskLane >= 0 && idxInputSafety < idxRiskLane, true, "content safety must run before risk lane split");
  assert.ok(content.includes("AI_CHAT_ENABLE_RISK_LANE_SPLIT"), "risk lane split should be configurable");
  assert.ok(content.includes("AI_CHAT_ENABLE_LIGHTWEIGHT_FAST_PATH"), "lightweight fast path should be configurable");
  assert.ok(content.includes("AI_CHAT_ENABLE_PROMPT_SLIMMING"), "prompt slimming should be configurable");
  assert.ok(content.includes("AI_CHAT_CONTROL_PREFLIGHT_BUDGET_MS_CAP"), "preflight budget cap should be configurable");
  assert.ok(content.includes("AI_CHAT_LORE_RETRIEVAL_BUDGET_MS_CAP"), "lore budget cap should be configurable");
  assert.ok(content.includes("Promise.race([") && content.includes("loreBudgetMs"), "lore timeout degrade guard missing");
});
