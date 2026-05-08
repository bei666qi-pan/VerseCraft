import assert from "node:assert/strict";
import test from "node:test";
import { buildRunSnapshotV2 } from "./builder";
import {
  migrateLegacySaveToSnapshot,
  normalizeRunSnapshotV2,
  projectSnapshotToLegacy,
} from "./migration";

test("legacy save can migrate to RunSnapshotV2 without crashing", () => {
  const snapshot = migrateLegacySaveToSnapshot({
    playerName: "测试玩家",
    gender: "其他",
    height: 168,
    personality: "谨慎",
    stats: { sanity: 12, agility: 3, luck: 4, charm: 5, background: 6 },
    time: { day: 2, hour: 22 },
    originium: 17,
    playerLocation: "1F_Lobby",
    equippedWeapon: {
      id: "WPN-001",
      name: "静默短棍",
      description: "test",
      counterThreatIds: ["A-002"],
      counterTags: ["sound"],
      stability: 80,
      calibratedThreatId: null,
      modSlots: [],
      currentMods: [],
      currentInfusions: [],
      contamination: 0,
      repairable: true,
    },
  });
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.player.profile.name, "测试玩家");
  assert.equal(snapshot.time.day, 2);
  assert.equal(snapshot.player.currentLocation, "1F_Lobby");
  assert.equal(snapshot.player.equippedWeapon?.id, "WPN-001");
});

test("normalizeRunSnapshotV2 fills defaults for partial snapshot", () => {
  const normalized = normalizeRunSnapshotV2({
    schemaVersion: 2,
    meta: { runId: "run_x", worldVersion: 2, startedAt: "2026-01-01T00:00:00.000Z" },
    player: { profile: { name: "A", gender: "男", height: 170, personality: "冷静" } },
    time: { day: 3, hour: 0 },
  });
  assert.equal(normalized.meta.runId, "run_x");
  assert.equal(normalized.meta.branchMeta?.slotId, "main_slot");
  assert.equal(normalized.profession.currentProfession, null);
  assert.equal(normalized.time.darkMoonStarted, true);
  assert.ok(Array.isArray(normalized.world.discoveredSecrets));
  assert.ok(typeof normalized.services.anchorUnlocked === "boolean");
  assert.ok(typeof normalized.world.mainThreatByFloor["1"]?.threatId === "string");
  assert.ok(normalized.memory);
  assert.equal(normalized.memory!.spine.v, 1);
  assert.ok(Array.isArray(normalized.memory!.spine.entries));
});

test("normalizeRunSnapshotV2 reattaches separate ending settlement snapshot", () => {
  const normalized = normalizeRunSnapshotV2({
    schemaVersion: 2,
    meta: { runId: "run_ending", worldVersion: 2, startedAt: "2026-01-01T00:00:00.000Z" },
    player: { profile: { name: "A", gender: "other", height: 170, personality: "quiet" } },
    time: { day: 10, hour: 5 },
    endingState: {
      phase: "settlement_ready",
      eligibility: {
        outcome: "doom",
        confidence: 1,
        reasons: ["day=10"],
        blockers: [],
        detectedAtTurn: 8,
        source: "time",
        priority: 20,
      },
      finalNarrative: null,
      settlementSnapshot: null,
      redirectedAt: null,
      settledAt: null,
      idempotencyKey: "run_ending:doom:8",
    },
    endingSettlementSnapshot: {
      v: 1,
      runId: "run_ending",
      settlementId: "settlement:run_ending:doom:8",
      outcome: "doom",
      grade: "E",
      title: "Doom",
      caption: "",
      finalNarrative: "",
      survivalHours: 245,
      survivalDay: 10,
      survivalHour: 5,
      maxFloorScore: 0,
      maxFloorLabel: "B1",
      killedAnomalies: 0,
      keyChoices: [],
      obtainedClues: [],
      npcEpilogues: [],
      worldStateLines: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      writingMarkdown: "",
    },
  });

  assert.equal(normalized.endingState?.phase, "settlement_ready");
  assert.equal(normalized.endingState?.settlementSnapshot?.settlementId, "settlement:run_ending:doom:8");
  assert.equal(normalized.endingSettlementSnapshot?.settlementId, "settlement:run_ending:doom:8");
});

test("normalizeRunSnapshotV2 preserves legacy chapter state and backfills director chapter", () => {
  const nowHour = Math.max(0, Math.floor(Date.now() / 3600000));
  const normalized = normalizeRunSnapshotV2({
    schemaVersion: 2,
    meta: { runId: "run_chapter_compat", worldVersion: 2, startedAt: "2026-01-01T00:00:00.000Z" },
    player: { profile: { name: "A", gender: "other", height: 170, personality: "quiet" } },
    time: { day: 1, hour: 4 },
    world: {
      storyDirector: {
        v: 1,
        arcId: "legacy_arc",
        tension: 42,
        stallCount: 1,
      },
    },
    chapterState: {
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
          narrativeCharCount: 20,
          keyChoiceCount: 1,
          completedBeatIds: [],
          stateChangeCount: 1,
          lastObjectiveText: "Follow the echo behind the door.",
        },
      },
      summariesByChapterId: {},
      lastChapterEndAt: null,
      pendingChapterEndId: null,
    },
    memory: {
      spine: {
        v: 1,
        entries: [
          {
            id: "legacy_memory_without_chapter",
            kind: "hook",
            scope: "run_private",
            summary: "A legacy hook without chapter fields.",
            salience: 0.8,
            confidence: 0.9,
            status: "active",
            createdAtHour: nowHour,
            lastTouchedAtHour: nowHour,
            ttlHours: 72,
            mergeKey: "legacy:hook",
            anchors: {},
            recallTags: ["hook"],
            source: "system_hook",
            promoteToLore: false,
          },
        ],
      },
    },
  });
  const director = normalized.world.storyDirector as any;
  assert.equal(normalized.chapterState?.activeChapterId, "chapter-2");
  assert.equal(director.arcId, "legacy_arc");
  assert.equal(director.chapter.currentChapterId, "chapter-2");
  assert.equal(director.chapter.chapterOrder, 2);
  assert.equal(director.chapter.mainQuestion, "Follow the echo behind the door.");
  const memory = normalized.memory?.spine.entries.find((entry) => entry.id === "legacy_memory_without_chapter");
  assert.ok(memory);
  assert.equal(memory!.chapterId, undefined);
  assert.equal(memory!.chapterOrder, undefined);
});

test("snapshot projection keeps legacy surface usable", () => {
  const snapshot = buildRunSnapshotV2({
    player: { name: "B", gender: "女", height: 165, personality: "稳重" },
    stats: { sanity: 9, agility: 2, luck: 2, charm: 2, background: 2 },
    originium: 10,
    inventory: [],
    warehouse: [],
    codex: {},
    currentLocation: "B1_SafeZone",
    alive: true,
    day: 0,
    hour: 1,
    dynamicNpcStates: { "N-001": { currentLocation: "1F_Lobby", isAlive: true } },
    homeSeed: { "N-001": "1F_Lobby" },
    tasks: [],
  });
  const legacy = projectSnapshotToLegacy(snapshot);
  assert.equal(legacy.playerName, "B");
  assert.equal(legacy.playerLocation, "B1_SafeZone");
  assert.equal(legacy.stats?.sanity, 9);
  assert.equal(legacy.dynamicNpcStates?.["N-001"]?.isAlive, true);
});

test("profession state migration/persistence keeps certification fields", () => {
  const normalized = normalizeRunSnapshotV2({
    schemaVersion: 2,
    meta: { runId: "run_prof", worldVersion: 2, startedAt: "2026-01-01T00:00:00.000Z" },
    player: { profile: { name: "A", gender: "男", height: 170, personality: "冷静" } },
    time: { day: 2, hour: 12 },
    profession: {
      currentProfession: "守灯人",
      unlockedProfessions: ["守灯人"],
      eligibilityByProfession: {
        守灯人: true,
        巡迹客: false,
        觅兆者: false,
        齐日角: false,
        溯源师: false,
      },
      progressByProfession: {
        守灯人: { statQualified: true, behaviorQualified: true, behaviorEvidenceCount: 2, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_lampkeeper", trialTaskCompleted: true, certified: true },
        巡迹客: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_pathfinder", trialTaskCompleted: false, certified: false },
        觅兆者: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_omenseeker", trialTaskCompleted: false, certified: false },
        齐日角: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_sunhorn", trialTaskCompleted: false, certified: false },
        溯源师: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "prof_trial_traceorigin", trialTaskCompleted: false, certified: false },
      },
      activePerks: ["perk.lampkeeper.threat_telegraph"],
      professionFlags: { "profession.certified.守灯人": true },
      professionCooldowns: { switchProfession: 99 },
    },
  });
  const legacy = projectSnapshotToLegacy(normalized);
  assert.equal(legacy.professionState?.currentProfession, "守灯人");
  assert.equal(legacy.professionState?.progressByProfession["守灯人"]?.trialTaskCompleted, true);
  assert.equal(legacy.professionState?.professionFlags?.["profession.certified.守灯人"], true);
});
