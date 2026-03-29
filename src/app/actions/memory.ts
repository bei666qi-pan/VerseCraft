"use server";

import { eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { gameSessionMemory } from "@/db/schema";
import {
  coerceToEpistemicMemory,
  sessionMemoryRowLooksPresent,
  sessionMemoryToDbRow,
  toLegacyCompressedMemory,
  type CompressedMemory,
  type SessionMemoryRow,
} from "@/lib/memoryCompress";

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
  if (!row) return null;
  const snake: SessionMemoryRow = {
    plot_summary: String(row.plotSummary ?? ""),
    player_status: (row.playerStatus as Record<string, unknown>) ?? {},
    npc_relationships: (row.npcRelationships as Record<string, unknown>) ?? {},
  };
  if (!sessionMemoryRowLooksPresent(snake)) return null;
  const ep = coerceToEpistemicMemory(snake);
  return ep ? toLegacyCompressedMemory(ep) : null;
}

export async function upsertSessionMemory(mem: CompressedMemory): Promise<{ ok: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false };

  const ep = coerceToEpistemicMemory({
    plot_summary: mem.plot_summary,
    player_status: mem.player_status,
    npc_relationships: mem.npc_relationships,
  });
  if (!ep) return { ok: false };
  const dbRow = sessionMemoryToDbRow(ep);

  await db
    .insert(gameSessionMemory)
    .values({
      userId,
      plotSummary: dbRow.plotSummary,
      playerStatus: dbRow.playerStatus,
      npcRelationships: dbRow.npcRelationships,
    })
    .onConflictDoUpdate({
      target: gameSessionMemory.userId,
      set: {
        plotSummary: dbRow.plotSummary,
        playerStatus: dbRow.playerStatus,
        npcRelationships: dbRow.npcRelationships,
      },
    });

  return { ok: true };
}
