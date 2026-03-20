import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getAiInsights } from "@/lib/admin/service";
import { generateAiInsightReport } from "@/lib/admin/aiInsights";

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
    const data = await getAiInsights(range);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=180, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[api/admin/ai-insights] failed", error);
    return NextResponse.json(
      { error: "ai_insights_unavailable", degraded: true, range },
      { status: 500, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);

  try {
    const report = await generateAiInsightReport(range);
    return NextResponse.json(
      {
        range,
        model: report.model,
        degraded: report.degraded,
        input: report.input,
        output: report.output,
      },
      { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" } }
    );
  } catch (error) {
    console.error("[api/admin/ai-insights:post] failed", error);
    return NextResponse.json(
      {
        error: "ai_insights_generation_failed",
        degraded: true,
        range,
      },
      { status: 500, headers: { "Cache-Control": "private, max-age=5" } }
    );
  }
}

