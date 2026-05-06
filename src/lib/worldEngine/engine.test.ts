import test from "node:test";
import assert from "node:assert/strict";
import { detectWorldEngineTriggers, parseWorldEngineDeltaJson } from "@/lib/worldEngine/contracts";
import { validateDirectorPlan } from "@/lib/worldEngine/validator";

test("detectWorldEngineTriggers emits expected trigger categories", () => {
  const got = detectWorldEngineTriggers({
    turnIndex: 12,
    latestUserInput: "我继续调查幕后真相",
    previousPlayerLocation: "1F_Corridor",
    playerLocation: "2F_Corridor",
    npcLocationUpdateCount: 2,
    dmRecord: {
      narrative: "ok",
      task_updates: [{ id: "t1", done: true }],
      npc_location_updates: [{ id: "N-001", to_location: "2F_Corridor" }],
      clue_updates: [{ id: "c1" }],
    },
    preflightRiskTags: ["political"],
    clueCount: 5,
  });
  assert.ok(got.includes("in_game_day_elapsed"));
  assert.ok(got.includes("multi_room_movement"));
  assert.ok(got.includes("key_story_node_hit"));
  assert.ok(got.includes("important_npc_state_changed"));
  assert.ok(got.includes("clue_threshold_reached"));
  assert.ok(got.includes("world_fact_threshold_reached"));
});

test("detectWorldEngineTriggers does not treat non-empty playerLocation as movement", () => {
  const got = detectWorldEngineTriggers({
    turnIndex: 1,
    latestUserInput: "我观察走廊",
    previousPlayerLocation: "2F_Corridor",
    playerLocation: "2F_Corridor",
    npcLocationUpdateCount: 0,
    dmRecord: { narrative: "ok" },
    preflightRiskTags: [],
  });
  assert.equal(got.includes("multi_room_movement"), false);
});

test("detectWorldEngineTriggers does not turn safety tags into story triggers", () => {
  const got = detectWorldEngineTriggers({
    turnIndex: 2,
    latestUserInput: "我等一等",
    playerLocation: null,
    npcLocationUpdateCount: 0,
    dmRecord: { narrative: "ok" },
    preflightRiskTags: ["political", "violence"],
  });
  assert.equal(got.includes("world_fact_threshold_reached"), false);
});

test("detectWorldEngineTriggers detects stagnation and due agenda signals", () => {
  const got = detectWorldEngineTriggers({
    turnIndex: 8,
    latestUserInput: "我继续检查门缝",
    playerLocation: null,
    npcLocationUpdateCount: 0,
    dmRecord: { narrative: "ok" },
    preflightRiskTags: [],
    progresslessTurnCount: 4,
    repeatedInvestigationCount: 3,
    dueHookCount: 1,
    dueNpcAgendaCount: 1,
    currentTension: 0.1,
  });
  assert.ok(got.includes("plot_stagnation_detected"));
  assert.ok(got.includes("repeated_investigation_loop"));
  assert.ok(got.includes("due_hook_reached"));
  assert.ok(got.includes("npc_agenda_due"));
  assert.ok(got.includes("tension_too_low"));
});

test("parseWorldEngineDeltaJson accepts director_plan_v1 json", () => {
  const parsed = parseWorldEngineDeltaJson(
    JSON.stringify({
      schema_version: "director_plan_v1",
      director_intent: "用一个低风险线索打断停滞。",
      current_phase: "quiet",
      target_phase: "build_up",
      pacing_assessment: {
        tension: 0.2,
        mystery: 0.7,
        fatigue: 0.1,
        progress: 0.2,
        agency_health: 0.8,
        reveal_pressure: 0.5,
      },
      risk_assessment: {
        agency_risk: "low",
        continuity_risk: "low",
        spoiler_risk: "low",
        safety_risk: "low",
      },
      reveal_policy: "hint_only",
      npc_next_actions: [{ npc_code: "N_001", action: "去楼梯口确认噪声", urgency: "medium", eta_turns: 2 }],
      world_events_to_schedule: [
        {
          event_code: "EV_LOCKDOWN",
          title: "封锁升级",
          due_in_turns: 3,
          ttl_turns: 4,
          priority: "high",
          salience: 2,
          trigger_conditions: ["玩家仍在走廊附近"],
          injection_hint: "楼梯间的铁门从内侧传来轻微回弹声。",
          agency_constraints: ["玩家可以绕开或等待"],
          forbidden_outcomes: ["不得强制受伤"],
          payload: { zone: "B2" },
        },
      ],
      story_branch_seeds: [{ seed_code: "SB_1", summary: "出现分支", confidence: 1.7 }],
      consistency_warnings: [{ code: "CW_1", message: "时间线轻微冲突", severity: "low" }],
      player_private_hooks: [{ hook_code: "PH_1", summary: "隐藏线索", ttl_turns: 5 }],
    })
  );
  assert.ok(parsed);
  assert.equal(parsed?.schema_version, "director_plan_v1");
  assert.equal(parsed?.world_events_to_schedule.length, 1);
  assert.equal(parsed?.world_events_to_schedule[0]?.salience, 1);
  assert.equal(parsed?.story_branch_seeds[0]?.confidence, 1);
  assert.equal(parsed?.player_private_hooks[0]?.must_not_surface_directly, true);
});

test("parseWorldEngineDeltaJson remains compatible with legacy five-array output", () => {
  const parsed = parseWorldEngineDeltaJson(
    JSON.stringify({
      npc_next_actions: [{ npc_code: "N-001", action: "巡逻", urgency: "medium", eta_turns: 2 }],
      world_events_to_schedule: [
        {
          event_code: "EV_OLD",
          title: "旧事件",
          due_in_turns: 1,
          priority: "medium",
          injection_hint: "门外出现短促脚步声。",
          agency_constraints: ["玩家可以不开门"],
          forbidden_outcomes: ["不得强制失败"],
          payload: {},
        },
      ],
      story_branch_seeds: [{ seed_code: "SB_1", summary: "出现分支", confidence: 0.8 }],
      consistency_warnings: [{ code: "CW_1", message: "时间线轻微冲突", severity: "low" }],
      player_private_hooks: [{ hook_code: "PH_1", summary: "隐藏线索", ttl_turns: 5 }],
    })
  );
  assert.ok(parsed);
  assert.equal(parsed?.world_events_to_schedule.length, 1);
  assert.equal(parsed?.npc_next_actions[0]?.npc_code, "N-001".replace(/[^A-Z0-9_-]/g, "_"));
});

test("validateDirectorPlan rejects high agency or spoiler plans for agenda", () => {
  const parsed = parseWorldEngineDeltaJson(
    JSON.stringify({
      schema_version: "director_plan_v1",
      risk_assessment: { agency_risk: "high", continuity_risk: "low", spoiler_risk: "high", safety_risk: "low" },
      world_events_to_schedule: [
        {
          event_code: "EV_FORCE_FAIL",
          title: "强制失败",
          due_in_turns: 1,
          ttl_turns: 2,
          priority: "high",
          salience: 0.9,
          injection_hint: "无论玩家怎么做，都让门后怪物抓住他。",
          agency_constraints: ["无"],
          forbidden_outcomes: ["不得泄露真相"],
          payload: {},
        },
      ],
    })
  );
  assert.ok(parsed);
  const validation = validateDirectorPlan(parsed!);
  assert.equal(parsed?.agenda_write_allowed, false);
  assert.equal(validation.accepted, false);
  assert.deepEqual(validation.acceptedEventCodes, []);
});

test("parseWorldEngineDeltaJson returns null on invalid root", () => {
  assert.equal(parseWorldEngineDeltaJson("not-json"), null);
  assert.equal(parseWorldEngineDeltaJson("[]"), null);
});
