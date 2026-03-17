import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";

export const dynamic = "force-dynamic";

export async function POST() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const testUsers = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(like(users.name, "play_%"));

    if (testUsers.length === 0) {
      return NextResponse.json({ deleted: 0, message: "No test users found" });
    }

    for (const u of testUsers) {
      await db.delete(users).where(eq(users.id, u.id));
    }

    return NextResponse.json({
      deleted: testUsers.length,
      names: testUsers.map((u) => u.name),
    });
  } catch (error) {
    const err = error as Error;
    console.error(
      `\x1b[31m[api/admin/cleanup-test-users] DB operation failed\x1b[0m`,
      { message: err?.message, cause: (err as any)?.cause, stack: err?.stack, error }
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
