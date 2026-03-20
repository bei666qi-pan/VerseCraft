import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { getRealtimeMetrics } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const metrics = await getRealtimeMetrics();
    return NextResponse.json(metrics, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    console.error("[api/admin/realtime] failed", error);
    return NextResponse.json(
      { error: "realtime_unavailable", degraded: true },
      { status: 500, headers: { "Cache-Control": "private, max-age=3" } }
    );
  }
}

