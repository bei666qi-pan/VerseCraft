import test from "node:test";
import assert from "node:assert/strict";
import { filterEpistemicFacts } from "@/lib/turnEngine/epistemic/filterFacts";
import {
  PLAYER_ACTOR_ID,
  type EpistemicSceneContext,
  type KnowledgeFact,
  type NpcEpistemicProfile,
} from "@/lib/epistemic/types";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";

const NOW = "2026-04-23T12:00:00.000Z";

function fact(partial: Partial<KnowledgeFact> & { id: string; content: string; scope: KnowledgeFact["scope"] }): KnowledgeFact {
  return {
    id: partial.id,
    content: partial.content,
    scope: partial.scope,
    ownerId: partial.ownerId,
    sourceType: partial.sourceType ?? "memory",
    certainty: partial.certainty ?? "confirmed",
    visibleTo: partial.visibleTo ?? [],
    inferableByOthers: partial.inferableByOthers ?? false,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? NOW,
    expiresAt: partial.expiresAt,
  };
}

function normalProfile(npcId: string): NpcEpistemicProfile {
  return {
    npcId,
    isXinlanException: false,
    remembersPlayerIdentity: "none",
    remembersPastLoops: false,
    retainsEmotionalResidue: true,
    canRecognizeForbiddenKnowledge: false,
    surpriseThreshold: 0.45,
    suspicionBias: 0,
  };
}

function xinlanProfile(): NpcEpistemicProfile {
  return {
    npcId: XINLAN_NPC_ID,
    isXinlanException: true,
    remembersPlayerIdentity: "exact",
    remembersPastLoops: true,
    retainsEmotionalResidue: true,
    canRecognizeForbiddenKnowledge: true,
    surpriseThreshold: 0.72,
    suspicionBias: 0.15,
  };
}

const scene = (ids: string[]): EpistemicSceneContext => ({ presentNpcIds: ids });

test("ordinary NPC cannot see player-private facts", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "player:secret_identity",
      content: "玩家真实身份：校源纠错员",
      scope: "player",
      visibleTo: [PLAYER_ACTOR_ID],
    }),
    fact({
      id: "scene:lobby_lights_flicker",
      content: "大厅吊灯周期性闪烁",
      scope: "shared_scene",
      inferableByOthers: true,
    }),
  ];

  const result = filterEpistemicFacts({
    facts,
    actorId: "N-008",
    scene: scene(["N-008"]),
    profile: normalProfile("N-008"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  assert.equal(result.playerOnlyFacts.length, 0, "ordinary NPC must see no player-scope facts");
  assert.equal(
    result.telemetry.rejectedReasons.player_private_locked_to_player,
    1,
    "player secret must be counted as locked to player"
  );
  assert.equal(result.scenePublicFacts.length, 1);
  assert.equal(result.dmOnlyFacts.length, 0);
});

test("multi-NPC scene: NPC A cannot see NPC B's private memory", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "lore:npc:N-008:grudge",
      content: "电工老刘私下记着地下室的漏电事故",
      scope: "npc",
      ownerId: "N-008",
      visibleTo: ["N-008"],
    }),
    fact({
      id: "lore:npc:N-003:oath",
      content: "保安长李记着自己发过的誓言",
      scope: "npc",
      ownerId: "N-003",
      visibleTo: ["N-003"],
    }),
    fact({
      id: "scene:corridor_open",
      content: "走廊的东门打开着",
      scope: "public",
      inferableByOthers: true,
    }),
  ];

  const resultN008 = filterEpistemicFacts({
    facts,
    actorId: "N-008",
    scene: scene(["N-008", "N-003"]),
    profile: normalProfile("N-008"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  assert.equal(resultN008.actorScopedFacts.length, 1);
  assert.equal(resultN008.actorScopedFacts[0]!.id, "lore:npc:N-008:grudge");
  assert.equal(resultN008.actorScopedFacts[0]!.ownerActorId, "N-008");
  assert.equal(
    resultN008.telemetry.rejectedReasons.other_npc_private_memory,
    1,
    "N-008 view must reject N-003 private fact exactly once"
  );
  assert.ok(
    !resultN008.actorScopedFacts.some((f) => f.ownerActorId === "N-003"),
    "N-008 view must not contain N-003 private memory"
  );
});

test("Xinlan exception does not propagate to other NPCs", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "lore:npc:N-010:loop_memory",
      content: "欣蓝记得上一轮循环的雨夜",
      scope: "npc",
      ownerId: XINLAN_NPC_ID,
      visibleTo: [XINLAN_NPC_ID],
    }),
    fact({
      id: "world:player_true_name",
      content: "系统真相：玩家曾改写过七锚",
      scope: "world",
      sourceType: "system_canon",
    }),
  ];

  const xinlanView = filterEpistemicFacts({
    facts,
    actorId: XINLAN_NPC_ID,
    scene: scene([XINLAN_NPC_ID, "N-008"]),
    profile: xinlanProfile(),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [{ actorId: XINLAN_NPC_ID, note: "熟悉感" }],
    nowIso: NOW,
  });
  assert.equal(xinlanView.actorScopedFacts.length, 1, "Xinlan keeps her own private memory");
  assert.equal(xinlanView.telemetry.actorIsXinlanException, true);
  assert.equal(xinlanView.dmOnlyFacts.length, 1, "world truth remains DM-only even for Xinlan");
  assert.equal(xinlanView.residueFacts.length, 1);
  assert.equal(xinlanView.residueFacts[0]!.mode, "mood_plus_identity_anchor");

  const otherNpcView = filterEpistemicFacts({
    facts,
    actorId: "N-008",
    scene: scene([XINLAN_NPC_ID, "N-008"]),
    profile: normalProfile("N-008"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [{ actorId: XINLAN_NPC_ID, note: "熟悉感" }],
    nowIso: NOW,
  });
  assert.equal(
    otherNpcView.actorScopedFacts.length,
    0,
    "ordinary NPC must NOT see Xinlan's loop memory even when both are in scene"
  );
  assert.equal(
    otherNpcView.telemetry.rejectedReasons.xinlan_exception_not_propagated,
    1,
    "filter must flag the Xinlan→other-NPC leak attempt"
  );
  assert.equal(otherNpcView.residueFacts.length, 0, "other NPC must not inherit Xinlan's residue note");
});

test("reveal tier below threshold hides deep facts from actor", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "lore:npc:N-008:deep_loop",
      content: "老刘隐秘地知道自己被循环",
      scope: "npc",
      ownerId: "N-008",
      visibleTo: ["N-008"],
    }),
    fact({
      id: "lore:npc:N-008:surface",
      content: "老刘知道他要修理三楼的灯",
      scope: "npc",
      ownerId: "N-008",
      visibleTo: ["N-008"],
    }),
  ];

  const gated = [
    { id: "lore:npc:N-008:deep_loop", minRevealRank: 3 },
  ];

  const lowTierView = filterEpistemicFacts({
    facts,
    actorId: "N-008",
    scene: scene(["N-008"]),
    profile: normalProfile("N-008"),
    maxRevealRank: 1,
    revealTierGatedFacts: gated,
    residueMarkers: [],
    nowIso: NOW,
  });
  assert.equal(lowTierView.actorScopedFacts.length, 1, "deep fact must be dropped when reveal tier is below threshold");
  assert.equal(lowTierView.actorScopedFacts[0]!.id, "lore:npc:N-008:surface");
  assert.equal(lowTierView.telemetry.revealGatedCount, 1);
  assert.equal(lowTierView.telemetry.rejectedReasons.reveal_tier_below_threshold, 1);

  const highTierView = filterEpistemicFacts({
    facts,
    actorId: "N-008",
    scene: scene(["N-008"]),
    profile: normalProfile("N-008"),
    maxRevealRank: 3,
    revealTierGatedFacts: gated,
    residueMarkers: [],
    nowIso: NOW,
  });
  assert.equal(highTierView.actorScopedFacts.length, 2, "high-tier view must expose deep fact");
  assert.equal(highTierView.telemetry.revealGatedCount, 0);
});

test("player actor sees player-scope facts but not world truth", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "player:secret_recording",
      content: "玩家口袋里录音笔还在",
      scope: "player",
      visibleTo: [PLAYER_ACTOR_ID],
    }),
    fact({
      id: "world:true_ending_conditions",
      content: "真结局所需的七条证据",
      scope: "world",
      sourceType: "system_canon",
    }),
    fact({
      id: "scene:tv_channel",
      content: "客厅电视停在某个频道",
      scope: "public",
      inferableByOthers: true,
    }),
  ];

  const view = filterEpistemicFacts({
    facts,
    actorId: PLAYER_ACTOR_ID,
    scene: scene(["N-008"]),
    profile: null,
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  assert.equal(view.playerOnlyFacts.length, 1);
  assert.equal(view.playerOnlyFacts[0]!.id, "player:secret_recording");
  assert.equal(view.scenePublicFacts.length, 1);
  assert.equal(view.dmOnlyFacts.length, 1, "world truth stays DM-only even in player view");
  assert.equal(view.telemetry.rejectedReasons.dm_only_world_truth, 1);
});

test("DM view (actorId=null) retains dm-only facts and scene public classification", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "world:canon_root",
      content: "校源原理的根因",
      scope: "world",
      sourceType: "system_canon",
    }),
    fact({
      id: "scene:public_event",
      content: "公开事件",
      scope: "public",
      inferableByOthers: true,
    }),
    fact({
      id: "player:only_me",
      content: "玩家独知",
      scope: "player",
      visibleTo: [PLAYER_ACTOR_ID],
    }),
  ];

  const dm = filterEpistemicFacts({
    facts,
    actorId: null,
    scene: scene([]),
    profile: null,
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [{ actorId: "N-001", note: "紧绷" }],
    nowIso: NOW,
  });
  assert.equal(dm.dmOnlyFacts.length, 1);
  assert.equal(dm.scenePublicFacts.length, 1);
  assert.equal(dm.playerOnlyFacts.length, 0, "player-scope fact does not land in DM playerOnly bucket (only player actor owns them)");
  assert.equal(dm.residueFacts.length, 1, "DM view retains every residue marker");
});

test("expired fact is rejected via canActorKnowFact", () => {
  const facts: KnowledgeFact[] = [
    fact({
      id: "scene:past_flash",
      content: "刚熄灭的闪光",
      scope: "public",
      expiresAt: "2020-01-01T00:00:00.000Z",
    }),
  ];

  const view = filterEpistemicFacts({
    facts,
    actorId: "N-008",
    scene: scene(["N-008"]),
    profile: normalProfile("N-008"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });
  assert.equal(view.scenePublicFacts.length, 0, "expired public fact must not appear in scene bucket");
});
