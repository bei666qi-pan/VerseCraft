import test from "node:test";
import assert from "node:assert/strict";
import { buildEpistemicPromptContext, filterEpistemicFacts } from "@/lib/turnEngine/epistemic";
import { PLAYER_ACTOR_ID, type EpistemicSceneContext, type KnowledgeFact, type NpcEpistemicProfile } from "@/lib/epistemic/types";
import { buildDynamicPlayerDmSystemSuffix } from "@/lib/playRealtime/playerChatSystemPrompt";

const NOW = "2026-05-07T12:00:00.000Z";

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

const scene = (ids: string[]): EpistemicSceneContext => ({ presentNpcIds: ids });

test("dm-only facts are blocked by id and never appear in the prompt block", () => {
  const result = filterEpistemicFacts({
    facts: [
      fact({
        id: "world:root-secret",
        content: "DM_ONLY_SECRET_ROOT_CAUSE",
        scope: "world",
        sourceType: "system_canon",
      }),
      fact({
        id: "scene:public-lamp",
        content: "PUBLIC_LAMP_FLICKERS",
        scope: "public",
        inferableByOthers: true,
      }),
    ],
    actorId: "N-001",
    scene: scene(["N-001"]),
    profile: normalProfile("N-001"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, "N-001", "RULE");
  const dynamicSuffix = buildDynamicPlayerDmSystemSuffix({
    memoryBlock: "",
    epistemicPromptContextBlock: context.promptBlock,
    playerContext: "player-context",
    isFirstAction: false,
    runtimePackets: "",
    controlAugmentation: "",
  });

  assert.equal(context.blockedDmOnlyFactIds.includes("world:root-secret"), true);
  assert.equal(context.promptBlock.includes("DM_ONLY_SECRET_ROOT_CAUSE"), false);
  assert.equal(dynamicSuffix.includes("DM_ONLY_SECRET_ROOT_CAUSE"), false);
  assert.equal(context.promptBlock.includes("PUBLIC_LAMP_FLICKERS"), true);
  assert.equal(dynamicSuffix.includes("PUBLIC_LAMP_FLICKERS"), true);
});

test("actor-scoped facts are allowed for the matching NPC actor", () => {
  const result = filterEpistemicFacts({
    facts: [
      fact({
        id: "npc:N-001:private-work",
        content: "N001_PRIVATE_WORKSHOP_MEMORY",
        scope: "npc",
        ownerId: "N-001",
        visibleTo: ["N-001"],
      }),
    ],
    actorId: "N-001",
    scene: scene(["N-001"]),
    profile: normalProfile("N-001"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, "N-001", "RULE");

  assert.deepEqual(context.allowedActorScopedFacts.map((item) => item.id), ["npc:N-001:private-work"]);
  assert.equal(context.promptBlock.includes("N001_PRIVATE_WORKSHOP_MEMORY"), true);
});

test("player-only facts are blocked from prompt context content", () => {
  const result = filterEpistemicFacts({
    facts: [
      fact({
        id: "player:private-note",
        content: "PLAYER_ONLY_PRIVATE_NOTE",
        scope: "player",
        visibleTo: [PLAYER_ACTOR_ID],
      }),
    ],
    actorId: PLAYER_ACTOR_ID,
    scene: scene([]),
    profile: null,
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, PLAYER_ACTOR_ID, "RULE");

  assert.equal(context.blockedPlayerOnlyFactIds.includes("player:private-note"), true);
  assert.equal(context.promptBlock.includes("PLAYER_ONLY_PRIVATE_NOTE"), false);
});

test("residue markers enter only as non-propositional hints", () => {
  const forbiddenResidueContent = "RESIDUE_SPECIFIC_LOOP_MEMORY";
  const result = filterEpistemicFacts({
    facts: [],
    actorId: "N-001",
    scene: scene(["N-001"]),
    profile: normalProfile("N-001"),
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [{ actorId: "N-001", note: forbiddenResidueContent }],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, "N-001", "RULE");

  assert.equal(context.allowedResidueHints.length, 1);
  assert.equal(context.promptBlock.includes(forbiddenResidueContent), false);
  assert.equal(context.promptBlock.includes("allowedResidueHints"), true);
  assert.equal(context.promptBlock.includes("hesitation_or_unease"), true);
});

test("reveal-tier gated facts do not enter the prompt context when over limit", () => {
  const result = filterEpistemicFacts({
    facts: [
      fact({
        id: "scene:deep-stage",
        content: "REVEAL_TIER_TOO_DEEP_STAGE",
        scope: "public",
        inferableByOthers: true,
      }),
      fact({
        id: "scene:surface",
        content: "SURFACE_FACT_ALLOWED",
        scope: "public",
        inferableByOthers: true,
      }),
    ],
    actorId: "N-001",
    scene: scene(["N-001"]),
    profile: normalProfile("N-001"),
    maxRevealRank: 1,
    revealTierGatedFacts: [{ id: "scene:deep-stage", minRevealRank: 3 }],
    residueMarkers: [],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, "N-001", "REVEAL");

  assert.equal(context.telemetry.revealGatedCount, 1);
  assert.equal(context.promptBlock.includes("REVEAL_TIER_TOO_DEEP_STAGE"), false);
  assert.equal(context.promptBlock.includes("SURFACE_FACT_ALLOWED"), true);
});

test("FAST lane uses compact caps and still blocks dm-only facts", () => {
  const result = filterEpistemicFacts({
    facts: [
      fact({ id: "world:hidden", content: "FAST_DM_ONLY_HIDDEN", scope: "world", sourceType: "system_canon" }),
      fact({ id: "scene:a", content: "FAST_PUBLIC_A", scope: "public", inferableByOthers: true }),
      fact({ id: "scene:b", content: "FAST_PUBLIC_B", scope: "public", inferableByOthers: true }),
      fact({ id: "scene:c", content: "FAST_PUBLIC_C", scope: "public", inferableByOthers: true }),
    ],
    actorId: PLAYER_ACTOR_ID,
    scene: scene([]),
    profile: null,
    maxRevealRank: 0,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, PLAYER_ACTOR_ID, "FAST");

  assert.equal(context.telemetry.compact, true);
  assert.equal(context.allowedScenePublicFacts.length, 2);
  assert.equal(context.promptBlock.includes("FAST_DM_ONLY_HIDDEN"), false);
  assert.equal(context.promptBlock.includes("FAST_PUBLIC_C"), false);
});

test("REVEAL lane uses fuller context but still blocks forbidden facts", () => {
  const result = filterEpistemicFacts({
    facts: [
      fact({ id: "world:hidden", content: "REVEAL_DM_ONLY_HIDDEN", scope: "world", sourceType: "system_canon" }),
      fact({ id: "scene:a", content: "REVEAL_PUBLIC_A", scope: "public", inferableByOthers: true }),
      fact({
        id: "npc:N-001:private",
        content: "REVEAL_N001_PRIVATE_ALLOWED",
        scope: "npc",
        ownerId: "N-001",
        visibleTo: ["N-001"],
      }),
    ],
    actorId: "N-001",
    scene: scene(["N-001"]),
    profile: normalProfile("N-001"),
    maxRevealRank: 5,
    revealTierGatedFacts: [],
    residueMarkers: [],
    nowIso: NOW,
  });

  const context = buildEpistemicPromptContext(result, "N-001", "REVEAL");

  assert.equal(context.telemetry.compact, false);
  assert.equal(context.promptBlock.includes("REVEAL_PUBLIC_A"), true);
  assert.equal(context.promptBlock.includes("REVEAL_N001_PRIVATE_ALLOWED"), true);
  assert.equal(context.promptBlock.includes("REVEAL_DM_ONLY_HIDDEN"), false);
});
