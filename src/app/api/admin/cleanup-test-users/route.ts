import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createAdminRoute } from "@/lib/admin/adminRouteFactory";

export const dynamic = "force-dynamic";

export const POST = createAdminRoute(async () => {
  const testUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(like(users.name, "play_%"));

  if (testUsers.length === 0) {
    return { data: { deleted: 0, message: "No test users found" as const } };
  }

  for (const u of testUsers) {
    await db.delete(users).where(eq(users.id, u.id));
  }

  return {
    deleted: testUsers.length,
    names: testUsers.map((u) => u.name),
  };
}, { label: "cleanup-test-users", errorReason: "cleanup_test_users_failed" });
