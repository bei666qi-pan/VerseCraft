import test from "node:test";
import assert from "node:assert/strict";
import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import {
  computeNpcFirstEncounterEchoPlan,
  inferCurrentRunNpcDiscovered,
} from "@/lib/playerEcho/npcFirstEncounter";
import type { NpcCanonicalIdentity, NpcMemoryPrivilege, NpcPlayerRecognitionMode } from "@/lib/registry/types";
import type { PlayerEchoCanon } from "@/lib/playerEcho/types";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";

function identity(overrides: Partial<NpcCanonicalIdentity>): NpcCanonicalIdentity {
  const memoryPrivilege = overrides.memoryPrivilege ?? "normal";
  const playerRecognitionMode: NpcPlayerRecognitionMode =
    memoryPrivilege === "normal" ? "none" : memoryPrivilege === "xinlan" ? "exact_knowledge" : "familiar_pull";
  return {
    npcId: "N-020",
    canonicalName: "普通住户",
    canonicalGender: "female",
    canonicalAddressing: "第三人称",
    ageBand: "young_adult",
    studentAffinityType: "surface_stranger_student",
    apartmentSurfaceIdentity: "住户",
    fragmentSchoolIdentity: "无深层权限",
    canonicalAppearanceShort: "短外貌",
    canonicalAppearanceLong: "长外貌",
    canonicalPersonalityCore: "谨慎",
    canonicalSpeechCore: "克制",
    canonicalPublicRole: "住户",
    canonicalDeepRole: "无",
    canonicalHomeLocation: "B1_SafeZone",
    allowedSpawnLocations: ["B1_SafeZone"],
    memoryPrivilege,
    playerRecognitionMode,
    baselineViewOfPlayer: "误闯学生",
    canKnowPlayerCoreIdentity: false,
    canKnowLoopTruth: false,
    revealTierCap: REVEAL_TIER_RANK.fracture,
    antiFabricationHints: [],
    ...overrides,
  };
}

function canonFor(npcId: string, memoryPrivilege: NpcMemoryPrivilege): PlayerEchoCanon {
  return {
    schema: "player_echo_canon_v1",
    version: 1,
    playerKey: null,
    worldId: "dark_moon_prologue",
    loopCount: 3,
    fragments: [
      {
        id: "echo",
        type: "relationship_shift",
        targetType: "npc",
        targetId: npcId,
        summary: "强牵引残响",
        safetyLevel: 2,
        emotionalWeight: 0.9,
        salience: 0.9,
        confidence: 0.9,
        status: "active",
        anchors: { npcIds: [npcId] },
      },
    ],
    npcBonds: [{ npcId, memoryPrivilege, recognitionMode: "familiar_pull", bondScore: 0.9, fragmentIds: ["echo"] }],
    strongestChoices: [],
    unresolvedRegrets: [],
    repeatedDeathCauses: [],
    stableEchoSummary: null,
    lastRunSummary: null,
    updatedAt: null,
  };
}

function snapshotFor(args: { npcId: string; discoveredByPlayer?: boolean; codex?: boolean }): RunSnapshotV2 {
  return {
    schemaVersion: 2,
    player: {
      codex: args.codex
        ? { [args.npcId]: { id: args.npcId, name: args.npcId, type: "npc" } }
        : {},
    },
    npcs: {
      [args.npcId]: {
        currentLocation: "B1_SafeZone",
        alive: true,
        favorability: 0,
        relationshipState: "neutral",
        inventoryHeld: [],
        taskState: "idle",
        discoveredByPlayer: Boolean(args.discoveredByPlayer),
      },
    },
  } as unknown as RunSnapshotV2;
}

test("normal NPC first encounter is none or subtle and never allows explicit previous-run memory", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({ npcId: "N-020", memoryPrivilege: "normal" }),
    echoCanon: canonFor("N-020", "normal"),
    activeNpcId: "N-020",
    currentRunDiscovered: [],
    revealTier: REVEAL_TIER_RANK.abyss,
  });

  assert.equal(["none", "subtle"].includes(plan.intensity), true);
  assert.equal(plan.strength, plan.intensity);
  assert.equal(plan.allowExplicitLoopMemory, false);
  assert.equal(plan.allowedForms.includes("registration_hesitation"), false);
  assert.equal(plan.forbiddenClaims.includes("explicit_previous_run_memory"), true);
  assert.equal(plan.styleHint, "仍当作误闯学生");
});

test("xinlan can be strong while still forbidding full loop truth reveal", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({
      npcId: "N-010",
      canonicalName: "欣蓝",
      memoryPrivilege: "xinlan",
      canKnowLoopTruth: true,
      canKnowPlayerCoreIdentity: true,
      revealTierCap: REVEAL_TIER_RANK.abyss,
    }),
    echoCanon: canonFor("N-010", "xinlan"),
    activeNpcId: "N-010",
    currentRunDiscovered: [],
    revealTier: REVEAL_TIER_RANK.deep,
  });

  assert.equal(plan.intensity, "strong");
  assert.equal(plan.allowedForms.includes("registration_hesitation"), true);
  assert.equal(plan.allowExplicitLoopMemory, false);
  assert.equal(plan.forbiddenClaims.includes("loop_truth_full_reveal"), true);
  assert.equal(plan.styleHint, "登记停顿/名单牵引但不说破");
});

test("night reader first encounter can use metaphor", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({
      npcId: "N-011",
      canonicalName: "夜读老人",
      memoryPrivilege: "night_reader",
      revealTierCap: REVEAL_TIER_RANK.deep,
    }),
    echoCanon: canonFor("N-011", "night_reader"),
    activeNpcId: "N-011",
    revealTier: REVEAL_TIER_RANK.deep,
  });

  assert.equal(plan.intensity, "noticeable");
  assert.equal(plan.allowedForms.includes("metaphor"), true);
  assert.equal(plan.styleHint, "书页/墨迹/重读隐喻");
});

test("major charm first encounter stays quiet without echo evidence", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({
      npcId: "N-015",
      canonicalName: "N-015",
      memoryPrivilege: "major_charm",
      revealTierCap: REVEAL_TIER_RANK.abyss,
    }),
    echoCanon: null,
    activeNpcId: "N-015",
    revealTier: REVEAL_TIER_RANK.surface,
  });

  assert.equal(plan.intensity, "none");
  assert.equal(plan.allowedForms.length, 0);
  assert.equal(plan.forbiddenClaims.includes("known_friend_claim"), true);
});

test("night reader without echo evidence is subtle rather than a strong first impact", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({
      npcId: "N-011",
      canonicalName: "夜读老人",
      memoryPrivilege: "night_reader",
      revealTierCap: REVEAL_TIER_RANK.deep,
    }),
    echoCanon: null,
    activeNpcId: "N-011",
    revealTier: REVEAL_TIER_RANK.deep,
  });

  assert.equal(plan.intensity, "subtle");
  assert.equal(plan.allowedForms.includes("metaphor"), true);
});

test("already discovered NPC is lowered to none", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({ npcId: "N-010", memoryPrivilege: "xinlan" }),
    echoCanon: canonFor("N-010", "xinlan"),
    activeNpcId: "N-010",
    snapshot: snapshotFor({ npcId: "N-010", discoveredByPlayer: true }),
    revealTier: REVEAL_TIER_RANK.abyss,
  });

  assert.equal(plan.intensity, "none");
  assert.equal(plan.reason, "already_discovered_in_current_run");
});

test("low reveal tier forbids safety level 4 expression", () => {
  const plan = computeNpcFirstEncounterEchoPlan({
    canonIdentity: identity({ npcId: "N-010", memoryPrivilege: "xinlan" }),
    echoCanon: canonFor("N-010", "xinlan"),
    activeNpcId: "N-010",
    revealTier: REVEAL_TIER_RANK.surface,
  });

  assert.equal(plan.safetyLevelCap, 3);
  assert.equal(plan.forbiddenClaims.includes("safety_level_4_expression"), true);
  assert.equal(plan.forbiddenClaims.includes("explicit_previous_run_memory"), true);
});

test("snapshot discoveredByPlayer has priority over codex presence", () => {
  const snapshot = snapshotFor({ npcId: "N-020", discoveredByPlayer: false, codex: true });

  assert.equal(inferCurrentRunNpcDiscovered(snapshot, "N-020"), false);
});
