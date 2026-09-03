// src/lib/worldEngine/directorEnforcer.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceChapterPacingPlan,
  npcReferencedIn,
  findDeadNpcInPersistedAgendaItem,
} from "@/lib/worldEngine/directorEnforcer";
import type {
  ChapterPacingPlan,
  DirectorEnforcerGameState,
} from "@/lib/worldEngine/directorEnforcer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalPlan(overrides: Partial<ChapterPacingPlan> = {}): ChapterPacingPlan {
  return {
    schema_version: "director_plan_v1",
    director_intent: "测试意图",
    current_phase: "quiet",
    target_phase: "build_up",
    pacing_assessment: {
      tension: 0.5,
      mystery: 0.5,
      fatigue: 0.5,
      progress: 0.3,
      agency_health: 0.7,
      reveal_pressure: 0.3,
    },
    risk_assessment: {
      agency_risk: "low",
      continuity_risk: "low",
      spoiler_risk: "low",
      safety_risk: "low",
    },
    reveal_policy: "hint_only",
    npc_next_actions: [],
    world_events_to_schedule: [],
    story_branch_seeds: [],
    consistency_warnings: [],
    player_private_hooks: [],
    ...overrides,
  };
}

function makeGameState(
  overrides: Partial<DirectorEnforcerGameState> = {},
): DirectorEnforcerGameState {
  return {
    activeNpcIds: new Set(["NPC_GUARD", "NPC_MERCHANT", "NPC_PRIEST"]),
    currentPhase: "quiet",
    ...overrides,
  };
}

function makeAgendaItem(
  eventCode: string,
  title: string,
  injectionHint = "",
): import("@/lib/worldEngine/contracts").DirectorAgendaItem {
  return {
    event_code: eventCode,
    title,
    due_in_turns: 2,
    ttl_turns: 6,
    priority: "low",
    salience: 0.4,
    trigger_conditions: [],
    injection_hint: injectionHint,
    agency_constraints: [],
    forbidden_outcomes: [],
    payload: {},
  };
}

function makeNpcAction(npcCode: string, action = "调查周围"): import("@/lib/worldEngine/contracts").DirectorNpcAction {
  return {
    npc_code: npcCode,
    action,
    urgency: "low",
    eta_turns: 1,
  };
}

// ---------------------------------------------------------------------------
// Test 1: valid phase transitions pass
// ---------------------------------------------------------------------------

test("valid phase transition quiet→build_up passes", () => {
  const plan = makeMinimalPlan({ target_phase: "build_up" });
  const gameState = makeGameState({ currentPhase: "quiet" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.target_phase, "build_up");
});

test("valid phase transition pressure→release passes", () => {
  const plan = makeMinimalPlan({ target_phase: "release" });
  const gameState = makeGameState({ currentPhase: "pressure" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.target_phase, "release");
});

test("valid phase transition recovery→quiet passes", () => {
  const plan = makeMinimalPlan({ target_phase: "quiet" });
  const gameState = makeGameState({ currentPhase: "recovery" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
});

test("valid phase transition reveal→release passes", () => {
  const plan = makeMinimalPlan({ target_phase: "release" });
  const gameState = makeGameState({ currentPhase: "reveal" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
});

// ---------------------------------------------------------------------------
// Test 2: quiet→reveal jump rejected
// ---------------------------------------------------------------------------

test("quiet→reveal jump is rejected", () => {
  const plan = makeMinimalPlan({ target_phase: "reveal" });
  const gameState = makeGameState({ currentPhase: "quiet" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.ok(result.rejections.length >= 1);
  const phaseRejection = result.rejections.find((r) => r.kind === "phase_transition");
  assert.ok(phaseRejection, "Expected a phase_transition rejection");
  assert.match(phaseRejection!.reason, /quiet.*reveal/);
  // target_phase should be downgraded to currentPhase
  assert.equal(result.plan.target_phase, "quiet");
});

test("build_up→reveal jump is rejected", () => {
  const plan = makeMinimalPlan({ target_phase: "reveal" });
  const gameState = makeGameState({ currentPhase: "build_up" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.ok(result.rejections.some((r) => r.kind === "phase_transition"));
  assert.equal(result.plan.target_phase, "build_up");
});

test("release→reveal jump is rejected", () => {
  const plan = makeMinimalPlan({ target_phase: "reveal" });
  const gameState = makeGameState({ currentPhase: "release" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.ok(result.rejections.some((r) => r.kind === "phase_transition"));
  assert.equal(result.plan.target_phase, "release");
});

// ---------------------------------------------------------------------------
// Test 3: same-phase transition passes
// ---------------------------------------------------------------------------

test("same-phase quiet→quiet passes", () => {
  const plan = makeMinimalPlan({ target_phase: "quiet" });
  const gameState = makeGameState({ currentPhase: "quiet" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.target_phase, "quiet");
});

test("same-phase reveal→reveal passes", () => {
  const plan = makeMinimalPlan({ target_phase: "reveal" });
  const gameState = makeGameState({ currentPhase: "reveal" });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.target_phase, "reveal");
});

test("all same-phase transitions pass", () => {
  const phases = ["quiet", "build_up", "pressure", "release", "reveal", "recovery"] as const;
  for (const phase of phases) {
    const plan = makeMinimalPlan({ target_phase: phase });
    const gameState = makeGameState({ currentPhase: phase });
    const result = enforceChapterPacingPlan(plan, gameState);
    assert.equal(result.passedAll, true, `same-phase ${phase}→${phase} should pass`);
  }
});

// ---------------------------------------------------------------------------
// Test 4: dead/inactive NPC references filtered from agenda items
// ---------------------------------------------------------------------------

test("dead NPC reference in title is filtered", () => {
  const plan = makeMinimalPlan({
    world_events_to_schedule: [
      makeAgendaItem("EV_ATTACK", "NPC_VILLAIN attacks the village"),
    ],
  });
  const gameState = makeGameState({
    deadOrInactiveNpcIds: ["NPC_VILLAIN"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].kind, "agenda_item");
  assert.match(result.rejections[0].reason, /NPC_VILLAIN/);
  assert.equal(result.plan.world_events_to_schedule.length, 0);
});

test("dead NPC reference in injection_hint is filtered", () => {
  const plan = makeMinimalPlan({
    world_events_to_schedule: [
      makeAgendaItem("EV_RUMOR", "Strange noise", "NPC_SPY seen near the gate"),
    ],
  });
  const gameState = makeGameState({
    deadOrInactiveNpcIds: ["NPC_SPY"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].kind, "agenda_item");
  assert.match(result.rejections[0].reason, /NPC_SPY/);
  assert.equal(result.plan.world_events_to_schedule.length, 0);
});

test("dead NPC reference in payload is filtered", () => {
  const plan = makeMinimalPlan({
    world_events_to_schedule: [
      makeAgendaItem("EV_ITEM", "Item found", "A clue appears", {
        event_code: "EV_ITEM",
        title: "Item found",
        due_in_turns: 2,
        ttl_turns: 6,
        priority: "low",
        salience: 0.4,
        trigger_conditions: [],
        injection_hint: "A clue appears",
        agency_constraints: [],
        forbidden_outcomes: [],
        ...({ payload: { source: "NPC_TRAITOR" } } as any),
      } as any),
    ],
  });
  // Override the payload on the first item
  plan.world_events_to_schedule[0].payload = { source: "NPC_TRAITOR" };

  const gameState = makeGameState({
    deadOrInactiveNpcIds: ["NPC_TRAITOR"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].kind, "agenda_item");
  assert.match(result.rejections[0].reason, /NPC_TRAITOR/);
  assert.equal(result.plan.world_events_to_schedule.length, 0);
});

test("clean agenda items pass through when no dead NPCs match", () => {
  const plan = makeMinimalPlan({
    world_events_to_schedule: [
      makeAgendaItem("EV_SAFE", "Safe event"),
      makeAgendaItem("EV_SAFE2", "Another safe event"),
    ],
  });
  const gameState = makeGameState({
    deadOrInactiveNpcIds: ["NPC_VILLAIN", "NPC_SPY"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.world_events_to_schedule.length, 2);
});

test("no dead NPC set — all agenda items kept", () => {
  const plan = makeMinimalPlan({
    world_events_to_schedule: [
      makeAgendaItem("EV_A", "Talks about NPC_GUARD"),
      makeAgendaItem("EV_B", "NPC_MERCHANT closes shop"),
    ],
  });
  const gameState = makeGameState({
    deadOrInactiveNpcIds: undefined,
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.plan.world_events_to_schedule.length, 2);
});

// ---------------------------------------------------------------------------
// Test 5: missing NPCs from npc_next_actions removed
// ---------------------------------------------------------------------------

test("NPC action with unknown NPC is removed", () => {
  const plan = makeMinimalPlan({
    npc_next_actions: [
      makeNpcAction("NPC_UNKNOWN", "做一些事"),
    ],
  });
  const gameState = makeGameState({
    activeNpcIds: ["NPC_GUARD", "NPC_MERCHANT"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].kind, "npc_action");
  assert.equal(result.rejections[0].itemCode, "NPC_UNKNOWN");
  assert.equal(result.plan.npc_next_actions.length, 0);
});

test("mix of valid and invalid NPC actions — invalid removed, valid kept", () => {
  const plan = makeMinimalPlan({
    npc_next_actions: [
      makeNpcAction("NPC_GUARD", "巡逻"),
      makeNpcAction("NPC_GHOST", "飘过"),
      makeNpcAction("NPC_MERCHANT", "摆摊"),
    ],
  });
  const gameState = makeGameState({
    activeNpcIds: ["NPC_GUARD", "NPC_MERCHANT", "NPC_PRIEST"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, false);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0].itemCode, "NPC_GHOST");
  assert.equal(result.plan.npc_next_actions.length, 2);
  assert.equal(result.plan.npc_next_actions[0].npc_code, "NPC_GUARD");
  assert.equal(result.plan.npc_next_actions[1].npc_code, "NPC_MERCHANT");
});

test("all NPC actions valid — none removed", () => {
  const plan = makeMinimalPlan({
    npc_next_actions: [
      makeNpcAction("NPC_GUARD"),
      makeNpcAction("NPC_MERCHANT"),
    ],
  });
  const gameState = makeGameState({
    activeNpcIds: ["NPC_GUARD", "NPC_MERCHANT", "NPC_PRIEST"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.npc_next_actions.length, 2);
});

test("empty activeNpcIds — fail-open: all NPC actions kept", () => {
  const plan = makeMinimalPlan({
    npc_next_actions: [
      makeNpcAction("NPC_ANY"),
    ],
  });
  const gameState = makeGameState({
    activeNpcIds: [],
  });
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  assert.equal(result.plan.npc_next_actions.length, 1);
});

// ---------------------------------------------------------------------------
// Test 6: pacing inconsistency warnings
// ---------------------------------------------------------------------------

test("high tension + low fatigue without director acknowledgment → warning", () => {
  const plan = makeMinimalPlan({
    director_intent: "Keep the story moving.",
    pacing_assessment: {
      tension: 0.9,
      mystery: 0.5,
      fatigue: 0.1,
      progress: 0.3,
      agency_health: 0.7,
      reveal_pressure: 0.3,
    },
  });
  const gameState = makeGameState();
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.ok(result.pacingWarnings.length >= 1);
  assert.match(result.pacingWarnings[0], /tension=0\.90.*fatigue=0\.10/);
  // pacing warnings alone should not cause passedAll=false
  // (other checks may pass or fail, but the warning itself doesn't block)
});

test("high tension + low fatigue with acknowledgment → no warning", () => {
  const plan = makeMinimalPlan({
    director_intent: "当前紧张度很高但玩家似乎并不疲劳，检查紧张度。",
    pacing_assessment: {
      tension: 0.9,
      mystery: 0.5,
      fatigue: 0.1,
      progress: 0.3,
      agency_health: 0.7,
      reveal_pressure: 0.3,
    },
  });
  const gameState = makeGameState();
  const result = enforceChapterPacingPlan(plan, gameState);
  const mismatchWarning = result.pacingWarnings.find((w) => w.includes("high tension usually implies elevated fatigue"));
  assert.equal(mismatchWarning, undefined, "Should not warn when director_intent acknowledges tension");
});

test("high fatigue + high tension → burnout risk warning", () => {
  const plan = makeMinimalPlan({
    pacing_assessment: {
      tension: 0.85,
      mystery: 0.5,
      fatigue: 0.8,
      progress: 0.3,
      agency_health: 0.7,
      reveal_pressure: 0.3,
    },
  });
  const gameState = makeGameState();
  const result = enforceChapterPacingPlan(plan, gameState);
  const burnout = result.pacingWarnings.find((w) => w.includes("burnout"));
  assert.ok(burnout, "Expected burnout risk warning");
  assert.match(burnout!, /fatigue=0\.80.*tension=0\.85/);
});

test("very high mystery + very low tension/fatigue → pacing oddity warning", () => {
  const plan = makeMinimalPlan({
    pacing_assessment: {
      tension: 0.1,
      mystery: 0.95,
      fatigue: 0.15,
      progress: 0.3,
      agency_health: 0.7,
      reveal_pressure: 0.3,
    },
  });
  const gameState = makeGameState();
  const result = enforceChapterPacingPlan(plan, gameState);
  const oddity = result.pacingWarnings.find((w) => w.includes("oddity") || w.includes("stalled"));
  assert.ok(oddity, "Expected pacing oddity warning");
});

test("balanced pacing produces no warnings", () => {
  const plan = makeMinimalPlan({
    pacing_assessment: {
      tension: 0.5,
      mystery: 0.5,
      fatigue: 0.5,
      progress: 0.5,
      agency_health: 0.7,
      reveal_pressure: 0.3,
    },
  });
  const gameState = makeGameState();
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.pacingWarnings.length, 0);
});

// ---------------------------------------------------------------------------
// Test 7: empty gameState falls through gracefully
// ---------------------------------------------------------------------------

test("empty activeNpcIds (empty array) does not crash", () => {
  const plan = makeMinimalPlan({
    npc_next_actions: [
      makeNpcAction("NPC_X"),
    ],
  });
  const gameState: DirectorEnforcerGameState = {
    activeNpcIds: [],
  };
  const result = enforceChapterPacingPlan(plan, gameState);
  assert.equal(result.passedAll, true);
  // fail-open: no active data means actions are kept
  assert.equal(result.plan.npc_next_actions.length, 1);
});

test("no currentPhase does not crash", () => {
  const plan = makeMinimalPlan({ target_phase: "reveal" });
  const gameState: DirectorEnforcerGameState = {
    activeNpcIds: ["NPC_GUARD"],
    // currentPhase omitted
  };
  const result = enforceChapterPacingPlan(plan, gameState);
  // Without currentPhase, no phase validation occurs — plan passes
  assert.equal(result.passedAll, true);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.plan.target_phase, "reveal");
});

test("completely minimal gameState — empty arrays, no phase", () => {
  const plan = makeMinimalPlan({
    world_events_to_schedule: [
      makeAgendaItem("EV_A", "Some event"),
    ],
    npc_next_actions: [
      makeNpcAction("NPC_X"),
    ],
  });
  const gameState: DirectorEnforcerGameState = {
    activeNpcIds: [],
  };
  const result = enforceChapterPacingPlan(plan, gameState);
  // No dead/inactive NPCs set → no agenda filtering
  // No active NPCs → fail-open on npc actions
  // No currentPhase → no phase check
  assert.equal(result.passedAll, true);
  assert.equal(result.plan.world_events_to_schedule.length, 1);
  assert.equal(result.plan.npc_next_actions.length, 1);
});

// ---------------------------------------------------------------------------
// Test 8: full valid plan passes all checks
// ---------------------------------------------------------------------------

test("full valid plan passes all checks", () => {
  const plan = makeMinimalPlan({
    director_intent: "本章进入上升期，逐步增加紧张感。",
    current_phase: "quiet",
    target_phase: "pressure",
    pacing_assessment: {
      tension: 0.45,
      mystery: 0.55,
      fatigue: 0.3,
      progress: 0.4,
      agency_health: 0.75,
      reveal_pressure: 0.35,
    },
    world_events_to_schedule: [
      makeAgendaItem("EV_GUARD_TALK", "NPC_GUARD 报告发现异常", "守卫在巡逻时注意到了不寻常的痕迹"),
      makeAgendaItem("EV_MERCHANT_HINT", "NPC_MERCHANT 提供线索", "商人回忆起有人询问过类似物品"),
    ],
    npc_next_actions: [
      makeNpcAction("NPC_GUARD", "加强夜间巡逻"),
      makeNpcAction("NPC_MERCHANT", "整理旧账本查找线索"),
      makeNpcAction("NPC_PRIEST", "为村民祈福"),
    ],
  });
  const gameState = makeGameState({
    activeNpcIds: ["NPC_GUARD", "NPC_MERCHANT", "NPC_PRIEST"],
    deadOrInactiveNpcIds: ["NPC_VILLAIN", "NPC_SPY"],
    currentPhase: "quiet",
  });
  const result = enforceChapterPacingPlan(plan, gameState);

  // Should pass all hard checks
  assert.equal(result.passedAll, true, JSON.stringify(result.rejections));
  assert.equal(result.rejections.length, 0);

  // Phase transition should be valid
  assert.equal(result.plan.target_phase, "pressure");

  // No agenda items should have been removed
  assert.equal(result.plan.world_events_to_schedule.length, 2);

  // No NPC actions should have been removed
  assert.equal(result.plan.npc_next_actions.length, 3);

  // No pacing warnings expected (balanced values)
  assert.equal(result.pacingWarnings.length, 0);

  // Plan should be a different reference (shallow copy)
  assert.notEqual(result.plan, plan);
  assert.notEqual(result.plan.world_events_to_schedule, plan.world_events_to_schedule);
  assert.notEqual(result.plan.npc_next_actions, plan.npc_next_actions);
});

// ---------------------------------------------------------------------------
// Edge: multiple rejections combined
// ---------------------------------------------------------------------------

test("multiple rejections across phase, agenda, and NPC actions", () => {
  const plan = makeMinimalPlan({
    target_phase: "reveal", // invalid from quiet
    world_events_to_schedule: [
      makeAgendaItem("EV_BAD", "NPC_VILLAIN strikes", "NPC_SPY helps"),
    ],
    npc_next_actions: [
      makeNpcAction("NPC_GHOST", "出没"),
    ],
  });
  const gameState = makeGameState({
    currentPhase: "quiet",
    deadOrInactiveNpcIds: ["NPC_VILLAIN", "NPC_SPY"],
    activeNpcIds: ["NPC_GUARD"],
  });
  const result = enforceChapterPacingPlan(plan, gameState);

  assert.equal(result.passedAll, false);
  assert.ok(result.rejections.length >= 3, `Expected at least 3 rejections, got ${result.rejections.length}`);

  const kinds = result.rejections.map((r) => r.kind).sort();
  assert.ok(kinds.includes("phase_transition"));
  assert.ok(kinds.includes("agenda_item"));
  assert.ok(kinds.includes("npc_action"));

  // Phase should be downgraded
  assert.equal(result.plan.target_phase, "quiet");

  // Agenda and NPC actions should be cleared
  assert.equal(result.plan.world_events_to_schedule.length, 0);
  assert.equal(result.plan.npc_next_actions.length, 0);
});

// ---------------------------------------------------------------------------
// Unit: npcReferencedIn helper
// ---------------------------------------------------------------------------

test("npcReferencedIn finds NPC ID in text", () => {
  const npcIds = new Set(["NPC_GUARD"]);
  assert.equal(npcReferencedIn("NPC_GUARD approaches", npcIds), "NPC_GUARD");
  assert.equal(npcReferencedIn("No one here", npcIds), null);
  assert.equal(npcReferencedIn("", npcIds), null);
});

test("npcReferencedIn with empty text returns null", () => {
  const npcIds = new Set(["NPC_X"]);
  assert.equal(npcReferencedIn("", npcIds), null);
});

// ---------------------------------------------------------------------------
// Unit: findDeadNpcInPersistedAgendaItem helper
// ---------------------------------------------------------------------------

test("findDeadNpcInPersistedAgendaItem finds NPC in title", () => {
  const deadIds = new Set(["NPC_VILLAIN"]);
  const hit = findDeadNpcInPersistedAgendaItem(
    { title: "NPC_VILLAIN plot", injectionHint: "something", payload: {} },
    deadIds,
  );
  assert.equal(hit, "NPC_VILLAIN");
});

test("findDeadNpcInPersistedAgendaItem finds NPC in injectionHint", () => {
  const deadIds = new Set(["NPC_SPY"]);
  const hit = findDeadNpcInPersistedAgendaItem(
    { title: "Safe title", injectionHint: "NPC_SPY spotted", payload: {} },
    deadIds,
  );
  assert.equal(hit, "NPC_SPY");
});

test("findDeadNpcInPersistedAgendaItem finds NPC in payload", () => {
  const deadIds = new Set(["NPC_TRAITOR"]);
  const hit = findDeadNpcInPersistedAgendaItem(
    { title: "Safe", injectionHint: "Safe", payload: { source: "NPC_TRAITOR" } },
    deadIds,
  );
  assert.equal(hit, "NPC_TRAITOR");
});

test("findDeadNpcInPersistedAgendaItem returns null for clean items", () => {
  const deadIds = new Set(["NPC_VILLAIN"]);
  const hit = findDeadNpcInPersistedAgendaItem(
    { title: "Normal event", injectionHint: "Nothing suspicious", payload: { type: "ambient" } },
    deadIds,
  );
  assert.equal(hit, null);
});
