import test from "node:test";
import assert from "node:assert/strict";
import {
  buildActorConstraintBundle,
  buildActorForeshadowPacket,
  buildNarrativeTaskModePacket,
  buildActionTimeCostPacket,
  compactActorConstraintBundle,
  parseRtTaskLayers,
} from "@/lib/playRealtime/actorConstraintPackets";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";

const bundleArgsBase = {
  playerContext: "【rt_task_layers】t_soft=soft_lead,t_promise=conversation_promise,t_main=formal_task。",
  latestUserInput: "我随口问一句楼下怎么走",
  location: "B1_Lobby",
  maxRevealRank: REVEAL_TIER_RANK.surface,
  hotThreatPresent: false,
  activeTaskIds: ["t_soft", "t_promise"],
  pendingHourFraction: 0.08,
};

test("parseRtTaskLayers decodes URI-encoded task ids", () => {
  const layers = parseRtTaskLayers("【rt_task_layers】foo%2Fbar=formal_task,x=soft_lead。");
  assert.equal(layers.length, 2);
  assert.deepEqual(layers[0], { taskId: "foo/bar", layer: "formal_task" });
  assert.deepEqual(layers[1], { taskId: "x", layer: "soft_lead" });
});

test("major charm vs standard NPC yield distinct compact personality packets", () => {
  const major = compactActorConstraintBundle(
    buildActorConstraintBundle({ ...bundleArgsBase, focusNpcId: "N-010" })
  ).actor_personality_packet as Record<string, unknown>;
  const std = compactActorConstraintBundle(
    buildActorConstraintBundle({ ...bundleArgsBase, focusNpcId: "N-008" })
  ).actor_personality_packet as Record<string, unknown>;
  assert.equal(major.sch, "aper_v1");
  assert.equal(std.sch, "aper_v1");
  assert.notEqual(JSON.stringify(major), JSON.stringify(std));
  assert.notEqual(major.ct, std.ct);
});

test("actor foreshadow does not unlock deep payload at low reveal", () => {
  const fx = buildActorForeshadowPacket({
    focusNpcId: "N-010",
    maxRevealRank: REVEAL_TIER_RANK.surface,
  }) as Record<string, unknown>;
  assert.equal(fx.deep_payload_locked, true);
  const ban = fx.ban_lexicon_hard as string[];
  assert.ok(Array.isArray(ban) && ban.length > 0);
});

test("narrative_task_mode_packet carries anti-formal-task-ui rules for soft layers", () => {
  const p = buildNarrativeTaskModePacket([
    { taskId: "a", layer: "soft_lead" },
    { taskId: "b", layer: "conversation_promise" },
  ]) as { rules: string[]; counts: Record<string, number> };
  assert.ok(p.rules.some((r) => r.includes("禁止系统")));
  assert.equal(p.counts.soft_lead, 1);
  assert.equal(p.counts.conversation_promise, 1);
});

test("action_time_cost_packet reflects heavy / dangerous heuristics", () => {
  const light = buildActionTimeCostPacket({ pendingHourFraction: 0, latestUserInput: "嗯" });
  assert.equal(light.suggest_for_this_turn, "light");
  const danger = buildActionTimeCostPacket({ pendingHourFraction: 0, latestUserInput: "我拼命冲向楼梯" });
  assert.equal(danger.suggest_for_this_turn, "dangerous");
});

test("compact actor constraint bundle stays bounded", () => {
  const json = JSON.stringify(
    compactActorConstraintBundle(buildActorConstraintBundle({ ...bundleArgsBase, focusNpcId: "N-010" }))
  );
  assert.ok(json.length < 1200, `expected compact bundle <1200 chars, got ${json.length}`);
});
