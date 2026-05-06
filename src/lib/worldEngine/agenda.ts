import { pool } from "@/db/index";
import { resolveWorldDirectorConfig } from "./config";
import type { DirectorAgendaItem, DirectorRiskAssessment, RevealPolicy } from "./contracts";

export type DirectorAgendaStatus = "pending" | "due" | "injected" | "resolved" | "expired" | "rejected";

export type PersistedDirectorAgendaItem = {
  id: number;
  sessionId: string;
  userId: string | null;
  eventCode: string;
  title: string;
  status: DirectorAgendaStatus;
  dueTurnIndex: number;
  expiresTurnIndex: number;
  salience: number;
  priority: "low" | "medium" | "high";
  revealPolicy: RevealPolicy;
  injectionHint: string;
  agencyConstraints: string[];
  forbiddenOutcomes: string[];
  payload: Record<string, unknown>;
};

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function clampInt(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : fallback;
  return Math.max(min, Math.min(max, safe));
}

function normalizeAgendaRow(row: Record<string, unknown>): PersistedDirectorAgendaItem {
  return {
    id: Number(row.id ?? 0),
    sessionId: String(row.session_id ?? ""),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    eventCode: String(row.event_code ?? ""),
    title: String(row.title ?? ""),
    status:
      row.status === "due" ||
      row.status === "injected" ||
      row.status === "resolved" ||
      row.status === "expired" ||
      row.status === "rejected"
        ? row.status
        : "pending",
    dueTurnIndex: clampInt(row.due_turn_index, 0, 999999, 0),
    expiresTurnIndex: clampInt(row.expires_turn_index, 0, 999999, 0),
    salience: Math.max(0, Math.min(1, Number(row.salience ?? 0) / 100)),
    priority: row.priority === "high" || row.priority === "medium" ? row.priority : "low",
    revealPolicy:
      row.reveal_policy === "hold" ||
      row.reveal_policy === "soft_reveal" ||
      row.reveal_policy === "redirect"
        ? row.reveal_policy
        : "hint_only",
    injectionHint: String(row.injection_hint ?? ""),
    agencyConstraints: asStringArray(row.agency_constraints),
    forbiddenOutcomes: asStringArray(row.forbidden_outcomes),
    payload: asRecord(row.payload),
  };
}

async function raceTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  if (timeoutMs <= 0) return promise.catch(() => fallback);
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeout = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function insertDirectorAgendaItems(args: {
  runId: number;
  sessionId: string;
  userId: string | null;
  turnIndex: number;
  dedupKey: string;
  risk: DirectorRiskAssessment;
  revealPolicy: RevealPolicy;
  events: DirectorAgendaItem[];
}): Promise<{ created: number; skipped: number }> {
  if (!args.sessionId || args.events.length === 0) return { created: 0, skipped: 0 };
  let created = 0;
  let skipped = 0;
  const client = await pool.connect();
  try {
    for (const ev of args.events) {
      const dueTurn = Math.max(0, args.turnIndex + ev.due_in_turns);
      const expiresTurn = Math.max(dueTurn + 1, dueTurn + ev.ttl_turns);
      const r = await client.query<{ id: number }>(
        `INSERT INTO world_engine_event_queue (
           run_id, session_id, user_id, event_code, title, due_in_turns, priority,
           payload, status, due_turn_index, ttl_turns, expires_turn_index,
           salience, agency_risk, continuity_risk, spoiler_risk, reveal_policy,
           injection_hint, agency_constraints, forbidden_outcomes, dedup_key
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8::jsonb, 'pending', $9, $10, $11,
           $12, $13, $14, $15, $16,
           $17, $18::jsonb, $19::jsonb, $20
         )
         ON CONFLICT (session_id, event_code, dedup_key) DO NOTHING
         RETURNING id`,
        [
          args.runId,
          args.sessionId,
          args.userId,
          ev.event_code,
          ev.title,
          ev.due_in_turns,
          ev.priority,
          JSON.stringify(ev.payload ?? {}),
          dueTurn,
          ev.ttl_turns,
          expiresTurn,
          Math.round(ev.salience * 100),
          args.risk.agency_risk,
          args.risk.continuity_risk,
          args.risk.spoiler_risk,
          ev.payload?.reveal_policy ?? args.revealPolicy,
          ev.injection_hint,
          JSON.stringify(ev.agency_constraints ?? []),
          JSON.stringify(ev.forbidden_outcomes ?? []),
          `${args.dedupKey}:${ev.event_code}`,
        ]
      );
      if (r.rows[0]) created += 1;
      else skipped += 1;
    }
    return { created, skipped };
  } finally {
    client.release();
  }
}

export async function expireStaleDirectorAgenda(args: {
  sessionId: string;
  turnIndex: number;
}): Promise<void> {
  if (!args.sessionId) return;
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE world_engine_event_queue
       SET status = 'expired'
       WHERE session_id = $1
         AND status IN ('pending', 'due')
         AND expires_turn_index IS NOT NULL
         AND expires_turn_index < $2`,
      [args.sessionId, args.turnIndex]
    );
  } finally {
    client.release();
  }
}

export async function loadDueDirectorAgenda(args: {
  sessionId: string;
  turnIndex: number;
  limit?: number;
  timeoutMs?: number;
}): Promise<PersistedDirectorAgendaItem[]> {
  if (!args.sessionId) return [];
  const cfg = resolveWorldDirectorConfig();
  const limit = Math.max(1, Math.min(3, args.limit ?? cfg.maxDueHints));
  const query = (async (): Promise<PersistedDirectorAgendaItem[]> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE world_engine_event_queue
         SET status = 'expired'
         WHERE session_id = $1
           AND status IN ('pending', 'due')
           AND expires_turn_index IS NOT NULL
           AND expires_turn_index < $2`,
        [args.sessionId, args.turnIndex]
      );
      await client.query(
        `UPDATE world_engine_event_queue
         SET status = 'due'
         WHERE session_id = $1
           AND status = 'pending'
           AND COALESCE(due_turn_index, 999999) <= $2
           AND COALESCE(expires_turn_index, 999999) >= $2`,
        [args.sessionId, args.turnIndex]
      );
      const r = await client.query<Record<string, unknown>>(
        `SELECT id, session_id, user_id, event_code, title, status,
                due_turn_index, expires_turn_index, salience, priority, reveal_policy,
                injection_hint, agency_constraints, forbidden_outcomes, payload
         FROM world_engine_event_queue
         WHERE session_id = $1
           AND status = 'due'
           AND COALESCE(spoiler_risk, 'low') <> 'high'
           AND COALESCE(agency_risk, 'low') <> 'high'
           AND COALESCE(injection_hint, '') <> ''
         ORDER BY salience DESC NULLS LAST,
                  CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
                  due_turn_index ASC NULLS LAST,
                  id ASC
         LIMIT $2`,
        [args.sessionId, limit]
      );
      await client.query("COMMIT");
      return r.rows.map(normalizeAgendaRow);
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  })();
  return raceTimeout(query, args.timeoutMs ?? cfg.agendaQueryTimeoutMs, []);
}

export async function markDirectorAgendaInjected(args: {
  sessionId: string;
  agendaIds: readonly number[];
  turnIndex: number;
  requestId?: string | null;
}): Promise<void> {
  if (!args.sessionId || args.agendaIds.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE world_engine_event_queue
       SET status = 'injected',
           injected_turn_index = COALESCE(injected_turn_index, $3),
           payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('injected_request_id', $4::text)
       WHERE session_id = $1
         AND id = ANY($2::int[])
         AND status IN ('due', 'pending', 'injected')`,
      [args.sessionId, [...args.agendaIds], args.turnIndex, args.requestId ?? null]
    );
  } finally {
    client.release();
  }
}

export async function markDirectorAgendaResolved(args: {
  sessionId: string;
  agendaIds: readonly number[];
  turnIndex: number;
}): Promise<void> {
  if (!args.sessionId || args.agendaIds.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE world_engine_event_queue
       SET status = 'resolved',
           resolved_turn_index = COALESCE(resolved_turn_index, $3)
       WHERE session_id = $1
         AND id = ANY($2::int[])
         AND status IN ('injected', 'due', 'pending')`,
      [args.sessionId, [...args.agendaIds], args.turnIndex]
    );
  } finally {
    client.release();
  }
}

export async function markDirectorAgendaExpired(args: {
  sessionId: string;
  agendaIds: readonly number[];
  turnIndex: number;
}): Promise<void> {
  if (!args.sessionId || args.agendaIds.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE world_engine_event_queue
       SET status = 'expired'
       WHERE session_id = $1
         AND id = ANY($2::int[])
         AND status IN ('pending', 'due', 'injected')`,
      [args.sessionId, [...args.agendaIds]]
    );
  } finally {
    client.release();
  }
}
