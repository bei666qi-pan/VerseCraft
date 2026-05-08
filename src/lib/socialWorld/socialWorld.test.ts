import test from "node:test";
import assert from "node:assert/strict";
import { selectActiveNpcsForSocialTick } from "@/lib/socialWorld/activation";
import { DEFAULT_SOCIAL_WORLD_BUDGET } from "@/lib/socialWorld/budget";
import { buildSocialWorldHintBlock } from "@/lib/socialWorld/prompt";
import { projectSocialEventToPlayerHint } from "@/lib/socialWorld/projection";
import { createEmptyNpcAgentState, normalizeSocialEvent } from "@/lib/socialWorld/state";
import { validateSocialEventCandidate } from "@/lib/socialWorld/validator";
import type { NpcAgentState, SocialEvent } from "@/lib/socialWorld/types";

function npc(id: string, partial: Partial<NpcAgentState> = {}): NpcAgentState {
  return {
    ...createEmptyNpcAgentState(id, 10),
    plotRelevance: 0.4,
    agencyWeight: 0.5,
    socialEnergy: 0.8,
    ...partial,
  };
}

function event(partial: Partial<SocialEvent> = {}): SocialEvent {
  return normalizeSocialEvent({
    id: "E-1",
    turn: 10,
    type: "rumor_spread",
    actorNpcIds: ["N-001"],
    targetNpcIds: ["N-002"],
    locationId: "third_floor_hallway",
    visibility: "rumor",
    causeFactIds: ["F-CAUSE"],
    producedFactIds: ["F-RUMOR"],
    relationDeltas: [],
    playerRelevance: "medium",
    escapeRelevance: "none",
    knowledgeScope: "rumor_network",
    mustNotReveal: [],
    summaryForModel: "N-001 tells N-002 an unverified hallway rumor.",
    summaryForPlayer: "有人提到三楼门后有奇怪响动。",
    status: "candidate",
    ...partial,
  });
}

test("active NPC selection never exceeds seven", () => {
  const states = Array.from({ length: 20 }, (_, index) =>
    npc(`N-${String(index + 1).padStart(3, "0")}`, {
      plotRelevance: 1,
      volatility: 1,
    })
  );
  const selected = selectActiveNpcsForSocialTick({
    npcStates: states,
    nowTurn: 10,
    desiredActiveNpcCount: 20,
  });
  assert.ok(selected.length <= DEFAULT_SOCIAL_WORLD_BUDGET.maxActiveNpcPerTick);
  assert.ok(selected.length <= 7);
});

test("cooldown NPC is skipped unless due or highly relevant", () => {
  const cooldown = npc("N-001", {
    status: "cooldown",
    nextEligibleTurn: 20,
    plotRelevance: 0.4,
  });
  const normal = npc("N-002", { plotRelevance: 0.3 });

  const skipped = selectActiveNpcsForSocialTick({
    npcStates: [cooldown, normal],
    nowTurn: 10,
    desiredActiveNpcCount: 2,
  });
  assert.deepEqual(
    skipped.map((x) => x.npcId),
    ["N-002"]
  );

  const due = selectActiveNpcsForSocialTick({
    npcStates: [cooldown, normal],
    nowTurn: 10,
    desiredActiveNpcCount: 2,
    dueAgendaNpcIds: ["N-001"],
  });
  assert.ok(due.some((x) => x.npcId === "N-001"));

  const high = selectActiveNpcsForSocialTick({
    npcStates: [{ ...cooldown, plotRelevance: 0.95 }, normal],
    nowTurn: 10,
    desiredActiveNpcCount: 2,
  });
  assert.ok(high.some((x) => x.npcId === "N-001"));
});

test("private event does not project to player hint", () => {
  const privateEvent = event({
    visibility: "private",
    knowledgeScope: "actor_private",
    summaryForPlayer: "玩家不该看到的密谈。",
  });
  assert.equal(projectSocialEventToPlayerHint(privateEvent), null);
});

test("mustNotReveal text is removed from player hint", () => {
  const hint = projectSocialEventToPlayerHint(
    event({
      visibility: "ambient",
      knowledgeScope: "scene_public",
      mustNotReveal: ["七号锚点"],
      summaryForPlayer: "墙角纸条提到了七号锚点和一个被划掉的门牌。",
    })
  );
  assert.ok(hint);
  assert.equal(hint?.includes("七号锚点"), false);
});

test("social prompt block respects budget and excludes private events", () => {
  const privateEvent = event({
    id: "E-PRIVATE",
    visibility: "private",
    knowledgeScope: "actor_private",
    summaryForPlayer: "PRIVATE_SECRET_TEXT",
  });
  const visibleEvents = Array.from({ length: 6 }, (_, index) =>
    event({
      id: `E-${index}`,
      visibility: index % 2 === 0 ? "ambient" : "directly_observable",
      knowledgeScope: "scene_public",
      summaryForPlayer: `这是一个很长的后台社会事件投影摘要 ${index}，用于测试预算裁剪和提示块长度。`,
    })
  );

  const block = buildSocialWorldHintBlock([privateEvent, ...visibleEvents], {
    budget: { maxSocialPromptChars: 180, maxVisibleSocialEventsPerTurn: 2, maxCharsPerSocialEvent: 80 },
  });
  assert.ok(block.length <= 180);
  assert.ok(block.startsWith("## 【社会动态提示｜只供写作，不是玩家可见文本】"));
  assert.equal(block.includes("PRIVATE_SECRET_TEXT"), false);
});

test("invalid NPC id is rejected", () => {
  const result = validateSocialEventCandidate({
    knownNpcIds: ["N-001", "N-002"],
    event: event({
      actorNpcIds: ["N-001"],
      targetNpcIds: ["N-999"],
      knowledgeScope: "scene_public",
      visibility: "ambient",
    }),
  });
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some((issue) => issue.code === "invalid_target_npc"));
  assert.equal(result.sanitizedEvent, null);
});

test("validator requires knowledgeScope and keeps sanitized player summary safe", () => {
  const result = validateSocialEventCandidate({
    knownNpcIds: ["N-001", "N-002"],
    event: {
      ...event({
        knowledgeScope: "",
        mustNotReveal: ["根因"],
        summaryForPlayer: "传言里直接说出了根因。",
      }),
      knowledgeScope: "",
    },
  });
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some((issue) => issue.code === "missing_knowledge_scope"));
});

test("visibility rumor projects as rumor-level hint instead of fact assertion", () => {
  const hint = projectSocialEventToPlayerHint(
    event({
      visibility: "rumor",
      knowledgeScope: "rumor_network",
      summaryForPlayer: "三楼有人说楼梯口被换过锁。",
    })
  );
  assert.ok(hint?.startsWith("传闻（未证实）："));
  assert.equal(hint?.includes("事实："), false);
});
