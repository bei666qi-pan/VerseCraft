import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getAiInsights } from "@/lib/admin/service";
import { getCachedAiInsightReport, refreshAiInsightReport } from "@/lib/admin/aiInsights";
import { invalidateCompletionCacheByTask } from "@/lib/ai/governance/responseCache";
import { invalidateAiAnalysisSnapshot } from "@/lib/ai/analysis/snapshotStore";

export const dynamic = "force-dynamic";
const ADMIN_AI_INSIGHTS_DISABLE = process.env.ADMIN_AI_INSIGHTS_DISABLE === "1";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("admin_ai_insights_timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  if (ADMIN_AI_INSIGHTS_DISABLE) {
    return NextResponse.json(
      { error: "ai_insights_disabled", degraded: true, range },
      { status: 500, headers: { "Cache-Control": "private, max-age=10" } }
    );
  }
  try {
    const cached = await getCachedAiInsightReport(range);
    if (cached) {
      return NextResponse.json(
        { ...cached, source: "snapshot" },
        { headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" } }
      );
    }
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
  if (url.searchParams.get("refresh_cache") === "1") {
    const deletedCompletion = await invalidateCompletionCacheByTask("DEV_ASSIST");
    const deletedSnapshot = await invalidateAiAnalysisSnapshot({ task: "admin_insight" });
    return NextResponse.json({ ok: true, task: "DEV_ASSIST", deletedCompletion, deletedSnapshot });
  }
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  if (ADMIN_AI_INSIGHTS_DISABLE) {
    return NextResponse.json(
      {
        error: "ai_insights_disabled",
        degraded: true,
        range,
      },
      { status: 500, headers: { "Cache-Control": "private, max-age=5" } }
    );
  }

  try {
    if (url.searchParams.get("warmup") === "1") {
      const presets: Array<"today" | "7d" | "30d"> = ["today", "7d", "30d"];
      const refreshed: Array<{ preset: string; degraded: boolean; model: string }> = [];
      for (const preset of presets) {
        const sp = new URLSearchParams();
        sp.set("range", preset);
        const r = await withTimeout(refreshAiInsightReport(parseAdminTimeRangeFromSearchParams(sp)), 12_000);
        refreshed.push({ preset, degraded: r.degraded, model: r.model });
      }
      return NextResponse.json({ ok: true, refreshed, source: "warmup" });
    }
    const report = await withTimeout(refreshAiInsightReport(range), 12_000);
    return NextResponse.json(
      {
        ...report,
        source: "refresh",
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

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const url = new URL(req.url);
  const task = url.searchParams.get("task");
  if (task !== "DEV_ASSIST" && task !== "admin_insight") {
    return NextResponse.json({ error: "unsupported_task" }, { status: 400 });
  }
  const deletedCompletion = task === "DEV_ASSIST" ? await invalidateCompletionCacheByTask("DEV_ASSIST") : 0;
  const deletedSnapshot = task === "admin_insight" ? await invalidateAiAnalysisSnapshot({ task: "admin_insight" }) : 0;
  return NextResponse.json({ ok: true, task, deletedCompletion, deletedSnapshot });
}

