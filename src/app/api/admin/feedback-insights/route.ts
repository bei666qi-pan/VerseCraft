import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getFeedbackInsights } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  try {
    const data = await getFeedbackInsights(range);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[api/admin/feedback-insights] failed", error);
    return NextResponse.json(
      { error: "feedback_insights_unavailable", degraded: true, range },
      { status: 500, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}

