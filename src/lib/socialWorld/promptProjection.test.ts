import assert from "node:assert/strict";
import test from "node:test";
import { createInMemorySocialWorldPersistence } from "@/lib/socialWorld/persistence";
import {
  buildSocialWorldHintBlock,
  loadSocialWorldHintForPrompt,
} from "@/lib/socialWorld/prompt";
import { normalizeSocialEvent } from "@/lib/socialWorld/state";
import type { SocialEvent } from "@/lib/socialWorld/types";
import { assemblePlayerChatPrompt } from "@/lib/turnEngine/promptAssembly";

function event(partial: Partial<SocialEvent> = {}): SocialEvent {
  return normalizeSocialEvent({
    id: "SE-PROMPT-1",
    turn: 10,
    dueTurn: 10,
    expiresTurn: 12,
    type: "rumor_spread",
    actorNpcIds: ["N-001"],
    targetNpcIds: ["N-002"],
    locationId: "third_floor_hallway",
    visibility: "rumor",
    causeFactIds: ["F-1"],
    producedFactIds: ["F-2"],
    relationDeltas: [],
    playerRelevance: "medium",
    escapeRelevance: "none",
    knowledgeScope: "rumor_network",
    mustNotReveal: [],
    summaryForModel: "N-001 spreads a candidate rumor.",
    summaryForPlayer: "有人低声说三楼走廊刚刚换过门锁。",
    status: "committed",
    ...partial,
  });
}

test("social hint loading fails open when due-event query throws", async () => {
  const result = await loadSocialWorldHintForPrompt({
    sessionId: "S-1",
    nowTurn: 10,
    loadDueSocialEventsForPrompt: async () => {
      throw new Error("table missing");
    },
  });

  assert.equal(result.block, "");
  assert.equal(result.socialHintCount, 0);
  assert.equal(result.socialProjectionSkippedReason, "query_failed");
});

test("private social events do not enter prompt blocks", () => {
  const block = buildSocialWorldHintBlock([
    event({
      id: "SE-PRIVATE",
      visibility: "private",
      knowledgeScope: "actor_private",
      summaryForPlayer: "玩家不应看到这段密谈。",
    }),
  ]);

  assert.equal(block, "");
});

test("social hint block stays under budget and strips mustNotReveal", () => {
  const block = buildSocialWorldHintBlock(
    [
      event({
        id: "HIDDEN_EVENT_CODE",
        visibility: "ambient",
        knowledgeScope: "scene_public",
        mustNotReveal: ["隐藏根因", "HIDDEN_EVENT_CODE"],
        summaryForPlayer: "墙边出现一张纸，写着隐藏根因和被划掉的房号。",
      }),
      event({
        id: "SE-LONG",
        visibility: "directly_observable",
        knowledgeScope: "scene_public",
        summaryForPlayer:
          "两个 NPC 在门边短暂僵持，其中一个把钥匙收回袖口，另一个立刻改口说自己只是路过。",
      }),
    ],
    { budget: { maxSocialPromptChars: 420, maxCharsPerSocialEvent: 90, maxVisibleSocialEventsPerTurn: 2 } }
  );

  assert.ok(block.length <= 420);
  assert.ok(block.includes("## 【社会动态提示｜只供写作，不是玩家可见文本】"));
  assert.equal(block.includes("隐藏根因"), false);
  assert.equal(block.includes("HIDDEN_EVENT_CODE"), false);
});

test("projected social events are marked after injection", async () => {
  const persistence = createInMemorySocialWorldPersistence();
  await persistence.insertSocialEvents("S-1", [event({ id: "SE-INJECTED" })], "turn-10");

  const hint = await loadSocialWorldHintForPrompt({
    sessionId: "S-1",
    nowTurn: 10,
    loadDueSocialEventsForPrompt: persistence.loadDueSocialEventsForPrompt,
  });
  assert.deepEqual(hint.projectedEventIds, ["SE-INJECTED"]);

  const projected = await persistence.markSocialEventsProjected("S-1", hint.projectedEventIds);
  assert.equal(projected, 1);
  assert.deepEqual(await persistence.loadDueSocialEventsForPrompt("S-1", 10, 2), []);
});

test("social dynamic content does not change stable prompt message", () => {
  const socialBlock = buildSocialWorldHintBlock([event()]);
  const stablePrefix = "STABLE_PREFIX_EXACT";
  const withSocial = assemblePlayerChatPrompt({
    stablePrefix,
    dynamicSuffix: `DYNAMIC_CONTEXT\n${socialBlock}`,
    splitDualSystem: true,
    messagesToSend: [{ role: "user", content: "player action" }],
  });
  const withoutSocial = assemblePlayerChatPrompt({
    stablePrefix,
    dynamicSuffix: "DYNAMIC_CONTEXT",
    splitDualSystem: true,
    messagesToSend: [{ role: "user", content: "player action" }],
  });

  assert.equal(withSocial.safeMessages[0]?.content, stablePrefix);
  assert.ok(withSocial.safeMessages[1]?.content.includes("社会动态提示"));
  assert.equal(withSocial.promptStablePrefixHash, withoutSocial.promptStablePrefixHash);
});
