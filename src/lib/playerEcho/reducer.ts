import type {
  EchoFragment,
  EchoFragmentAnchors,
  EchoFragmentStatus,
} from "./types";
import type {
  EchoFragmentType,
  EchoSafetyLevel,
  EchoTargetType,
  NpcEchoBond,
  PlayerEchoCanon,
} from "./types";

type UnknownRecord = Record<string, unknown>;
type PlayerEchoCandidatesInput = Partial<PlayerEchoCanon> | EchoFragment[] | null | undefined;

const EMPTY_CANON: PlayerEchoCanon = {
  schema: "player_echo_canon_v1",
  version: 1,
  playerKey: null,
  worldId: null,
  loopCount: 0,
  fragments: [],
  npcBonds: [],
  strongestChoices: [],
  unresolvedRegrets: [],
  repeatedDeathCauses: [],
  stableEchoSummary: null,
  lastRunSummary: null,
  updatedAt: null,
};

const FRAGMENT_TYPES = new Set<EchoFragmentType>([
  "death",
  "ending",
  "npc_bond",
  "betrayal",
  "rescue",
  "truth_glimpse",
  "promise",
  "debt",
  "relationship_shift",
  "death_mark",
  "route_hint",
  "danger_hint",
  "secret_fragment",
  "escape_condition",
  "hook",
  "npc_attitude",
]);

const TARGET_TYPES = new Set<EchoTargetType>([
  "npc",
  "location",
  "floor",
  "task",
  "item",
  "world",
  "route",
  "anomaly",
  "global",
]);
const STATUSES = new Set<EchoFragmentStatus>(["active", "consumed", "expired"]);
const SAFETY_LEVELS = new Set<EchoSafetyLevel>([0, 1, 2, 3, 4]);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length <= maxChars ? s : s.slice(0, maxChars);
}

function cleanNullableString(value: unknown, maxChars: number): string | null {
  const s = cleanString(value, maxChars);
  return s ? s : null;
}

function clamp01(value: unknown, fallback: number): number | null {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function cleanList(value: unknown, cap: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const s = cleanString(item, maxChars);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function cleanAnchors(value: unknown): EchoFragmentAnchors | undefined {
  if (!isRecord(value)) return undefined;
  const anchors: EchoFragmentAnchors = {
    npcIds: cleanList(value.npcIds, 8, 40),
    locationIds: cleanList(value.locationIds, 8, 80),
    floorIds: cleanList(value.floorIds, 6, 16),
    taskIds: cleanList(value.taskIds, 8, 80),
    itemIds: cleanList(value.itemIds, 8, 80),
    worldFlags: cleanList(value.worldFlags, 8, 80),
    keywords: cleanList(value.keywords, 8, 40),
  };
  return Object.values(anchors).some((items) => Array.isArray(items) && items.length > 0) ? anchors : undefined;
}

function stableHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function fragmentMergeKey(fragment: EchoFragment): string {
  return `${fragment.type}|${fragment.targetType}|${fragment.targetId ?? ""}`;
}

function scoreFragment(fragment: EchoFragment): number {
  return fragment.emotionalWeight * 0.45 + fragment.salience * 0.35 + fragment.confidence * 0.2;
}

function normalizeFragment(input: unknown): EchoFragment | null {
  if (!isRecord(input)) return null;
  const summary = cleanString(input.summary, 240);
  if (!summary) return null;

  const type = FRAGMENT_TYPES.has(input.type as EchoFragmentType) ? (input.type as EchoFragmentType) : null;
  if (!type) return null;

  const targetType = TARGET_TYPES.has(input.targetType as EchoTargetType)
    ? (input.targetType as EchoTargetType)
    : null;
  if (!targetType) return null;

  const rawSafety = Number(input.safetyLevel ?? 1);
  if (!Number.isInteger(rawSafety) || !SAFETY_LEVELS.has(rawSafety as EchoSafetyLevel)) return null;

  const emotionalWeight = clamp01(input.emotionalWeight, 0.5);
  if (emotionalWeight === null) return null;

  const salience = clamp01(input.salience, 0.5);
  if (salience === null) return null;
  const confidence = clamp01(input.confidence, 0.7);
  if (confidence === null) return null;

  const status = STATUSES.has(input.status as EchoFragmentStatus)
    ? (input.status as EchoFragmentStatus)
    : "active";
  const targetId = cleanNullableString(input.targetId, 100);
  const id =
    cleanString(input.id, 100) ||
    `echo_${type}_${targetType}_${targetId ?? "none"}_${stableHash(summary).slice(0, 8)}`;

  const sourceLoop = Number(input.sourceLoop);
  const revealTierMin = Number(input.revealTierMin);
  const anchors = cleanAnchors(input.anchors);
  const allowedNpcPrivilege = cleanList(input.allowedNpcPrivilege, 4, 24).filter(
    (x) => x === "normal" || x === "major_charm" || x === "night_reader" || x === "xinlan"
  ) as NonNullable<EchoFragment["allowedNpcPrivilege"]>;

  return {
    id,
    type,
    targetType,
    targetId,
    summary,
    safetyLevel: rawSafety as EchoSafetyLevel,
    emotionalWeight,
    salience,
    confidence,
    status,
    ...(Number.isFinite(sourceLoop) ? { sourceLoop: Math.max(0, Math.trunc(sourceLoop)) } : {}),
    ...(cleanNullableString(input.sourceTurnId, 100) ? { sourceTurnId: cleanString(input.sourceTurnId, 100) } : {}),
    ...(anchors ? { anchors } : {}),
    ...(Number.isFinite(revealTierMin) ? { revealTierMin: Math.max(0, Math.min(4, Math.trunc(revealTierMin))) } : {}),
    ...(allowedNpcPrivilege.length > 0 ? { allowedNpcPrivilege } : {}),
    ...(typeof input.tone === "string" && input.tone.trim() ? { tone: input.tone.trim().slice(0, 40) as EchoFragment["tone"] } : {}),
  };
}

function normalizeBond(input: unknown): NpcEchoBond | null {
  if (!isRecord(input)) return null;
  const npcId = cleanString(input.npcId, 40);
  if (!npcId) return null;
  const memoryPrivilege =
    input.memoryPrivilege === "normal" ||
    input.memoryPrivilege === "major_charm" ||
    input.memoryPrivilege === "night_reader" ||
    input.memoryPrivilege === "xinlan"
      ? input.memoryPrivilege
      : "normal";
  const recognitionMode =
    input.recognitionMode === "none" ||
    input.recognitionMode === "emotional_residue" ||
    input.recognitionMode === "familiar_pull" ||
    input.recognitionMode === "exact_knowledge"
      ? input.recognitionMode
      : "none";
  const bondScore = clamp01(input.bondScore, 0);
  if (bondScore === null) return null;
  const lastEchoedAtLoop = Number(input.lastEchoedAtLoop);
  const cooldownTurns = Number(input.cooldownTurns);
  return {
    npcId,
    memoryPrivilege,
    recognitionMode,
    bondScore,
    fragmentIds: cleanList(input.fragmentIds, 12, 100),
    ...(Number.isFinite(lastEchoedAtLoop) ? { lastEchoedAtLoop: Math.max(0, Math.trunc(lastEchoedAtLoop)) } : {}),
    ...(Number.isFinite(cooldownTurns) ? { cooldownTurns: Math.max(0, Math.min(999, Math.trunc(cooldownTurns))) } : {}),
  };
}

function mergeTextLists(a: string[], b: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...a, ...b]) {
    const s = cleanString(item, 120);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function mergeFragments(prev: EchoFragment[], next: EchoFragment[]): EchoFragment[] {
  const byKey = new Map<string, EchoFragment>();
  for (const fragment of [...prev, ...next]) {
    const key = fragmentMergeKey(fragment);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, fragment);
      continue;
    }
    const keepNext = scoreFragment(fragment) > scoreFragment(existing);
    const base = keepNext ? fragment : existing;
    const other = keepNext ? existing : fragment;
    byKey.set(key, {
      ...base,
      emotionalWeight: Math.max(base.emotionalWeight, other.emotionalWeight),
      salience: Math.max(base.salience, other.salience),
      confidence: Math.max(base.confidence, other.confidence),
      safetyLevel: Math.max(base.safetyLevel, other.safetyLevel) as EchoSafetyLevel,
      summary: base.summary || other.summary,
      anchors: base.anchors ?? other.anchors,
    });
  }
  return [...byKey.values()]
    .filter((fragment) => fragment.status !== "expired")
    .sort((a, b) => scoreFragment(b) - scoreFragment(a))
    .slice(0, 80);
}

function mergeBonds(prev: NpcEchoBond[], next: NpcEchoBond[]): NpcEchoBond[] {
  const byNpc = new Map<string, NpcEchoBond>();
  for (const bond of [...prev, ...next]) {
    const existing = byNpc.get(bond.npcId);
    if (!existing) {
      byNpc.set(bond.npcId, bond);
      continue;
    }
    byNpc.set(bond.npcId, {
      ...existing,
      memoryPrivilege: bond.memoryPrivilege,
      recognitionMode: bond.recognitionMode,
      bondScore: Math.max(existing.bondScore, bond.bondScore),
      fragmentIds: mergeTextLists(existing.fragmentIds, bond.fragmentIds, 12),
      lastEchoedAtLoop: Math.max(existing.lastEchoedAtLoop ?? 0, bond.lastEchoedAtLoop ?? 0) || undefined,
      cooldownTurns: Math.max(existing.cooldownTurns ?? 0, bond.cooldownTurns ?? 0) || undefined,
    });
  }
  return [...byNpc.values()].slice(0, 40);
}

function normalizeCanonFields(input: unknown): PlayerEchoCanon {
  if (!isRecord(input)) return { ...EMPTY_CANON, fragments: [], npcBonds: [] };
  const loopCount = Number(input.loopCount);
  return {
    schema: "player_echo_canon_v1",
    version: 1,
    playerKey: cleanNullableString(input.playerKey, 120),
    worldId: cleanNullableString(input.worldId, 120),
    loopCount: Number.isFinite(loopCount) ? Math.max(0, Math.min(9999, Math.trunc(loopCount))) : 0,
    fragments: Array.isArray(input.fragments) ? input.fragments.map(normalizeFragment).filter(Boolean) : [],
    npcBonds: Array.isArray(input.npcBonds) ? input.npcBonds.map(normalizeBond).filter(Boolean) : [],
    strongestChoices: cleanList(input.strongestChoices, 8, 120),
    unresolvedRegrets: cleanList(input.unresolvedRegrets, 8, 120),
    repeatedDeathCauses: cleanList(input.repeatedDeathCauses, 6, 120),
    stableEchoSummary: cleanNullableString(input.stableEchoSummary, 240),
    lastRunSummary: cleanNullableString(input.lastRunSummary, 240),
    updatedAt: cleanNullableString(input.updatedAt, 80),
  };
}

export function normalizePlayerEchoCanon(input: unknown): PlayerEchoCanon {
  const canon = normalizeCanonFields(input);
  return {
    ...canon,
    fragments: mergeFragments([], canon.fragments),
    npcBonds: mergeBonds([], canon.npcBonds),
  };
}

export function reducePlayerEchoCandidates(
  prev: PlayerEchoCanon | null | undefined,
  candidates: PlayerEchoCandidatesInput
): PlayerEchoCanon {
  const base = normalizePlayerEchoCanon(prev);
  const incoming = Array.isArray(candidates)
    ? normalizeCanonFields({ fragments: candidates })
    : normalizeCanonFields(candidates);

  return {
    schema: "player_echo_canon_v1",
    version: 1,
    playerKey: incoming.playerKey ?? base.playerKey,
    worldId: incoming.worldId ?? base.worldId,
    loopCount: Math.max(base.loopCount, incoming.loopCount),
    fragments: mergeFragments(base.fragments, incoming.fragments),
    npcBonds: mergeBonds(base.npcBonds, incoming.npcBonds),
    strongestChoices: mergeTextLists(base.strongestChoices, incoming.strongestChoices, 8),
    unresolvedRegrets: mergeTextLists(base.unresolvedRegrets, incoming.unresolvedRegrets, 8),
    repeatedDeathCauses: mergeTextLists(base.repeatedDeathCauses, incoming.repeatedDeathCauses, 6),
    stableEchoSummary: incoming.stableEchoSummary ?? base.stableEchoSummary,
    lastRunSummary: incoming.lastRunSummary ?? base.lastRunSummary,
    updatedAt: incoming.updatedAt ?? base.updatedAt,
  };
}
