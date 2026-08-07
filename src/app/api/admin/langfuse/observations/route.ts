import { adminJson, adminOk, adminFail } from "@/lib/admin/apiEnvelope";
import { verifyAdminRequest } from "@/lib/admin/authGuard";
import { listObservations, listTraces } from "@/lib/observability/langfuse/queryClient";
import type { ModelObservationStats } from "@/lib/observability/langfuse/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;

  try {
    const url = new URL(req.url);
    const traceId = url.searchParams.get("traceId") ?? undefined;

    if (traceId) {
      // Fetch observations for a specific trace
      const obsResult = await listObservations({ traceId, limit: 200 });
      return adminJson(adminOk({ observations: obsResult.data }, { degraded: obsResult.degraded, reason: obsResult.reason }), {
        headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
      });
    }

    // Aggregate by model/role from recent traces
    const tracesResult = await listTraces({ limit: 50 });
    const degraded = tracesResult.degraded;

    // Build model/role aggregation from trace observations
    const modelMap = new Map<string, { model: string; role: string; count: number; latencies: number[]; totalTokens: number; totalCost: number }>();

    // Fetch observations for each trace to get model/role info
    for (const trace of tracesResult.data.traces.slice(0, 10)) {
      try {
        const obs = await listObservations({ traceId: trace.id, limit: 50 });
        for (const o of obs.data) {
          if (!o.model) continue;
          const key = `${o.model}:${o.type}`;
          if (!modelMap.has(key)) {
            modelMap.set(key, { model: o.model, role: o.type, count: 0, latencies: [], totalTokens: 0, totalCost: 0 });
          }
          const m = modelMap.get(key)!;
          m.count++;
          if (o.endTime && o.startTime) {
            const latency = new Date(o.endTime).getTime() - new Date(o.startTime).getTime();
            m.latencies.push(latency);
          }
          m.totalTokens += o.usage?.totalTokens ?? 0;
          m.totalCost += (o.inputCost + o.outputCost);
        }
      } catch {
        // Skip traces that fail observation fetch
      }
    }

    const models: ModelObservationStats[] = [];
    for (const [, m] of modelMap) {
      const sorted = [...m.latencies].sort((a, b) => a - b);
      const n = sorted.length;
      models.push({
        model: m.model,
        role: m.role,
        count: m.count,
        avgLatencyMs: n > 0 ? Math.round(sorted.reduce((a, b) => a + b, 0) / n) : 0,
        p50LatencyMs: n > 0 ? sorted[Math.floor(n * 0.5)] : 0,
        p95LatencyMs: n > 0 ? sorted[Math.floor(n * 0.95)] : 0,
        successRate: 1,
        totalTokens: m.totalTokens,
        avgTokens: m.count > 0 ? Math.round(m.totalTokens / m.count) : 0,
        totalCost: Math.round(m.totalCost * 10000) / 10000,
      });
    }

    return adminJson(adminOk({ models }, { degraded, reason: degraded ? tracesResult.reason : null }), {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (error) {
    console.error("[api/admin/langfuse/observations] failed", error);
    return adminJson(adminFail("langfuse_unavailable", { models: [] }), {
      status: 200,
      headers: { "Cache-Control": "private, max-age=5" },
    });
  }
}
