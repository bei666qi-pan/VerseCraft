import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ANALYTICS_EVENT_TAXONOMY,
  validateAnalyticsEventContract,
  type AnalyticsEventContract,
} from "@/lib/analytics/eventTaxonomy";
import type { AnalyticsEventName } from "@/lib/analytics/types";
import type { AdminTimeRange } from "@/lib/admin/timeRange";

type CountMap = Map<string, number>;

export type EventHealthCoverageRow = {
  eventName: string;
  label: string;
  count: number;
  covered: boolean;
  status: "covered" | "missing";
};

export type EventHealthMetrics = {
  range: AdminTimeRange;
  totalEvents: number;
  eventsByName: Array<{ eventName: string; count: number }>;
  invalidContractCount: number;
  missingActorCount: number;
  missingGuestCount: number;
  anonSessionCount: number;
  unknownPlatformCount: number;
  missingWorldIdCount: number;
  missingChapterIdCount: number;
  rates: {
    invalidContractRate: number;
    missingActorRate: number;
    missingGuestRate: number;
    anonSessionRate: number;
    unknownPlatformRate: number;
    missingWorldIdRate: number;
    missingChapterIdRate: number;
  };
  topInvalidEvents: Array<{ eventName: string; count: number; reasons: Array<{ reason: string; count: number }> }>;
  topMissingProperties: Array<{ property: string; count: number; eventName: string | null }>;
  eventCoverage: EventHealthCoverageRow[];
  evidenceSufficiency: "enough" | "insufficient";
  updatedAt: string;
};

export type EventHealthRawRow = {
  eventName: string | null;
  actorId: string | null;
  actorType: string | null;
  userId: string | null;
  guestId: string | null;
  sessionId: string | null;
  platform: string | null;
  payload: unknown;
};

const KEY_FUNNEL_EVENTS: Array<{ eventName: AnalyticsEventName; label: string; aliases?: AnalyticsEventName[] }> = [
  { eventName: "home_viewed", label: "Home viewed" },
  { eventName: "world_selected", label: "World selected" },
  { eventName: "character_create_started", label: "Character create started" },
  { eventName: "character_create_success", label: "Character create success", aliases: ["create_character_success"] },
  { eventName: "enter_main_game", label: "Enter main game" },
  { eventName: "first_effective_action", label: "First effective action" },
  { eventName: "third_effective_action", label: "Third effective action" },
  { eventName: "save_created", label: "Save created", aliases: ["save_sync", "save_load"] },
  { eventName: "settlement_submitted", label: "Settlement submitted", aliases: ["game_settlement"] },
  { eventName: "feedback_submitted", label: "Feedback submitted" },
];

const WORLD_EXPECTED_EVENTS = new Set<string>([
  "world_selected",
  "character_create_started",
  "character_create_success",
  "create_character_success",
  "enter_main_game",
  "chat_action_started",
  "chat_action_completed",
  "chat_request_started",
  "chat_request_finished",
  "effective_action",
  "first_effective_action",
  "third_effective_action",
  "save_created",
  "save_sync",
  "save_load",
  "settlement_submitted",
  "game_settlement",
]);

const CHAPTER_EXPECTED_EVENTS = new Set<string>([
  "chat_action_completed",
  "effective_action",
  "first_effective_action",
  "third_effective_action",
  "turn_commit_summary",
  "narrative_validator_issue",
  "narrative_safety_issue",
  "save_created",
  "save_sync",
  "save_load",
]);

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 ? clean : null;
}

function rate(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}

function payloadObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasAnyPayloadKey(payload: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = payload[key];
    return typeof value === "string" ? value.trim().length > 0 : value != null;
  });
}

function bump(map: CountMap, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function bumpNested(map: Map<string, CountMap>, key: string, nested: string): void {
  const current = map.get(key) ?? new Map<string, number>();
  bump(current, nested);
  map.set(key, current);
}

function sortedCounts(map: CountMap, limit: number): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function isGuestLikeMissingGuest(row: EventHealthRawRow, contract: AnalyticsEventContract | null, payload: Record<string, unknown>): boolean {
  const actorType = text(row.actorType);
  const userId = text(row.userId);
  const guestId = text(row.guestId);
  if (guestId) return false;
  const dataQuality = payload.dataQuality && typeof payload.dataQuality === "object" ? (payload.dataQuality as Record<string, unknown>) : {};
  if (dataQuality.missingGuestId === true) return true;
  if (actorType === "guest") return true;
  if (userId) return false;
  if (!contract) return true;
  return contract.category !== "admin" && contract.category !== "health";
}

export function buildEmptyEventHealthMetrics(range: AdminTimeRange): EventHealthMetrics {
  return computeEventHealthMetricsFromRows(range, [], { limit: 20 });
}

export function computeEventHealthMetricsFromRows(
  range: AdminTimeRange,
  rows: EventHealthRawRow[],
  opts?: { limit?: number }
): EventHealthMetrics {
  const limit = Math.max(1, Math.min(100, Math.trunc(opts?.limit ?? 20)));
  const eventsByName = new Map<string, number>();
  const invalidByEvent = new Map<string, CountMap>();
  const missingProperties = new Map<string, number>();

  let invalidContractCount = 0;
  let missingActorCount = 0;
  let missingGuestCount = 0;
  let anonSessionCount = 0;
  let unknownPlatformCount = 0;
  let missingWorldIdCount = 0;
  let missingChapterIdCount = 0;
  let worldExpectedCount = 0;
  let chapterExpectedCount = 0;
  const taxonomy = ANALYTICS_EVENT_TAXONOMY as Record<string, AnalyticsEventContract | undefined>;

  for (const row of rows) {
    const eventName = text(row.eventName) ?? "unknown_event";
    const payload = payloadObject(row.payload);
    const contract = taxonomy[eventName] ?? null;
    bump(eventsByName, eventName);

    const actorId = text(row.actorId);
    const userId = text(row.userId);
    const guestId = text(row.guestId);
    const sessionId = text(row.sessionId);
    const platform = text(row.platform);

    if (!actorId) {
      missingActorCount += 1;
      bump(missingProperties, "identity.actorId");
    }
    if (isGuestLikeMissingGuest(row, contract, payload)) {
      missingGuestCount += 1;
      bump(missingProperties, "identity.guestId");
    }
    if (sessionId === "anon_session") {
      anonSessionCount += 1;
      bump(missingProperties, "identity.sessionId.anon_session");
    }
    if (!platform || platform === "unknown") {
      unknownPlatformCount += 1;
      bump(missingProperties, "platform");
    }
    if (WORLD_EXPECTED_EVENTS.has(eventName)) {
      worldExpectedCount += 1;
      if (!hasAnyPayloadKey(payload, ["worldId", "world", "world_id"])) {
        missingWorldIdCount += 1;
        bump(missingProperties, "payload.worldId");
      }
    }
    if (CHAPTER_EXPECTED_EVENTS.has(eventName)) {
      chapterExpectedCount += 1;
      if (!hasAnyPayloadKey(payload, ["chapterId", "chapter_id", "currentChapterId", "activeChapterId", "chapter"])) {
        missingChapterIdCount += 1;
        bump(missingProperties, "payload.chapterId");
      }
    }

    const validation = validateAnalyticsEventContract({
      eventName,
      actorId,
      userId,
      guestId,
      sessionId,
      payload,
    });
    if (!validation.ok) {
      invalidContractCount += 1;
      bumpNested(invalidByEvent, eventName, validation.reason);
      for (const key of validation.missingIdentity) bump(missingProperties, `identity.${key}`);
      for (const key of validation.missingPayloadKeys) bump(missingProperties, `payload.${key}`);
      for (const key of validation.sensitivePayloadKeys) bump(missingProperties, `sensitive.${key}`);
      if (validation.reason === "unknown_event") bump(missingProperties, "eventName.unknown");
    }
  }

  const totalEvents = rows.length;
  const coverage = KEY_FUNNEL_EVENTS.map((item) => {
    const count = [item.eventName, ...(item.aliases ?? [])].reduce((sum, name) => sum + (eventsByName.get(name) ?? 0), 0);
    return {
      eventName: item.eventName,
      label: item.label,
      count,
      covered: count > 0,
      status: count > 0 ? ("covered" as const) : ("missing" as const),
    };
  });

  return {
    range,
    totalEvents,
    eventsByName: sortedCounts(eventsByName, limit).map(({ key, count }) => ({ eventName: key, count })),
    invalidContractCount,
    missingActorCount,
    missingGuestCount,
    anonSessionCount,
    unknownPlatformCount,
    missingWorldIdCount,
    missingChapterIdCount,
    rates: {
      invalidContractRate: rate(invalidContractCount, totalEvents),
      missingActorRate: rate(missingActorCount, totalEvents),
      missingGuestRate: rate(missingGuestCount, totalEvents),
      anonSessionRate: rate(anonSessionCount, totalEvents),
      unknownPlatformRate: rate(unknownPlatformCount, totalEvents),
      missingWorldIdRate: rate(missingWorldIdCount, worldExpectedCount),
      missingChapterIdRate: rate(missingChapterIdCount, chapterExpectedCount),
    },
    topInvalidEvents: [...invalidByEvent.entries()]
      .map(([eventName, reasons]) => ({
        eventName,
        count: [...reasons.values()].reduce((sum, count) => sum + count, 0),
        reasons: sortedCounts(reasons, 5).map(({ key, count }) => ({ reason: key, count })),
      }))
      .sort((a, b) => b.count - a.count || a.eventName.localeCompare(b.eventName))
      .slice(0, limit),
    topMissingProperties: sortedCounts(missingProperties, limit).map(({ key, count }) => ({
      property: key,
      count,
      eventName: null,
    })),
    eventCoverage: coverage,
    evidenceSufficiency: totalEvents >= 20 ? "enough" : "insufficient",
    updatedAt: new Date().toISOString(),
  };
}

export async function getEventHealthMetrics(range: AdminTimeRange, opts?: { limit?: number }): Promise<EventHealthMetrics> {
  const raw = await db.execute(sql`
    SELECT
      event_name AS "eventName",
      actor_id AS "actorId",
      actor_type AS "actorType",
      user_id AS "userId",
      guest_id AS "guestId",
      session_id AS "sessionId",
      platform AS "platform",
      payload AS "payload"
    FROM analytics_events
    WHERE event_time >= ${range.start}
      AND event_time <= ${range.end}
  `);
  const rows = rowsOf(raw).map((row) => ({
    eventName: text(row.eventName),
    actorId: text(row.actorId),
    actorType: text(row.actorType),
    userId: text(row.userId),
    guestId: text(row.guestId),
    sessionId: text(row.sessionId),
    platform: text(row.platform),
    payload: row.payload,
  }));
  return computeEventHealthMetricsFromRows(range, rows, opts);
}
