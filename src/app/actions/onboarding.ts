"use server";

import { eq } from "drizzle-orm";
import { auth } from "../../../auth";
import { db } from "@/db";
import { userOnboarding } from "@/db/schema";

export type OnboardingType = "codex" | "warehouse" | "tasks";

export interface OnboardingStatus {
  codexFirstViewDone: boolean;
  warehouseFirstViewDone: boolean;
  tasksFirstViewDone: boolean;
}

export async function getOnboardingStatus(): Promise<OnboardingStatus | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const rows = await db
    .select({
      codexFirstViewDone: userOnboarding.codexFirstViewDone,
      warehouseFirstViewDone: userOnboarding.warehouseFirstViewDone,
      tasksFirstViewDone: userOnboarding.tasksFirstViewDone,
    })
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return {
      codexFirstViewDone: false,
      warehouseFirstViewDone: false,
      tasksFirstViewDone: false,
    };
  }

  return {
    codexFirstViewDone: Number(row.codexFirstViewDone) !== 0,
    warehouseFirstViewDone: Number(row.warehouseFirstViewDone) !== 0,
    tasksFirstViewDone: Number(row.tasksFirstViewDone) !== 0,
  };
}

export async function markOnboardingViewed(
  type: OnboardingType
): Promise<{ ok: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false };

  const setColumn =
    type === "codex"
      ? { codexFirstViewDone: 1 }
      : type === "warehouse"
        ? { warehouseFirstViewDone: 1 }
        : { tasksFirstViewDone: 1 };

  await db
    .insert(userOnboarding)
    .values({
      userId,
      codexFirstViewDone: type === "codex" ? 1 : 0,
      warehouseFirstViewDone: type === "warehouse" ? 1 : 0,
      tasksFirstViewDone: type === "tasks" ? 1 : 0,
    })
    .onConflictDoUpdate({ target: userOnboarding.userId, set: setColumn });

  return { ok: true };
}
