import type { MemorySpineEntry, MemorySpineState } from "./types";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function asFiniteInt(n: unknown, fallback = 0): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

function normalizeSummary(s: unknown, maxChars: number): string {
  const t = typeof s === "string" ? s.trim() : String(s ?? "").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars);
}

export function normalizeMemorySpineEntry(raw: unknown, nowHour: number): MemorySpineEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "";
  const kind = o.kind;
  const scope = o.scope;
  const status = o.status;
  const summary = normalizeSummary(o.summary, 80);
  const mergeKey = typeof o.mergeKey === "string" ? o.mergeKey.slice(0, 120) : "";
  if (!id || !summary || !mergeKey) return null;

  const allowedKinds = new Set([
    "promise",
    "debt",
    "relationship_shift",
    "secret_fragment",
    "route_hint",
    "danger_hint",
    "item_provenance",
    "task_residue",
    "death_mark",
    "npc_attitude",
    "escape_condition",
    "hook",
  ]);
  const allowedScopes = new Set(["run_private", "npc_local", "location_local", "session_world"]);
  const allowedStatus = new Set(["active", "resolved", "consumed", "expired"]);
  if (!allowedKinds.has(String(kind))) return null;
  if (!allowedScopes.has(String(scope))) return null;
  if (!allowedStatus.has(String(status))) return null;

  const createdAtHour = asFiniteInt(o.createdAtHour, nowHour);
  const lastTouchedAtHour = asFiniteInt(o.lastTouchedAtHour, createdAtHour);
  const ttlHours = Math.max(0, Math.min(24 * 30, asFiniteInt(o.ttlHours, 72)));
  const anchors = o.anchors && typeof o.anchors === "object" && !Array.isArray(o.anchors) ? (o.anchors as any) : {};
  const recallTags = Array.isArray(o.recallTags)
    ? o.recallTags.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).slice(0, 12)
    : [];

  const source = typeof o.source === "string" ? o.source : "resolved_turn";
  const promoteToLore = typeof o.promoteToLore === "boolean" ? o.promoteToLore : false;

  return {
    id,
    kind: kind as any,
    scope: scope as any,
    summary,
    salience: clamp01(Number(o.salience ?? 0.5)),
    confidence: clamp01(Number(o.confidence ?? 0.7)),
    status: status as any,
    createdAtHour,
    lastTouchedAtHour,
    ttlHours,
    mergeKey,
    anchors: {
      locationIds: Array.isArray(anchors.locationIds) ? anchors.locationIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 8) : undefined,
      npcIds: Array.isArray(anchors.npcIds) ? anchors.npcIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 8) : undefined,
      taskIds: Array.isArray(anchors.taskIds) ? anchors.taskIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 8) : undefined,
      itemIds: Array.isArray(anchors.itemIds) ? anchors.itemIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 10) : undefined,
      floorIds: Array.isArray(anchors.floorIds) ? anchors.floorIds.filter((x: unknown): x is string => typeof x === "string").slice(0, 6) : undefined,
      worldFlags: Array.isArray(anchors.worldFlags) ? anchors.worldFlags.filter((x: unknown): x is string => typeof x === "string").slice(0, 10) : undefined,
    },
    recallTags,
    source: source as any,
    promoteToLore,
  };
}

export function pruneMemorySpine(state: MemorySpineState, nowHour: number, opts?: { maxEntries?: number }): MemorySpineState {
  const maxEntries = Math.max(16, Math.min(128, opts?.maxEntries ?? 64));
  const normalized: MemorySpineEntry[] = [];
  for (const e of state.entries ?? []) {
    const ne = normalizeMemorySpineEntry(e, nowHour);
    if (ne) normalized.push(ne);
  }
  const alive = normalized.filter((e) => {
    if (e.status === "expired") return false;
    const age = nowHour - e.lastTouchedAtHour;
    if (!Number.isFinite(age)) return true;
    if (e.ttlHours <= 0) return false;
    return age <= e.ttlHours;
  });

  if (alive.length <= maxEntries) return { v: 1, entries: alive };

  const scored = alive.map((e) => {
    const recency = Math.max(0, Math.min(1, 1 - Math.max(0, nowHour - e.lastTouchedAtHour) / Math.max(1, e.ttlHours)));
    const unresolvedBonus = e.status === "active" ? 0.12 : 0;
    const score = e.salience * 0.55 + e.confidence * 0.25 + recency * 0.2 + unresolvedBonus;
    return { e, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return { v: 1, entries: scored.slice(0, maxEntries).map((x) => x.e) };
}

