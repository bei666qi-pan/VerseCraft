"use server";

import { and, eq, sql } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { saveSlots } from "@/db/schema";

export async function syncSaveToCloud(slotId: string, data: unknown) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false };
  if (!slotId) return { ok: false };

  await db
    .insert(saveSlots)
    .values({
      userId,
      slotId,
      data: (data ?? {}) as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        data: (data ?? {}) as Record<string, unknown>,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  return { ok: true };
}

export async function fetchCloudSaves() {
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
}

export async function fetchCloudSaveBySlot(slotId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = await db
    .select({ data: saveSlots.data })
    .from(saveSlots)
    .where(and(eq(saveSlots.userId, userId), eq(saveSlots.slotId, slotId)))
    .limit(1);

  return (rows[0]?.data as Record<string, unknown> | undefined) ?? null;
}

export async function deleteCloudSaveSlot(slotId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false };
  if (!slotId) return { ok: false };

  await db
    .delete(saveSlots)
    .where(and(eq(saveSlots.userId, userId), eq(saveSlots.slotId, slotId)));

  return { ok: true };
}
