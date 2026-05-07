import assert from "node:assert/strict";
import test from "node:test";
import type { ChapterState } from "@/lib/chapters/types";
import { SESSION_MEMORY_EPISTEMIC_EMBED_KEY } from "@/lib/memoryCompress";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
import type { LorePacket } from "@/lib/worldKnowledge/types";
import { buildDialogueContext, type DialogueContextBuilderDeps } from "./contextBuilder";

const chapterState: ChapterState = {
  currentChapterId: "chapter-1",
  activeChapterId: "chapter-1",
  reviewChapterId: null,
  chapterTitlesById: {
    "chapter-1": "暗月初醒",
  },
  completedChapterIds: [],
  unlockedChapterIds: ["chapter-1"],
  progressByChapterId: {
    "chapter-1": {
      chapterId: "chapter-1",
      status: "active",
      startedAt: 1,
      completedAt: null,
      turnCount: 2,
      narrativeCharCount: 120,
      keyChoiceCount: 1,
      completedBeatIds: ["wake"],
      stateChangeCount: 1,
      lastObjectiveText: "Find the first stable clue.",
    },
  },
  summariesByChapterId: {},
  lastChapterEndAt: null,
  pendingChapterEndId: null,
};

const snapshot = {
  schemaVersion: 2,
  player: {
    currentLocation: "B1_SafeZone",
    stats: { sanity: 80, agility: 5 },
    inventory: [{ id: "I-C03" }],
    warehouse: [],
    codex: { "N-010": { id: "N-010", name: "Xinlan", type: "npc" } },
  },
  time: { day: 1, hour: 8 },
  profession: { currentProfession: "keeper" },
  world: {
    discoveredSecrets: ["fact:door"],
    worldFlags: {},
    pendingEvents: [],
    storyDirector: {
      chapter: {
        currentChapterId: "chapter-1",
        chapterOrder: 1,
        chapterTitle: "暗月初醒",
        chapterPhase: "echo",
        promise: "第一道异常会在门后的回声里继续逼近。",
        mainQuestion: "门后的回声究竟指向哪里？",
        emotionalTone: "克制、悬疑、余波未散",
        mustEchoMemoryIds: ["mem:promise", "mem:secret"],
        openThreadIds: ["mem:promise", "mem:hook"],
        forbiddenRevealIds: ["mem:secret"],
        closeCandidate: {
          shouldClose: false,
        },
      },
    },
  },
  journal: { version: 1, clues: [{ id: "clue:first-door" }] },
  memory: {
    spine: {
      v: 1,
      entries: [
        {
          id: "mem:promise",
          kind: "promise",
          scope: "run_private",
          summary: "玩家答应沿门后的回声继续查下去。",
          salience: 0.9,
          confidence: 0.85,
          status: "active",
          createdAtHour: 1,
          lastTouchedAtHour: 2,
          ttlHours: 72,
          mergeKey: "promise:door",
          anchors: { npcIds: ["N-010"], itemIds: ["I-C03"] },
          recallTags: [],
          source: "resolved_turn",
          chapterId: "chapter-1",
          chapterOrder: 1,
          chapterRole: "setup",
          promoteToLore: false,
        },
        {
          id: "mem:hook",
          kind: "hook",
          scope: "run_private",
          summary: "门后的回声留下新的调查钩子。",
          salience: 0.86,
          confidence: 0.82,
          status: "active",
          createdAtHour: 1,
          lastTouchedAtHour: 2,
          ttlHours: 72,
          mergeKey: "hook:door",
          anchors: {},
          recallTags: [],
          source: "system_hook",
          chapterId: "chapter-1",
          chapterOrder: 1,
          chapterRole: "hook",
          shouldAppearInRecap: true,
          promoteToLore: false,
        },
        {
          id: "mem:secret",
          kind: "secret_fragment",
          scope: "run_private",
          summary: "真正的门后循环真相不应直接泄露。",
          salience: 0.92,
          confidence: 0.9,
          status: "active",
          createdAtHour: 1,
          lastTouchedAtHour: 2,
          ttlHours: 72,
          mergeKey: "secret:door",
          anchors: {},
          recallTags: [],
          source: "resolved_turn",
          chapterId: "chapter-1",
          chapterOrder: 1,
          chapterRole: "hook",
          promoteToLore: false,
        },
      ],
    },
  },
  chapterState,
  npcs: {
    "N-010": {
      currentLocation: "B1_SafeZone",
      relationshipState: { trust: 55, fear: 5 },
    },
  },
  tasks: {
    active: [{ id: "task:route" }],
    available: [],
    completed: [],
    failed: [],
    hidden: [],
  },
} as unknown as RunSnapshotV2;

const lorePacket = {
  coreAnchors: [],
  relevantEntities: [
    {
      identity: { factKey: "world:rule:safe-zone" },
      layer: "core_canon",
      factType: "rule",
      canonicalText: "Safe zones cannot be treated as guaranteed exits.",
      tags: ["B1_SafeZone"],
      source: { kind: "registry", entityId: "B1_SafeZone" },
    },
  ],
  retrievedFacts: [],
  privateFacts: [],
  sceneFacts: [],
  compactPromptText: "",
  debugMeta: {
    queryFingerprint: "test",
    cache: { level0MemoHit: false, redisHit: false, postgresHit: false, writtenToRedis: false },
    hitSources: [],
    scores: {},
    trimmedByBudget: false,
    dbRoundTrips: 0,
  },
} as LorePacket;

function deps(overrides: Partial<DialogueContextBuilderDeps> = {}): Partial<DialogueContextBuilderDeps> {
  return {
    loadSessionMemoryForUser: async () => null,
    loadWorldLore: async () => lorePacket,
    loadRecentStoryEvents: async () => [
      {
        id: 1,
        turnIndex: 2,
        actorType: "player",
        actorId: "player",
        eventType: "player_action",
        summary: "Player checked the safe zone.",
      },
    ],
    loadNpcMemories: async () => [
      {
        id: 10,
        npcId: "N-010",
        scope: "session",
        kind: "observation",
        summary: "Xinlan noticed the player hesitated.",
        salience: 70,
        confidence: 85,
      },
    ],
    buildNpcHeartRuntimeView: ((() => ({
      profile: {
        displayName: "Xinlan",
        surfaceMask: "route guide",
        speechContract: "calm and precise",
        coreDrive: "keep the player from false routes",
        coreFear: "choosing for the player",
        tabooBoundary: "do not force fate choices",
        truthfulnessBand: "high",
      },
      relation: { trust: 55, fear: 5 },
      attitudeLabel: "warm",
      context: { locationId: "B1_SafeZone", floorId: "B1", hotThreatPresent: false, activeTaskIds: [] },
      whatNpcWantsFromPlayerNow: "",
      behavioralHints: {},
      canIssueTasksNow: true,
      suggestedTaskDramaticTypes: [],
    })) as unknown) as DialogueContextBuilderDeps["buildNpcHeartRuntimeView"],
    recordDegrade: async () => undefined,
    ...overrides,
  };
}

test("buildDialogueContext merges snapshot, lore, npc heart, memories, and recent events", async () => {
  const context = await buildDialogueContext({
    requestId: "req_ctx_1",
    sessionId: "sess_1",
    userId: "user_1",
    latestUserInput: "look around",
    messages: [{ role: "user", content: "look around" }],
    playerContext: "raw player context",
    clientState: {
      v: 1,
      turnIndex: 4,
      playerLocation: "B1_SafeZone",
      inventoryItemIds: ["I-C03"],
      presentNpcIds: ["N-010"],
      journalClueIds: ["clue:first-door"],
    },
    runSnapshotV2: snapshot,
    sessionMemory: {
      plot_summary: "Previous turns summarized.",
      player_status: { knownFactIds: ["fact:player"] },
      npc_relationships: {},
    },
    deps: deps(),
  });

  assert.equal(context.player.locationId, "B1_SafeZone");
  assert.equal(context.player.time?.day, 1);
  assert.equal(context.player.stats.sanity, 80);
  assert.ok(context.player.inventoryIds.includes("I-C03"));
  assert.ok(context.player.knownFactIds.includes("fact:door"));
  assert.ok(context.player.discoveredClueIds.includes("clue:first-door"));
  assert.equal(context.chapter.chapterId, "chapter-1");
  assert.equal(context.chapter.title, "暗月初醒");
  assert.equal(context.chapter.phase, "选择回响");
  assert.notEqual(context.chapter.phase, "echo");
  assert.equal(context.chapter.mainQuestion, "门后的回声究竟指向哪里？");
  assert.equal(context.chapter.promise, "第一道异常会在门后的回声里继续逼近。");
  assert.ok(context.chapter.writerInstruction);
  assert.ok(context.chapter.mustEchoSummaries.length <= 4);
  assert.ok(context.chapter.mustEchoSummaries.some((line) => line.includes("玩家答应")));
  assert.ok(context.chapter.mustEchoSummaries.some((line) => line.includes("禁止直接揭露未解真相：mem:secret")));
  assert.equal(JSON.stringify(context.chapter.mustEchoSummaries).includes("真正的门后循环真相"), false);
  assert.ok(context.chapter.unresolvedThreads.length <= 6);
  assert.deepEqual(context.chapter.forbiddenRevealIds, ["mem:secret"]);
  assert.match(context.chapter.closePolicy ?? "", /不要主动宣布章节结束/);
  assert.ok(context.chapter.allowedEventIds.includes("observe"));
  assert.equal(context.activeNpc?.npcId, "N-010");
  assert.equal(context.activeNpc?.displayName, "Xinlan");
  assert.equal(context.npcMemories.length, 1);
  assert.equal(context.recentEvents.length, 1);
  assert.ok(context.world.loreFacts.some((fact) => fact.factKey === "world:rule:safe-zone"));
  assert.ok(context.world.hardRules.includes("Safe zones cannot be treated as guaranteed exits."));
  assert.ok(context.world.allowedEntityIds.includes("N-010"));
});

test("buildDialogueContext injects a writer-safe chapter director context", async () => {
  const context = await buildDialogueContext({
    requestId: "req_ctx_chapter_director",
    sessionId: "sess_ctx_chapter_director",
    userId: "user_ctx_chapter_director",
    latestUserInput: "look around",
    messages: [{ role: "user", content: "look around" }],
    playerContext: "",
    clientState: { v: 1, turnIndex: 4, playerLocation: "B1_SafeZone" },
    runSnapshotV2: snapshot,
    deps: deps({
      loadRecentStoryEvents: async () => [],
      loadNpcMemories: async () => [],
    }),
  });

  assert.equal(context.chapter.chapterId, "chapter-1");
  assert.equal(context.chapter.title, "暗月初醒");
  assert.equal(context.chapter.phase, "选择回响");
  assert.notEqual(context.chapter.phase, "echo");
  assert.equal(context.chapter.forbiddenRevealIds.includes("mem:secret"), true);
  assert.ok(context.chapter.mustEchoSummaries.length > 0);
  assert.ok(context.chapter.mustEchoSummaries.length <= 4);
  assert.equal(JSON.stringify(context.chapter.mustEchoSummaries).includes("真正的门后循环真相"), false);
  assert.equal(JSON.stringify(context.chapter).includes("pressureBudget"), false);
});

test("buildDialogueContext does not infer active NPC from free-form user input", async () => {
  const context = await buildDialogueContext({
    requestId: "req_ctx_2",
    sessionId: null,
    userId: null,
    latestUserInput: "I talk to N-010",
    messages: [{ role: "user", content: "I talk to N-010" }],
    playerContext: "",
    clientState: { v: 1, turnIndex: 1, playerLocation: "B1_SafeZone" },
    deps: deps({
      loadRecentStoryEvents: async () => [],
      loadNpcMemories: async () => [],
    }),
  });

  assert.equal(context.activeNpc, null);
  assert.deepEqual(context.npcMemories, []);
});

test("buildDialogueContext falls back to legacy chapter objective when director chapter is absent", async () => {
  const legacySnapshot = {
    ...(snapshot as any),
    world: {
      ...((snapshot as any).world ?? {}),
      storyDirector: undefined,
    },
  } as unknown as RunSnapshotV2;
  const context = await buildDialogueContext({
    requestId: "req_ctx_legacy_chapter",
    sessionId: "sess_legacy_chapter",
    userId: null,
    latestUserInput: "look",
    messages: [{ role: "user", content: "look" }],
    playerContext: "",
    clientState: { v: 1, turnIndex: 1, playerLocation: "B1_SafeZone" },
    runSnapshotV2: legacySnapshot,
    chapterState,
    deps: deps({
      loadRecentStoryEvents: async () => [],
      loadNpcMemories: async () => [],
    }),
  });

  assert.equal(context.chapter.chapterId, "chapter-1");
  assert.equal(context.chapter.mainQuestion, "Find the first stable clue.");
  assert.equal(context.chapter.objective, "Find the first stable clue.");
  assert.match(context.chapter.writerInstruction ?? "", /Find the first stable clue/);
});

test("buildDialogueContext returns conservative context without session memory", async () => {
  const context = await buildDialogueContext({
    requestId: "req_ctx_no_memory",
    sessionId: "sess_no_memory",
    userId: "user_no_memory",
    latestUserInput: "wait",
    messages: [{ role: "user", content: "wait" }],
    playerContext: "",
    clientState: null,
    deps: deps({
      loadSessionMemoryForUser: async () => null,
      loadWorldLore: async () => ({ ...lorePacket, relevantEntities: [] }),
      loadRecentStoryEvents: async () => [],
      loadNpcMemories: async () => [],
    }),
  });

  assert.equal(context.player.locationId, null);
  assert.deepEqual(context.player.knownFactIds, []);
  assert.deepEqual(context.npcMemories, []);
  assert.equal(context.activeNpc, null);
  assert.equal(context.rawCompatibility.sessionMemory, undefined);
});

test("buildDialogueContext keeps allowedEntityIds to registry, snapshot, and lore sources", async () => {
  const context = await buildDialogueContext({
    requestId: "req_ctx_allowed_ids",
    sessionId: "sess_allowed_ids",
    userId: "user_allowed_ids",
    latestUserInput: "look",
    messages: [{ role: "user", content: "look" }],
    playerContext: "",
    clientState: {
      v: 1,
      turnIndex: 1,
      inventoryItemIds: ["I-UNKNOWN-FROM-CLIENT"],
      presentNpcIds: ["NPC-FAKE-999"],
    },
    runSnapshotV2: snapshot,
    deps: deps({
      loadRecentStoryEvents: async () => [],
      loadNpcMemories: async () => [],
    }),
  });

  assert.ok(context.world.allowedEntityIds.includes("I-C03"));
  assert.ok(context.world.allowedEntityIds.includes("N-010"));
  assert.ok(context.world.allowedEntityIds.includes("world:rule:safe-zone"));
  assert.equal(context.world.allowedEntityIds.includes("I-UNKNOWN-FROM-CLIENT"), false);
  assert.equal(context.world.allowedEntityIds.includes("NPC-FAKE-999"), false);
});

test("buildDialogueContext carries forbidden fact ids from epistemic memory", async () => {
  const context = await buildDialogueContext({
    requestId: "req_ctx_forbidden",
    sessionId: "sess_forbidden",
    userId: "user_forbidden",
    latestUserInput: "wait",
    messages: [{ role: "user", content: "wait" }],
    playerContext: "",
    clientState: null,
    revealTier: 1,
    sessionMemory: {
      plot_summary: "",
      player_status: {
        [SESSION_MEMORY_EPISTEMIC_EMBED_KEY]: {
          dm_only_truth_summary: "The loop exit is not publicly known.",
          reveal_tier_sensitive_facts: [{ id: "fact:locked", minRevealRank: 3 }],
        },
      },
      npc_relationships: {},
    },
    deps: deps({
      loadWorldLore: async () => ({ ...lorePacket, relevantEntities: [] }),
      loadRecentStoryEvents: async () => [],
      loadNpcMemories: async () => [],
    }),
  });

  assert.ok(context.world.forbiddenFactIds.includes("fact:locked"));
  assert.ok(context.world.forbiddenFactIds.includes("memory:dm_only_truth_summary"));
});

test("buildDialogueContext returns conservative context and records degrade reasons", async () => {
  const recorded: string[][] = [];
  const context = await buildDialogueContext({
    requestId: "req_ctx_3",
    sessionId: "sess_3",
    userId: "user_3",
    latestUserInput: "wait",
    messages: [{ role: "user", content: "wait" }],
    playerContext: "",
    clientState: null,
    deps: deps({
      loadSessionMemoryForUser: async () => {
        throw new Error("session table missing");
      },
      loadWorldLore: async () => {
        throw new Error("world knowledge missing");
      },
      loadRecentStoryEvents: async () => {
        throw new Error("story events missing");
      },
      recordDegrade: async (input) => {
        recorded.push(input.reasons);
      },
    }),
  });

  assert.equal(context.player.locationId, null);
  assert.deepEqual(context.world.loreFacts, []);
  assert.equal(recorded.length, 1);
  assert.ok(recorded[0]?.includes("session_memory_read_failed"));
  assert.ok(recorded[0]?.includes("world_lore_read_failed"));
  assert.ok(recorded[0]?.includes("recent_story_events_read_failed"));
});
