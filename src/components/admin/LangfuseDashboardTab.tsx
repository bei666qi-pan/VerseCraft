"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { AdminApiEnvelope } from "@/lib/admin/apiEnvelope";
import { readAdminResponseJson } from "@/lib/admin/parseAdminEnvelope";

// ── Types ─────────────────────────────────────────────

type DegradedMap = Record<string, string | null>;

interface TraceListItem {
  id: string;
  name: string;
  timestamp: string;
  latency: number;
  totalTokens: number;
  totalCost: number;
  scores: { name: string; value: number | string }[];
}

interface ObservationNode {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string | null;
  model: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  inputCost: number;
  outputCost: number;
  parentObservationId: string | null;
}

interface ScoreStats {
  name: string;
  dataType: string;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  count: number;
  trend: { date: string; avg: number }[];
}

interface ModelObservationStats {
  model: string;
  role: string;
  count: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  successRate: number;
  totalTokens: number;
  avgTokens: number;
  totalCost: number;
}

interface CostBreakdown {
  model: string;
  role: string;
  totalCost: number;
  traceCount: number;
  tokenCount: number;
}

// ── Fetch ─────────────────────────────────────────────

async function fetchEnvelope<T>(url: string): Promise<{ env: AdminApiEnvelope<T>; status: number }> {
  const res = await fetch(url, { credentials: "include" });
  return { env: await readAdminResponseJson<T>(res), status: res.status };
}

// ── Sub-components ────────────────────────────────────

function Panel({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/82 p-4 shadow-[0_12px_28px_rgba(38,57,49,0.08)]">
      {children}
    </section>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="vc-reading-serif text-2xl font-semibold leading-none text-[#123f39]">{title}</h2>
        {meta ? <p className="mt-1 text-sm text-[#68746c]">{meta}</p> : null}
      </div>
    </div>
  );
}

function DegradedBanner({ reason }: { reason: string | null }) {
  return (
    <div className="rounded-lg border border-[#c4914a]/35 bg-[#fff2cf] p-3 text-sm text-[#7a4e15]">
      数据不可用{reason ? `：${reason}` : ""}
    </div>
  );
}

function time(v: string | Date | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

function fmt(v: number | string | null | undefined, unit?: string): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "—";
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M${unit ?? ""}`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K${unit ?? ""}`;
    return `${Math.round(v * 100) / 100}${unit ?? ""}`;
  }
  return `${v}${unit ?? ""}`;
}

// ── Score Trend Bar Chart ─────────────────────────────

function ScoreTrendChart({ stats }: { stats: ScoreStats[]; rangeDays?: number }) {
  if (!stats.length) return <p className="text-sm text-[#68746c]">暂无 Score 数据。</p>;

  const coreScores = stats.filter((s) =>
    ["contract_valid", "turn_committed", "ttft_ms", "final_latency_ms"].includes(s.name)
  );

  return (
    <div className="space-y-4">
      {coreScores.map((s) => {
        const maxAvg = Math.max(...s.trend.map((t) => t.avg), 1);
        return (
          <div key={s.name} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#123f39]">{s.name}</span>
              <span className="text-[#68746c]">avg: {fmt(s.avg)} | p50: {fmt(s.p50)} | p95: {fmt(s.p95)}</span>
            </div>
            <div className="flex items-end gap-[2px] h-12">
              {s.trend.map((t) => (
                <div
                  key={t.date}
                  className="flex-1 bg-[#174d46]/70 hover:bg-[#174d46] transition-colors rounded-t-sm"
                  style={{ height: `${Math.max((t.avg / maxAvg) * 100, 2)}%` }}
                  title={`${t.date}: ${t.avg}`}
                />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-[#68746c]">
              <span>{s.trend[0]?.date ?? ""}</span>
              <span>{s.trend[s.trend.length - 1]?.date ?? ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Trace Waterfall ───────────────────────────────────

function TraceWaterfall({ observations }: { observations: ObservationNode[] }) {
  if (!observations.length) return <p className="text-sm text-[#68746c]">暂无 observation 数据。</p>;

  const minTime = Math.min(...observations.map((o) => new Date(o.startTime).getTime()));
  const maxTime = Math.max(...observations.map((o) => o.endTime ? new Date(o.endTime).getTime() : new Date(o.startTime).getTime()));
  const totalMs = maxTime - minTime || 1;

  const roots = observations.filter((o) => !o.parentObservationId);
  const children = observations.filter((o) => o.parentObservationId);

  function renderObs(o: ObservationNode, depth: number) {
    const startMs = new Date(o.startTime).getTime() - minTime;
    const endMs = o.endTime ? new Date(o.endTime).getTime() - minTime : startMs + 1;
    const leftPct = (startMs / totalMs) * 100;
    const widthPct = Math.max(((endMs - startMs) / totalMs) * 100, 1);

    return (
      <div key={o.id}>
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: `${depth * 16}px` }}>
          <div className="flex-1 relative h-5 bg-[#e8e0d3] rounded">
            <div
              className="absolute top-0 h-full rounded bg-[#174d46]/60"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            />
          </div>
          <span className="text-xs text-[#335c54] min-w-[80px] text-right truncate">
            {o.name || o.model || o.type}
          </span>
          <span className="text-[10px] text-[#68746c] min-w-[50px] text-right">
            {endMs - startMs}ms
          </span>
        </div>
        {children
          .filter((c) => c.parentObservationId === o.id)
          .map((c) => renderObs(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {roots.map((r) => renderObs(r, 0))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────

export default function LangfuseDashboardTab() {
  const [refreshing, setRefreshing] = useState(false);
  const [degraded, setDegraded] = useState<DegradedMap>({});

  // Trace data
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [tracesTotal, setTracesTotal] = useState(0);
  const [tracesPage, setTracesPage] = useState(1);
  const [traceSearch, setTraceSearch] = useState("");
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [traceDetail, setTraceDetail] = useState<{ observations: ObservationNode[] } | null>(null);

  // Score data
  const [scoreStats, setScoreStats] = useState<ScoreStats[]>([]);
  const [scoreRange, setScoreRange] = useState<"1d" | "7d" | "30d">("7d");

  // Model performance
  const [modelStats, setModelStats] = useState<ModelObservationStats[]>([]);

  // Cost data
  const [costBreakdown, setCostBreakdown] = useState<CostBreakdown[]>([]);
  const [dailyCostTrend, setDailyCostTrend] = useState<{ date: string; cost: number }[]>([]);
  const [costRange, setCostRange] = useState<"1d" | "7d" | "30d">("7d");

  // Health
  const [healthData, setHealthData] = useState<{ connected: boolean; lastIngestionTime: string | null; exportErrorCount: number } | null>(null);

  const loadLangfuse = useCallback(async () => {
    setRefreshing(true);
    const nextDegraded: DegradedMap = {};
    try {
      const [t, s, o, c, h] = await Promise.all([
        fetchEnvelope<{ traces: TraceListItem[]; total: number; page: number; limit: number }>(
          `/api/admin/langfuse/traces?page=${tracesPage}&limit=20&q=${encodeURIComponent(traceSearch)}`
        ),
        fetchEnvelope<{ stats: ScoreStats[] }>(
          `/api/admin/langfuse/scores?range=${scoreRange}`
        ),
        fetchEnvelope<{ models: ModelObservationStats[] }>(
          "/api/admin/langfuse/observations"
        ),
        fetchEnvelope<{ costs: CostBreakdown[]; dailyCostTrend: { date: string; cost: number }[] }>(
          `/api/admin/langfuse/cost?range=${costRange}`
        ),
        fetchEnvelope<{ connected: boolean; lastIngestionTime: string | null; exportErrorCount: number }>(
          "/api/admin/langfuse/health"
        ),
      ]);

      for (const [key, item] of Object.entries({ traces: t, scores: s, observations: o, cost: c, health: h })) {
        if (item.status === 403) return;
        if (!item.env.ok || item.env.degraded) nextDegraded[key] = item.env.reason ?? "degraded";
      }

      if (t.env.data) { setTraces(t.env.data.traces); setTracesTotal(t.env.data.total); }
      if (s.env.data) setScoreStats(s.env.data.stats);
      if (o.env.data) setModelStats(o.env.data.models);
      if (c.env.data) { setCostBreakdown(c.env.data.costs); setDailyCostTrend(c.env.data.dailyCostTrend); }
      if (h.env.data) setHealthData(h.env.data);
      setDegraded(nextDegraded);
    } finally {
      setRefreshing(false);
    }
  }, [tracesPage, traceSearch, scoreRange, costRange]);

  useEffect(() => {
    loadLangfuse();
  }, [loadLangfuse]);

  const loadTraceDetail = useCallback(async (traceId: string) => {
    const { env } = await fetchEnvelope<{ observations: ObservationNode[] }>(
      `/api/admin/langfuse/traces/${encodeURIComponent(traceId)}`
    );
    if (env.data) setTraceDetail(env.data);
  }, []);

  const handleTraceClick = useCallback((traceId: string) => {
    if (expandedTraceId === traceId) {
      setExpandedTraceId(null);
      setTraceDetail(null);
    } else {
      setExpandedTraceId(traceId);
      setTraceDetail(null);
      loadTraceDetail(traceId);
    }
  }, [expandedTraceId, loadTraceDetail]);

  const allDegraded = Object.keys(degraded).length >= 4;

  return (
    <section className="space-y-4" data-testid="admin-langfuse-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="vc-reading-serif text-2xl font-semibold text-[#123f39]">Langfuse 可观测</h2>
        <button
          onClick={loadLangfuse}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8d0c3] bg-[#fffaf0] px-3 py-1.5 text-xs text-[#335c54] hover:bg-[#f7eddd] disabled:opacity-50"
          title="刷新数据"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          刷新
        </button>
      </div>

      {allDegraded ? (
        <DegradedBanner reason="Langfuse 数据源不可用，请检查配置与网络连接。" />
      ) : null}

      {/* ── Trace 浏览器 ── */}
      <Panel testId="admin-langfuse-traces">
        <SectionTitle title="Trace 浏览器" meta={`共 ${tracesTotal} 条 trace`} />
        {degraded.traces ? (
          <DegradedBanner reason={degraded.traces} />
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-[#d8d0c3] bg-[#fffdf8] px-2 py-1">
                <Search className="h-3.5 w-3.5 text-[#68746c]" />
                <input
                  className="bg-transparent text-sm text-[#123f39] placeholder-[#a3b0a9] outline-none w-40"
                  placeholder="搜索 trace..."
                  value={traceSearch}
                  onChange={(e) => { setTraceSearch(e.target.value); setTracesPage(1); }}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse bg-[#fffdf8] text-sm">
                <thead>
                  <tr className="border-b border-[#d8d0c3] text-left text-xs text-[#68746c]">
                    <th className="p-2">Trace ID</th>
                    <th className="p-2">时间</th>
                    <th className="p-2">名称</th>
                    <th className="p-2">延迟</th>
                    <th className="p-2">Tokens</th>
                    <th className="p-2">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {traces.length === 0 ? (
                    <tr><td colSpan={6} className="p-4 text-center text-[#68746c]">暂无 trace 数据。</td></tr>
                  ) : (
                    traces.map((t) => (
                      <>
                        <tr
                          key={t.id}
                          className={`border-b border-[#ece5d8] cursor-pointer hover:bg-[#f7eddd]/50 ${expandedTraceId === t.id ? "bg-[#f0e8d8]" : ""}`}
                          onClick={() => handleTraceClick(t.id)}
                        >
                          <td className="p-2 font-mono text-xs text-[#0d6b55]">{t.id.slice(0, 12)}...</td>
                          <td className="p-2 text-xs text-[#68746c]">{time(t.timestamp)}</td>
                          <td className="p-2 text-xs text-[#335c54] max-w-[120px] truncate">{t.name}</td>
                          <td className="p-2 text-xs text-[#68746c]">{t.latency}ms</td>
                          <td className="p-2 text-xs text-[#68746c]">{fmt(t.totalTokens)}</td>
                          <td className="p-2 text-xs">
                            {t.scores.map((s, i) => (
                              <span key={i} className="mr-1 rounded bg-[#e8e0d3] px-1 py-0.5 text-[10px] text-[#335c54]">
                                {s.name}:{typeof s.value === "number" ? s.value.toFixed(1) : s.value}
                              </span>
                            ))}
                          </td>
                        </tr>
                        {expandedTraceId === t.id && traceDetail ? (
                          <tr key={`${t.id}-detail`}>
                            <td colSpan={6} className="p-3 bg-[#faf6ef]">
                              <div className="text-xs font-medium text-[#123f39] mb-2">Observation 瀑布图</div>
                              <TraceWaterfall observations={traceDetail.observations} />
                            </td>
                          </tr>
                        ) : null}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#68746c]">
                第 {tracesPage} 页 / 共 {Math.ceil(tracesTotal / 20)} 页
              </span>
              <div className="flex gap-1">
                <button
                  className="inline-flex items-center gap-1 rounded border border-[#d8d0c3] px-2 py-1 text-xs text-[#335c54] hover:bg-[#f7eddd] disabled:opacity-30"
                  disabled={tracesPage <= 1}
                  onClick={() => setTracesPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-3 w-3" /> 上一页
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded border border-[#d8d0c3] px-2 py-1 text-xs text-[#335c54] hover:bg-[#f7eddd] disabled:opacity-30"
                  disabled={tracesPage * 20 >= tracesTotal}
                  onClick={() => setTracesPage((p) => p + 1)}
                >
                  下一页 <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* ── Score 趋势 ── */}
      <Panel testId="admin-langfuse-scores">
        <SectionTitle title="Score 趋势" />
        {degraded.scores ? (
          <DegradedBanner reason={degraded.scores} />
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              {(["1d", "7d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  className={`rounded px-2 py-0.5 text-xs border ${scoreRange === r ? "bg-[#174d46] text-[#fffaf0] border-[#174d46]" : "bg-[#fffaf0] text-[#335c54] border-[#d8d0c3]"}`}
                  onClick={() => setScoreRange(r)}
                >
                  {r === "1d" ? "今日" : r === "7d" ? "7 天" : "30 天"}
                </button>
              ))}
            </div>
            <ScoreTrendChart stats={scoreStats} rangeDays={scoreRange === "30d" ? 30 : scoreRange === "1d" ? 1 : 7} />
          </div>
        )}
      </Panel>

      {/* ── 模型性能 ── */}
      <Panel testId="admin-langfuse-models">
        <SectionTitle title="模型性能" />
        {degraded.observations ? (
          <DegradedBanner reason={degraded.observations} />
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modelStats.length === 0 ? (
              <p className="text-sm text-[#68746c] col-span-full">暂无模型性能数据。</p>
            ) : (
              modelStats.map((m) => (
                <div key={`${m.model}:${m.role}`} className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/88 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#123f39]">{m.model}</span>
                    <span className="text-[10px] text-[#68746c] rounded bg-[#e8e0d3] px-1.5 py-0.5">{m.role}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <span className="text-[#68746c]">请求数</span><span className="text-[#123f39] text-right">{m.count}</span>
                    <span className="text-[#68746c]">P50 延迟</span><span className="text-[#123f39] text-right">{m.p50LatencyMs}ms</span>
                    <span className="text-[#68746c]">P95 延迟</span><span className="text-[#123f39] text-right">{m.p95LatencyMs}ms</span>
                    <span className="text-[#68746c]">平均 Token</span><span className="text-[#123f39] text-right">{fmt(m.avgTokens)}</span>
                    <span className="text-[#68746c]">成功率</span><span className="text-[#123f39] text-right">{(m.successRate * 100).toFixed(1)}%</span>
                    <span className="text-[#68746c]">估算成本</span><span className="text-[#123f39] text-right">${m.totalCost.toFixed(4)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </Panel>

      {/* ── 成本仪表盘 ── */}
      <Panel testId="admin-langfuse-cost">
        <SectionTitle title="成本仪表盘" />
        {degraded.cost ? (
          <DegradedBanner reason={degraded.cost} />
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              {(["1d", "7d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  className={`rounded px-2 py-0.5 text-xs border ${costRange === r ? "bg-[#174d46] text-[#fffaf0] border-[#174d46]" : "bg-[#fffaf0] text-[#335c54] border-[#d8d0c3]"}`}
                  onClick={() => setCostRange(r)}
                >
                  {r === "1d" ? "今日" : r === "7d" ? "7 天" : "30 天"}
                </button>
              ))}
            </div>

            {/* Cost breakdown bar chart */}
            {costBreakdown.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#123f39]">按模型成本分布</p>
                {(() => {
                  const maxCost = Math.max(...costBreakdown.map((c) => c.totalCost), 0.0001);
                  return costBreakdown.map((c) => (
                    <div key={c.model} className="flex items-center gap-2 text-xs">
                      <span className="w-24 truncate text-[#335c54]">{c.model}</span>
                      <div className="flex-1 h-4 bg-[#e8e0d3] rounded">
                        <div
                          className="h-full bg-[#174d46]/60 rounded"
                          style={{ width: `${(c.totalCost / maxCost) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-[#68746c]">${c.totalCost.toFixed(4)}</span>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Daily cost trend */}
            {dailyCostTrend.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-[#123f39]">日成本趋势</p>
                <div className="flex items-end gap-[2px] h-16">
                  {(() => {
                    const maxDaily = Math.max(...dailyCostTrend.map((d) => d.cost), 0.0001);
                    return dailyCostTrend.map((d) => (
                      <div
                        key={d.date}
                        className="flex-1 bg-[#174d46]/50 hover:bg-[#174d46] transition-colors rounded-t-sm"
                        style={{ height: `${Math.max((d.cost / maxDaily) * 100, 2)}%` }}
                        title={`${d.date}: $${d.cost.toFixed(4)}`}
                      />
                    ));
                  })()}
                </div>
                <div className="flex justify-between text-[10px] text-[#68746c]">
                  <span>{dailyCostTrend[0]?.date ?? ""}</span>
                  <span>{dailyCostTrend[dailyCostTrend.length - 1]?.date ?? ""}</span>
                </div>
              </div>
            )}

            {costBreakdown.length === 0 && dailyCostTrend.length === 0 && (
              <p className="text-sm text-[#68746c]">暂无成本数据。</p>
            )}
          </div>
        )}
      </Panel>

      {/* ── 健康检查 ── */}
      <Panel testId="admin-langfuse-health">
        <SectionTitle title="Langfuse 健康" />
        {degraded.health ? (
          <DegradedBanner reason={degraded.health} />
        ) : healthData ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/88 p-3 text-center">
              <div className={`inline-flex h-3 w-3 rounded-full ${healthData.connected ? "bg-[#0d6b55]" : "bg-[#9f2f2f]"}`} />
              <p className="mt-1 text-sm font-medium text-[#123f39]">{healthData.connected ? "已连接" : "未连接"}</p>
              <p className="text-[10px] text-[#68746c]">连接状态</p>
            </div>
            <div className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/88 p-3 text-center">
              <p className="text-sm font-medium text-[#123f39]">{time(healthData.lastIngestionTime)}</p>
              <p className="text-[10px] text-[#68746c]">最近写入时间</p>
            </div>
            <div className="rounded-lg border border-[#d8d0c3] bg-[#fffaf0]/88 p-3 text-center">
              <p className={`text-sm font-medium ${healthData.exportErrorCount > 0 ? "text-[#9f2f2f]" : "text-[#0d6b55]"}`}>{healthData.exportErrorCount}</p>
              <p className="text-[10px] text-[#68746c]">导出错误计数</p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#68746c]">正在加载...</p>
        )}
      </Panel>
    </section>
  );
}
