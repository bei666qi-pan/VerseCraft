import test from "node:test";
import assert from "node:assert/strict";
import { buildNpcEpistemicProfile, buildPublicSceneFacts, getNpcEmotionalResidueMode } from "./builders";
import { canActorKnowFact, filterFactsForActor } from "./guards";
import { getDefaultMemoryPolicyForNpc, isXinlanNpcId, XINLAN_NPC_ID } from "./policy";
import { DM_ACTOR_ID, PLAYER_ACTOR_ID, type KnowledgeFact } from "./types";

const scene = (ids: string[]) => ({ presentNpcIds: ids });
const now = "2026-03-28T12:00:00.000Z";

test("default NPC does not precisely remember player identity", () => {
  const p = getDefaultMemoryPolicyForNpc("N-001");
  assert.equal(p.remembersPlayerIdentity, "none");
  assert.equal(p.remembersPastLoops, false);
});

test("Xinlan is explicit exception with exact identity and past loops", () => {
  assert.equal(isXinlanNpcId(XINLAN_NPC_ID), true);
  const p = getDefaultMemoryPolicyForNpc(XINLAN_NPC_ID);
  assert.equal(p.remembersPlayerIdentity, "exact");
  assert.equal(p.remembersPastLoops, true);
  assert.equal(p.canRecognizeForbiddenKnowledge, true);
  const profile = buildNpcEpistemicProfile(XINLAN_NPC_ID);
  assert.equal(profile.isXinlanException, true);
});

test("public and shared_scene facts readable by multiple NPCs present", () => {
  const facts: KnowledgeFact[] = [
    {
      id: "pub1",
      content: "电梯灯闪烁",
      scope: "public",
      sourceType: "observation",
      certainty: "confirmed",
      visibleTo: [],
      inferableByOthers: true,
      tags: [],
      createdAt: now,
    },
    {
      id: "sh1",
      content: "警卫刚离开走廊",
      scope: "shared_scene",
      sourceType: "observation",
      certainty: "heard",
      visibleTo: [],
      inferableByOthers: false,
      tags: [],
      createdAt: now,
    },
  ];
  const ctx = scene(["N-001", "N-002"]);
  assert.equal(canActorKnowFact(facts[0]!, "N-001", ctx), true);
  assert.equal(canActorKnowFact(facts[0]!, "N-002", ctx), true);
  assert.equal(canActorKnowFact(facts[1]!, PLAYER_ACTOR_ID, ctx), true);
  assert.equal(canActorKnowFact(facts[1]!, "N-001", ctx), true);
});

test("NPC-private fact is not readable by another NPC", () => {
  const secret: KnowledgeFact = {
    id: "sec",
    content: "队长私藏钥匙",
    scope: "npc",
    ownerId: "N-001",
    sourceType: "dialogue",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001", "N-002"]);
  assert.equal(canActorKnowFact(secret, "N-001", ctx), true);
  assert.equal(canActorKnowFact(secret, "N-002", ctx), false);
  assert.equal(canActorKnowFact(secret, PLAYER_ACTOR_ID, ctx), false);
  const pool = [secret];
  const n2 = filterFactsForActor(pool, "N-002", ctx);
  assert.equal(n2.length, 0);
});

test("emotional residue mode is not the same as concrete memory access", () => {
  const normal = buildNpcEpistemicProfile("N-099");
  assert.equal(getNpcEmotionalResidueMode(normal), "mood_only");
  const secret: KnowledgeFact = {
    id: "hidden",
    content: "七锚真名列表",
    scope: "world",
    sourceType: "system_canon",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: now,
  };
  assert.equal(canActorKnowFact(secret, "N-099", scene(["N-099"])), false);
  assert.equal(canActorKnowFact(secret, DM_ACTOR_ID, scene(["N-099"])), true);
});

test("Xinlan emotional residue mode exposes identity anchor channel not world facts", () => {
  const xl = buildNpcEpistemicProfile(XINLAN_NPC_ID);
  assert.equal(getNpcEmotionalResidueMode(xl), "mood_plus_identity_anchor");
  const world: KnowledgeFact = {
    id: "w1",
    content: "未揭露的世界底层",
    scope: "world",
    sourceType: "system_canon",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: now,
  };
  assert.equal(canActorKnowFact(world, XINLAN_NPC_ID, scene([XINLAN_NPC_ID])), false);
});

test("visibleTo whitelist overrides scope", () => {
  const f: KnowledgeFact = {
    id: "wl",
    content: "只给玩家",
    scope: "public",
    sourceType: "rumor",
    certainty: "suspected",
    visibleTo: [PLAYER_ACTOR_ID],
    inferableByOthers: true,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001"]);
  assert.equal(canActorKnowFact(f, PLAYER_ACTOR_ID, ctx), true);
  assert.equal(canActorKnowFact(f, "N-001", ctx), false);
});

test("buildPublicSceneFacts produces public scope entries", () => {
  const rows = buildPublicSceneFacts({
    sceneId: "1F_Lobby",
    summaries: ["地面积水"],
    nowIso: now,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.scope, "public");
});
