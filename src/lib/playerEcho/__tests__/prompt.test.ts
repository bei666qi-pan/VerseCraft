import test from "node:test";
import assert from "node:assert/strict";
import { PLAYER_ECHO_HARD_CAP_CHARS } from "@/lib/playerEcho/constants";
import { buildPlayerEchoPromptBlock } from "@/lib/playerEcho/prompt";
import type { NpcFirstEncounterEchoPlan, SelectedEchoFragment } from "@/lib/playerEcho/types";

function selected(overrides: Partial<SelectedEchoFragment>): SelectedEchoFragment {
  return {
    id: "s",
    type: "promise",
    targetType: "npc",
    targetId: "N-010",
    npcId: "N-010",
    summary: "登记口前的未完承诺只能写成一瞬牵引",
    safetyLevel: 2,
    score: 1,
    ...overrides,
  };
}

function plan(overrides: Partial<NpcFirstEncounterEchoPlan>): NpcFirstEncounterEchoPlan {
  return {
    schema: "npc_first_encounter_echo_plan_v1",
    activeNpcId: "N-010",
    npcId: "N-010",
    memoryPrivilege: "xinlan",
    intensity: "strong",
    strength: "strong",
    allowedForms: ["pause", "gesture", "registration_hesitation", "sensory_deja_vu"],
    forbiddenClaims: [
      "explicit_previous_run_memory",
      "loop_truth_full_reveal",
      "exact_death_recall",
      "canon_override",
    ],
    allowExplicitLoopMemory: false,
    revealTier: 2,
    safetyLevelCap: 3,
    styleHint: "登记停顿/名单牵引但不说破",
    reason: null,
    ...overrides,
  };
}

test("playerEcho prompt returns empty when there is no selection or active plan", () => {
  assert.equal(buildPlayerEchoPromptBlock([], null), "");
});

test("playerEcho prompt can emit first encounter plan without fragments", () => {
  const block = buildPlayerEchoPromptBlock([], plan({}));

  assert.equal(block.includes("首见：N-010 intensity=strong"), true);
  assert.equal(block.includes("登记停顿/名单牵引但不说破"), true);
});

test("playerEcho prompt is compact and keeps required constraints", () => {
  const block = buildPlayerEchoPromptBlock(
    [
      selected({ id: "a", summary: "长".repeat(120) }),
      selected({ id: "b", targetId: "N-015", npcId: "N-015", summary: "麟泽处只允许动作迟疑，不允许旧友默认" }),
      selected({ id: "c", targetType: "floor", targetId: "7F", npcId: null, summary: "七楼边缘可出现冷感残响" }),
    ],
    plan({}),
    { maxChars: PLAYER_ECHO_HARD_CAP_CHARS }
  );

  assert.equal(block.length <= PLAYER_ECHO_HARD_CAP_CHARS, true);
  assert.equal(block.includes("不得覆盖当前周目事实"), true);
  assert.equal(block.includes("不得让普通 NPC 明确认得玩家"), true);
  assert.equal(block.includes("```"), false);
  assert.equal(block.includes("UI"), false);
});

test("playerEcho normal NPC packet forbids explicit memory", () => {
  const block = buildPlayerEchoPromptBlock(
    [selected({ targetId: "N-020", npcId: "N-020", summary: "只允许陌生中的轻微违和" })],
    plan({
      activeNpcId: "N-020",
      npcId: "N-020",
      memoryPrivilege: "normal",
      intensity: "subtle",
      strength: "subtle",
      allowedForms: ["pause", "gesture"],
      forbiddenClaims: ["explicit_previous_run_memory", "old_friend_default", "known_friend_claim"],
      allowExplicitLoopMemory: false,
      styleHint: "仍当作误闯学生",
    }),
    { maxChars: PLAYER_ECHO_HARD_CAP_CHARS }
  );

  assert.equal(block.includes("explicit_previous_run_memory"), true);
  assert.equal(block.includes("forms=explicit_previous_run_memory"), false);
  assert.equal(block.includes("不得让普通 NPC 明确认得玩家"), true);
});
