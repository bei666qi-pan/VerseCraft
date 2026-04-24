import { cookies } from "next/headers";
import { ADMIN_SHADOW_COOKIE, verifyAdminShadowSession } from "@/lib/adminShadow";
import { adminJson, adminOk, adminFail, adminUnauthorizedJson } from "@/lib/admin/apiEnvelope";
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
    return adminUnauthorizedJson();
  }

  const url = new URL(req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  if (ADMIN_AI_INSIGHTS_DISABLE) {
    return adminJson(adminFail<null>("ai_insights_disabled", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=10" },
    });
  }
  try {
    const cached = await getCachedAiInsightReport(range);
    if (cached) {
      return adminJson(adminOk({ ...cached, source: "snapshot" as const }), {
        headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=300" },
      });
    }
    const data = await getAiInsights(range);
    return adminJson(adminOk(data), {
      headers: { "Cache-Control": "private, max-age=180, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("[api/admin/ai-insights] failed", error);
    const reason = error instanceof Error ? error.message : "ai_insights_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=10" } });
  }
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }

  const url = new URL(req.url);
  if (url.searchParams.get("refresh_cache") === "1") {
    const deletedCompletion = await invalidateCompletionCacheByTask("DEV_ASSIST");
    const deletedSnapshot = await invalidateAiAnalysisSnapshot({ task: "admin_insight" });
    return adminJson(adminOk({ ok: true, task: "DEV_ASSIST" as const, deletedCompletion, deletedSnapshot }));
  }
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  if (ADMIN_AI_INSIGHTS_DISABLE) {
    return adminJson(adminFail<null>("ai_insights_disabled", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
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
      return adminJson(adminOk({ ok: true as const, refreshed, source: "warmup" as const }));
    }
    const report = await withTimeout(refreshAiInsightReport(range), 12_000);
    return adminJson(
      adminOk({
        ...report,
        source: "refresh" as const,
      }),
      { headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" } }
    );
  } catch (error) {
    console.error("[api/admin/ai-insights:post] failed", error);
    try {
      const fallback = await getAiInsights(range);
      return adminJson(
        adminOk(
          {
            ...fallback,
            source: "rule_fallback" as const,
            degraded: true,
          },
          { degraded: true, reason: "ai_refresh_failed_used_rule_fallback" }
        ),
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } }
      );
    } catch {
      // fall through
    }
    return adminJson(adminFail<null>("ai_insights_generation_failed", null), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const shadowCookie = cookieStore.get(ADMIN_SHADOW_COOKIE)?.value;
  if (!verifyAdminShadowSession(shadowCookie)) {
    return adminUnauthorizedJson();
  }
  const url = new URL(req.url);
  const task = url.searchParams.get("task");
  if (task !== "DEV_ASSIST" && task !== "admin_insight") {
    return adminJson(adminFail<null>("unsupported_task", null), { status: 400 });
  }
  const deletedCompletion = task === "DEV_ASSIST" ? await invalidateCompletionCacheByTask("DEV_ASSIST") : 0;
  const deletedSnapshot = task === "admin_insight" ? await invalidateAiAnalysisSnapshot({ task: "admin_insight" }) : 0;
  return adminJson(adminOk({ ok: true as const, task, deletedCompletion, deletedSnapshot }));
}
