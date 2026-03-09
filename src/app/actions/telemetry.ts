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
      todayPlayTime: sql`CASE
        WHEN DATE(${users.lastDataReset}) = CURRENT_DATE THEN ${users.todayPlayTime} + 30
        ELSE 30
      END`,
      todayTokensUsed: sql`CASE
        WHEN DATE(${users.lastDataReset}) = CURRENT_DATE THEN ${users.todayTokensUsed}
        ELSE 0
      END`,
      lastDataReset: sql`CASE
        WHEN DATE(${users.lastDataReset}) = CURRENT_DATE THEN ${users.lastDataReset}
        ELSE NOW()
      END`,
    })
    .where(eq(users.id, userId));

  return { ok: true };
}
