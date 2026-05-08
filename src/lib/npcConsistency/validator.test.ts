import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { buildNpcEpistemicProfile } from "@/lib/epistemic/builders";
import { emptyEpistemicAnomalyResult } from "@/lib/epistemic/detector";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import type { KnowledgeFact } from "@/lib/epistemic/types";
import { getNpcCanonicalIdentity } from "@/lib/registry/npcCanon";
import { applyNpcConsistencyPostGeneration } from "./validator";

const now = "2026-06-01T00:00:00.000Z";

function baseDm(narrative: string): Record<string, unknown> {
  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative,
    is_death: false,
    consumes_time: true,
    options: ["a", "b", "c", "d"],
  };
}

function withPlayerEchoValidatorEnabled<T>(fn: () => T): T {
  const prev = process.env.VERSECRAFT_ENABLE_PLAYER_ECHO_VALIDATOR;
  process.env.VERSECRAFT_ENABLE_PLAYER_ECHO_VALIDATOR = "1";
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.VERSECRAFT_ENABLE_PLAYER_ECHO_VALIDATOR;
    else process.env.VERSECRAFT_ENABLE_PLAYER_ECHO_VALIDATOR = prev;
  }
}

describe("applyNpcConsistencyPostGeneration", () => {
  let prevValidator: string | undefined;
  let prevNpcConsistency: string | undefined;

  before(() => {
    prevValidator = process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR;
    process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR = "1";
    prevNpcConsistency = process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR;
    process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR = "1";
  });

  after(() => {
    if (prevValidator === undefined) delete process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR;
    else process.env.VERSECRAFT_ENABLE_EPISTEMIC_VALIDATOR = prevValidator;
    if (prevNpcConsistency === undefined) delete process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR;
    else process.env.VERSECRAFT_ENABLE_NPC_CONSISTENCY_VALIDATOR = prevNpcConsistency;
  });

  const emptyFacts: KnowledgeFact[] = [];

  it("普通 NPC 叙事写旧识口吻 -> 拦截并改写", () => {
    const npcId = "N-003";
    const r = applyNpcConsistencyPostGeneration({
      dmRecord: baseDm("我老相识，你终于来了。"),
      actorNpcId: npcId,
      presentNpcIds: [npcId],
      allFacts: emptyFacts,
      profile: buildNpcEpistemicProfile(npcId),
      anomalyResult: emptyEpistemicAnomalyResult(npcId),
      nowIso: now,
      maxRevealRank: 0,
      canonical: getNpcCanonicalIdentity(npcId),
    });
    assert.ok(r.telemetry.npcConsistencyValidatorTriggered);
    assert.ok(r.telemetry.violationTypes?.includes("normal_npc_old_friend_tone"));
    assert.ok(/哪里|听来/.test(String(r.dmRecord.narrative)));
  });

  it("性别称谓明显写反 -> 软化", () => {
    const npcId = "N-008";
    const canon = getNpcCanonicalIdentity(npcId);
    if (canon.canonicalGender !== "male") {
      return;
    }
    const r = applyNpcConsistencyPostGeneration({
      dmRecord: baseDm("她低声道：‘别靠那么近。’"),
      actorNpcId: npcId,
      presentNpcIds: [npcId],
      allFacts: emptyFacts,
      profile: buildNpcEpistemicProfile(npcId),
      anomalyResult: emptyEpistemicAnomalyResult(npcId),
      nowIso: now,
      maxRevealRank: 0,
      canonical: canon,
    });
    assert.ok(r.telemetry.violationTypes?.includes("gender_pronoun_mismatch"));
    assert.ok(String(r.dmRecord.narrative).length > 0);
  });

  it("不在场 NPC 被写成开口 -> 拦截", () => {
    const npcId = "N-001";
    const r = applyNpcConsistencyPostGeneration({
      dmRecord: baseDm("N-099低声道：‘快走。’"),
      actorNpcId: npcId,
      presentNpcIds: [npcId],
      allFacts: emptyFacts,
      profile: buildNpcEpistemicProfile(npcId),
      anomalyResult: emptyEpistemicAnomalyResult(npcId),
      nowIso: now,
      maxRevealRank: 0,
      canonical: getNpcCanonicalIdentity(npcId),
    });
    assert.ok(r.telemetry.violationTypes?.includes("offscreen_npc_dialogue"));
  });

  it("普通 NPC 直接确认循环真相 -> 拦截", () => {
    const npcId = "N-030";
    const r = applyNpcConsistencyPostGeneration({
      dmRecord: baseDm("读档世界的循环真相就是校源根因全貌。"),
      actorNpcId: npcId,
      presentNpcIds: [npcId],
      allFacts: emptyFacts,
      profile: buildNpcEpistemicProfile(npcId),
      anomalyResult: emptyEpistemicAnomalyResult(npcId),
      nowIso: now,
      maxRevealRank: 0,
      canonical: getNpcCanonicalIdentity(npcId),
    });
    assert.ok(r.telemetry.violationTypes?.includes("loop_truth_premature"));
  });

  it("欣蓝含牵引措辞但不踩循环命题 -> 不因 loop 规则误杀", () => {
    const r = applyNpcConsistencyPostGeneration({
      dmRecord: baseDm("她目光在你脸上停了一瞬，像要把话头拴住，却仍把后半句咽回去。"),
      actorNpcId: XINLAN_NPC_ID,
      presentNpcIds: [XINLAN_NPC_ID],
      allFacts: emptyFacts,
      profile: buildNpcEpistemicProfile(XINLAN_NPC_ID),
      anomalyResult: emptyEpistemicAnomalyResult(XINLAN_NPC_ID),
      nowIso: now,
      maxRevealRank: 0,
      canonical: getNpcCanonicalIdentity(XINLAN_NPC_ID),
    });
    assert.ok(!r.telemetry.violationTypes?.includes("loop_truth_premature"));
  });

  it("高魅力可保留熟悉感但不一口 omnibus", () => {
    const npcId = "N-020";
    const canon = getNpcCanonicalIdentity(npcId);
    if (canon.memoryPrivilege !== "major_charm") {
      return;
    }
    const r = applyNpcConsistencyPostGeneration({
      dmRecord: baseDm("七锚全员真相闭环已经写在校史根因里。"),
      actorNpcId: npcId,
      presentNpcIds: [npcId],
      allFacts: emptyFacts,
      profile: buildNpcEpistemicProfile(npcId),
      anomalyResult: emptyEpistemicAnomalyResult(npcId),
      nowIso: now,
      maxRevealRank: 0,
      canonical: canon,
    });
    assert.ok(r.telemetry.violationTypes?.includes("familiarity_overreach"));
  });
});

describe("applyNpcConsistencyPostGeneration playerEcho bridge", () => {
  const emptyFacts: KnowledgeFact[] = [];

  it("blocks normal NPC explicit previous-run memory when rollout is enabled", () => {
    const npcId = "N-001";
    const r = withPlayerEchoValidatorEnabled(() =>
      applyNpcConsistencyPostGeneration({
        dmRecord: baseDm("陈婆婆说：“你又来了，我记得你上次死在七楼。”"),
        actorNpcId: npcId,
        presentNpcIds: [npcId],
        allFacts: emptyFacts,
        profile: buildNpcEpistemicProfile(npcId),
        anomalyResult: emptyEpistemicAnomalyResult(npcId),
        nowIso: now,
        maxRevealRank: 0,
        canonical: getNpcCanonicalIdentity(npcId),
        playerEchoPacketPresent: true,
        firstEncounterPlan: null,
      })
    );

    assert.ok(r.telemetry.violationTypes?.includes("player_echo_normal_npc_overreach"));
    assert.ok(r.telemetry.consistencyViolations?.some((v) => v.includes("player_echo_normal_npc_overreach")));
    assert.equal(String(r.dmRecord.narrative).includes("你又来了"), false);
  });
});
