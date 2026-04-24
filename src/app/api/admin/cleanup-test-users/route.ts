import { cookies } from "next/headers";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

  try {
    const testUsers = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(like(users.name, "play_%"));

    if (testUsers.length === 0) {
      return adminJson(adminOk({ deleted: 0, message: "No test users found" as const }));
    }

    for (const u of testUsers) {
      await db.delete(users).where(eq(users.id, u.id));
    }

    return adminJson(
      adminOk({
        deleted: testUsers.length,
        names: testUsers.map((u) => u.name),
      })
    );
  } catch (error) {
    const err = error as Error;
    const cause = err instanceof Error && "cause" in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.error(
      `\x1b[31m[api/admin/cleanup-test-users] DB operation failed\x1b[0m`,
      { message: err?.message, cause, stack: err?.stack, error }
    );
    return adminJson(adminFail<null>("cleanup_test_users_failed", null), { status: 200 });
  }
}
