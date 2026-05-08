import test from "node:test";
import assert from "node:assert/strict";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { applyPlayerEchoPostGenerationValidation } from "@/lib/playerEcho/validator";
import type { NpcFirstEncounterEchoPlan } from "@/lib/playerEcho/types";

function firstEncounterPlan(overrides: Partial<NpcFirstEncounterEchoPlan> = {}): NpcFirstEncounterEchoPlan {
  return {
    schema: "npc_first_encounter_echo_plan_v1",
    activeNpcId: "N-010",
    npcId: "N-010",
    memoryPrivilege: "xinlan",
    intensity: "strong",
    strength: "strong",
    allowedForms: ["pause", "registration_hesitation", "sensory_deja_vu"],
    forbiddenClaims: [
      "explicit_previous_run_memory",
      "loop_truth_full_reveal",
      "exact_death_recall",
      "canon_override",
    ],
    allowExplicitLoopMemory: false,
    revealTier: REVEAL_TIER_RANK.deep,
    safetyLevelCap: 3,
    styleHint: "登记停顿/名单牵引但不说破",
    reason: null,
    ...overrides,
  };
}

test("normal NPC explicit old-friend memory is rewritten", () => {
  const canonical = getNpcCanonicalIdentity("N-001");
  const result = applyPlayerEchoPostGenerationValidation({
    narrative: "陈婆婆说：“你又来了，我记得你上次死在七楼。”",
    actorNpcId: "N-001",
    canonical,
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerEchoPacketPresent: true,
    firstEncounterPlan: null,
  });

  assert.equal(result.telemetry.validatorTriggered, true);
  assert.equal(result.telemetry.rewriteTriggered, true);
  assert.equal(result.telemetry.violationTypes.includes("player_echo_normal_npc_overreach"), true);
  assert.equal(result.narrative.includes("你又来了"), false);
  assert.equal(result.narrative.includes("我记得你上次"), false);
  assert.equal(result.narrative.includes("高处风硬"), true);
});

test("xinlan strong pull without explicit loop memory is allowed", () => {
  const narrative = "欣蓝在登记簿前停顿了一下，像知道什么，却只说：“先登记，别乱走。”";
  const result = applyPlayerEchoPostGenerationValidation({
    narrative,
    actorNpcId: "N-010",
    canonical: getNpcCanonicalIdentity("N-010"),
    maxRevealRank: REVEAL_TIER_RANK.deep,
    playerEchoPacketPresent: true,
    firstEncounterPlan: firstEncounterPlan(),
  });

  assert.equal(result.telemetry.validatorTriggered, false);
  assert.equal(result.narrative, narrative);
});

test("xinlan full loop memory is rewritten", () => {
  const result = applyPlayerEchoPostGenerationValidation({
    narrative: "欣蓝说：“我完整记得每一轮，循环真相就是七锚闭环。”",
    actorNpcId: "N-010",
    canonical: getNpcCanonicalIdentity("N-010"),
    maxRevealRank: REVEAL_TIER_RANK.deep,
    playerEchoPacketPresent: true,
    firstEncounterPlan: firstEncounterPlan(),
  });

  assert.equal(result.telemetry.validatorTriggered, true);
  assert.equal(result.telemetry.violationTypes.includes("player_echo_reveal_overreach"), true);
  assert.equal(result.narrative.includes("完整记得每一轮"), false);
  assert.equal(result.narrative.includes("七锚闭环"), false);
  assert.equal(result.narrative.includes("登记簿"), true);
});

test("night reader page metaphor is allowed", () => {
  const narrative = "夜读老人看着书页，像看见页边重复出现的墨迹，只把书脊轻轻按住。";
  const result = applyPlayerEchoPostGenerationValidation({
    narrative,
    actorNpcId: "N-011",
    canonical: getNpcCanonicalIdentity("N-011"),
    maxRevealRank: REVEAL_TIER_RANK.deep,
    playerEchoPacketPresent: true,
    firstEncounterPlan: firstEncounterPlan({
      activeNpcId: "N-011",
      npcId: "N-011",
      memoryPrivilege: "night_reader",
      intensity: "noticeable",
      strength: "noticeable",
      allowedForms: ["pause", "metaphor", "sensory_deja_vu"],
      styleHint: "书页/墨迹/重读隐喻",
    }),
  });

  assert.equal(result.telemetry.validatorTriggered, false);
  assert.equal(result.narrative, narrative);
});

test("loop truth at low reveal tier is rewritten", () => {
  const result = applyPlayerEchoPostGenerationValidation({
    narrative: "他说，循环真相已经写在B2 真相里，校源根因就是答案。",
    actorNpcId: "N-020",
    canonical: getNpcCanonicalIdentity("N-020"),
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerEchoPacketPresent: true,
    firstEncounterPlan: null,
  });

  assert.equal(result.telemetry.validatorTriggered, true);
  assert.equal(result.telemetry.violationTypes.includes("player_echo_reveal_overreach"), true);
  assert.equal(result.narrative.includes("循环真相"), false);
  assert.equal(result.narrative.includes("校源根因"), false);
});

test("without player echo packet, obvious old-friend line is still blocked as generic", () => {
  const result = applyPlayerEchoPostGenerationValidation({
    narrative: "陈婆婆说：“我记得你，你又来了。”",
    actorNpcId: "N-001",
    canonical: getNpcCanonicalIdentity("N-001"),
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerEchoPacketPresent: false,
    firstEncounterPlan: null,
  });

  assert.equal(result.telemetry.validatorTriggered, true);
  assert.equal(result.telemetry.source, "generic");
  assert.equal(result.telemetry.violationTypes.includes("player_echo_normal_npc_overreach"), true);
});
