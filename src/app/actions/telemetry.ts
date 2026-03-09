"use server";

import { eq, sql } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function pingPresence() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false };
  }

  await db
    .update(users)
    .set({
      lastActive: new Date(),
      playTime: sql`${users.playTime} + 30`,
    })
    .where(eq(users.id, userId));

  return { ok: true };
}
