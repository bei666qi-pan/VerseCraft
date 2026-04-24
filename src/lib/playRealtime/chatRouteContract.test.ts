import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("chat route 保持 SSE 终帧与 JSON 契约关键字段", () => {
  // Phase-3/4 以来若干 perf/preflight 配置已抽离到 turnEngine/chatPerf.ts。
  // 契约仍需要：route.ts 保留 SSE/final/resolve/runtimePacket/inputSafety-before-lane 主链；
  // 可配置性可分布在 chatPerf.ts。
  const routePath = join(process.cwd(), "src/app/api/chat/route.ts");
  const routeContent = readFileSync(routePath, "utf8");
  const chatPerfPath = join(process.cwd(), "src/lib/turnEngine/chatPerf.ts");
  const chatPerfContent = readFileSync(chatPerfPath, "utf8");
  const anyContent = `${routeContent}\n/*-*/\n${chatPerfContent}`;

  assert.ok(routeContent.includes("__VERSECRAFT_FINAL__"));
  assert.ok(routeContent.includes("runStreamFinalHooks"));
  const required = ["is_action_legal", "sanity_damage", "narrative", "is_death", "consumes_time"];
  for (const key of required) {
    assert.ok(routeContent.includes(key), `missing contract key marker: ${key}`);
  }
  // Phase-1: 终帧必须经过 resolver 收口为“可提交对象”
  assert.ok(routeContent.includes("resolveDmTurn"), "final envelope resolver must be applied");
  assert.ok(
    routeContent.includes("maxChars: 4000") ||
      routeContent.includes("contextMode === \"minimal\" ? 1400 : 4000"),
    "runtime packet budget must stay aligned with buildRuntimeContextPackets full default (stage2 + 学制子包)"
  );
  assert.ok(routeContent.includes("finalOutputModeration"), "final output safety must be retained");
  assert.ok(routeContent.includes("runStreamFinalHooks"), "final hooks must stay enabled");
  const idxInputSafety = routeContent.indexOf("const inputSafety = await moderateInputOnServer");
  const idxRiskLane = routeContent.indexOf("const laneDecision =");
  assert.equal(
    idxInputSafety >= 0 && idxRiskLane >= 0 && idxInputSafety < idxRiskLane,
    true,
    "content safety must run before risk lane split"
  );
  assert.ok(anyContent.includes("AI_CHAT_ENABLE_RISK_LANE_SPLIT"), "risk lane split should be configurable");
  assert.ok(anyContent.includes("AI_CHAT_ENABLE_LIGHTWEIGHT_FAST_PATH"), "lightweight fast path should be configurable");
  assert.ok(anyContent.includes("AI_CHAT_ENABLE_PROMPT_SLIMMING"), "prompt slimming should be configurable");
  assert.ok(
    anyContent.includes("AI_CHAT_CONTROL_PREFLIGHT_BUDGET_MS_CAP"),
    "preflight budget cap should be configurable"
  );
  assert.ok(
    anyContent.includes("AI_CHAT_LORE_RETRIEVAL_BUDGET_MS_CAP"),
    "lore budget cap should be configurable"
  );
  // Lore retrieval budget guard: the hot path must still race lore retrieval
  // against a budget. The budget variable name has been refactored
  // (loreBudgetMs -> loreRetrievalBudgetMs), but the guard itself must remain
  // in `route.ts`. Accept either name.
  assert.ok(
    routeContent.includes("Promise.race([") &&
      (routeContent.includes("loreRetrievalBudgetMs") || routeContent.includes("loreBudgetMs")),
    "lore timeout degrade guard missing"
  );
});
