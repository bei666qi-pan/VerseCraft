import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("chat route 保持 SSE 终帧与 JSON 契约关键字段", () => {
  // Phase-3/4: perf/preflight 配置抽离到 turnEngine/chatPerf.ts。
  // Phase-6+: runStreamFinalHooks 已回内联到 route.ts（避免 80 字段 context 对象构造开销）。
  const routePath = join(process.cwd(), "src/app/api/chat/route.ts");
  const routeContent = readFileSync(routePath, "utf8");
  const chatPerfPath = join(process.cwd(), "src/lib/turnEngine/chatPerf.ts");
  const chatPerfContent = readFileSync(chatPerfPath, "utf8");
  const promptAssemblyPath = join(process.cwd(), "src/lib/playRealtime/promptAssembly.ts");
  const promptAssemblyContent = readFileSync(promptAssemblyPath, "utf8");
  const anyContent = `${routeContent}\n/*-*/\n${chatPerfContent}`;

  assert.ok(routeContent.includes("VERSECRAFT_FINAL_PREFIX"));
  assert.ok(routeContent.includes("runStreamFinalHooks"));
  const required = ["is_action_legal", "sanity_damage", "narrative", "is_death", "consumes_time"];
  for (const key of required) {
    assert.ok(routeContent.includes(key), `missing contract key marker: ${key}`);
  }
  // Phase-1: 终帧必须经过 resolver 收口为"可提交对象"（现内联于 route.ts）
  assert.ok(routeContent.includes("resolveDmTurn"), "final envelope resolver must be applied");
  const deterministicServiceIndex = routeContent.indexOf("buildDeterministicServiceTurn({");
  const kgIndex = routeContent.indexOf("const kgEnabled = isKgLayerEnabled()");
  const preflightIndex = routeContent.indexOf("runControlPreflightStage({");
  const modelIndex = routeContent.indexOf("generateMainReply({");
  assert.ok(deterministicServiceIndex > 0, "deterministic service fast lane must exist");
  assert.ok(deterministicServiceIndex < kgIndex, "deterministic service must avoid KG work");
  assert.ok(deterministicServiceIndex < preflightIndex, "deterministic service must avoid control preflight");
  assert.ok(deterministicServiceIndex < modelIndex, "deterministic service must avoid model generation");
  assert.ok(routeContent.includes('"X-VerseCraft-Turn-Path": "deterministic_service"'));
  assert.ok(promptAssemblyContent.includes("AI_CHAT_RUNTIME_PACKET_MAX_CHARS"), "runtime packet budget must be configurable");
  assert.ok(promptAssemblyContent.includes("Math.max(2_400"), "runtime packet budget must retain the authority-packet safety floor");
  assert.ok(routeContent.includes("finalOutputModeration"), "final output safety must be retained");
  assert.ok(routeContent.includes("x-versecraft-output-language"), "outer SSE fallback must preserve requested display language");
  assert.ok(routeContent.includes("language: validated.language"), "inner fallback payloads must preserve validated display language");
  assert.ok(routeContent.includes("VERSECRAFT_ENABLE_FINAL_LANGUAGE_GUARD"), "mixed-language final output must have a guarded recovery path");
  assert.ok(routeContent.includes("hasWrongGameplayTurnLanguage"), "final output must reject wrong-language narrative and choices");
  assert.ok(routeContent.includes("collectSafetyReport"), "Narrative Safety Kernel must stay on final path");
  assert.ok(promptAssemblyContent.includes("lane_side_effect_applied"), "TurnLane side-effect telemetry must be retained");
  assert.ok(routeContent.includes("sideEffectPlan"), "route.ts must consume TurnLane sideEffectPlan");
  assert.ok(routeContent.includes("runStreamFinalHooks"), "final hooks must stay enabled");
  assert.ok(
    !routeContent.includes("maxTokensOverride: playerChatMaxTokens"),
    "PLAYER_CHAT must not forward an application-side token ceiling"
  );
  assert.ok(
    routeContent.includes("const next = await callUpstreamOnce({ skipRoles: skippedStreamRoles })"),
    "stream reconnects must reuse the same token-aware request closure"
  );
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
  for (const forbidden of [
    "本回合未生成",
    "本回合未提交",
    "创作主脑暂时离线",
    "世界推演暂时超时",
    "世界推演服务暂时不可用",
    "连接失败，正在降级",
  ]) {
    assert.equal(routeContent.includes(forbidden), false, `non-safety fallback leaked: ${forbidden}`);
  }
});

test("malformed DM repair keeps a bounded post-generation budget", () => {
  // 内联回 route.ts
  const content = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const finalizingIndex = content.indexOf('writeStatusFrame("finalizing"');
  const budgetIndex = content.indexOf('envNumber("VC_FINAL_REPAIR_BUDGET_MS", 6_000)');
  const repairIndex = content.indexOf("const phaseRepairMalformedCandidate");
  assert.ok(budgetIndex > finalizingIndex, "repair budget must be created in final hooks, after first status");
  assert.ok(repairIndex > budgetIndex, "malformed-DM repair must consume the final-hook budget");
  assert.ok(content.includes("budgetMs: nextFinalRepairBudgetMs(4_000)"), "malformed-DM repair must retain its four-second default window");
  assert.ok(content.includes("budgetMs: nextFinalRepairBudgetMs(6_000)"), "post-validator narrative repair must receive the six-second default window");
  // repair budget must retain 1–12 second bounds (Math.max(1_000, Math.min(12_000, ...)))
  assert.ok(content.includes("Math.min(12_000, envNumber"), "repair budget must retain 1–12 second bounds");
});

test("narrative expansion remains a bounded final hook with a p95 deadline", () => {
  const routeContent = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const logicalTasksContent = readFileSync(join(process.cwd(), "src/lib/ai/logicalTasks.ts"), "utf8");

  // First status frame still emitted from route.ts before streaming starts.
  assert.ok(routeContent.includes('writeStatusFrame("request_sent"'));
  // Expansion budget logic now inlined into route.ts.
  assert.ok(routeContent.includes("const finalP95RemainingMs"));
  assert.ok(routeContent.includes("CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms"));
  assert.ok(routeContent.includes("Math.min(configuredExpansionBudgetMs, performanceBudgetMs - 250, finalP95RemainingMs)"));
  assert.ok(logicalTasksContent.includes("Math.min(10_000, args.budgetMs ?? 6_000)"));
});

test("non-injection entity hard blocks receive a bounded model repair before deterministic fallback", () => {
  const content = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const logicalTasksContent = readFileSync(join(process.cwd(), "src/lib/ai/logicalTasks.ts"), "utf8");
  const repairableIndex = content.indexOf("const repairableNarrativeFailure");
  const repairIndex = content.lastIndexOf("const repaired = await repairNarrativeOnly");
  const commitIndex = content.indexOf("const commitResult = commitTurn");

  assert.ok(repairableIndex >= 0 && repairIndex > repairableIndex && commitIndex > repairIndex);
  assert.ok(content.includes("narrativeSafetyEnforcement.shouldBlockCommit"));
  assert.ok(content.includes("!narrativeSafetyEnforcement.promptInjectionBlocked"));
  assert.ok(content.includes("narrativeSafetyReport = narrativeSafetyRuntime.kernelEnabled"));
  assert.ok(logicalTasksContent.includes("Math.min(6_000, args.budgetMs ?? 2_500)"));
});
