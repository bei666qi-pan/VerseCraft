import test from "node:test";
import assert from "node:assert/strict";
import { selectActiveNpcsForSocialTick } from "@/lib/socialWorld/activation";
import { resolveSocialWorldConfig } from "@/lib/socialWorld/config";
import { buildSocialWorldHintBlockWithMeta, loadSocialWorldHintForPrompt } from "@/lib/socialWorld/prompt";
import { createEmptyNpcAgentState, normalizeSocialEvent } from "@/lib/socialWorld/state";
import type { NpcAgentState, SocialEvent } from "@/lib/socialWorld/types";

function npc(id: string, partial: Partial<NpcAgentState> = {}): NpcAgentState {
  return {
    ...createEmptyNpcAgentState(id, 12),
    socialEnergy: 1,
    volatility: 0.7,
    agencyWeight: 0.8,
    plotRelevance: 0.8,
    ...partial,
  };
}

function visibleEvent(partial: Partial<SocialEvent> = {}): SocialEvent {
  return normalizeSocialEvent({
    id: partial.id ?? "SW-E-1",
    turn: 12,
    dueTurn: 12,
    expiresTurn: 18,
    type: "rumor_spread",
    actorNpcIds: ["N-001"],
    targetNpcIds: ["N-002"],
    locationId: "hallway",
    visibility: "rumor",
    causeFactIds: [],
    producedFactIds: ["rumor:hallway"],
    relationDeltas: [],
    playerRelevance: "high",
    escapeRelevance: "false_lead",
    knowledgeScope: "rumor_network",
    mustNotReveal: ["true_exit_location"],
    summaryForModel: "N-001 gives N-002 an unverified hallway rumor.",
    summaryForPlayer: "有人说走廊尽头传来争执声。",
    status: "committed",
    ...partial,
  });
}

test("social world off mode disables background and prompt behavior", async () => {
  const config = resolveSocialWorldConfig({
    AI_ENABLE_SOCIAL_WORLD: "false",
    AI_SOCIAL_WORLD_MODE: "soft",
  });
  let called = false;
  const hint = await loadSocialWorldHintForPrompt({
    sessionId: "S-1",
    nowTurn: 12,
    enabled: config.promptInjectionEnabled,
    budget: config.budget,
    loadDueSocialEventsForPrompt: async () => {
      called = true;
      return [visibleEvent()];
    },
  });

  assert.equal(config.mode, "off");
  assert.equal(config.backgroundEnabled, false);
  assert.equal(config.promptInjectionEnabled, false);
  assert.equal(called, false);
  assert.equal(hint.block, "");
  assert.equal(hint.socialProjectionSkippedReason, "disabled");
});

test("social world shadow mode does not inject prompt hints", async () => {
  const config = resolveSocialWorldConfig({
    AI_ENABLE_SOCIAL_WORLD: "true",
    AI_SOCIAL_WORLD_MODE: "shadow",
  });
  let called = false;
  const hint = await loadSocialWorldHintForPrompt({
    sessionId: "S-1",
    nowTurn: 12,
    enabled: config.promptInjectionEnabled,
    budget: config.budget,
    loadDueSocialEventsForPrompt: async () => {
      called = true;
      return [visibleEvent()];
    },
  });

  assert.equal(config.backgroundEnabled, true);
  assert.equal(config.promptInjectionEnabled, false);
  assert.equal(called, false);
  assert.equal(hint.socialHintCount, 0);
});

test("social world soft mode can inject bounded prompt hints", async () => {
  const config = resolveSocialWorldConfig({
    AI_ENABLE_SOCIAL_WORLD: "true",
    AI_SOCIAL_WORLD_MODE: "soft",
    AI_SOCIAL_PROMPT_MAX_CHARS: "220",
  });
  let called = false;
  const hint = await loadSocialWorldHintForPrompt({
    sessionId: "S-1",
    nowTurn: 12,
    enabled: config.promptInjectionEnabled,
    timeoutMs: config.queryTimeoutMs,
    budget: config.budget,
    loadDueSocialEventsForPrompt: async () => {
      called = true;
      return [visibleEvent()];
    },
  });

  assert.equal(config.promptInjectionEnabled, true);
  assert.equal(called, true);
  assert.equal(hint.socialHintCount, 1);
  assert.ok(hint.block.includes("只供写作"));
  assert.ok(hint.socialHintChars <= config.promptMaxChars);
});

test("social world prompt query timeout fails open", async () => {
  const config = resolveSocialWorldConfig({
    AI_ENABLE_SOCIAL_WORLD: "true",
    AI_SOCIAL_WORLD_MODE: "soft",
    AI_SOCIAL_QUERY_TIMEOUT_MS: "10",
  });
  const hint = await loadSocialWorldHintForPrompt({
    sessionId: "S-1",
    nowTurn: 12,
    enabled: config.promptInjectionEnabled,
    timeoutMs: 1,
    budget: config.budget,
    loadDueSocialEventsForPrompt: () =>
      new Promise<readonly SocialEvent[]>((resolve) => setTimeout(() => resolve([visibleEvent()]), 25)),
  });

  assert.equal(hint.block, "");
  assert.equal(hint.socialHintCount, 0);
  assert.equal(hint.socialProjectionSkippedReason, "timeout");
});

test("social world max prompt chars and max active NPC limits are enforced", () => {
  const config = resolveSocialWorldConfig({
    AI_ENABLE_SOCIAL_WORLD: "true",
    AI_SOCIAL_WORLD_MODE: "soft",
    AI_SOCIAL_MAX_ACTIVE_NPCS: "3",
    AI_SOCIAL_PROMPT_MAX_CHARS: "160",
  });
  const selected = selectActiveNpcsForSocialTick({
    npcStates: Array.from({ length: 12 }, (_, index) => npc(`N-${String(index + 1).padStart(3, "0")}`)),
    nowTurn: 12,
    desiredActiveNpcCount: config.maxActiveNpcs,
    budget: config.budget,
  });
  const hint = buildSocialWorldHintBlockWithMeta(
    Array.from({ length: 4 }, (_, index) => visibleEvent({ id: `SW-E-${index + 1}` })),
    { budget: config.budget }
  );

  assert.equal(config.maxActiveNpcs, 3);
  assert.equal(selected.length, 3);
  assert.ok(hint.socialHintChars <= config.promptMaxChars);
  assert.ok(hint.socialHintCount <= config.maxPromptEvents);
});
