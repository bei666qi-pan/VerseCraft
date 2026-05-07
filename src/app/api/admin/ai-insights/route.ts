import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
import { getAiInsights } from "@/lib/admin/service";
import { generateRuleFallbackAiInsightReport, getCachedAiInsightReport, refreshAiInsightReport } from "@/lib/admin/aiInsights";
import { invalidateCompletionCacheByTask } from "@/lib/ai/governance/responseCache";
import { invalidateAiAnalysisSnapshot } from "@/lib/ai/analysis/snapshotStore";
import { recordAdminAuditLog } from "@/lib/admin/auditLog";

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
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

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
    const reason = "ai_insights_unavailable";
    return adminJson(adminFail<null>(reason, null), { status: 200, headers: { "Cache-Control": "private, max-age=10" } });
  }
}

export async function POST(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  if (url.searchParams.get("refresh_cache") === "1") {
    const deletedCompletion = await invalidateCompletionCacheByTask("DEV_ASSIST");
    const deletedSnapshot = await invalidateAiAnalysisSnapshot({ task: "admin_insight" });
    await recordAdminAuditLog({
      action: "admin_ai_insight_cache_clear",
      actor: guard.actor,
      success: true,
      metadata: { deletedCompletion, deletedSnapshot },
    });
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
      await recordAdminAuditLog({
        action: "admin_ai_insight_refresh",
        actor: guard.actor,
        success: refreshed.every((x) => !x.degraded),
        reason: refreshed.some((x) => x.degraded) ? "partial_degraded" : null,
        metadata: { warmup: true, refreshed },
      });
      return adminJson(adminOk({ ok: true as const, refreshed, source: "warmup" as const }));
    }
    const report = await withTimeout(refreshAiInsightReport(range), 12_000);
    await recordAdminAuditLog({
      action: "admin_ai_insight_refresh",
      actor: guard.actor,
      success: !report.degraded,
      reason: report.degraded ? "ai_refresh_degraded" : null,
      metadata: { range: range.preset, model: report.model },
    });
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
      const fallback = await generateRuleFallbackAiInsightReport(range);
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
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const task = url.searchParams.get("task");
  if (task !== "DEV_ASSIST" && task !== "admin_insight") {
    return adminJson(adminFail<null>("unsupported_task", null), { status: 400 });
  }
  const deletedCompletion = task === "DEV_ASSIST" ? await invalidateCompletionCacheByTask("DEV_ASSIST") : 0;
  const deletedSnapshot = task === "admin_insight" ? await invalidateAiAnalysisSnapshot({ task: "admin_insight" }) : 0;
  await recordAdminAuditLog({
    action: "admin_ai_insight_cache_clear",
    actor: guard.actor,
    success: true,
    targetType: "ai_analysis_task",
    targetId: task,
    metadata: { deletedCompletion, deletedSnapshot },
  });
  return adminJson(adminOk({ ok: true as const, task, deletedCompletion, deletedSnapshot }));
}
