/**
 * 从 NPC 行 + 可选 NpcProfileV2 构建权威身份卡，并在构建期执行世界观硬规则纠偏。
 */

import type { NPC } from "./types";
import type {
  CanonicalGender,
  NpcAgeBand,
  NpcCanonicalIdentity,
  NpcMemoryPrivilege,
  NpcPlayerRecognitionMode,
  NpcProfileV2,
  NpcStudentAffinityType,
} from "./types";
import { MAJOR_NPC_IDS, type MajorNpcId } from "./majorNpcDeepCanon";
import { MAJOR_NPC_DEEP_CANON } from "./majorNpcDeepCanon";
import { REVEAL_TIER_RANK, type RevealTierRank } from "./revealTierRank";

export const DEFAULT_BASELINE_VIEW_OF_PLAYER =
  "受空间碎片影响、误闯诡异公寓的学生之一；非天选唯一身份，默认与本人无旧识。";

const BASE_ANTI_FABRICATION: readonly string[] = [
  "禁止编造未在注册表出现的道具 ID、诡异编号、楼层节点与服务名。",
  "对白代词、称谓与性别表现必须与本卡 canonicalGender、canonicalAddressing 一致。",
  "不得把情绪残响写成可核对的具体记忆或秘密命题。",
];

export const XINLAN_NPC_ID = "N-010";
export const NIGHT_READER_NPC_ID = "N-011";

const loggedGenderFallback = new Set<string>();
const loggedLocationWarnings = new Set<string>();

export function logCanonGenderFallback(npcId: string, reason: string): void {
  const k = `${npcId}:${reason}`;
  if (loggedGenderFallback.has(k)) return;
  loggedGenderFallback.add(k);
  console.warn(`[npcCanon] gender_fallback npcId=${npcId} ${reason}`);
}

export function logCanonLocationWarning(npcId: string, detail: string): void {
  const k = `${npcId}:${detail}`;
  if (loggedLocationWarnings.has(k)) return;
  loggedLocationWarnings.add(k);
  console.warn(`[npcCanon] location_resolve npcId=${npcId} ${detail}`);
}

export function logCanonBuildError(detail: string): void {
  console.error(`[npcCanon] build_error ${detail}`);
}

function isMajorCharmId(npcId: string): boolean {
  return MAJOR_NPC_IDS.includes(npcId as MajorNpcId);
}

export function resolveMemoryPrivilegeForNpcId(npcId: string): NpcMemoryPrivilege {
  if (npcId === XINLAN_NPC_ID) return "xinlan";
  if (npcId === NIGHT_READER_NPC_ID) return "night_reader";
  if (isMajorCharmId(npcId)) return "major_charm";
  return "normal";
}

export function clampPlayerRecognitionMode(
  privilege: NpcMemoryPrivilege,
  mode: NpcPlayerRecognitionMode
): NpcPlayerRecognitionMode {
  if (privilege === "normal") {
    if (mode === "familiar_pull" || mode === "exact_knowledge") {
      logCanonBuildError(
        `clamp: normal NPC cannot use ${mode}; downgraded to emotional_residue`
      );
      return "emotional_residue";
    }
    return mode;
  }
  if (privilege === "major_charm" || privilege === "night_reader") {
    if (mode === "exact_knowledge") {
      logCanonBuildError(`clamp: ${privilege} cannot use exact_knowledge; downgraded to familiar_pull`);
      return "familiar_pull";
    }
    return mode;
  }
  return mode;
}

export function defaultPlayerRecognitionMode(privilege: NpcMemoryPrivilege): NpcPlayerRecognitionMode {
  switch (privilege) {
    case "xinlan":
      return "exact_knowledge";
    case "night_reader":
    case "major_charm":
      return "familiar_pull";
    case "normal":
      return "none";
    default:
      return "none";
  }
}

export function resolveRevealTierCap(
  privilege: NpcMemoryPrivilege,
  npcId: string
): RevealTierRank {
  if (privilege === "xinlan") return REVEAL_TIER_RANK.abyss;
  if (privilege === "major_charm") return REVEAL_TIER_RANK.abyss;
  if (privilege === "night_reader") return REVEAL_TIER_RANK.deep;
  if (npcId === "N-019") return REVEAL_TIER_RANK.deep;
  return REVEAL_TIER_RANK.fracture;
}

function studentAffinityFor(privilege: NpcMemoryPrivilege, npcId: string): NpcStudentAffinityType {
  if (npcId === XINLAN_NPC_ID) return "xinlan_anchor";
  if (npcId === NIGHT_READER_NPC_ID) return "night_reader_observer";
  if (privilege === "major_charm") return "major_anchor_resonant";
  if (privilege === "normal") {
    if (npcId === "N-004" || npcId === "N-009") return "child_wanderer";
    if (npcId === "N-008" || npcId === "N-014") return "service_staff";
    if (npcId === "N-018") return "edge_merchant";
    return "surface_stranger_student";
  }
  return "surface_stranger_student";
}

/** 显式性别表：缺失时降级 unknown 并记日志（禁止模型自由发挥） */
const CANON_GENDER: Record<string, CanonicalGender> = {
  "N-001": "female",
  "N-002": "female",
  "N-003": "male",
  "N-004": "female",
  "N-005": "male",
  "N-006": "male",
  "N-007": "female",
  "N-008": "male",
  "N-009": "group",
  "N-010": "female",
  "N-011": "male",
  "N-012": "male",
  "N-013": "male",
  "N-014": "female",
  "N-015": "male",
  "N-016": "male",
  "N-017": "female",
  "N-018": "male",
  "N-019": "male",
  "N-020": "female",
};

const AGE_BAND: Record<string, NpcAgeBand> = {
  "N-001": "elder",
  "N-002": "young_adult",
  "N-003": "middle",
  "N-004": "child",
  "N-005": "middle",
  "N-006": "elder",
  "N-007": "young_adult",
  "N-008": "middle",
  "N-009": "child",
  "N-010": "young_adult",
  "N-011": "elder",
  "N-012": "middle",
  "N-013": "teen",
  "N-014": "middle",
  "N-015": "young_adult",
  "N-016": "young_adult",
  "N-017": "middle",
  "N-018": "young_adult",
  "N-019": "middle",
  "N-020": "teen",
};

const ADDRESSING: Record<string, string> = {
  "N-001": "第三人称「她」；可称婆婆，不预设与玩家有亲缘。",
  "N-002": "第三人称「她」；称林医生，保持医患距离。",
  "N-003": "第三人称「他」；邮差/老王。",
  "N-004": "第三人称「她」；女童，不写成少年。",
  "N-005": "第三人称「他」；盲人/先生。",
  "N-006": "第三人称「他」；张先生。",
  "N-007": "第三人称「她」；单名「叶」或叶同学（不默认同校旧识）。",
  "N-008": "第三人称「他」；电工老刘。",
  "N-009": "第三人称「她们」复数；双胞胎，不拆成单人。",
  "N-010": "第三人称「她」；欣蓝；可物业/登记员口吻。",
  "N-011": "第三人称「他」；夜读老人。",
  "N-012": "第三人称「他」；厨师。",
  "N-013": "第三人称「他」；枫。",
  "N-014": "第三人称「她」；洗衣房阿姨。",
  "N-015": "第三人称「他」；麟泽。",
  "N-016": "第三人称「他」；年轻男性。",
  "N-017": "第三人称「她」；保洁员。",
  "N-018": "第三人称「他」；北夏。",
  "N-019": "第三人称「他」；前调查员。",
  "N-020": "第三人称「她」；灵伤。",
};

function appearanceShort(appearance: string): string {
  const t = appearance.trim();
  if (t.length <= 80) return t;
  return `${t.slice(0, 77)}…`;
}

function deepRoleFromMajor(npcId: string): string | null {
  const entry = MAJOR_NPC_DEEP_CANON[npcId as MajorNpcId];
  if (!entry) return null;
  return `${entry.publicMaskRole}（深层：${entry.schoolIdentity.slice(0, 120)}）`;
}

function fragmentSchoolLineForNpc(npcId: string, privilege: NpcMemoryPrivilege): string {
  if (privilege === "xinlan") {
    return "耶里档案干事与旧七人牵引残留；真相须分层揭露，禁止单回合说尽根因与七锚链。";
  }
  if (privilege === "major_charm") {
    const d = deepRoleFromMajor(npcId);
    return d ?? "校源徘徊者：仅允许按 reveal 档位逐步露出，不得编造未许可的校籍与闭环细节。";
  }
  if (privilege === "night_reader") {
    return "可读公寓表层秩序与消化日志式观察；不自动获得周目真相与校源全图。";
  }
  return "无校源深层叙事权限：不得编造耶里校籍、七锚与闭环机制细节。";
}

function surfaceIdentity(npc: NPC): string {
  return `${npc.location} · ${npc.specialty}（性格：${npc.personality}）`;
}

function speechFromV2(v2: NpcProfileV2 | null, npc: NPC): string {
  return v2?.interaction.speechPattern?.trim() || `说话贴合「${npc.personality}」，不抢跑校源设定。`;
}

export function normalizeLocationKey(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function locationsMatch(a: string, b: string): boolean {
  const x = normalizeLocationKey(a).toLowerCase();
  const y = normalizeLocationKey(b).toLowerCase();
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return false;
}

export function buildAllowedSpawnLocations(npc: NPC, canonicalHome: string): readonly string[] {
  const set = new Set<string>();
  set.add(normalizeLocationKey(canonicalHome));
  set.add(normalizeLocationKey(npc.location));
  if (npc.floor === "random") {
    set.add("各楼层");
    set.add("各楼层信箱区");
    set.add("B1");
    set.add("1");
    set.add("2");
    set.add("3");
    set.add("4");
    set.add("5");
    set.add("6");
    set.add("7");
  }
  if (npc.id === "N-018") {
    set.add("1F_GuardRoom");
  }
  return [...set];
}

export type RuntimeLocationResolveResult = {
  ok: boolean;
  runtimeLocation: string;
  correctedTo: string | null;
  warning: string | null;
};

/**
 * 若 runtime 不在白名单：回退到 canonicalHomeLocation 并打 warning（权威纠偏）。
 */
export function resolveNpcRuntimeLocation(args: {
  npcId: string;
  canonicalHomeLocation: string;
  allowedSpawnLocations: readonly string[];
  runtimeLocation: string | null | undefined;
}): RuntimeLocationResolveResult {
  const home = normalizeLocationKey(args.canonicalHomeLocation);
  const raw = args.runtimeLocation?.trim();
  if (!raw) {
    return { ok: true, runtimeLocation: home, correctedTo: null, warning: null };
  }
  const rt = normalizeLocationKey(raw);
  const allowed = args.allowedSpawnLocations.some((loc) => locationsMatch(rt, loc));
  if (allowed) {
    return { ok: true, runtimeLocation: rt, correctedTo: null, warning: null };
  }
  const msg = `runtime="${rt}" not in allowed list; corrected to canonical home="${home}"`;
  logCanonLocationWarning(args.npcId, msg);
  return {
    ok: false,
    runtimeLocation: home,
    correctedTo: home,
    warning: msg,
  };
}

export function canonicalGenderOrFallback(npcId: string): CanonicalGender {
  const g = CANON_GENDER[npcId];
  if (g) return g;
  logCanonGenderFallback(npcId, "missing_CANON_GENDER");
  return "unknown";
}

export function assertValidIdentityForBuild(card: NpcCanonicalIdentity): void {
  if (card.memoryPrivilege === "normal") {
    if (card.playerRecognitionMode === "exact_knowledge" || card.playerRecognitionMode === "familiar_pull") {
      throw new Error(
        `[npcCanon] invalid build: ${card.npcId} normal NPC has ${card.playerRecognitionMode}`
      );
    }
  }
  if (card.memoryPrivilege === "major_charm" || card.memoryPrivilege === "night_reader") {
    if (card.playerRecognitionMode === "exact_knowledge") {
      throw new Error(
        `[npcCanon] invalid build: ${card.npcId} ${card.memoryPrivilege} has exact_knowledge`
      );
    }
  }
  if (!card.baselineViewOfPlayer?.trim()) {
    throw new Error(`[npcCanon] invalid build: ${card.npcId} missing baselineViewOfPlayer`);
  }
}

export function buildCanonicalIdentityCard(npc: NPC, profileV2: NpcProfileV2 | null): NpcCanonicalIdentity {
  const id = npc.id;
  const priv = resolveMemoryPrivilegeForNpcId(id);
  const home = profileV2?.homeNode?.trim() || npc.location;
  let recognition = defaultPlayerRecognitionMode(priv);
  recognition = clampPlayerRecognitionMode(priv, recognition);

  const gender = canonicalGenderOrFallback(id);
  const revealCap = resolveRevealTierCap(priv, id);

  const canKnowIdentity = priv === "xinlan";
  const canKnowLoop = priv === "xinlan";

  const deep = deepRoleFromMajor(id);
  const deepRole =
    deep ??
    (npc.lore.length > 120 ? npc.lore.slice(0, 118) + "…" : npc.lore);

  const card: NpcCanonicalIdentity = {
    npcId: id,
    canonicalName: npc.name,
    canonicalGender: gender,
    canonicalAddressing: ADDRESSING[id] ?? "第三人称与称谓须与本卡一致；不预设与玩家旧识。",
    ageBand: AGE_BAND[id] ?? "ambiguous",
    studentAffinityType: studentAffinityFor(priv, id),
    apartmentSurfaceIdentity: surfaceIdentity(npc),
    fragmentSchoolIdentity: fragmentSchoolLineForNpc(id, priv),
    canonicalAppearanceShort: appearanceShort(npc.appearance),
    canonicalAppearanceLong: npc.appearance,
    canonicalPersonalityCore: npc.personality,
    canonicalSpeechCore: speechFromV2(profileV2, npc),
    canonicalPublicRole: npc.specialty,
    canonicalDeepRole: deepRole,
    canonicalHomeLocation: normalizeLocationKey(home),
    allowedSpawnLocations: buildAllowedSpawnLocations(npc, home),
    memoryPrivilege: priv,
    playerRecognitionMode: recognition,
    baselineViewOfPlayer: DEFAULT_BASELINE_VIEW_OF_PLAYER,
    canKnowPlayerCoreIdentity: canKnowIdentity,
    canKnowLoopTruth: canKnowLoop,
    revealTierCap: revealCap,
    antiFabricationHints: [...BASE_ANTI_FABRICATION, `本卡 npcId=${id}；特权=${priv}。`],
  };

  assertValidIdentityForBuild(card);
  return card;
}
