import test from "node:test";
import assert from "node:assert/strict";
import { buildNpcEpistemicProfile, buildPublicSceneFacts, getNpcEmotionalResidueMode } from "./builders";
import { canActorKnowFact, filterFactsForActor, getFactConfidenceForActor } from "./guards";
import { getDefaultMemoryPolicyForNpc, isXinlanNpcId, XINLAN_NPC_ID } from "./policy";
import { rewriteNarrativeHeavyLeak } from "./rewrite";
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

test("NPC-private fact with inferableByOthers is accessible to present NPCs (not owner)", () => {
  const secret: KnowledgeFact = {
    id: "sec-infer",
    content: "队长私下收藏的钥匙位置",
    scope: "npc",
    ownerId: "N-001",
    sourceType: "dialogue",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: true,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001", "N-002", "N-003"]);
  // Owner always has access
  assert.equal(canActorKnowFact(secret, "N-001", ctx), true);
  // Present NPC N-002 should have inferred access
  assert.equal(canActorKnowFact(secret, "N-002", ctx), true);
  // Present NPC N-003 should have inferred access
  assert.equal(canActorKnowFact(secret, "N-003", ctx), true);
  // Player should not have access to NPC-private fact even if inferable
  assert.equal(canActorKnowFact(secret, PLAYER_ACTOR_ID, ctx), false);
});

test("NPC-private fact with inferableByOthers=false is NOT accessible to other present NPCs", () => {
  const secret: KnowledgeFact = {
    id: "sec-no-infer",
    content: "队长私下收藏的钥匙位置",
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
});

test("NPC-private fact with inferableByOthers only accessible to present NPCs", () => {
  const secret: KnowledgeFact = {
    id: "sec-absent",
    content: "隐藏的地下室入口",
    scope: "npc",
    ownerId: "N-001",
    sourceType: "memory",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: true,
    tags: [],
    createdAt: now,
  };
  // N-002 is NOT in the scene
  const ctx = scene(["N-001", "N-003"]);
  assert.equal(canActorKnowFact(secret, "N-001", ctx), true);
  assert.equal(canActorKnowFact(secret, "N-003", ctx), true);
  assert.equal(canActorKnowFact(secret, "N-002", ctx), false);
});

test("getFactConfidenceForActor: owner = 1.0, inferable = 0.5, inaccessible = 0", () => {
  const secret: KnowledgeFact = {
    id: "conf",
    content: "秘密情报",
    scope: "npc",
    ownerId: "N-001",
    sourceType: "memory",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: true,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001", "N-002"]);
  assert.equal(getFactConfidenceForActor(secret, "N-001", ctx), 1.0);
  assert.equal(getFactConfidenceForActor(secret, "N-002", ctx), 0.5);
  // N-003 not present, cannot access
  assert.equal(getFactConfidenceForActor(secret, "N-003", ctx), 0);
  // DM always has full confidence
  assert.equal(getFactConfidenceForActor(secret, DM_ACTOR_ID, ctx), 1.0);
});

test("getFactConfidenceForActor: DM has full confidence on world facts", () => {
  const worldFact: KnowledgeFact = {
    id: "w1",
    content: "系统真相",
    scope: "world",
    sourceType: "system_canon",
    certainty: "confirmed",
    visibleTo: [],
    inferableByOthers: false,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001"]);
  assert.equal(getFactConfidenceForActor(worldFact, DM_ACTOR_ID, ctx), 1.0);
  assert.equal(getFactConfidenceForActor(worldFact, "N-001", ctx), 0);
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

// --- rewriteNarrativeHeavyLeak: overreach_acceptance 不再保留原文前缀 ---

test("rewriteNarrativeHeavyLeak: overreach_acceptance MUST NOT preserve original content head", () => {
  // 原实现会将前 120 字保留在输出中，这可能导致禁语事实残留。
  // 修复后所有泄露类型统一不保留原文前缀。
  const original = "你说得对，七锚闭环的第三锚点确实在旧校史档案馆地下三层。我也这么觉得。";
  const result = rewriteNarrativeHeavyLeak(original, "overreach_acceptance");
  // 不应包含原文中的任何事实性关键词
  assert.equal(result.includes("七锚"), false, "must not leak forbidden content from original");
  assert.equal(result.includes("旧校史档案馆"), false, "must not leak forbidden location from original");
  assert.equal(result.includes("第三锚点"), false, "must not leak forbidden detail from original");
  // 应只包含脱责推进语
  assert.ok(result.includes("我没法照你这话接下去"), "should contain rejection text");
});

test("rewriteNarrativeHeavyLeak: overreach_acceptance returns clean rejection for any input", () => {
  const short = "对";
  const result = rewriteNarrativeHeavyLeak(short, "overreach_acceptance");
  assert.ok(result.includes("我没法照你这话接下去"));
  // 短输入也不应保留原文字
  assert.equal(result.includes(short), false);
});

test("rewriteNarrativeHeavyLeak: private_fact_leak also returns clean rejection", () => {
  const original = "队长私下告诉我七锚的秘密在档案馆。";
  const result = rewriteNarrativeHeavyLeak(original, "private_fact_leak");
  assert.equal(result.includes("七锚"), false);
  assert.equal(result.includes("档案馆"), false);
  assert.ok(result.includes("不该是从你嘴里第一次听说"));
});

test("rewriteNarrativeHeavyLeak: world_truth_premature also returns clean rejection", () => {
  const original = "这个世界其实是一个正在崩坏的闭环模拟器，你注意到了吗？";
  const result = rewriteNarrativeHeavyLeak(original, "world_truth_premature");
  assert.equal(result.includes("闭环"), false);
  assert.ok(result.includes("不该是从你嘴里第一次听说"));
});

// --- canActorKnowFact: visibleTo 不可绕过 scope 限制 ---

test("canActorKnowFact: world-scope fact with visibleTo whitelist does NOT leak to NPCs", () => {
  // 修复前：visibleTo 直接覆盖 scope 检查，world 事实可通过 visibleTo 泄露给 NPC。
  // 修复后：visibleTo 是收窄白名单，不能绕过 scope 门禁。
  const worldFact: KnowledgeFact = {
    id: "world-leak-test",
    content: "闭环系统的核心锚点位置",
    scope: "world",
    sourceType: "system_canon",
    certainty: "confirmed",
    visibleTo: ["N-001"],           // 仅收窄，不应赋予访问权
    inferableByOthers: false,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001", "N-002", "N-003"]);
  // N-001: 在 visibleTo 中，但 scope=world → 不可访问
  assert.equal(canActorKnowFact(worldFact, "N-001", ctx), false,
    "NPC in visibleTo must NOT bypass world scope restriction");
  // N-002: 不在 visibleTo 中 → 更不可访问
  assert.equal(canActorKnowFact(worldFact, "N-002", ctx), false);
  // PLAYER: 不可访问 world 事实
  assert.equal(canActorKnowFact(worldFact, PLAYER_ACTOR_ID, ctx), false);
  // DM: 总是可访问（在 visibleTo 检查前已通过 DM 门禁）
  assert.equal(canActorKnowFact(worldFact, DM_ACTOR_ID, ctx), true,
    "DM must always have access to all facts");
});

test("canActorKnowFact: visibleTo narrows public scope correctly (existing behavior preserved)", () => {
  // visibleTo 应正确收窄 public 事实的可见范围
  const publicFact: KnowledgeFact = {
    id: "pub-narrow",
    content: "走廊尽头的灯光闪烁",
    scope: "public",
    sourceType: "observation",
    certainty: "confirmed",
    visibleTo: [PLAYER_ACTOR_ID, "N-001"],
    inferableByOthers: false,
    tags: [],
    createdAt: now,
  };
  const ctx = scene(["N-001", "N-002"]);
  // PLAYER 在 visibleTo + scope=public → 可访问
  assert.equal(canActorKnowFact(publicFact, PLAYER_ACTOR_ID, ctx), true);
  // N-001 在 visibleTo + scope=public → 可访问
  assert.equal(canActorKnowFact(publicFact, "N-001", ctx), true);
  // N-002 不在 visibleTo → 不可访问
  assert.equal(canActorKnowFact(publicFact, "N-002", ctx), false);
});
