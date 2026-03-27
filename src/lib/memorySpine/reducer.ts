import type { MemorySpineEntry, MemorySpineState } from "./types";
import { pruneMemorySpine } from "./prune";

export type MemoryCandidateDraft = Omit<MemorySpineEntry, "id" | "createdAtHour" | "lastTouchedAtHour"> & {
  id?: string;
  createdAtHour?: number;
  lastTouchedAtHour?: number;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function newId(nowHour: number): string {
  return `mem_${nowHour}_${Math.random().toString(36).slice(2, 8)}`;
}

function mergeAnchors(a: MemorySpineEntry["anchors"], b: MemorySpineEntry["anchors"]): MemorySpineEntry["anchors"] {
  const merge = (x?: string[], y?: string[], cap = 10) => {
    const out = new Set<string>();
    for (const v of x ?? []) if (typeof v === "string" && v.trim()) out.add(v.trim());
    for (const v of y ?? []) if (typeof v === "string" && v.trim()) out.add(v.trim());
    return [...out].slice(0, cap);
  };
  return {
    locationIds: merge(a.locationIds, b.locationIds, 8),
    npcIds: merge(a.npcIds, b.npcIds, 8),
    taskIds: merge(a.taskIds, b.taskIds, 8),
    itemIds: merge(a.itemIds, b.itemIds, 10),
    floorIds: merge(a.floorIds, b.floorIds, 6),
    worldFlags: merge(a.worldFlags, b.worldFlags, 10),
  };
}

function mergeRecallTags(a: string[], b: string[]): string[] {
  const out = new Set<string>();
  for (const x of a ?? []) if (typeof x === "string" && x.trim()) out.add(x.trim());
  for (const x of b ?? []) if (typeof x === "string" && x.trim()) out.add(x.trim());
  return [...out].slice(0, 12);
}

export function reduceMemoryCandidates(input: {
  prev: MemorySpineState;
  candidates: MemoryCandidateDraft[];
  nowHour: number;
  maxEntries?: number;
  perTurnInsertCap?: number;
}): MemorySpineState {
  const prev = input.prev ?? { v: 1, entries: [] };
  const nowHour = input.nowHour;
  const perTurnInsertCap = Math.max(4, Math.min(20, input.perTurnInsertCap ?? 10));

  // 低价值限流：同一回合只允许少量新条目进入（其余会被 merge 或丢弃）。
  const drafts = (input.candidates ?? [])
    .filter((c) => c && typeof c.summary === "string" && c.summary.trim().length > 0)
    .slice(0, 64);

  const entries = [...(prev.entries ?? [])];
  const byMergeKey = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    byMergeKey.set(entries[i]!.mergeKey, i);
  }

  let inserted = 0;
  for (const d of drafts) {
    const mergeKey = String(d.mergeKey ?? "").slice(0, 120);
    if (!mergeKey) continue;
    const summary = String(d.summary ?? "").trim().slice(0, 80);
    if (!summary) continue;

    const candidate: MemorySpineEntry = {
      id: typeof d.id === "string" && d.id ? d.id : newId(nowHour),
      kind: d.kind,
      scope: d.scope,
      summary,
      salience: clamp01(Number(d.salience ?? 0.5)),
      confidence: clamp01(Number(d.confidence ?? 0.7)),
      status: d.status ?? "active",
      createdAtHour: typeof d.createdAtHour === "number" && Number.isFinite(d.createdAtHour) ? Math.trunc(d.createdAtHour) : nowHour,
      lastTouchedAtHour: typeof d.lastTouchedAtHour === "number" && Number.isFinite(d.lastTouchedAtHour) ? Math.trunc(d.lastTouchedAtHour) : nowHour,
      ttlHours: Math.max(0, Math.min(24 * 30, Math.trunc(Number(d.ttlHours ?? 72) || 0))),
      mergeKey,
      anchors: d.anchors ?? {},
      recallTags: Array.isArray(d.recallTags) ? d.recallTags.slice(0, 12) : [],
      source: d.source ?? "resolved_turn",
      promoteToLore: Boolean(d.promoteToLore),
    };

    const idx = byMergeKey.get(mergeKey);
    if (idx !== undefined) {
      const prevE = entries[idx]!;
      const merged: MemorySpineEntry = {
        ...prevE,
        summary: prevE.summary.length >= candidate.summary.length ? prevE.summary : candidate.summary,
        salience: Math.max(prevE.salience, candidate.salience),
        confidence: Math.max(prevE.confidence, candidate.confidence),
        status: prevE.status === "active" ? candidate.status ?? "active" : prevE.status,
        lastTouchedAtHour: Math.max(prevE.lastTouchedAtHour, candidate.lastTouchedAtHour),
        ttlHours: Math.max(prevE.ttlHours, candidate.ttlHours),
        anchors: mergeAnchors(prevE.anchors, candidate.anchors),
        recallTags: mergeRecallTags(prevE.recallTags, candidate.recallTags),
        promoteToLore: prevE.promoteToLore || candidate.promoteToLore,
      };
      entries[idx] = merged;
      continue;
    }

    if (inserted >= perTurnInsertCap) continue;
    entries.push(candidate);
    byMergeKey.set(mergeKey, entries.length - 1);
    inserted += 1;
  }

  return pruneMemorySpine({ v: 1, entries }, nowHour, { maxEntries: input.maxEntries });
}

