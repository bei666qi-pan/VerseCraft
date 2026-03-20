import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getAdminRealtimeMetrics } from "@/lib/analytics/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const metrics = await getAdminRealtimeMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[api/admin/realtime] failed", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

