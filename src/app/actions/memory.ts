"use server";

import { eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { gameSessionMemory } from "@/db/schema";
import type { CompressedMemory } from "@/lib/memoryCompress";

export async function getSessionMemory(): Promise<CompressedMemory | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = await db
    .select({
      plotSummary: gameSessionMemory.plotSummary,
      playerStatus: gameSessionMemory.playerStatus,
      npcRelationships: gameSessionMemory.npcRelationships,
    })
    .from(gameSessionMemory)
    .where(eq(gameSessionMemory.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row?.plotSummary) return null;

  return {
    plot_summary: String(row.plotSummary ?? ""),
    player_status: (row.playerStatus as Record<string, unknown>) ?? {},
    npc_relationships: (row.npcRelationships as Record<string, unknown>) ?? {},
  };
}

export async function upsertSessionMemory(mem: CompressedMemory): Promise<{ ok: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false };

  await db
    .insert(gameSessionMemory)
    .values({
      userId,
      plotSummary: mem.plot_summary,
      playerStatus: mem.player_status,
      npcRelationships: mem.npc_relationships,
    })
    .onDuplicateKeyUpdate({
      set: {
        plotSummary: mem.plot_summary,
        playerStatus: mem.player_status,
        npcRelationships: mem.npc_relationships,
      },
    });

  return { ok: true };
}
