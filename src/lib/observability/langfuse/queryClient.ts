// src/lib/observability/langfuse/queryClient.ts
// Read-only Langfuse query client for the Admin Dashboard.
// All methods fail-open: timeouts/network errors return empty results + degraded: true.
import "server-only";

import type {
  QueryResult,
  TraceListItem,
  TraceDetail,
  ObservationNode,
  ScoreStats,
  DailyMetrics,
  ListTracesParams,
  PaginatedTraces,
  LangfuseScore,
} from "./types";
import { getLangfuseConfig, isLangfuseReadEnabled } from "./config";

// ── Helpers ───────────────────────────────────────────

function disabledResult<T>(empty: T): QueryResult<T> {
  return { data: empty, degraded: true, reason: "langfuse_read_disabled" };
}

function degradedResult<T>(empty: T, reason: string): QueryResult<T> {
  return { data: empty, degraded: true, reason };
}

function okResult<T>(data: T): QueryResult<T> {
  return { data, degraded: false, reason: null };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

async function createClient() {
  const { LangfuseClient } = await import("@langfuse/client");
  const cfg = getLangfuseConfig();
  return new LangfuseClient({
    publicKey: cfg.publicKey!,
    secretKey: cfg.secretKey!,
    baseUrl: cfg.baseUrl,
  });
}

function mapApiScore(s: Record<string, unknown>): { name: string; value: number | string } {
  return {
    name: String(s.name ?? ""),
    value: (s.value ?? 0) as number | string,
  };
}

function mapApiTrace(t: Record<string, unknown>, scores?: Record<string, unknown>[]): TraceListItem {
  const usage = (t.usage ?? {}) as Record<string, number>;
  const cost = (t.totalCost ?? 0) as number;
  return {
    id: String(t.id ?? ""),
    name: String(t.name ?? ""),
    userId: t.userId ? String(t.userId) : null,
    sessionId: t.sessionId ? String(t.sessionId) : null,
    timestamp: String(t.timestamp ?? ""),
    latency: Number(t.latency ?? 0),
    totalTokens: usage.totalTokens ?? usage.total ?? 0,
    totalCost: Number(cost),
    observationCount: 0,
    scores: (scores ?? []).map(mapApiScore),
  };
}

function mapApiObservation(o: Record<string, unknown>): ObservationNode {
  const usage = (o.usage ?? {}) as Record<string, number>;
  return {
    id: String(o.id ?? ""),
    name: String(o.name ?? ""),
    type: (o.type as ObservationNode["type"]) ?? "SPAN",
    startTime: String(o.startTime ?? ""),
    endTime: o.endTime ? String(o.endTime) : null,
    model: o.model ? String(o.model) : null,
    usage: usage.promptTokens !== undefined
      ? { promptTokens: usage.promptTokens ?? 0, completionTokens: usage.completionTokens ?? 0, totalTokens: usage.totalTokens ?? 0 }
      : null,
    inputCost: Number((o as Record<string, unknown>).inputCost ?? 0),
    outputCost: Number((o as Record<string, unknown>).outputCost ?? 0),
    parentObservationId: o.parentObservationId ? String(o.parentObservationId) : null,
  };
}

// ── Public API ────────────────────────────────────────

/**
 * List traces with pagination and filtering.
 */
export async function listTraces(params: ListTracesParams = {}): Promise<QueryResult<PaginatedTraces>> {
  if (!isLangfuseReadEnabled()) {
    return disabledResult({ traces: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 20 });
  }

  const cfg = getLangfuseConfig();
  try {
    const client = await createClient();

    const result = await withTimeout(
      client.trace.list({
        page: params.page ?? 1,
        limit: Math.min(params.limit ?? 20, 100),
        ...(params.q ? { name: params.q } : {}),
        ...(params.fromTimestamp ? { fromTimestamp: new Date(params.fromTimestamp) } : {}),
        ...(params.toTimestamp ? { toTimestamp: new Date(params.toTimestamp) } : {}),
        ...(params.model ? { tags: [params.model] } : {}),
      }),
      cfg.readTimeoutMs,
    );

    const traces: TraceListItem[] = (result.data ?? []).map(
      (t: Record<string, unknown>) => mapApiTrace(t, (t.scores ?? []) as Record<string, unknown>[]),
    );

    return okResult({
      traces,
      total: (result.meta?.totalItems ?? 0) as number,
      page: (result.meta?.page ?? params.page ?? 1) as number,
      limit: (result.meta?.limit ?? params.limit ?? 20) as number,
    });
  } catch (err) {
    const reason = err instanceof Error && err.message === "TIMEOUT"
      ? "langfuse_read_timeout"
      : "langfuse_unavailable";
    console.warn("[langfuse:query] listTraces failed", reason);
    return degradedResult(
      { traces: [], total: 0, page: params.page ?? 1, limit: params.limit ?? 20 },
      reason,
    );
  }
}

/**
 * Get a single trace with full observation tree and scores.
 */
export async function getTrace(traceId: string): Promise<QueryResult<TraceDetail | null>> {
  if (!isLangfuseReadEnabled()) {
    return disabledResult(null);
  }

  const cfg = getLangfuseConfig();
  try {
    const client = await createClient();

    const traceResult = await withTimeout(
      client.trace.get(traceId),
      cfg.readTimeoutMs,
    );

    if (!traceResult) {
      return degradedResult(null, "trace_not_found");
    }

    const t = traceResult as Record<string, unknown>;

    // Fetch observations
    let observations: ObservationNode[] = [];
    try {
      const obsResult = await withTimeout(
        client.observations.getMany({ traceId }),
        cfg.readTimeoutMs,
      );
      observations = ((obsResult?.data ?? []) as Record<string, unknown>[]).map(mapApiObservation);
    } catch {
      // Observations fetch failure is non-fatal — traces without observations are still useful
    }

    // Fetch scores
    let scoreList: LangfuseScore[] = [];
    try {
      const scoreResult = await withTimeout(
        client.score.get({ traceId }),
        cfg.readTimeoutMs,
      );
      scoreList = ((scoreResult?.data ?? []) as Record<string, unknown>[]).map((s) => ({
        name: String(s.name ?? ""),
        value: (s.value ?? 0) as number | string,
        dataType: (s.dataType ?? "NUMERIC") as LangfuseScore["dataType"],
        source: (s.source ?? "API") as LangfuseScore["source"],
        higherIsBetter: true,
        comment: s.comment ? String(s.comment) : undefined,
      }));
    } catch {
      // Scores fetch failure is non-fatal
    }

    const detail: TraceDetail = {
      ...mapApiTrace(t, (t.scores ?? []) as Record<string, unknown>[]),
      observations,
      scoreList,
    };

    return okResult(detail);
  } catch (err) {
    const reason = err instanceof Error && err.message === "TIMEOUT"
      ? "langfuse_read_timeout"
      : "langfuse_unavailable";
    console.warn("[langfuse:query] getTrace failed", reason);
    return degradedResult(null, reason);
  }
}

/**
 * List observations for a given filter.
 */
export async function listObservations(params: {
  traceId?: string;
  page?: number;
  limit?: number;
}): Promise<QueryResult<ObservationNode[]>> {
  if (!isLangfuseReadEnabled()) {
    return disabledResult([]);
  }

  const cfg = getLangfuseConfig();
  try {
    const client = await createClient();

    const result = await withTimeout(
      client.observations.getMany({
        ...(params.traceId ? { traceId: params.traceId } : {}),
        page: params.page ?? 1,
        limit: Math.min(params.limit ?? 50, 100),
      }),
      cfg.readTimeoutMs,
    );

    const observations: ObservationNode[] = ((result?.data ?? []) as Record<string, unknown>[]).map(mapApiObservation);
    return okResult(observations);
  } catch (err) {
    const reason = err instanceof Error && err.message === "TIMEOUT"
      ? "langfuse_read_timeout"
      : "langfuse_unavailable";
    console.warn("[langfuse:query] listObservations failed", reason);
    return degradedResult([], reason);
  }
}

/**
 * List scores with optional filtering.
 */
export async function listScores(params: {
  name?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  page?: number;
  limit?: number;
}): Promise<QueryResult<LangfuseScore[]>> {
  if (!isLangfuseReadEnabled()) {
    return disabledResult([]);
  }

  const cfg = getLangfuseConfig();
  try {
    const client = await createClient();

    const result = await withTimeout(
      client.score.get({
        page: params.page ?? 1,
        limit: Math.min(params.limit ?? 50, 100),
        ...(params.name ? { name: params.name } : {}),
        ...(params.fromTimestamp ? { fromTimestamp: new Date(params.fromTimestamp) } : {}),
        ...(params.toTimestamp ? { toTimestamp: new Date(params.toTimestamp) } : {}),
      }),
      cfg.readTimeoutMs,
    );

    const scores: LangfuseScore[] = ((result?.data ?? []) as Record<string, unknown>[]).map((s) => ({
      name: String(s.name ?? ""),
      value: (s.value ?? 0) as number | string,
      dataType: (s.dataType ?? "NUMERIC") as LangfuseScore["dataType"],
      source: (s.source ?? "API") as LangfuseScore["source"],
      higherIsBetter: true,
      comment: s.comment ? String(s.comment) : undefined,
    }));

    return okResult(scores);
  } catch (err) {
    const reason = err instanceof Error && err.message === "TIMEOUT"
      ? "langfuse_read_timeout"
      : "langfuse_unavailable";
    console.warn("[langfuse:query] listScores failed", reason);
    return degradedResult([], reason);
  }
}

/**
 * Get aggregated score statistics with daily trend.
 */
export async function getScoreStats(params: {
  name?: string;
  rangeDays?: number;
}): Promise<QueryResult<ScoreStats[]>> {
  if (!isLangfuseReadEnabled()) {
    return disabledResult([]);
  }

  const cfg = getLangfuseConfig();
  const rangeDays = params.rangeDays ?? 7;

  try {
    const client = await createClient();
    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

    const result = await withTimeout(
      client.score.get({
        page: 1,
        limit: 10000, // Fetch all scores in the range for aggregation
        fromTimestamp,
        toTimestamp: now,
        ...(params.name ? { name: params.name } : {}),
      }),
      cfg.readTimeoutMs,
    );

    const allScores = ((result?.data ?? []) as Record<string, unknown>[]).map((s) => ({
      name: String(s.name ?? ""),
      value: Number(s.value ?? 0),
      timestamp: String(s.timestamp ?? ""),
      dataType: (s.dataType ?? "NUMERIC") as string,
    }));

    // Group by score name
    const grouped = new Map<string, { values: number[]; dataType: string; dailyMap: Map<string, number[]> }>();
    for (const s of allScores) {
      if (!grouped.has(s.name)) {
        grouped.set(s.name, { values: [], dataType: s.dataType, dailyMap: new Map() });
      }
      const g = grouped.get(s.name)!;
      g.values.push(s.value);

      const dateKey = s.timestamp.slice(0, 10);
      if (!g.dailyMap.has(dateKey)) g.dailyMap.set(dateKey, []);
      g.dailyMap.get(dateKey)!.push(s.value);
    }

    const stats: ScoreStats[] = [];
    for (const [name, g] of grouped) {
      const sorted = [...g.values].sort((a, b) => a - b);
      const n = sorted.length;
      if (n === 0) continue;

      const p50 = sorted[Math.floor(n * 0.5)];
      const p95 = sorted[Math.floor(n * 0.95)];

      const trend: { date: string; avg: number }[] = [];
      for (const [date, vals] of g.dailyMap) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        trend.push({ date, avg: Math.round(avg * 100) / 100 });
      }
      trend.sort((a, b) => a.date.localeCompare(b.date));

      stats.push({
        name,
        dataType: (g.dataType === "NUMERIC" ? "NUMERIC" : g.dataType === "CATEGORICAL" ? "CATEGORICAL" : "BOOLEAN") as ScoreStats["dataType"],
        avg: Math.round((g.values.reduce((a, b) => a + b, 0) / n) * 100) / 100,
        min: sorted[0],
        max: sorted[n - 1],
        p50,
        p95,
        count: n,
        trend,
      });
    }

    return okResult(stats);
  } catch (err) {
    const reason = err instanceof Error && err.message === "TIMEOUT"
      ? "langfuse_read_timeout"
      : "langfuse_unavailable";
    console.warn("[langfuse:query] getScoreStats failed", reason);
    return degradedResult([], reason);
  }
}

/**
 * Get daily metrics aggregation.
 */
export async function getMetricsDaily(params: {
  rangeDays?: number;
}): Promise<QueryResult<DailyMetrics[]>> {
  if (!isLangfuseReadEnabled()) {
    return disabledResult([]);
  }

  const cfg = getLangfuseConfig();
  const rangeDays = params.rangeDays ?? 7;

  try {
    const client = await createClient();
    const now = new Date();
    const fromTimestamp = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

    // Fetch traces and aggregate by date
    const result = await withTimeout(
      client.trace.list({
        page: 1,
        limit: 10000,
        fromTimestamp,
        toTimestamp: now,
      }),
      cfg.readTimeoutMs,
    );

    const traces = (result?.data ?? []) as Record<string, unknown>[];
    const dailyMap = new Map<string, { count: number; totalTokens: number; totalCost: number; latencies: number[] }>();

    for (const t of traces) {
      const dateKey = String(t.timestamp ?? "").slice(0, 10);
      if (!dateKey) continue;
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { count: 0, totalTokens: 0, totalCost: 0, latencies: [] });
      }
      const d = dailyMap.get(dateKey)!;
      d.count++;
      const usage = (t.usage ?? {}) as Record<string, number>;
      d.totalTokens += usage.totalTokens ?? usage.total ?? 0;
      d.totalCost += Number(t.totalCost ?? 0);
      d.latencies.push(Number(t.latency ?? 0));
    }

    const metrics: DailyMetrics[] = [];
    for (const [date, d] of dailyMap) {
      metrics.push({
        date,
        traceCount: d.count,
        totalTokens: d.totalTokens,
        totalCost: Math.round(d.totalCost * 10000) / 10000,
        avgLatencyMs: d.latencies.length > 0
          ? Math.round(d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length)
          : 0,
      });
    }
    metrics.sort((a, b) => a.date.localeCompare(b.date));

    return okResult(metrics);
  } catch (err) {
    const reason = err instanceof Error && err.message === "TIMEOUT"
      ? "langfuse_read_timeout"
      : "langfuse_unavailable";
    console.warn("[langfuse:query] getMetricsDaily failed", reason);
    return degradedResult([], reason);
  }
}
