import { createAdminRoute } from "@/lib/admin/adminRouteFactory";
import { parseAdminTimeRangeFromSearchParams } from "@/lib/admin/timeRange";
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
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export const GET = createAdminRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  if (ADMIN_AI_INSIGHTS_DISABLE) {
    throw new Error("ai_insights_disabled");
  }
  const cached = await getCachedAiInsightReport(range);
  if (cached) {
    return { data: { ...cached, source: "snapshot" as const }, reason: null };
  }
  const data = await generateRuleFallbackAiInsightReport(range);
  return { data: { ...data, source: "rule_fallback" as const }, degraded: true, reason: "ai_insights_snapshot_missing_used_rule_fallback" };
}, {
  label: "ai-insights",
  cacheSeconds: 120,
  staleWhileRevalidate: 300,
  onError: () => ({ reason: "ai_insights_unavailable", cacheSeconds: 10 }),
});

export const POST = createAdminRoute(async (ctx) => {
  const url = new URL(ctx.req.url);

  if (url.searchParams.get("refresh_cache") === "1") {
    const deletedCompletion = await invalidateCompletionCacheByTask("DEV_ASSIST");
    const deletedSnapshot = await invalidateAiAnalysisSnapshot({ task: "admin_insight" });
    await recordAdminAuditLog({
      action: "admin_ai_insight_cache_clear",
      actor: ctx.guard,
      success: true,
      metadata: { deletedCompletion, deletedSnapshot },
    });
    return { data: { ok: true, task: "DEV_ASSIST" as const, deletedCompletion, deletedSnapshot }, reason: null };
  }

  const range = parseAdminTimeRangeFromSearchParams(url.searchParams);
  if (ADMIN_AI_INSIGHTS_DISABLE) {
    throw new Error("ai_insights_disabled");
  }

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
      actor: ctx.guard,
      success: refreshed.every((x) => !x.degraded),
      reason: refreshed.some((x) => x.degraded) ? "partial_degraded" : null,
      metadata: { warmup: true, refreshed },
    });
    return { data: { ok: true as const, refreshed, source: "warmup" as const } };
  }

  try {
    const report = await withTimeout(refreshAiInsightReport(range), 12_000);
    await recordAdminAuditLog({
      action: "admin_ai_insight_refresh",
      actor: ctx.guard,
      success: !report.degraded,
      reason: report.degraded ? "ai_refresh_degraded" : null,
      metadata: { range: range.preset, model: report.model },
    });
    return { data: { ...report, source: "refresh" as const } };
  } catch (error) {
    try {
      const fallback = await generateRuleFallbackAiInsightReport(range);
      await recordAdminAuditLog({
        action: "admin_ai_insight_refresh",
        actor: ctx.guard,
        success: false,
        reason: "ai_refresh_failed_used_rule_fallback",
        metadata: { range: range.preset, model: fallback.model },
      }).catch(() => undefined);
      return {
        data: { ...fallback, source: "rule_fallback" as const, degraded: true },
        degraded: true,
        reason: "ai_refresh_failed_used_rule_fallback",
      };
    } catch {
      await recordAdminAuditLog({
        action: "admin_ai_insight_refresh",
        actor: ctx.guard,
        success: false,
        reason: "ai_insights_generation_failed",
        metadata: { range: range.preset },
      }).catch(() => undefined);
      throw error;
    }
  }
}, {
  label: "ai-insights:post",
  cacheSeconds: 5,
  staleWhileRevalidate: 10,
  onError: () => ({ reason: "ai_insights_generation_failed", cacheSeconds: 5 }),
});

export const DELETE = createAdminRoute(async (ctx) => {
  const url = new URL(ctx.req.url);
  const task = url.searchParams.get("task");
  if (task !== "DEV_ASSIST" && task !== "admin_insight") {
    throw new Error("unsupported_task");
  }
  const deletedCompletion = task === "DEV_ASSIST" ? await invalidateCompletionCacheByTask("DEV_ASSIST") : 0;
  const deletedSnapshot = task === "admin_insight" ? await invalidateAiAnalysisSnapshot({ task: "admin_insight" }) : 0;
  await recordAdminAuditLog({
    action: "admin_ai_insight_cache_clear",
    actor: ctx.guard,
    success: true,
    targetType: "ai_analysis_task",
    targetId: task,
    metadata: { deletedCompletion, deletedSnapshot },
  });
  return { data: { ok: true as const, task, deletedCompletion, deletedSnapshot } };
}, {
  label: "ai-insights:delete",
  onError: (error) => ({
    reason: error instanceof Error ? error.message : "ai_insights_delete_failed",
    cacheSeconds: 5,
  }),
});
