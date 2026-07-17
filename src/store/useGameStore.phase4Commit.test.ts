import test from "node:test";
import assert from "node:assert/strict";
import { migratePersistedState, useGameStore } from "./useGameStore";

function resetStore() {
  const initial = (useGameStore as unknown as { getInitialState: () => ReturnType<typeof useGameStore.getState> }).getInitialState();
  useGameStore.setState(initial, true);
}

test("initCharacter starts without gifting a random inventory item", () => {
  resetStore();
  useGameStore.getState().initCharacter(
    { name: "测试者", gender: "unknown", height: 170, personality: "谨慎" },
    { sanity: 10, agility: 0, luck: 0, charm: 0, background: 10 },
    "洞察之眼"
  );

  assert.equal(useGameStore.getState().isGameStarted, true);
  assert.deepEqual(useGameStore.getState().inventory, []);
});

test("initCharacter clears an earlier run's narrative log", () => {
  resetStore();
  useGameStore.setState({ logs: [{ role: "assistant", content: "上一局的中文正文" }] });

  useGameStore.getState().initCharacter(
    { name: "Rowan", gender: "unknown", height: 170, personality: "Calm" },
    { sanity: 10, agility: 0, luck: 0, charm: 0, background: 10 },
    "洞察之眼"
  );

  assert.deepEqual(useGameStore.getState().logs, []);
});

test("phase4: awarded_items write should land in inventory", () => {
  resetStore();
  const s = useGameStore.getState();
  s.addItems([
    {
      id: "IT_AWARD_1",
      name: "旧钥匙",
      tier: "B",
      description: "desc",
      tags: "loot",
      ownerId: "N-019",
    } as never,
  ]);
  assert.equal(useGameStore.getState().inventory.some((x) => x.id === "IT_AWARD_1"), true);
});

test("phase4: awarded_warehouse_items write should land in warehouse", () => {
  resetStore();
  const s = useGameStore.getState();
  s.addWarehouseItems([
    {
      id: "WH_AWARD_1",
      name: "锈蚀齿轮",
      description: "desc",
      benefit: "benefit",
      sideEffect: "side",
      ownerId: "N-019",
      floor: "B1",
    } as never,
  ]);
  assert.equal(useGameStore.getState().warehouse.some((x) => x.id === "WH_AWARD_1"), true);
});

test("mergeCodex preserves existing observation fields on relationship-only updates", () => {
  resetStore();
  const s = useGameStore.getState();
  s.mergeCodex([
    {
      id: "N-015",
      name: "麟泽",
      type: "npc",
      known_info: "第一次见到他时，他披着旧外套，肩上有雨痕。",
      personality: "克制警觉",
      traits: "说话短促",
    },
  ]);
  s.mergeCodex([
    {
      id: "N-015",
      name: "麟泽",
      type: "npc",
      favorability: 12,
    },
  ]);

  const entry = useGameStore.getState().codex["N-015"];
  assert.equal(entry?.favorability, 12);
  assert.equal(entry?.known_info, "第一次见到他时，他披着旧外套，肩上有雨痕。");
  assert.equal(entry?.personality, "克制警觉");
  assert.equal(entry?.traits, "说话短促");
});

test("mergeCodex appends current-turn observations and keeps relationship-only updates stable", () => {
  resetStore();
  const s = useGameStore.getState();
  s.mergeCodex([
    {
      id: "N-015",
      name: "N-015",
      type: "npc",
      known_info: "first structured note",
      observations: ["first sighting by the stairwell"],
    },
  ]);
  s.mergeCodex([
    {
      id: "N-015",
      name: "N-015",
      type: "npc",
      observations: ["second sighting near storage", "first sighting by the stairwell"],
      trust: 3,
    },
  ]);
  s.mergeCodex([
    {
      id: "N-015",
      name: "N-015",
      type: "npc",
      fear: 1,
    },
  ]);

  const entry = useGameStore.getState().codex["N-015"];
  assert.deepEqual(entry?.observations?.slice(0, 2), [
    "second sighting near storage",
    "first sighting by the stairwell",
  ]);
  assert.equal(entry?.trust, 3);
  assert.equal(entry?.fear, 1);
});

test("mergeCodex accumulates repeated relationship deltas and clamps to [-100,100]", () => {
  resetStore();
  const s = useGameStore.getState();
  // 模拟连续多回合 relationship_updates 下发同一 NPC 的 favorability 增量。
  s.mergeCodex([{ id: "N-020", name: "N-020", type: "npc", favorability: 40 }]);
  assert.equal(useGameStore.getState().codex["N-020"]?.favorability, 40);

  s.mergeCodex([{ id: "N-020", name: "N-020", type: "npc", favorability: 30 }]);
  assert.equal(useGameStore.getState().codex["N-020"]?.favorability, 70);

  // 第三次增量会超出上限（70+40=110），必须裁剪到 100 而不是覆盖成 40 或直接相加到 110。
  s.mergeCodex([{ id: "N-020", name: "N-020", type: "npc", favorability: 40 }]);
  assert.equal(useGameStore.getState().codex["N-020"]?.favorability, 100);

  // 负向增量同理验证下界裁剪。
  s.mergeCodex([{ id: "N-020", name: "N-020", type: "npc", trust: -60 }]);
  s.mergeCodex([{ id: "N-020", name: "N-020", type: "npc", trust: -60 }]);
  assert.equal(useGameStore.getState().codex["N-020"]?.trust, -100);
});

test("markCodexViewed marks an entry as viewed and is idempotent", () => {
  resetStore();
  const s = useGameStore.getState();
  s.mergeCodex([{ id: "N-015", name: "麟泽", type: "npc", known_info: "第一次见到他。" }]);

  assert.deepEqual(useGameStore.getState().viewedCodexIds, {});

  s.markCodexViewed("N-015");
  assert.equal(useGameStore.getState().viewedCodexIds["N-015"], true);

  // 重复标记应保持幂等：已读条目再次标记不应产生新的对象引用。
  const afterFirstMark = useGameStore.getState().viewedCodexIds;
  s.markCodexViewed("N-015");
  assert.equal(useGameStore.getState().viewedCodexIds, afterFirstMark);

  // 空 id 应被忽略，不写入任何 key。
  s.markCodexViewed("");
  assert.deepEqual(Object.keys(useGameStore.getState().viewedCodexIds), ["N-015"]);
});

test("G3: applyGameTimeFromResolvedTurn auto-fails active tasks past autoFailAfterGameHour", () => {
  resetStore();
  useGameStore.setState({
    time: { day: 0, hour: 0 },
    tasks: [
      {
        id: "t_overdue",
        title: "过期任务",
        desc: "",
        type: "floor",
        issuerId: "",
        issuerName: "",
        floorTier: "",
        guidanceLevel: "none",
        reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
        status: "active",
        expiresAt: null,
        betrayalPossible: false,
        hiddenOutcome: "",
        hiddenTriggerConditions: [],
        claimMode: "manual",
        npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
        npcProactiveGrantLastIssuedHour: null,
        nextHint: "",
        worldConsequences: [],
        highRiskHighReward: false,
        // 阈值设为 0：只要时间推进到 hourIndex > 0（即推进任意 1 小时）就应触发自动失败。
        autoFailAfterGameHour: 0,
      },
    ] as never,
  });

  // 不传 time_cost：per resolveHourProgressDelta 走 legacy 分支，保证整推进 1 小时。
  const result = useGameStore.getState().applyGameTimeFromResolvedTurn({ consumes_time: true });
  assert.equal(result.hoursAdvanced, 1);

  const task = useGameStore.getState().tasks.find((t) => t.id === "t_overdue");
  assert.equal(task?.status, "failed");
});

test("G3: applyGameTimeFromResolvedTurn leaves tasks array reference untouched when no task is overdue", () => {
  resetStore();
  const tasksBefore = [
    {
      id: "t_future",
      title: "未过期任务",
      desc: "",
      type: "floor",
      issuerId: "",
      issuerName: "",
      floorTier: "",
      guidanceLevel: "none",
      reward: { originium: 0, items: [], warehouseItems: [], unlocks: [], relationshipChanges: [] },
      status: "active",
      expiresAt: null,
      betrayalPossible: false,
      hiddenOutcome: "",
      hiddenTriggerConditions: [],
      claimMode: "manual",
      npcProactiveGrant: { enabled: false, npcId: "", minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      npcProactiveGrantLastIssuedHour: null,
      nextHint: "",
      worldConsequences: [],
      highRiskHighReward: false,
      autoFailAfterGameHour: 999,
    },
  ] as never;
  useGameStore.setState({ time: { day: 0, hour: 0 }, tasks: tasksBefore });

  useGameStore.getState().applyGameTimeFromResolvedTurn({ consumes_time: true });

  assert.equal(useGameStore.getState().tasks, tasksBefore, "无任务过期时应保持同一数组引用");
  assert.equal(useGameStore.getState().tasks[0]?.status, "active");
});

test("phase4: warehouse state supports narrative consume without changing save fields", () => {
  resetStore();
  const s = useGameStore.getState();
  s.addWarehouseItems([
    {
      id: "WH_CONSUME_1",
      name: "旧仓库钥匙",
      description: "desc",
      benefit: "benefit",
      sideEffect: "side",
      ownerId: "N-019",
      floor: "B1",
    } as never,
  ]);
  s.removeWarehouseItems(["WH_CONSUME_1"]);
  assert.equal(useGameStore.getState().warehouse.some((x) => x.id === "WH_CONSUME_1"), false);
});

test("phase4: weapon save fields remain readable after UI entry pruning", () => {
  resetStore();
  const equippedWeapon = {
    id: "WPN_SAVE_1",
    name: "存档主手",
    description: "旧存档中的主手武器。",
    counterThreatIds: ["A-002"],
    counterTags: ["sound"],
    stability: 72,
    calibratedThreatId: null,
    modSlots: ["core", "surface"],
    currentMods: ["silent"],
    currentInfusions: [],
    contamination: 11,
    repairable: true,
  } as never;
  const weaponBag = [
    {
      id: "WPN_SAVE_BAG",
      name: "存档备用",
      description: "旧存档中的备用武器。",
      counterThreatIds: ["A-006"],
      counterTags: ["mirror"],
      stability: 64,
      calibratedThreatId: null,
      modSlots: ["core", "surface"],
      currentMods: [],
      currentInfusions: [],
      contamination: 3,
      repairable: true,
    },
  ] as never;

  useGameStore.setState({
    isGameStarted: true,
    currentSaveSlot: "main_slot",
    logs: [{ role: "assistant", content: "武器存档兼容测试" }],
    time: { day: 2, hour: 8 },
    playerLocation: "2F_Corridor",
    equippedWeapon,
    weaponBag,
  });
  useGameStore.getState().saveGame("main_slot");
  const saved = useGameStore.getState().saveSlots.main_slot;
  assert.equal(saved?.equippedWeapon?.id, "WPN_SAVE_1");
  assert.equal(saved?.weaponBag?.[0]?.id, "WPN_SAVE_BAG");

  resetStore();
  useGameStore.setState({ saveSlots: { main_slot: saved } as never });
  useGameStore.getState().loadGame("main_slot");
  assert.equal(useGameStore.getState().isGameStarted, true);
  assert.equal(useGameStore.getState().equippedWeapon?.id, "WPN_SAVE_1");
  assert.equal(useGameStore.getState().weaponBag[0]?.id, "WPN_SAVE_BAG");
});

test("phase4: saveGame should update main_slot even when options are empty", () => {
  resetStore();
  useGameStore.setState({
    isGameStarted: true,
    currentOptions: [],
    logs: [{ role: "assistant", content: "推进到新回合" }],
    time: { day: 1, hour: 3 },
    playerLocation: "B1_SafeZone",
  });
  const s = useGameStore.getState();
  s.saveGame("main_slot");
  const first = useGameStore.getState().saveSlots["main_slot"]?.slotMeta?.updatedAt ?? null;
  assert.ok(first);
  useGameStore.setState({ time: { day: 1, hour: 4 } });
  s.saveGame("main_slot");
  const second = useGameStore.getState().saveSlots["main_slot"]?.slotMeta?.updatedAt ?? null;
  assert.ok(second);
  assert.notEqual(first, second);
});

test("phase4: options-only update must not mutate dialogue/time/world state", () => {
  resetStore();
  useGameStore.setState({
    dialogueCount: 3,
    time: { day: 2, hour: 6 },
    inventory: [{ id: "IT-1", name: "A", tier: "B", description: "d", tags: "t", ownerId: "N-019" }] as never,
    warehouse: [{ id: "WH-1", name: "W", description: "d", benefit: "b", sideEffect: "s", ownerId: "N-019", floor: "B1" }] as never,
    tasks: [{ id: "t1", title: "T1", status: "active" }] as never,
    playerLocation: "1F_Corridor",
    logs: [{ role: "assistant", content: "old" }],
  });
  const before = useGameStore.getState();
  useGameStore.getState().setCurrentOptions(["选项A", "选项B"]);
  const after = useGameStore.getState();
  assert.equal(after.dialogueCount, before.dialogueCount);
  assert.deepEqual(after.time, before.time);
  assert.equal(after.playerLocation, before.playerLocation);
  assert.equal(after.inventory.length, before.inventory.length);
  assert.equal(after.warehouse.length, before.warehouse.length);
  assert.equal(after.tasks.length, before.tasks.length);
  assert.equal(after.logs.length, before.logs.length);
});

test("phase4: setCurrentOptions filters journal/menu-like options", () => {
  resetStore();
  useGameStore.getState().setCurrentOptions(["查看灵感手记", "检查背包", "我用手电照向门缝"]);
  assert.deepEqual(useGameStore.getState().currentOptions, ["我用手电照向门缝"]);
});

test("language presentation replacement changes only the latest DM text and current choices", () => {
  resetStore();
  useGameStore.setState({
    dialogueCount: 5,
    time: { day: 2, hour: 6 },
    logs: [
      { role: "assistant", content: "Earlier scene" },
      { role: "user", content: "I listen" },
      { role: "assistant", content: "旧场景" },
    ],
    currentOptions: ["旧选项一", "旧选项二"],
    recentOptions: ["历史选项"],
  });

  useGameStore.getState().replaceLatestAssistantLog("Current scene");
  useGameStore.getState().replaceCurrentOptions(["I listen at the door.", "I step back."]);

  const state = useGameStore.getState();
  assert.equal(state.logs[0]?.content, "Earlier scene");
  assert.equal(state.logs[2]?.content, "Current scene");
  assert.deepEqual(state.currentOptions, ["I listen at the door.", "I step back."]);
  assert.deepEqual(state.recentOptions, ["历史选项"]);
  assert.equal(state.dialogueCount, 5);
  assert.deepEqual(state.time, { day: 2, hour: 6 });
});

test("chapter-aware migration preserves legacy local saves and backfills director chapter", () => {
  const chapterState = {
    currentChapterId: "chapter-2",
    activeChapterId: "chapter-2",
    reviewChapterId: null,
    completedChapterIds: ["chapter-1"],
    unlockedChapterIds: ["chapter-1", "chapter-2"],
    progressByChapterId: {
      "chapter-2": {
        chapterId: "chapter-2",
        status: "active",
        startedAt: 1,
        completedAt: null,
        turnCount: 1,
        narrativeCharCount: 24,
        keyChoiceCount: 1,
        completedBeatIds: [],
        stateChangeCount: 1,
        lastObjectiveText: "Follow the chapter two clue.",
      },
    },
    summariesByChapterId: {},
    lastChapterEndAt: null,
    pendingChapterEndId: null,
  };
  const legacySlot = {
    stats: { sanity: 10, agility: 0, luck: 0, charm: 0, background: 0 },
    inventory: [],
    logs: [{ role: "assistant", content: "legacy log survives" }],
    time: { day: 1, hour: 2 },
    codex: {},
    historicalMaxSanity: 50,
    playerLocation: "B1_SafeZone",
    chapterState,
    runSnapshotV2: {
      schemaVersion: 2,
      meta: {
        runId: "legacy_run",
        worldVersion: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
        lastSavedAt: "2026-01-01T00:00:00.000Z",
      },
      player: { profile: { name: "A", gender: "other", height: 170, personality: "quiet" } },
      time: { day: 1, hour: 2 },
      world: { storyDirector: { v: 1, arcId: "legacy_arc", tension: 37, stallCount: 1 } },
      chapterState,
    },
  } as never;

  const migrated = migratePersistedState(
    {
      logs: [{ role: "assistant", content: "root log survives" }],
      chapterState,
      storyDirector: { v: 1, arcId: "root_legacy_arc", tension: 12, stallCount: 0 },
      saveSlots: { main_slot: legacySlot },
    },
    1
  ) as any;

  assert.equal(migrated.logs[0].content, "root log survives");
  assert.ok(migrated.saveSlots.main_slot);
  assert.equal(migrated.saveSlots.main_slot.logs[0].content, "legacy log survives");
  assert.equal(migrated.storyDirector.chapter.currentChapterId, "chapter-2");
  assert.equal(migrated.saveSlots.main_slot.runSnapshotV2.world.storyDirector.chapter.currentChapterId, "chapter-2");

  resetStore();
  useGameStore.setState({ saveSlots: migrated.saveSlots });
  useGameStore.getState().loadGame("main_slot");
  const loaded = useGameStore.getState();
  assert.equal(loaded.logs[0]?.content, "legacy log survives");
  assert.equal(loaded.saveSlots.main_slot?.logs[0]?.content, "legacy log survives");
  assert.equal(loaded.chapterState.activeChapterId, "chapter-2");
  assert.equal((loaded.storyDirector as any).chapter.currentChapterId, "chapter-2");

  resetStore();
  useGameStore.getState().hydrateFromCloud("main_slot", legacySlot);
  const cloudLoaded = useGameStore.getState();
  assert.equal(cloudLoaded.logs[0]?.content, "legacy log survives");
  assert.equal(cloudLoaded.saveSlots.main_slot?.logs[0]?.content, "legacy log survives");
  assert.equal(cloudLoaded.chapterState.activeChapterId, "chapter-2");
  assert.equal((cloudLoaded.storyDirector as any).chapter.currentChapterId, "chapter-2");
});

test("phase4: saveGame does not persist journal/menu-like options", () => {
  resetStore();
  useGameStore.setState({
    isGameStarted: true,
    currentOptions: ["查看灵感手记", "我贴墙听走廊动静"],
    logs: [{ role: "assistant", content: "推进到新回合" }],
    time: { day: 1, hour: 3 },
    playerLocation: "B1_SafeZone",
  });
  useGameStore.getState().saveGame("main_slot");
  assert.deepEqual(useGameStore.getState().saveSlots.main_slot?.currentOptions, ["我贴墙听走廊动静"]);
});
