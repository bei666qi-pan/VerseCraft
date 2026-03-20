"use server";

import { and, eq, sql } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { saveSlots } from "@/db/schema";
import { recordGenericAnalyticsEvent } from "@/lib/analytics/repository";

export async function syncSaveToCloud(slotId: string, data: unknown) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { ok: false };
    if (!slotId) return { ok: false };

    const payload = data ?? {};
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return { ok: false };
    }

    await db
      .insert(saveSlots)
      .values({
        userId,
        slotId,
        data: payload as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [saveSlots.userId, saveSlots.slotId],
        set: {
          data: payload as Record<string, unknown>,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      });

    void recordGenericAnalyticsEvent({
      eventId: `${userId}:save_sync:${slotId}:${Date.now()}`,
      idempotencyKey: `${userId}:save_sync:${slotId}:${Date.now()}`,
      userId,
      sessionId: `save_${userId}`,
      eventName: "save_sync",
      eventTime: new Date(),
      page: "/play",
      source: "save_action",
      platform: "unknown",
      tokenCost: 0,
      playDurationDeltaSec: 0,
      payload: { slotId },
    }).catch(() => {});

    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function fetchCloudSaves() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return [];

    const rows = await db
      .select({
        slotId: saveSlots.slotId,
        data: saveSlots.data,
        updatedAt: saveSlots.updatedAt,
      })
      .from(saveSlots)
      .where(eq(saveSlots.userId, userId));

    return rows.map((row) => ({
      slotId: row.slotId,
      data: row.data as Record<string, unknown>,
      updatedAt: row.updatedAt?.toISOString() ?? null,
    }));
  } catch {
    return [];
  }
}

export async function fetchCloudSaveBySlot(slotId: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || !slotId) return null;

    const rows = await db
      .select({ data: saveSlots.data })
      .from(saveSlots)
      .where(and(eq(saveSlots.userId, userId), eq(saveSlots.slotId, slotId)))
      .limit(1);

    if (rows[0]?.data) {
      void recordGenericAnalyticsEvent({
        eventId: `${userId}:save_load:${slotId}:${Date.now()}`,
        idempotencyKey: `${userId}:save_load:${slotId}:${Date.now()}`,
        userId,
        sessionId: `save_${userId}`,
        eventName: "save_load",
        eventTime: new Date(),
        page: "/play",
        source: "save_action",
        platform: "unknown",
        tokenCost: 0,
        playDurationDeltaSec: 0,
        payload: { slotId },
      }).catch(() => {});
    }

    return (rows[0]?.data as Record<string, unknown> | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteCloudSaveSlot(slotId: string) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId || !slotId) return { ok: false };

    await db
      .delete(saveSlots)
      .where(and(eq(saveSlots.userId, userId), eq(saveSlots.slotId, slotId)));

    return { ok: true };
  } catch {
    return { ok: false };
  }
}
