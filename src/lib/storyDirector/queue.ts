import type { IncidentEnvelope, IncidentQueueState, StoryDirectorState } from "./types";
import { createEmptyIncidentQueue } from "./types";

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

function matchAnchors(a: IncidentEnvelope["anchors"], b: IncidentEnvelope["anchors"]): boolean {
  const keys: Array<keyof IncidentEnvelope["anchors"]> = ["locationIds", "npcIds", "taskIds", "floorIds", "memoryMergeKeys", "escapeTrackCodes"];
  for (const k of keys) {
    const ax = (a as any)?.[k];
    const bx = (b as any)?.[k];
    if (Array.isArray(ax) && Array.isArray(bx) && ax.some((x) => bx.includes(x))) return true;
  }
  return false;
}

export function normalizeIncidentQueue(raw: unknown): IncidentQueueState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return createEmptyIncidentQueue();
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? o.items : [];
  const normalized: IncidentEnvelope[] = items
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x))
    .map((x) => ({
      id: String(x.id ?? ""),
      incidentCode: String(x.incidentCode ?? ""),
      title: String(x.title ?? ""),
      kind: String(x.kind ?? "pressure") as any,
      severity: (x.severity === "high" || x.severity === "medium") ? (x.severity as any) : "low",
      source: (x.source === "world_engine" || x.source === "task" || x.source === "npc" || x.source === "memory") ? (x.source as any) : "director",
      scope: (x.scope === "session_world" || x.scope === "npc_local" || x.scope === "location_local") ? (x.scope as any) : "run_private",
      anchors: (x.anchors && typeof x.anchors === "object" && !Array.isArray(x.anchors)) ? (x.anchors as any) : {},
      dueTurn: clampInt(x.dueTurn, 0, 999999),
      expiresTurn: clampInt(x.expiresTurn, 0, 999999),
      cooldownTurns: clampInt(x.cooldownTurns, 0, 999),
      oneShot: Boolean(x.oneShot),
      status: (x.status === "armed" || x.status === "fired" || x.status === "resolved" || x.status === "expired") ? (x.status as any) : "queued",
      payload: (x.payload && typeof x.payload === "object" && !Array.isArray(x.payload)) ? (x.payload as any) : undefined,
    }))
    .filter((x) => x.id && x.incidentCode && x.title)
    .slice(0, 12);
  return { v: 1, items: normalized };
}

export function enqueueIncident(
  queue: IncidentQueueState,
  incident: IncidentEnvelope,
  opts?: { maxItems?: number }
): IncidentQueueState {
  const maxItems = Math.max(4, Math.min(12, opts?.maxItems ?? 10));
  const q = queue ?? createEmptyIncidentQueue();
  const items = [...(q.items ?? [])];

  // 去重：同 code 且锚点相交 或 dueTurn 相近时合并为“更早 due + 更晚 expires”
  const existingIdx = items.findIndex((x) =>
    x.incidentCode === incident.incidentCode &&
    (Math.abs((x.dueTurn ?? 0) - (incident.dueTurn ?? 0)) <= 1 || matchAnchors(x.anchors, incident.anchors))
  );
  if (existingIdx >= 0) {
    const prev = items[existingIdx]!;
    items[existingIdx] = {
      ...prev,
      dueTurn: Math.min(prev.dueTurn, incident.dueTurn),
      expiresTurn: Math.max(prev.expiresTurn, incident.expiresTurn),
      severity: prev.severity === "high" || incident.severity === "high" ? "high" : prev.severity === "medium" || incident.severity === "medium" ? "medium" : "low",
    };
  } else {
    items.push(incident);
  }

  // 淘汰：优先丢过期/已解决/已触发，再丢低严重度且 due 更远
  const sorted = items
    .slice()
    .sort((a, b) => {
      const pri = (x: IncidentEnvelope) =>
        (x.status === "expired" ? 1000 : 0) +
        (x.status === "resolved" ? 900 : 0) +
        (x.status === "fired" ? 800 : 0) +
        (x.status === "armed" ? 0 : 0) +
        (x.severity === "high" ? -50 : x.severity === "medium" ? -20 : 0) +
        (x.dueTurn ?? 0);
      return pri(a) - pri(b);
    })
    .slice(0, maxItems);
  return { v: 1, items: sorted };
}

export function advanceIncidentQueue(args: {
  queue: IncidentQueueState;
  director: StoryDirectorState;
  nowTurn: number;
}): { queue: IncidentQueueState; armed: IncidentEnvelope[]; expired: IncidentEnvelope[] } {
  const nowTurn = Math.max(0, Math.trunc(args.nowTurn ?? 0));
  const q = args.queue ?? createEmptyIncidentQueue();
  const items = [...(q.items ?? [])];
  const armed: IncidentEnvelope[] = [];
  const expired: IncidentEnvelope[] = [];

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.status === "resolved" || it.status === "expired") continue;
    if (nowTurn > (it.expiresTurn ?? 0)) {
      items[i] = { ...it, status: "expired" };
      expired.push(items[i]!);
      continue;
    }
    if (nowTurn >= (it.dueTurn ?? 0) && it.status === "queued") {
      items[i] = { ...it, status: "armed" };
      armed.push(items[i]!);
    }
  }

  return { queue: { v: 1, items }, armed, expired };
}

export function selectIncidentForTurn(args: {
  director: StoryDirectorState;
  queue: IncidentQueueState;
  nowTurn: number;
  preferredIncidentCode: string | null;
  suppressions: string[];
}): IncidentEnvelope | null {
  const nowTurn = Math.max(0, Math.trunc(args.nowTurn ?? 0));
  const suppress = new Set((args.suppressions ?? []).map((x) => String(x ?? "").trim()).filter(Boolean));
  const items = (args.queue?.items ?? []).filter((x) => x.status === "armed" && !suppress.has(x.incidentCode));
  if (items.length === 0) return null;

  // peak/cooldown：刚 peak 后不触发 high severity
  const inCooldown = nowTurn - (args.director.recentPeakTurn ?? 0) <= 1;

  const preferred = args.preferredIncidentCode
    ? items.find((x) => x.incidentCode === args.preferredIncidentCode)
    : null;
  const candidates = preferred ? [preferred, ...items.filter((x) => x !== preferred)] : items;

  const pick = candidates.find((x) => !(inCooldown && x.severity === "high")) ?? candidates[0]!;
  return pick ?? null;
}

export function markIncidentFired(queue: IncidentQueueState, incidentId: string): IncidentQueueState {
  const q = queue ?? createEmptyIncidentQueue();
  const items = (q.items ?? []).map((x) => (x.id === incidentId ? { ...x, status: "fired" as const } : x));
  return { v: 1, items };
}

export function buildIncidentDigest(queue: IncidentQueueState, nowTurn: number): {
  pendingCodes: string[];
  armedCodes: string[];
} {
  const now = Math.max(0, Math.trunc(nowTurn ?? 0));
  const pending = uniq((queue.items ?? []).filter((x) => x.status === "queued" && x.dueTurn <= now + 2).map((x) => x.incidentCode), 6);
  const armed = uniq((queue.items ?? []).filter((x) => x.status === "armed").map((x) => x.incidentCode), 4);
  return { pendingCodes: pending, armedCodes: armed };
}

