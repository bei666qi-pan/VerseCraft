import { test } from "node:test";
import assert from "node:assert/strict";
import {
  enforceToolCallShape,
  buildAnchorFallbackOptionsForTest,
  clearOptionsLruCacheForTest,
} from "@/lib/playRealtime/turnModeToolInterceptor";

const baseRecord = {
  is_action_legal: true,
  sanity_damage: 0,
  narrative: "我屏住呼吸，目光一寸寸扫过走廊。灯管在头顶嗡嗡作响，墙皮剥落处投成不规则阴影。",
  is_death: false,
  consumes_time: true,
  options: [] as string[],
  turn_mode: "narrative_only",
  decision_required: false,
};

test("enforceToolCallShape: narrative_only with 4 options keeps all 4 and corrects turn_mode", async () => {
  const r = await enforceToolCallShape({
    record: { ...baseRecord, options: ["继续观察", "轻敲门框", "后退一步", "屏息聆听"] },
    narrative: baseRecord.narrative,
    requestId: "req-1",
    disableLlmRefill: true,
    playerState: { playerLocation: "旧公寓三楼走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: ["item_phone"] },
  });
  assert.equal(r.record.turn_mode, "decision_required");
  assert.equal(r.record.decision_required, true);
  assert.equal((r.record.options as string[]).length, 4);
  assert.ok(r.flags.includes("turn_mode_corrected_from_narrative_only"));
});

test("enforceToolCallShape: narrative_only with empty options falls back to anchor template when LLM disabled", async () => {
  const r = await enforceToolCallShape({
    record: { ...baseRecord, options: [] },
    narrative: baseRecord.narrative,
    requestId: "req-2",
    disableLlmRefill: true,
    playerState: { playerLocation: "旧公寓三楼走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: ["item_phone"] },
  });
  // 用户指令：narrative_only 也要转为可用 json，不影响用户体验
  assert.equal(r.record.turn_mode, "decision_required");
  assert.equal(r.record.decision_required, true);
  assert.equal((r.record.options as string[]).length, 4);
  assert.ok(r.flags.includes("turn_mode_corrected_from_narrative_only"));
  assert.ok(r.flags.includes("options_refilled_by_template_fallback"));
  assert.equal(r.llmRefillUsed, false);
  assert.ok(r.appendedOptionsCount >= 1);
});

test("enforceToolCallShape: 1 option gets padded to 4 with narrative-anchored fallback", async () => {
  const r = await enforceToolCallShape({
    record: { ...baseRecord, options: ["屏住呼吸"] },
    narrative: baseRecord.narrative,
    requestId: "req-3",
    disableLlmRefill: true,
    playerState: { playerLocation: "旧公寓三楼走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: ["item_phone"] },
  });
  assert.equal((r.record.options as string[]).length, 4);
  assert.ok((r.record.options as string[])[0].includes("屏住呼吸"));
  assert.equal(r.record.turn_mode, "decision_required");
});

test("enforceToolCallShape: 6 options get truncated to 4", async () => {
  const r = await enforceToolCallShape({
    record: { ...baseRecord, options: ["A", "B", "C", "D", "E", "F"], turn_mode: "decision_required", decision_required: true },
    narrative: baseRecord.narrative,
    requestId: "req-4",
    disableLlmRefill: true,
    playerState: { playerLocation: "走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: [] },
  });
  assert.deepEqual(r.record.options, ["A", "B", "C", "D"]);
});

test("enforceToolCallShape: decision_options fallback when options empty + turn_mode decision_required", async () => {
  const r = await enforceToolCallShape({
    record: {
      ...baseRecord,
      options: [],
      turn_mode: "decision_required",
      decision_required: true,
      decision_options: ["绕到背后", "原地等待", "轻敲回应", "退回暗处"],
    },
    narrative: baseRecord.narrative,
    requestId: "req-5",
    disableLlmRefill: true,
    playerState: { playerLocation: "走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: [] },
  });
  assert.equal((r.record.options as string[]).length, 4);
  assert.equal(r.record.turn_mode, "decision_required");
});

test("enforceToolCallShape: writes hitl flags to _commit_flags + internal_meta", async () => {
  const r = await enforceToolCallShape({
    record: { ...baseRecord, options: ["A", "B", "C", "D"], _commit_flags: ["existing_flag"] },
    narrative: baseRecord.narrative,
    requestId: "req-6",
    disableLlmRefill: true,
    playerState: { playerLocation: "走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: [] },
  });
  const flags = r.record._commit_flags as string[];
  assert.ok(flags.includes("existing_flag"));
  assert.ok(flags.includes("turn_mode_corrected_from_narrative_only"));
  const meta = r.record.internal_meta as Record<string, unknown>;
  assert.equal(meta.hitl_turn_mode_interceptor, "applied_v2");
  assert.equal(meta.hitl_request_id, "req-6");
  assert.equal(meta.hitl_llm_refill_used, false);
});

test("buildAnchorFallbackOptionsForTest: produces 4 distinct entries without inventing facts", () => {
  const out = buildAnchorFallbackOptionsForTest({
    record: {},
    narrative: "我屏住呼吸，脚步放轻，注视着走廊尽头摇晃的灯光。",
    playerState: { playerLocation: "旧公寓三楼走廊", activeTaskIds: ["t-1"], aliveNpcIds: [], inventoryItemIds: ["item_phone"] },
  });
  assert.equal(out.length, 4);
  assert.equal(new Set(out).size, 4);
  for (const s of out) assert.ok(s.length <= 30, `option too long: ${s}`);
});

test("buildAnchorFallbackOptionsForTest: works even when narrative is missing", () => {
  const out = buildAnchorFallbackOptionsForTest({
    record: {},
    playerState: { playerLocation: "未知", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: [] },
  });
  assert.equal(out.length, 4);
  assert.equal(new Set(out).size, 4);
});

test("buildAnchorFallbackOptionsForTest: regression for null playerState + empty narrative", () => {
  // Regression: previously crashed with `Cannot read properties of undefined
  // (reading 'length')` when playerState is null because activeTaskIds was
  // guarded by `?.` but `.length` access was not.
  const out = buildAnchorFallbackOptionsForTest({
    record: {},
    narrative: undefined,
    playerState: null,
  });
  assert.equal(out.length, 4);
  assert.equal(new Set(out).size, 4);
});

test("enforceToolCallShape: hits LLM refill path when ctx provided + LLM enabled", async () => {
  // This test exercises the LLM refill branch by injecting a stub ctx.
  // The actual LLM call will fail (no real upstream in test), and we expect
  // a graceful fallback to anchor template. The key is that no exception is
  // thrown and the record still gets corrected.
  clearOptionsLruCacheForTest();
  const r = await enforceToolCallShape({
    record: { ...baseRecord, options: [] },
    narrative: baseRecord.narrative,
    requestId: "req-llm",
    ctx: { requestId: "req-llm", userId: "u", sessionId: "s" },
    playerState: { playerLocation: "走廊", activeTaskIds: [], aliveNpcIds: [], inventoryItemIds: [] },
  });
  assert.equal((r.record.options as string[]).length, 4);
  assert.equal(r.record.turn_mode, "decision_required");
  // Either LLM refill succeeded OR template fallback — both result in 4 options.
  assert.ok(r.appendedOptionsCount >= 1);
});