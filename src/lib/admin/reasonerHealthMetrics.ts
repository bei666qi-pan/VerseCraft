import "server-only";

import { pool } from "@/db";
import { readAnyWorkerHeartbeat } from "@/lib/kg/workerHeartbeat";

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const rows = (result as { rows?: unknown })?.rows;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export type ReasonerHealthSnapshot = {
  updatedAt: string;
  liveness: {
    workerOnline: boolean;
    workerCount: number;
    lastHeartbeatAt: string | null;
    lastTickSuccessAt: string | null;
    consecutiveFailures: number;
  };
  successRates: {
    last1h: { total: number; succeeded: number; failed: number; rate: number } | null;
    last24h: { total: number; succeeded: number; failed: number; rate: number } | null;
  };
  agendaEffectiveness: {
    totalCreated24h: number;
    injected24h: number;
    resolved24h: number;
    expired24h: number;
    pendingCount: number;
    dueCount: number;
    injectionRate: number;
    expirationRate: number;
  };
  directorStateSummary: {
    activeSessionCount: number;
    phaseDistribution: Record<string, number>;
  };
  riskEvents: {
    last1hAgencyHigh: number;
    last1hSpoilerHigh: number;
    last1hSafetyHigh: number;
  };
  deadJobs: {
    worldEngineDead24h: number;
    totalDead24h: number;
  };
};

export function buildEmptyReasonerHealth(): ReasonerHealthSnapshot {
  return {
    updatedAt: new Date().toISOString(),
    liveness: {
      workerOnline: false,
      workerCount: 0,
      lastHeartbeatAt: null,
      lastTickSuccessAt: null,
      consecutiveFailures: 0,
    },
    successRates: {
      last1h: null,
      last24h: null,
    },
    agendaEffectiveness: {
      totalCreated24h: 0,
      injected24h: 0,
      resolved24h: 0,
      expired24h: 0,
      pendingCount: 0,
      dueCount: 0,
      injectionRate: 0,
      expirationRate: 0,
    },
    directorStateSummary: {
      activeSessionCount: 0,
      phaseDistribution: {},
    },
    riskEvents: {
      last1hAgencyHigh: 0,
      last1hSpoilerHigh: 0,
      last1hSafetyHigh: 0,
    },
    deadJobs: {
      worldEngineDead24h: 0,
      totalDead24h: 0,
    },
  };
}

export async function getReasonerHealth(): Promise<ReasonerHealthSnapshot> {
  const [
    heartbeat,
    tickRuns1h,
    tickRuns24h,
    agendaStats,
    directorPhases,
    riskCounts,
    deadJobCounts,
  ] = await Promise.all([
    readAnyWorkerHeartbeat().catch(() => null),

    pool.query<{
      total: string; succeeded: string; failed: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
         COUNT(*) FILTER (WHERE status != 'succeeded')::int AS failed
       FROM world_engine_runs
       WHERE created_at >= NOW() - INTERVAL '1 hour'`
    ).catch(() => null),

    pool.query<{
      total: string; succeeded: string; failed: string;
    }>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
         COUNT(*) FILTER (WHERE status != 'succeeded')::int AS failed
       FROM world_engine_runs
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    ).catch(() => null),

    pool.query<{
      total_created: string; injected: string; resolved: string; expired: string;
      pending: string; due: string;
    }>(
      `SELECT
         COUNT(*)::int AS total_created,
         COUNT(*) FILTER (WHERE status = 'injected')::int AS injected,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
         COUNT(*) FILTER (WHERE status = 'expired')::int AS expired,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'due')::int AS due
       FROM world_engine_event_queue
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    ).catch(() => null),

    pool.query<{ phase: string; count: string }>(
      `SELECT phase, COUNT(*)::int AS count
       FROM world_engine_director_state
       WHERE updated_at >= NOW() - INTERVAL '7 days'
       GROUP BY phase
       ORDER BY count DESC`
    ).catch(() => null),

    pool.query<{ agency_high: string; spoiler_high: string; safety_high: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE output_json->'risk_assessment'->>'agency_risk' = 'high')::int AS agency_high,
         COUNT(*) FILTER (WHERE output_json->'risk_assessment'->>'spoiler_risk' = 'high')::int AS spoiler_high,
         COUNT(*) FILTER (WHERE output_json->'risk_assessment'->>'safety_risk' = 'high')::int AS safety_high
       FROM world_engine_runs
       WHERE created_at >= NOW() - INTERVAL '1 hour'
         AND status = 'succeeded'`
    ).catch(() => null),

    pool.query<{ we_dead: string; total_dead: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE job_type = 'WORLD_ENGINE_TICK')::int AS we_dead,
         COUNT(*)::int AS total_dead
       FROM vc_jobs
       WHERE status = 'dead'
         AND created_at >= NOW() - INTERVAL '24 hours'`
    ).catch(() => null),
  ]);

  // Liveness
  const liveness = {
    workerOnline: heartbeat !== null,
    workerCount: heartbeat ? 1 : 0,
    lastHeartbeatAt: heartbeat?.lastPollAt ?? null,
    lastTickSuccessAt: heartbeat ? (heartbeat as Record<string, unknown>).lastTickSuccess as string ?? null : null,
    consecutiveFailures: heartbeat?.consecutiveFailures ?? 0,
  };

  // Success rates
  const h1 = rowsOf(tickRuns1h)[0] ?? {};
  const h24 = rowsOf(tickRuns24h)[0] ?? {};
  const total1h = n(h1.total);
  const total24h = n(h24.total);
  const successRates = {
    last1h: total1h > 0 ? {
      total: total1h,
      succeeded: n(h1.succeeded),
      failed: n(h1.failed),
      rate: total1h > 0 ? Math.round((n(h1.succeeded) / total1h) * 1000) / 10 : 0,
    } : null,
    last24h: total24h > 0 ? {
      total: total24h,
      succeeded: n(h24.succeeded),
      failed: n(h24.failed),
      rate: total24h > 0 ? Math.round((n(h24.succeeded) / total24h) * 1000) / 10 : 0,
    } : null,
  };

  // Agenda effectiveness
  const agenda = rowsOf(agendaStats)[0] ?? {};
  const agendaCreated = n(agenda.total_created);
  const agendaInjected = n(agenda.injected);
  const agendaExpired = n(agenda.expired);
  const agendaEffectiveness = {
    totalCreated24h: agendaCreated,
    injected24h: agendaInjected,
    resolved24h: n(agenda.resolved),
    expired24h: agendaExpired,
    pendingCount: n(agenda.pending),
    dueCount: n(agenda.due),
    injectionRate: agendaCreated > 0 ? Math.round((agendaInjected / agendaCreated) * 1000) / 10 : 0,
    expirationRate: agendaCreated > 0 ? Math.round((agendaExpired / agendaCreated) * 1000) / 10 : 0,
  };

  // Director state summary
  const phaseRows = rowsOf(directorPhases);
  const phaseDistribution: Record<string, number> = {};
  let activeSessionCount = 0;
  for (const row of phaseRows) {
    const phase = String(row.phase ?? "unknown");
    const count = n(row.count);
    phaseDistribution[phase] = count;
    activeSessionCount += count;
  }
  const directorStateSummary = { activeSessionCount, phaseDistribution };

  // Risk events
  const risk = rowsOf(riskCounts)[0] ?? {};
  const riskEvents = {
    last1hAgencyHigh: n(risk.agency_high),
    last1hSpoilerHigh: n(risk.spoiler_high),
    last1hSafetyHigh: n(risk.safety_high),
  };

  // Dead jobs
  const dead = rowsOf(deadJobCounts)[0] ?? {};
  const deadJobs = {
    worldEngineDead24h: n(dead.we_dead),
    totalDead24h: n(dead.total_dead),
  };

  return {
    updatedAt: new Date().toISOString(),
    liveness,
    successRates,
    agendaEffectiveness,
    directorStateSummary,
    riskEvents,
    deadJobs,
  };
}
