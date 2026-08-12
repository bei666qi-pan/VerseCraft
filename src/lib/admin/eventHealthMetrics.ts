import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  ANALYTICS_EVENT_TAXONOMY,
  validateAnalyticsEventContract,
  type AnalyticsEventContract,
} from "@/lib/analytics/eventTaxonomy";
import { clamp } from "@/lib/clamp";
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
  /**
   * true 表示本次统计命中了采样上限（EVENT_HEALTH_SAMPLE_CAP），是"按最近 N 条事件采样"
   * 而非"该时间范围内的全部事件"。之前这里对 event_time 范围内的全部行做无 LIMIT 查询，
   * 大范围（如近30天）会把完整 JSONB payload 明细拉进 Node 内存，既慢又有 OOM 风险，
   * 且返回结果从不告知调用方"是不是全量"，看起来像可信的精确统计但其实可能是不完整的。
   */
  sampleCapped: boolean;
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

/** 单次 event-health 统计最多处理的事件行数；超过则标记 sampleCapped=true。 */
export const EVENT_HEALTH_SAMPLE_CAP = 8000;

export function buildEmptyEventHealthMetrics(range: AdminTimeRange): EventHealthMetrics {
  return computeEventHealthMetricsFromRows(range, [], { limit: 20 });
}

export function computeEventHealthMetricsFromRows(
  range: AdminTimeRange,
  rows: EventHealthRawRow[],
  opts?: { limit?: number; sampleCapped?: boolean }
): EventHealthMetrics {
  const limit = clamp(Math.trunc(opts?.limit ?? 20), 1, 100);
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
    sampleCapped: Boolean(opts?.sampleCapped),
    updatedAt: new Date().toISOString(),
  };
}

export async function getEventHealthMetrics(range: AdminTimeRange, opts?: { limit?: number }): Promise<EventHealthMetrics> {
  // 之前这里没有 LIMIT，会把整个时间范围内的事件明细（含完整 JSONB payload）拉进
  // Node 内存做 JS 侧统计；大范围（近30天）下既慢又有内存风险。现在按 event_time
  // 倒序取最近 EVENT_HEALTH_SAMPLE_CAP+1 条，命中上限时通过 sampleCapped 字段
  // 如实告知调用方"这是采样统计，不是全量"，而不是悄悄截断却装作精确。
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
    ORDER BY event_time DESC
    LIMIT ${EVENT_HEALTH_SAMPLE_CAP + 1}
  `);
  const allRows = rowsOf(raw);
  const sampleCapped = allRows.length > EVENT_HEALTH_SAMPLE_CAP;
  const rows = (sampleCapped ? allRows.slice(0, EVENT_HEALTH_SAMPLE_CAP) : allRows).map((row) => ({
    eventName: text(row.eventName),
    actorId: text(row.actorId),
    actorType: text(row.actorType),
    userId: text(row.userId),
    guestId: text(row.guestId),
    sessionId: text(row.sessionId),
    platform: text(row.platform),
    payload: row.payload,
  }));
  return computeEventHealthMetricsFromRows(range, rows, { ...opts, sampleCapped });
}
