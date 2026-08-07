import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { getMetricsDaily, listTraces } from "@/lib/observability/langfuse/queryClient";
import type { CostBreakdown } from "@/lib/observability/langfuse/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(req.url);
    const rangeParam = url.searchParams.get("range") ?? "7d";
    const rangeDays = rangeParam === "30d" ? 30 : rangeParam === "1d" ? 1 : 7;

    // Daily cost trend from metrics
    const metricsResult = await getMetricsDaily({ rangeDays });

    // Cost breakdown by model from recent traces
    const tracesResult = await listTraces({ limit: 100 });
    const costByModel = new Map<string, { model: string; role: string; totalCost: number; traceCount: number; tokenCount: number }>();

    for (const trace of tracesResult.data.traces) {
      const modelKey = trace.name || "unknown";
      if (!costByModel.has(modelKey)) {
        costByModel.set(modelKey, { model: modelKey, role: "main", totalCost: 0, traceCount: 0, tokenCount: 0 });
      }
      const c = costByModel.get(modelKey)!;
      c.totalCost += trace.totalCost;
      c.traceCount++;
      c.tokenCount += trace.totalTokens;
    }

    const costs: CostBreakdown[] = Array.from(costByModel.values())
      .filter((c) => c.totalCost > 0 || c.traceCount > 0);

    const dailyCostTrend = metricsResult.data.map((m) => ({
      date: m.date,
      cost: m.totalCost,
    }));

    const degraded = metricsResult.degraded || tracesResult.degraded;

    return adminJson(adminOk({ costs, dailyCostTrend }, { degraded, reason: degraded ? (metricsResult.reason ?? tracesResult.reason) : null }), {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("[api/admin/langfuse/cost] failed", error);
    return adminJson(adminFail("langfuse_unavailable", { costs: [], dailyCostTrend: [] }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}
