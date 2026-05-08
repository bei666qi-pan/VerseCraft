import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import type {
  NpcFirstEncounterEchoPlan,
  PlayerEchoCanon,
  PlayerEchoSelectionContext,
} from "@/lib/playerEcho/types";

export const PLAYER_ECHO_EVAL_CANON: PlayerEchoCanon = {
  schema: "player_echo_canon_v1",
  version: 1,
  playerKey: "eval-player",
  worldId: "dark_moon_prologue",
  loopCount: 4,
  fragments: [
    {
      id: "xinlan-register-pause",
      type: "promise",
      targetType: "npc",
      targetId: "N-010",
      summary: "登记册前的停顿只能写成名单牵引，不能说破根因",
      safetyLevel: 2,
      emotionalWeight: 0.92,
      salience: 0.96,
      confidence: 0.86,
      status: "active",
      anchors: { npcIds: ["N-010"], locationIds: ["B1_SafeZone"], keywords: ["欣蓝", "登记"] },
      allowedNpcPrivilege: ["xinlan"],
      tone: "xinlan_anchor",
    },
    {
      id: "xinlan-last-route",
      type: "relationship_shift",
      targetType: "npc",
      targetId: "N-010",
      summary: "上一轮的信任只能留下熟悉感，不得变成旧友确认",
      safetyLevel: 2,
      emotionalWeight: 0.88,
      salience: 0.9,
      confidence: 0.8,
      status: "active",
      anchors: { npcIds: ["N-010"], keywords: ["信任", "旧友"] },
      allowedNpcPrivilege: ["xinlan"],
      tone: "familiar_pull",
    },
    {
      id: "night-reader-page-loop",
      type: "truth_glimpse",
      targetType: "npc",
      targetId: "N-011",
      summary: "夜读老人只能用书页重读隐喻暗示残响",
      safetyLevel: 3,
      emotionalWeight: 0.72,
      salience: 0.84,
      confidence: 0.78,
      status: "active",
      anchors: { npcIds: ["N-011"], locationIds: ["7F_Corridor"], floorIds: ["7F"], keywords: ["夜读老人", "书页"] },
      allowedNpcPrivilege: ["night_reader"],
      tone: "page_metaphor",
    },
    {
      id: "normal-resident-unease",
      type: "danger_hint",
      targetType: "npc",
      targetId: "N-001",
      summary: "普通住户只能有陌生感里的轻微迟疑",
      safetyLevel: 1,
      emotionalWeight: 0.42,
      salience: 0.58,
      confidence: 0.72,
      status: "active",
      anchors: { npcIds: ["N-001"], locationIds: ["B1_SafeZone"], keywords: ["迟疑"] },
      allowedNpcPrivilege: ["normal"],
      tone: "unease",
    },
    {
      id: "deep-truth-hard-gate",
      type: "truth_glimpse",
      targetType: "world",
      targetId: "loop-root",
      summary: "深层真相只可在足够揭露等级下进入残响",
      safetyLevel: 4,
      emotionalWeight: 0.95,
      salience: 0.95,
      confidence: 0.9,
      status: "active",
      anchors: { npcIds: ["N-010"], keywords: ["循环真相", "七锚闭环"] },
      revealTierMin: REVEAL_TIER_RANK.abyss,
      allowedNpcPrivilege: ["xinlan"],
      tone: "cold_hint",
    },
  ],
  npcBonds: [
    {
      npcId: "N-010",
      memoryPrivilege: "xinlan",
      recognitionMode: "exact_knowledge",
      bondScore: 0.9,
      fragmentIds: ["xinlan-register-pause", "xinlan-last-route", "deep-truth-hard-gate"],
    },
    {
      npcId: "N-011",
      memoryPrivilege: "night_reader",
      recognitionMode: "familiar_pull",
      bondScore: 0.72,
      fragmentIds: ["night-reader-page-loop"],
    },
    {
      npcId: "N-001",
      memoryPrivilege: "normal",
      recognitionMode: "none",
      bondScore: 0.38,
      fragmentIds: ["normal-resident-unease"],
    },
  ],
  strongestChoices: ["没有把欣蓝的停顿写成官方事实"],
  unresolvedRegrets: ["七楼门缝后的回声仍未确认"],
  repeatedDeathCauses: ["高处坠落"],
  stableEchoSummary: "玩家残响只允许形成短促错觉、隐喻或停顿，不覆盖当前周目事实。",
  lastRunSummary: "上一轮在登记册前停住，没有说出根因。",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

export type PlayerEchoEvalPromptCase = {
  id: string;
  activeNpcId: string;
  context: PlayerEchoSelectionContext;
};

export const PLAYER_ECHO_PROMPT_CASES: PlayerEchoEvalPromptCase[] = [
  {
    id: "xinlan_strong_pause",
    activeNpcId: "N-010",
    context: {
      activeNpcId: "N-010",
      presentNpcIds: ["N-010"],
      locationId: "B1_SafeZone",
      floorId: "B1",
      latestUserInput: "我问欣蓝，她为什么在登记册前停住？",
      revealTier: REVEAL_TIER_RANK.deep,
      npcMemoryPrivilegeById: { "N-010": "xinlan" },
    },
  },
  {
    id: "night_reader_metaphor",
    activeNpcId: "N-011",
    context: {
      activeNpcId: "N-011",
      presentNpcIds: ["N-011"],
      locationId: "7F_Corridor",
      floorId: "7F",
      latestUserInput: "我提到夜读老人手里的书页。",
      revealTier: REVEAL_TIER_RANK.deep,
      npcMemoryPrivilegeById: { "N-011": "night_reader" },
    },
  },
  {
    id: "normal_resident_first_meet",
    activeNpcId: "N-001",
    context: {
      activeNpcId: "N-001",
      presentNpcIds: ["N-001"],
      locationId: "B1_SafeZone",
      floorId: "B1",
      latestUserInput: "我看向旁边那个普通住户。",
      revealTier: REVEAL_TIER_RANK.surface,
      npcMemoryPrivilegeById: { "N-001": "normal" },
    },
  },
];

export type PlayerEchoEvalValidatorCase = {
  id: string;
  actorNpcId: string;
  narrative: string;
  maxRevealRank: number;
  playerEchoPacketPresent: boolean;
  expectRewrite: boolean;
};

export const PLAYER_ECHO_VALIDATOR_CASES: PlayerEchoEvalValidatorCase[] = [
  {
    id: "normal_old_friend_rewrite",
    actorNpcId: "N-001",
    narrative: "普通住户说：“你又来了，我记得你上次死在七楼。”",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerEchoPacketPresent: true,
    expectRewrite: true,
  },
  {
    id: "xinlan_allowed_pause",
    actorNpcId: "N-010",
    narrative: "欣蓝在登记册前停顿了一下，像是被名单牵引，但她没有说破。",
    maxRevealRank: REVEAL_TIER_RANK.deep,
    playerEchoPacketPresent: true,
    expectRewrite: false,
  },
  {
    id: "night_reader_allowed_metaphor",
    actorNpcId: "N-011",
    narrative: "夜读老人按住书页，像按住一处反复渗出的墨迹。",
    maxRevealRank: REVEAL_TIER_RANK.deep,
    playerEchoPacketPresent: true,
    expectRewrite: false,
  },
  {
    id: "low_reveal_loop_truth_rewrite",
    actorNpcId: "N-010",
    narrative: "欣蓝说：“循环真相就是七锚闭环，B2 真相已经写出校源根因。”",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerEchoPacketPresent: true,
    expectRewrite: true,
  },
];

export function minimalFirstEncounterPlan(overrides: Partial<NpcFirstEncounterEchoPlan>): NpcFirstEncounterEchoPlan {
  return {
    schema: "npc_first_encounter_echo_plan_v1",
    activeNpcId: null,
    npcId: null,
    memoryPrivilege: "unknown",
    intensity: "none",
    strength: "none",
    allowedForms: [],
    forbiddenClaims: [
      "explicit_previous_run_memory",
      "loop_truth_full_reveal",
      "exact_death_recall",
      "canon_override",
    ],
    allowExplicitLoopMemory: false,
    revealTier: REVEAL_TIER_RANK.surface,
    safetyLevelCap: 3,
    styleHint: null,
    reason: null,
    ...overrides,
  };
}
