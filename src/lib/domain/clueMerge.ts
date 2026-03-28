import type { ClueEntry, ClueKind, ClueVerifyState, JournalState, NarrativeEntitySource } from "./narrativeDomain";
import {
  JOURNAL_STATE_VERSION,
  createEmptyJournalState,
  mergeNarrativeTrace,
  normalizeNarrativeTrace,
} from "./narrativeDomain";

const CLUE_KINDS = new Set<ClueKind>([
  "rumor",
  "hypothesis",
  "unverified",
  "place_anomaly",
  "npc_anomaly",
  "trace",
  "dead_end",
]);

const CLUE_STATUS = new Set<ClueVerifyState>(["unknown", "pending_verify", "verified", "invalidated"]);

function asString(v: unknown, max = 400): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length <= max ? t : t.slice(0, max);
}

function asStringArray(v: unknown, max = 12): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** 无 id 时由标题+摘要生成稳定伪 id，避免重复插入 */
export function stableClueIdFromContent(title: string, detail: string): string {
  const base = `${title}::${detail}`.slice(0, 240);
  let h = 5381;
  for (let i = 0; i < base.length; i++) {
    h = Math.imul(h, 33) ^ base.charCodeAt(i);
  }
  return `clue_${(h >>> 0).toString(16)}`;
}

function normalizeKind(v: unknown): ClueKind {
  return v !== undefined && CLUE_KINDS.has(v as ClueKind) ? (v as ClueKind) : "unverified";
}

function normalizeStatus(v: unknown): ClueVerifyState {
  return v !== undefined && CLUE_STATUS.has(v as ClueVerifyState) ? (v as ClueVerifyState) : "unknown";
}

function normalizeImportance(v: unknown): 1 | 2 | 3 {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 2;
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function normalizeSource(v: unknown): NarrativeEntitySource {
  return v === "player_inferred" || v === "system" ? v : "dm";
}

function normalizeVisibility(v: unknown): "shown" | "hidden" {
  return v === "hidden" ? "hidden" : "shown";
}

const STATUS_RANK: Record<ClueVerifyState, number> = {
  unknown: 0,
  pending_verify: 1,
  verified: 3,
  invalidated: 3,
};

function mergeStatus(a: ClueVerifyState, b: ClueVerifyState, preferB: boolean): ClueVerifyState {
  if (a === b) return a;
  if (a === "verified" || a === "invalidated") {
    if (b === "verified" || b === "invalidated") return preferB ? b : a;
    return a;
  }
  if (b === "verified" || b === "invalidated") return b;
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

function uniqStrings(a: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of a) {
    const k = s.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * 将 DM 单行 clue_updates 规范为 ClueEntry；无效则返回 null（空数据保护）。
 */
export function normalizeClueDraft(raw: unknown, nowIso: string): ClueEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const title = asString(o.title ?? o.name, 120);
  const detail = asString(o.detail ?? o.content ?? o.description, 2000);
  if (!title && !detail) return null;
  const idRaw = asString(o.id, 80);
  const id = idRaw || stableClueIdFromContent(title || "untitled", detail);
  const matObj =
    typeof o.maturesToObjectiveId === "string" && o.maturesToObjectiveId.trim()
      ? o.maturesToObjectiveId.trim()
      : typeof o.matures_to_objective_id === "string" && o.matures_to_objective_id.trim()
        ? o.matures_to_objective_id.trim()
        : null;
  const trace = normalizeNarrativeTrace(o.trace);
  const row: ClueEntry = {
    id,
    title: title || "未命名线索",
    detail: detail || title,
    kind: normalizeKind(o.kind ?? o.clueKind),
    status: normalizeStatus(o.status ?? o.verifyState),
    source: normalizeSource(o.source),
    visibility: normalizeVisibility(o.visibility),
    importance: normalizeImportance(o.importance),
    relatedNpcIds: uniqStrings(asStringArray(o.relatedNpcIds ?? o.npcIds)),
    relatedLocationIds: uniqStrings(asStringArray(o.relatedLocationIds ?? o.locationIds)),
    relatedItemIds: uniqStrings(asStringArray(o.relatedItemIds ?? o.itemIds)),
    relatedObjectiveId: typeof o.relatedObjectiveId === "string" && o.relatedObjectiveId.trim()
      ? o.relatedObjectiveId.trim()
      : typeof o.objectiveId === "string" && o.objectiveId.trim()
        ? o.objectiveId.trim()
        : null,
    acquisitionSource: asString(o.acquisitionSource, 120) || "dm_turn",
    triggerSource:
      typeof o.triggerSource === "string" && o.triggerSource.trim() ? o.triggerSource.trim() : null,
    createdAt: typeof o.createdAt === "string" && o.createdAt ? o.createdAt : nowIso,
    updatedAt: nowIso,
    ...(matObj ? { maturesToObjectiveId: matObj } : {}),
    ...(trace ? { trace } : {}),
  };
  return row;
}

export function normalizeClueUpdateArray(raw: unknown, nowIso: string): ClueEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ClueEntry[] = [];
  for (const row of raw) {
    const c = normalizeClueDraft(row, nowIso);
    if (c) out.push(c);
  }
  return out;
}

/**
 * 合并线索：按 id 去重；同 id 合并数组字段并晋升 status；防止无限增长。
 */
export function mergeCluesWithDedupe(existing: ClueEntry[], incoming: ClueEntry[], maxTotal = 200): ClueEntry[] {
  const byId = new Map<string, ClueEntry>();
  for (const c of existing) {
    if (c && typeof c.id === "string" && c.id) byId.set(c.id, c);
  }
  for (const inc of incoming) {
    const prev = byId.get(inc.id);
    if (!prev) {
      byId.set(inc.id, inc);
      continue;
    }
    const preferInc = inc.updatedAt >= prev.updatedAt;
    const mergedTrace = mergeNarrativeTrace(prev.trace, inc.trace, preferInc);
    const maturesMerged = preferInc
      ? inc.maturesToObjectiveId ?? prev.maturesToObjectiveId
      : prev.maturesToObjectiveId ?? inc.maturesToObjectiveId;
    const merged: ClueEntry = {
      ...prev,
      ...inc,
      title: preferInc ? inc.title : prev.title,
      detail: preferInc ? inc.detail : prev.detail,
      kind: preferInc ? inc.kind : prev.kind,
      status: mergeStatus(prev.status, inc.status, preferInc),
      importance: preferInc ? inc.importance : prev.importance,
      relatedNpcIds: uniqStrings([...prev.relatedNpcIds, ...inc.relatedNpcIds]),
      relatedLocationIds: uniqStrings([...prev.relatedLocationIds, ...inc.relatedLocationIds]),
      relatedItemIds: uniqStrings([...prev.relatedItemIds, ...inc.relatedItemIds]),
      relatedObjectiveId: preferInc ? inc.relatedObjectiveId : prev.relatedObjectiveId,
      updatedAt: preferInc ? inc.updatedAt : prev.updatedAt,
      createdAt: prev.createdAt || inc.createdAt,
    };
    if (mergedTrace) merged.trace = mergedTrace;
    else delete (merged as { trace?: ClueEntry["trace"] }).trace;
    if (typeof maturesMerged === "string" && maturesMerged.trim()) {
      merged.maturesToObjectiveId = maturesMerged.trim();
    } else {
      delete (merged as { maturesToObjectiveId?: string }).maturesToObjectiveId;
    }
    byId.set(inc.id, merged);
  }
  const all = [...byId.values()];
  all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return all.slice(0, maxTotal);
}

export function normalizeJournalState(raw: unknown): JournalState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createEmptyJournalState();
  const o = raw as Record<string, unknown>;
  const version = o.version === JOURNAL_STATE_VERSION ? JOURNAL_STATE_VERSION : JOURNAL_STATE_VERSION;
  const cluesRaw = Array.isArray(o.clues) ? o.clues : [];
  const clues: ClueEntry[] = [];
  const now = new Date().toISOString();
  for (const row of cluesRaw) {
    const c = normalizeClueDraft(row, now);
    if (c) clues.push(c);
  }
  return { version, clues: mergeCluesWithDedupe([], clues, 200) };
}
