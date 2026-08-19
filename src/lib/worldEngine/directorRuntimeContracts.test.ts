import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeWorldEngineTickPayload,
  parseWorldEngineDeltaJson,
} from "./contracts";
import {
  applyWorldCapabilitySafetyDefaults,
  getWorldDirectorCapabilityProfile,
  validateDirectorPlanCapabilities,
} from "./directorCapabilities";
import { validateDirectorPlan } from "./validator";
import { QINGSHI_MAP_ID, XINGNI_WORLD_ID } from "@/lib/worlds/types";
import { readFileSync } from "node:fs";

const base = {
  requestId: "req-1",
  userId: null,
  sessionId: "same-session",
  triggerSignals: ["key_story_node_hit"],
  controlRiskTags: [],
  npcLocationUpdateCount: 0,
  turnIndex: 2,
  dedupKey: "we:test",
  enqueuedAt: "2026-08-14T00:00:00.000Z",
};

test("legacy jobs with no scope migrate to Dark Moon only", () => {
  const result = normalizeWorldEngineTickPayload(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.migratedLegacyScope, true);
  assert.equal(result.payload.worldId, "dark_moon_prologue");
  assert.equal(result.payload.mapId, "dark_moon_apartment");
});

test("partial or mismatched scope is rejected instead of inferred", () => {
  assert.deepEqual(
    normalizeWorldEngineTickPayload({ ...base, worldId: XINGNI_WORLD_ID }),
    { ok: false, reason: "partial_world_scope" },
  );
  const mismatch = normalizeWorldEngineTickPayload({
    ...base,
    worldId: XINGNI_WORLD_ID,
    mapId: "dark_moon_apartment",
  });
  assert.equal(mismatch.ok, false);
});

test("V2 jobs never receive the legacy Dark Moon scope fallback", () => {
  assert.deepEqual(
    normalizeWorldEngineTickPayload({ ...base, version: 2 }),
    { ok: false, reason: "v2_world_scope_required" },
  );
});

test("pacing and structured collections are bounded", () => {
  const result = normalizeWorldEngineTickPayload({
    ...base,
    version: 2,
    worldId: XINGNI_WORLD_ID,
    mapId: QINGSHI_MAP_ID,
    presentNpcIds: Array.from({ length: 100 }, (_, index) => `XQ-N${index}`),
    pacingChapterSignals: { tension: 9, progress: -4, chapterIndex: -2, phase: "invalid" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.presentNpcIds.length, 64);
  assert.equal(result.payload.pacingChapterSignals.tension, 1);
  assert.equal(result.payload.pacingChapterSignals.progress, 0);
  assert.equal(result.payload.pacingChapterSignals.phase, "quiet");
});

test("Xingni capability profile removes cross-world NPCs and invented events", () => {
  const parsed = parseWorldEngineDeltaJson(JSON.stringify({
    schema_version: "director_plan_v1",
    director_intent: "推进青石县事件",
    current_phase: "quiet",
    target_phase: "build_up",
    npc_next_actions: [
      { npc_code: "N-001", action: "observe", urgency: "low", eta_turns: 1 },
      { npc_code: "XQ-N005", action: "observe", urgency: "low", eta_turns: 1 },
    ],
    world_events_to_schedule: [
      { event_code: "INVENTED", title: "invented", due_in_turns: 1, ttl_turns: 2, priority: "low", salience: 0.5, trigger_conditions: [], injection_hint: "invent", agency_constraints: [], forbidden_outcomes: [], payload: {} },
      { event_code: "XQ-EV01", title: "registered", due_in_turns: 1, ttl_turns: 2, priority: "low", salience: 0.5, trigger_conditions: [], injection_hint: "雨后药香", agency_constraints: [], forbidden_outcomes: [], payload: {} },
    ],
  }));
  assert.ok(parsed);
  const profile = getWorldDirectorCapabilityProfile({ worldId: XINGNI_WORLD_ID, mapId: QINGSHI_MAP_ID });
  assert.ok(profile);
  const result = validateDirectorPlanCapabilities(parsed, profile);
  assert.deepEqual(result.plan.npc_next_actions.map((x) => x.npc_code), ["XQ-N005"]);
  assert.deepEqual(result.plan.world_events_to_schedule.map((x) => x.event_code), ["XQ-EV01"]);
  assert.equal(result.plan.social_events_to_schedule.length, 0);
});

test("Xingni registered events still reject foreign references and progression mutations", () => {
  const parsed = parseWorldEngineDeltaJson(JSON.stringify({
    schema_version: "director_plan_v1",
    director_intent: "只使用青石县登记内容",
    world_events_to_schedule: [
      { event_code: "XQ-EV01", title: "cross world", injection_hint: "一个跨世界角色被错误写入微事件。", payload: { event_id: "XQ-EV01", npc_id: "N-001" } },
      { event_code: "XQ-EV02", title: "reward", injection_hint: "一个微事件试图直接发放未经裁决的奖励。", payload: { event_id: "XQ-EV02", reward: 99 } },
      { event_code: "XQ-EV03", title: "safe", injection_hint: "顾玄岳在镇邪司外停步观察，没有替玩家作决定。", payload: { event_id: "XQ-EV03", npc_id: "XQ-N001", location_id: "QS_EXORCISM_OFFICE" } },
    ],
  }));
  assert.ok(parsed);
  const profile = getWorldDirectorCapabilityProfile({ worldId: XINGNI_WORLD_ID, mapId: QINGSHI_MAP_ID });
  assert.ok(profile);
  const result = validateDirectorPlanCapabilities(parsed, profile);
  assert.deepEqual(result.plan.world_events_to_schedule.map((event) => event.event_code), ["XQ-EV03"]);
  assert.deepEqual(result.rejectedCodes.sort(), ["XQ-EV01", "XQ-EV02"].sort());
});

test("registered low-risk Xingni micro-events receive fixed agency boundaries before validation", () => {
  const parsed = parseWorldEngineDeltaJson(JSON.stringify({
    schema_version: "director_plan_v1",
    director_intent: "用登记坊市微事件缓和重复探索",
    world_events_to_schedule: [
      {
        event_code: "XQ-EV03",
        title: "坊市争价",
        priority: "medium",
        salience: 0.6,
        injection_hint: "坊市摊前传来一阵争价声，陈砚侧身让开道路，玩家可以自行决定是否停留。",
        payload: { event_id: "XQ-EV03", npc_id: "XQ-N006", location_id: "QS_CULTIVATOR_MARKET" },
      },
    ],
  }));
  const profile = getWorldDirectorCapabilityProfile({ worldId: XINGNI_WORLD_ID, mapId: QINGSHI_MAP_ID });
  assert.ok(parsed && profile);
  const normalized = applyWorldCapabilitySafetyDefaults(parsed, profile);
  assert.equal(normalized.world_events_to_schedule[0]?.agency_constraints.length, 1);
  assert.equal(normalized.world_events_to_schedule[0]?.forbidden_outcomes.length, 1);
  assert.equal(validateDirectorPlan(normalized).accepted, true);
});

test("capability defaults never repair invented, high-risk, or consequential Xingni events", () => {
  const parsed = parseWorldEngineDeltaJson(JSON.stringify({
    schema_version: "director_plan_v1",
    director_intent: "invalid candidates",
    world_events_to_schedule: [
      { event_code: "XQ-EV13", title: "invented", priority: "low", injection_hint: "一个未登记事件出现。", payload: {} },
      { event_code: "XQ-EV03", title: "high", priority: "high", injection_hint: "坊市出现高风险冲突。", payload: { event_id: "XQ-EV03" } },
      { event_code: "XQ-EV04", title: "reward", priority: "low", injection_hint: "事件直接发放奖励并完成任务。", payload: { event_id: "XQ-EV04", reward: 10 } },
    ],
  }));
  const profile = getWorldDirectorCapabilityProfile({ worldId: XINGNI_WORLD_ID, mapId: QINGSHI_MAP_ID });
  assert.ok(parsed && profile);
  const normalized = applyWorldCapabilitySafetyDefaults(parsed, profile);
  assert.ok(normalized.world_events_to_schedule.every((event) => event.agency_constraints.length === 0));
  assert.equal(validateDirectorPlan(normalized).accepted, false);
});

test("legacy storyDirector remains a deterministic signal controller without Writer prose", () => {
  const types = readFileSync("src/lib/storyDirector/types.ts", "utf8");
  const planner = readFileSync("src/lib/storyDirector/planner.ts", "utf8");
  const prompt = readFileSync("src/lib/storyDirector/prompt.ts", "utf8");
  assert.match(types, /PacingChapterControllerState/);
  assert.match(types, /PacingChapterControllerPlan/);
  assert.doesNotMatch(planner, /softPressureHint|hardConstraint/);
  assert.doesNotMatch(prompt, /buildDirectorPromptBlock/);
});
