import test from "node:test";
import assert from "node:assert/strict";
import { detectWorldEngineTriggers, parseWorldEngineDeltaJson } from "@/lib/worldEngine/contracts";

test("detectWorldEngineTriggers emits expected trigger categories", () => {
  const got = detectWorldEngineTriggers({
    turnIndex: 12,
    latestUserInput: "我继续调查幕后真相",
    playerLocation: "2F_Corridor",
    npcLocationUpdateCount: 2,
    dmRecord: {
      narrative: "ok",
      task_updates: [{ id: "t1", done: true }],
      npc_location_updates: [{ id: "N-001", to_location: "2F_Corridor" }],
    },
    preflightRiskTags: ["violence"],
  });
  assert.ok(got.includes("in_game_day_elapsed"));
  assert.ok(got.includes("multi_room_movement"));
  assert.ok(got.includes("key_story_node_hit"));
  assert.ok(got.includes("important_npc_state_changed"));
  assert.ok(got.includes("world_fact_threshold_reached"));
});

test("parseWorldEngineDeltaJson accepts strict structured json", () => {
  const parsed = parseWorldEngineDeltaJson(
    JSON.stringify({
      npc_next_actions: [{ npc_code: "N-001", action: "巡逻", urgency: "medium", eta_turns: 2 }],
      world_events_to_schedule: [
        { event_code: "EV_LOCKDOWN", title: "封锁升级", due_in_turns: 3, priority: "high", payload: { zone: "B2" } },
      ],
      story_branch_seeds: [{ seed_code: "SB_1", summary: "出现分支", confidence: 0.8 }],
      consistency_warnings: [{ code: "CW_1", message: "时间线轻微冲突", severity: "low" }],
      player_private_hooks: [{ hook_code: "PH_1", summary: "隐藏线索", ttl_turns: 5 }],
    })
  );
  assert.ok(parsed);
  assert.equal(parsed?.world_events_to_schedule.length, 1);
  assert.equal(parsed?.npc_next_actions[0]?.npc_code, "N-001");
});

test("parseWorldEngineDeltaJson returns null on invalid root", () => {
  assert.equal(parseWorldEngineDeltaJson("not-json"), null);
  assert.equal(parseWorldEngineDeltaJson("[]"), null);
});
