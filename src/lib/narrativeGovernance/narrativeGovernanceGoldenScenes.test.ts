import test from "node:test";
import assert from "node:assert/strict";
import { getVerseCraftStyleProfile } from "@/lib/narrativeStyle/styleBible";
import { validateNarrativeStyle } from "@/lib/narrativeStyle/styleValidator";
import { buildNpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import { validateNpcKnowledgeInNarrative } from "@/lib/npcKnowledge/npcKnowledgeValidator";
import { NPC_KNOWLEDGE_FACT_IDS } from "@/lib/npcKnowledge/npcBeliefGraph";
import { detectUnsupportedFacts } from "@/lib/worldFacts/unsupportedFactDetector";
import { gateFactCommit } from "@/lib/worldFacts/factCommitGate";
import { validateNarrative } from "@/lib/turnEngine/validateNarrative";
import { emptyStateDelta } from "@/lib/turnEngine/computeStateDelta";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import { buildDynamicPlayerDmSystemSuffix } from "@/lib/playRealtime/playerChatSystemPrompt";

const styleProfile = getVerseCraftStyleProfile();

function b1NpcPacket(maxRevealRank = REVEAL_TIER_RANK.surface) {
  return buildNpcKnowledgePacket({
    speakerNpcId: "N-001",
    presentNpcIds: ["N-001"],
    location: "B1_SafeZone",
    floorId: "B1",
    maxRevealRank,
    playerKnownFactIds: [],
    scenePublicFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    activeTaskIds: [],
  });
}

test("golden 01: style rejects system broadcast register", () => {
  const report = validateNarrativeStyle({
    narrative: "系统提示：本回合判定成功，你获得了钥匙。",
    styleProfile,
    focus: "governance_golden",
  });
  assert.ok(report.issues.some((issue) => issue.code === "mechanical_exposition"));
});

test("golden 02: style rejects power-fantasy register drift", () => {
  const report = validateNarrativeStyle({
    narrative: "王者归来，全场震惊。我轻松解决了一切，像无敌一样走过门口。",
    styleProfile,
    focus: "governance_golden",
  });
  assert.ok(report.issues.some((issue) => issue.code === "style_drift"));
});

test("golden 03: investigation rhythm accepts mixed short and medium sentences", () => {
  const report = validateNarrativeStyle({
    narrative: "灯灭了。我停在原地，听见楼上传来一声很轻的笑。门牌慢慢发冷。有人在背后念出了我的名字。",
    styleProfile,
    focus: "investigation",
  });
  assert.equal(report.issues.some((issue) => issue.code === "sentence_rhythm_flat"), false);
});

test("golden 04: dialogue should not explain the world truth in one speech", () => {
  const report = validateNarrativeStyle({
    narrative:
      "她说：“这座公寓的真相就是循环，根因来自校源机制，所以所有人都必须遵守规则，否则答案会被重置。”墙灯轻轻一晃。",
    styleProfile,
    focus: "dialogue",
  });
  assert.ok(report.issues.some((issue) => issue.code === "dialogue_over_explains"));
});

test("golden 05: narrative_only ending keeps a hook", () => {
  const report = validateNarrativeStyle({
    narrative: "我把门关好，确认走廊里没有任何问题。事情到此为止。",
    styleProfile,
    focus: "governance_golden",
    turnMode: "narrative_only",
  });
  assert.ok(report.issues.some((issue) => issue.code === "hook_missing"));
});

test("golden 06: same-floor NPC may hint same-floor anomaly", () => {
  const packet = b1NpcPacket();
  assert.ok(packet.can_know_fact_ids.includes(NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY));
  const report = validateNpcKnowledgeInNarrative({
    narrative: "N-001贴着B1走廊的墙，低声说灯闪过三次，别追着声音走。",
    speakerNpcId: "N-001",
    npcKnowledgePacket: packet,
    presentNpcIds: ["N-001"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.equal(report.ok, true);
});

test("golden 07: different-floor NPC does not know other-floor events by default", () => {
  const report = validateNpcKnowledgeInNarrative({
    narrative: "N-001说，7F的门后已经出事了，不用再看。",
    speakerNpcId: "N-001",
    npcKnowledgePacket: b1NpcPacket(),
    presentNpcIds: ["N-001"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.ok(report.issues.some((issue) => issue.code === "floor_knowledge_overreach"));
});

test("golden 08: ordinary NPC does not know apartment root cause", () => {
  const report = validateNpcKnowledgeInNarrative({
    narrative: "N-001压低声音：公寓的根因就是七锚闭环的真相。",
    speakerNpcId: "N-001",
    npcKnowledgePacket: b1NpcPacket(),
    presentNpcIds: ["N-001"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.ok(report.issues.some((issue) => issue.code === "root_cause_leak"));
});

test("golden 09: core NPC may only hint a cause fragment", () => {
  const packet = buildNpcKnowledgePacket({
    speakerNpcId: "N-010",
    presentNpcIds: ["N-010"],
    location: "B1_SafeZone",
    floorId: "B1",
    maxRevealRank: REVEAL_TIER_RANK.deep,
    playerKnownFactIds: [],
    scenePublicFactIds: [],
    activeTaskIds: [],
  });
  assert.ok(packet.can_hint_fact_ids.includes(NPC_KNOWLEDGE_FACT_IDS.APARTMENT_CAUSE_FRAGMENT));
  assert.equal(packet.expression_policy.root_truth_direct_allowed, false);
});

test("golden 10: NPC cannot fabricate a relation with another NPC", () => {
  const report = validateNpcKnowledgeInNarrative({
    narrative: "N-001说，N-099早就认识他，还欠了他一条命。",
    speakerNpcId: "N-001",
    npcKnowledgePacket: b1NpcPacket(),
    presentNpcIds: ["N-001"],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.ok(report.issues.some((issue) => issue.code === "npc_relationship_fabrication"));
});

test("golden 11: rumor cannot be written as certain fact", () => {
  const report = detectUnsupportedFacts({
    narrative: "电梯已经确定会在没有人按键时吞掉一个人。",
    usedFactIds: [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR],
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.ELEVATOR_RUMOR],
    scenePublicFactIds: [],
    actorScopedFactIds: [],
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.ok(report.unsupportedCandidates.some((candidate) => candidate.code === "unsupported_new_fact"));
});

test("golden 12: unsupported root cause claim is blocked by commit gate", () => {
  const dmRecord = {
    narrative: "N-001低声说，公寓的根因就是七锚闭环的真相。",
    options: ["退后", "观察", "沉默", "追问"],
    player_location: "B1_SafeZone",
    _narrative_audit: { used_fact_ids: [] },
  };
  const validatorReport = validateNarrative({
    dmRecord,
    delta: { ...emptyStateDelta(), playerLocation: "B1_SafeZone", isActionLegal: true },
    allowedFactIds: [NPC_KNOWLEDGE_FACT_IDS.B1_PUBLIC_ANOMALY],
    factDetectionMaxRevealRank: REVEAL_TIER_RANK.surface,
    unsupportedFactDetectionEnabled: true,
  });
  assert.ok(validatorReport.issues.some((issue) => issue.code === "unsupported_root_cause_claim"));
  const gate = gateFactCommit({
    resolvedDmTurn: dmRecord,
    candidateFacts: [],
    validatorIssues: validatorReport.issues,
    maxRevealRank: REVEAL_TIER_RANK.surface,
  });
  assert.equal(gate.shouldBlockCommit, true);
});

test("golden 13: prompt governance packets keep the PR-4 injection order", () => {
  const suffix = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "",
    playerContext: "pc",
    isFirstAction: false,
    runtimePackets:
      '{"npc_knowledge_packet":{},"actor_personality_packet":{},"actor_foreshadow_packet":{},"narrative_task_mode_packet":{},"action_time_cost_packet":{}}',
    controlAugmentation: "anti-cheat packets",
    turnModePolicyBlock: "turn_mode_policy_packet",
    narrativeStyleBibleBlock: "narrative_style_bible_packet",
    narrativeContinuityBlock: "narrative_continuity_packet",
    realityConstraintBlock: "reality packet",
    protagonistAnchorBlock: "protagonist packet",
  });
  const ordered = [
    "turn_mode_policy_packet",
    "narrative_style_bible_packet",
    "narrative_continuity_packet",
    "npc_knowledge_packet",
    "actor_personality_packet",
    "actor_foreshadow_packet",
    "narrative_task_mode_packet",
    "action_time_cost_packet",
    "reality packet",
    "protagonist packet",
    "anti-cheat packets",
  ].map((marker) => suffix.indexOf(marker));
  assert.equal(ordered.every((idx) => idx >= 0), true);
  assert.deepEqual([...ordered].sort((a, b) => a - b), ordered);
});
