import { safeRate } from "@/lib/admin/metricsUtils";

export type JourneyFunnelMode = "strict" | "any_order";
export type JourneyActorTypeFilter = "all" | "registered" | "guest";
export type JourneyPlatformFilter = "all" | "pc" | "mobile";

export type JourneyFunnelEventRow = {
  eventName?: string | null;
  stage?: string | null;
  actorKey?: string | null;
  actorId?: string | null;
  actorType?: string | null;
  userId?: string | null;
  guestId?: string | null;
  sessionId?: string | null;
  platform?: string | null;
  eventTime?: Date | string | number | null;
  firstAt?: Date | string | number | null;
};

export type JourneyFunnelEvent = {
  actorKey: string;
  stage: string;
  timeMs: number;
};

export type JourneyFunnelStage = {
  eventName: string;
  count: number;
  stepConversionRate: number;
  totalConversionRate: number;
  dropOffCount: number;
  dropOffRate: number;
  isBiggestDrop: boolean;
};

const STAGE_ALIASES: Record<string, string> = {
  create_character_success: "character_create_success",
  game_settlement: "settlement_submitted",
  save_sync: "save_created",
  save_load: "save_created",
};

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function toTimeMs(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function normalizeStageName(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  return STAGE_ALIASES[raw] ?? raw;
}

function resolveActorKey(row: JourneyFunnelEventRow): string | null {
  const actorKey = clean(row.actorKey) ?? clean(row.actorId);
  if (actorKey) return actorKey;
  const userId = clean(row.userId);
  if (userId) return `u:${userId}`;
  const guestId = clean(row.guestId);
  if (guestId) return `g:${guestId}`;
  return clean(row.sessionId);
}

function normalizedActorType(row: JourneyFunnelEventRow): "registered" | "guest" | "unknown" {
  const raw = clean(row.actorType);
  if (raw === "user" || raw === "registered") return "registered";
  if (raw === "guest") return "guest";
  if (clean(row.userId) || clean(row.actorKey)?.startsWith("u:") || clean(row.actorId)?.startsWith("u:")) return "registered";
  if (clean(row.guestId) || clean(row.actorKey)?.startsWith("g:") || clean(row.actorId)?.startsWith("g:")) return "guest";
  return "unknown";
}

function actorMatches(row: JourneyFunnelEventRow, filter: JourneyActorTypeFilter): boolean {
  if (filter === "all") return true;
  return normalizedActorType(row) === filter;
}

function platformMatches(row: JourneyFunnelEventRow, filter: JourneyPlatformFilter): boolean {
  if (filter === "all") return true;
  const platform = clean(row.platform);
  if (filter === "mobile") return platform === "mobile";
  return platform === "desktop";
}

export function parseJourneyFunnelMode(value: string | null | undefined): JourneyFunnelMode {
  return value === "any_order" ? "any_order" : "strict";
}

export function normalizeJourneyFunnelEvents(
  rows: JourneyFunnelEventRow[],
  filters: { actorType: JourneyActorTypeFilter; platform: JourneyPlatformFilter }
): JourneyFunnelEvent[] {
  const events: JourneyFunnelEvent[] = [];
  for (const row of rows) {
    if (!actorMatches(row, filters.actorType) || !platformMatches(row, filters.platform)) continue;
    const actorKey = resolveActorKey(row);
    const stage = normalizeStageName(row.stage ?? row.eventName);
    const timeMs = toTimeMs(row.firstAt ?? row.eventTime);
    if (!actorKey || !stage || timeMs == null) continue;
    events.push({ actorKey, stage, timeMs });
  }
  return events;
}

export function computeJourneyFunnelStages(
  eventOrder: readonly string[],
  events: JourneyFunnelEvent[],
  mode: JourneyFunnelMode
): JourneyFunnelStage[] {
  const stageSet = new Set(eventOrder);
  const byActor = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (!stageSet.has(event.stage)) continue;
    const actorStages = byActor.get(event.actorKey) ?? new Map<string, number>();
    const previous = actorStages.get(event.stage);
    actorStages.set(event.stage, previous == null ? event.timeMs : Math.min(previous, event.timeMs));
    byActor.set(event.actorKey, actorStages);
  }

  const counts: Record<string, number> = Object.fromEntries(eventOrder.map((stage) => [stage, 0]));
  for (const actorStages of byActor.values()) {
    if (mode === "any_order") {
      for (const stage of eventOrder) {
        if (actorStages.has(stage)) counts[stage] += 1;
      }
      continue;
    }

    let previousTime = Number.NEGATIVE_INFINITY;
    for (const stage of eventOrder) {
      const time = actorStages.get(stage);
      if (time == null || time < previousTime) break;
      counts[stage] += 1;
      previousTime = time;
    }
  }

  const base = Math.max(0, Number(counts[eventOrder[0] ?? ""] ?? 0));
  const stages = eventOrder.map((eventName, index) => {
    const count = Math.max(0, Number(counts[eventName] ?? 0));
    const prevName = eventOrder[index - 1];
    const prevCount = index === 0 ? count : Math.max(0, Number(counts[prevName ?? ""] ?? 0));
    const nextName = eventOrder[index + 1];
    const nextCount = nextName == null ? count : Math.max(0, Number(counts[nextName] ?? 0));
    const dropOffCount = nextName == null ? 0 : Math.max(0, count - nextCount);
    return {
      eventName,
      count,
      stepConversionRate: index === 0 ? 1 : safeRate(count, prevCount),
      totalConversionRate: index === 0 ? 1 : safeRate(count, base),
      dropOffCount,
      dropOffRate: safeRate(dropOffCount, count),
      isBiggestDrop: false,
    };
  });

  let biggestIndex = -1;
  for (let i = 0; i < stages.length; i += 1) {
    const current = stages[i];
    if (!current || current.dropOffCount <= 0) continue;
    const previous = biggestIndex >= 0 ? stages[biggestIndex] : null;
    if (
      !previous ||
      current.dropOffCount > previous.dropOffCount ||
      (current.dropOffCount === previous.dropOffCount && current.dropOffRate > previous.dropOffRate)
    ) {
      biggestIndex = i;
    }
  }
  if (biggestIndex >= 0 && stages[biggestIndex]) stages[biggestIndex].isBiggestDrop = true;
  return stages;
}
