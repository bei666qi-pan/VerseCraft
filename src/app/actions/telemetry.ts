"use server";

import { auth } from "../../../auth";
import { markUserActive } from "@/lib/presence";

export async function pingPresence() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false };
  }

  await markUserActive(userId);

  return { ok: true };
}

