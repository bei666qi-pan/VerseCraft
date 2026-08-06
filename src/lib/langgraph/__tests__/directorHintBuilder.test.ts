// src/lib/langgraph/__tests__/directorHintBuilder.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDirectorHintBlock, buildDegradedDirectorHint } from "../directorHintBuilder";
import type { WorldEngineStructuredDelta } from "@/lib/worldEngine/contracts";
import type { WorldDirectorState } from "@/lib/worldEngine/directorState";

function makeStructuredDelta(overrides: Partial<WorldEngineStructuredDelta> = {}): WorldEngineStructuredDelta {
  return {
    schema_version: "director_plan_v1",
    director_intent: "引导玩家前往旧图书馆调查失踪线索",
    current_phase: "build_up",
    target_phase: "pressure",
    pacing_assessment: {
      tension: 0.7,
      mystery: 0.8,
      fatigue: 0.3,
      progress: 0.25,
      agency_health: 0.65,
      reveal_pressure: 0.6,
    },
    risk_assessment: {
      agency_risk: "low",
      continuity_risk: "low",
      spoiler_risk: "medium",
      safety_risk: "low",
    },
    reveal_policy: "hint_only",
    npc_next_actions: [
      {
        npc_code: "librarian",
        action: "在图书馆整理残破古籍，等待主角到来",
        urgency: "high",
        eta_turns: 1,
      },
    ],
    world_events_to_schedule: [
      {
        event_code: "EVT_001",
        title: "图书馆线索出现",
        due_in_turns: 1,
        ttl_turns: 3,
        priority: "high",
        salience: 0.9,
        trigger_conditions: ["player enters library"],
        injection_hint: "图书馆管理员注意到一本被撕掉关键页的古籍",
        agency_constraints: ["player may choose to ignore the hint"],
        forbidden_outcomes: ["do not reveal the murderer's identity yet"],
        payload: {},
      },
    ],
    social_events_to_schedule: [],
    npc_relation_deltas: [],
    npc_agent_patches: [],
    story_branch_seeds: [],
    consistency_warnings: [],
    player_private_hooks: [],
    agenda_write_allowed: true,
    agenda_reject_reasons: [],
    social_write_allowed: false,
    social_reject_reasons: [],
    ...overrides,
  } as WorldEngineStructuredDelta;
}

function makeDirectorState(overrides: Partial<WorldDirectorState> = {}): WorldDirectorState {
  return {
    sessionId: "session_1",
    userId: "user_1",
    turnIndex: 5,
    phase: "build_up",
    pacing: {
      tension: 0.7,
      mystery: 0.8,
      fatigue: 0.3,
      progress: 0.25,
      agency_health: 0.65,
      reveal_pressure: 0.6,
    },
    recentDirectorIntent: "investigate library",
    worldRevision: "1",
    ...overrides,
  };
}

describe("buildDirectorHintBlock", () => {
  it("returns empty string when hasPlan is false", () => {
    const result = buildDirectorHintBlock({
      hasPlan: false,
      planConfidence: "none",
      structuredDelta: null,
      directorState: null,
    });
    assert.strictEqual(result, "");
  });

  it("returns empty string when structuredDelta is null", () => {
    const result = buildDirectorHintBlock({
      hasPlan: true,
      planConfidence: "normal",
      structuredDelta: null,
      directorState: makeDirectorState(),
    });
    assert.strictEqual(result, "");
  });

  it("builds a hint block with direction, phase, and pacing", () => {
    const result = buildDirectorHintBlock({
      hasPlan: true,
      planConfidence: "normal",
      structuredDelta: makeStructuredDelta(),
      directorState: makeDirectorState(),
    });

    assert.ok(result.includes("## 导演方向指引"));
    assert.ok(result.includes("当前剧情阶段: build_up"));
    assert.ok(result.includes('引导玩家前往旧图书馆调查失踪线索'));
    assert.ok(result.includes("当前游戏状态和人物性格自行创作"));
  });

  it("includes high priority NPC actions", () => {
    const result = buildDirectorHintBlock({
      hasPlan: true,
      planConfidence: "normal",
      structuredDelta: makeStructuredDelta(),
      directorState: makeDirectorState(),
    });

    assert.ok(result.includes("librarian"));
  });

  it("includes forbidden outcomes", () => {
    const result = buildDirectorHintBlock({
      hasPlan: true,
      planConfidence: "normal",
      structuredDelta: makeStructuredDelta(),
      directorState: makeDirectorState(),
    });

    assert.ok(result.includes("do not reveal the murderer's identity yet"));
  });

  it("does NOT contain narrative snippets or dialogue", () => {
    const result = buildDirectorHintBlock({
      hasPlan: true,
      planConfidence: "normal",
      structuredDelta: makeStructuredDelta(),
      directorState: makeDirectorState(),
    });

    assert.ok(!result.includes("said"));
    assert.ok(!result.includes("looked"));
    assert.ok(!result.includes("walked"));
  });

  it("includes autonomy reminder", () => {
    const result = buildDirectorHintBlock({
      hasPlan: true,
      planConfidence: "normal",
      structuredDelta: makeStructuredDelta(),
      directorState: makeDirectorState(),
    });

    assert.ok(result.includes("自行创作"));
    assert.ok(result.includes("不要逐字复制"));
  });
});

describe("buildDegradedDirectorHint", () => {
  it("returns empty string for null delta", () => {
    assert.strictEqual(buildDegradedDirectorHint(null), "");
  });

  it("returns simplified hint with phase and direction only", () => {
    const result = buildDegradedDirectorHint(makeStructuredDelta());

    assert.ok(result.includes("导演方向指引（简化）"));
    assert.ok(result.includes("当前阶段: build_up"));
    assert.ok(result.includes('引导玩家前往旧图书馆调查失踪线索'));
    assert.ok(result.includes("置信度较低"));
    // Should NOT include detailed event info in degraded mode
    assert.ok(!result.includes("关键事件"));
    assert.ok(!result.includes("NPC 关键行动"));
  });
});
