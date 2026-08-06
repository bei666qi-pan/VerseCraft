import type { PoolClient } from "pg";
import { pool } from "@/db/index";
import { resolveWorldDirectorConfig } from "./config";
import type {
  DirectorAgendaItem,
  DirectorBranchSeed,
  DirectorConsistencyWarning,
  DirectorNpcAction,
  DirectorPrivateHook,
  DirectorRiskAssessment,
  RevealPolicy,
} from "./contracts";
import {
  findDeadNpcInPersistedAgendaItem,
  type DirectorEnforcerGameState,
} from "./directorEnforcer";

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
  /** When provided, runs on this existing client (caller owns lifecycle). Otherwise acquires from pool. */
  client?: PoolClient;
}): Promise<{ created: number; skipped: number }> {
  if (!args.sessionId || args.events.length === 0) return { created: 0, skipped: 0 };
  let created = 0;
  let skipped = 0;
  const client = args.client ?? await pool.connect();
  const ownedClient = args.client ? null : client;
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
    ownedClient?.release();
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

export type DirectorAgendaLoadResult = {
  items: PersistedDirectorAgendaItem[];
  directorIntent?: string;
  currentPhase?: string;
  pacingSummary?: { tension: number; mystery: number; fatigue: number };
  /** Count of items rejected by directorEnforcer during this load. */
  enforcerRejectedCount: number;
  /** Short reasons for each rejection (max 8, for diagnostics). */
  enforcerRejectionReasons: string[];
};

function normalizePacingFromJson(raw: unknown): { tension: number; mystery: number; fatigue: number } | undefined {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return undefined;
  const tension = typeof o.tension === "number" && Number.isFinite(o.tension) ? o.tension : undefined;
  const mystery = typeof o.mystery === "number" && Number.isFinite(o.mystery) ? o.mystery : undefined;
  const fatigue = typeof o.fatigue === "number" && Number.isFinite(o.fatigue) ? o.fatigue : undefined;
  if (tension === undefined && mystery === undefined && fatigue === undefined) return undefined;
  return {
    tension: Math.max(0, Math.min(1, tension ?? 0)),
    mystery: Math.max(0, Math.min(1, mystery ?? 0)),
    fatigue: Math.max(0, Math.min(1, fatigue ?? 0)),
  };
}

export async function loadDueDirectorAgenda(args: {
  sessionId: string;
  turnIndex: number;
  limit?: number;
  timeoutMs?: number;
  /** When provided, loaded agenda items are validated against game state
   *  via directorEnforcer before being returned. */
  gameState?: DirectorEnforcerGameState;
}): Promise<DirectorAgendaLoadResult> {
  if (!args.sessionId) return { items: [], enforcerRejectedCount: 0, enforcerRejectionReasons: [] };
  const cfg = resolveWorldDirectorConfig();
  const limit = Math.max(1, Math.min(3, args.limit ?? cfg.maxDueHints));
  const query = (async (): Promise<DirectorAgendaLoadResult> => {
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
      const [agendaResult, directorResult] = await Promise.all([
        client.query<Record<string, unknown>>(
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
        ),
        client.query<{ phase: string; pacing_json: Record<string, unknown> | null; recent_director_intent: string | null }>(
          `SELECT phase, pacing_json, recent_director_intent
           FROM world_engine_director_state
           WHERE session_id = $1
           LIMIT 1`,
          [args.sessionId]
        ),
      ]);
      await client.query("COMMIT");

      const directorRow = directorResult.rows[0] ?? null;
      let items = agendaResult.rows.map(normalizeAgendaRow);
      let enforcerRejectedCount = 0;
      const enforcerRejectionReasons: string[] = [];

      if (args.gameState && items.length > 0) {
        const deadIds =
          args.gameState.deadOrInactiveNpcIds instanceof Set
            ? args.gameState.deadOrInactiveNpcIds
            : new Set(args.gameState.deadOrInactiveNpcIds ?? []);
        if (deadIds.size > 0) {
          const kept: PersistedDirectorAgendaItem[] = [];
          for (const item of items) {
            const hit = findDeadNpcInPersistedAgendaItem(
              { title: item.title, injectionHint: item.injectionHint, payload: item.payload },
              deadIds
            );
            if (hit) {
              enforcerRejectedCount++;
              if (enforcerRejectionReasons.length < 8) {
                enforcerRejectionReasons.push(
                  `agenda "${item.eventCode}" references dead/inactive NPC "${hit}"`
                );
              }
            } else {
              kept.push(item);
            }
          }
          items = kept;
        }
      }

      return {
        items,
        directorIntent: directorRow?.recent_director_intent?.trim() || undefined,
        currentPhase: directorRow?.phase?.trim() || undefined,
        pacingSummary: normalizePacingFromJson(directorRow?.pacing_json),
        enforcerRejectedCount,
        enforcerRejectionReasons,
      };
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.warn('[worldEngine] ROLLBACK failed in loadDueDirectorAgenda', {
          message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        });
      }
      throw e;
    } finally {
      client.release();
    }
  })();
  return raceTimeout(query, args.timeoutMs ?? cfg.agendaQueryTimeoutMs, {
    items: [],
    enforcerRejectedCount: 0,
    enforcerRejectionReasons: [],
  });
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

/**
 * 从 world_engine_agenda_snapshots 中读取最近一条 snapshot 的 langgraph_hint_block。
 * LangGraph 路径生成的导演提示块比 promptAssembly 中独立重建的更丰富
 * （包含 phase, intent, pacing, key events, NPC actions, forbidden outcomes）。
 * 可用时优先使用该字段，否则回退到 promptAssembly 的独立重建逻辑。
 */
export async function loadLanggraphHintBlock(args: {
  sessionId: string;
  timeoutMs?: number;
}): Promise<string | null> {
  if (!args.sessionId) return null;
  const cfg = resolveWorldDirectorConfig();
  const timeoutMs = args.timeoutMs ?? cfg.agendaQueryTimeoutMs;

  const query = (async (): Promise<string | null> => {
    const client = await pool.connect();
    try {
      const r = await client.query<{ snapshot_json: Record<string, unknown> }>(
        `SELECT snapshot_json
         FROM world_engine_agenda_snapshots
         WHERE session_id = $1
         ORDER BY agenda_revision DESC
         LIMIT 1`,
        [args.sessionId]
      );
      if (r.rows.length === 0) return null;
      const raw = r.rows[0]?.snapshot_json?.langgraph_hint_block;
      if (typeof raw !== "string" || !raw.trim()) return null;
      return raw;
    } finally {
      client.release();
    }
  })();

  try {
    if (timeoutMs <= 0) return await query;
    return await Promise.race([
      query,
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs)
      ),
    ]);
  } catch {
    return null;
  }
}

/**
 * 从 world_engine_agenda_snapshots 中读取最近一条 snapshot 的 npc_next_actions。
 * 用于将世界引擎规划的 NPC 后台行动注入主笔 prompt，作为 DM 写作的行为指引。
 */
export async function loadRecentNpcActions(args: {
  sessionId: string;
  timeoutMs?: number;
}): Promise<DirectorNpcAction[]> {
  if (!args.sessionId) return [];
  const cfg = resolveWorldDirectorConfig();
  const timeoutMs = args.timeoutMs ?? cfg.agendaQueryTimeoutMs;

  const query = (async (): Promise<DirectorNpcAction[]> => {
    const client = await pool.connect();
    try {
      const r = await client.query<{ snapshot_json: Record<string, unknown> }>(
        `SELECT snapshot_json
         FROM world_engine_agenda_snapshots
         WHERE session_id = $1
         ORDER BY agenda_revision DESC
         LIMIT 1`,
        [args.sessionId]
      );
      if (r.rows.length === 0) return [];
      const raw = r.rows[0]?.snapshot_json?.npc_next_actions;
      if (!Array.isArray(raw)) return [];
      const out: DirectorNpcAction[] = [];
      for (const x of raw) {
        if (!x || typeof x !== "object" || Array.isArray(x)) continue;
        const o = x as Record<string, unknown>;
        const npcCode = typeof o.npc_code === "string" ? o.npc_code.trim() : "";
        const action = typeof o.action === "string" ? o.action.trim() : "";
        const urgency =
          o.urgency === "high" || o.urgency === "medium" ? o.urgency : "low";
        if (!npcCode || !action) continue;
        out.push({
          npc_code: npcCode,
          action,
          urgency,
          eta_turns: typeof o.eta_turns === "number" && Number.isFinite(o.eta_turns)
            ? Math.max(0, Math.trunc(o.eta_turns))
            : 1,
        });
        if (out.length >= 12) break;
      }
      return out;
    } finally {
      client.release();
    }
  })();

  try {
    if (timeoutMs <= 0) return await query;
    return await Promise.race([
      query,
      new Promise<DirectorNpcAction[]>((resolve) =>
        setTimeout(() => resolve([]), timeoutMs)
      ),
    ]);
  } catch {
    return [];
  }
}

/**
 * 从 world_engine_agenda_snapshots 中读取最近一条 snapshot 的 player_private_hooks。
 * 用于将世界引擎规划的玩家私有伏笔注入主笔 prompt。
 * hooks 按 tag 分类：
 *  - must_recall: 必须回收的伏笔
 *  - forbidden_reveal: 禁止揭露的内容
 */
export async function loadRecentPlayerHooks(args: {
  sessionId: string;
  timeoutMs?: number;
}): Promise<DirectorPrivateHook[]> {
  if (!args.sessionId) return [];
  const cfg = resolveWorldDirectorConfig();
  const timeoutMs = args.timeoutMs ?? cfg.agendaQueryTimeoutMs;

  const query = (async (): Promise<DirectorPrivateHook[]> => {
    const client = await pool.connect();
    try {
      const r = await client.query<{ snapshot_json: Record<string, unknown> }>(
        `SELECT snapshot_json
         FROM world_engine_agenda_snapshots
         WHERE session_id = $1
         ORDER BY agenda_revision DESC
         LIMIT 1`,
        [args.sessionId]
      );
      if (r.rows.length === 0) return [];
      const raw = r.rows[0]?.snapshot_json?.player_private_hooks;
      if (!Array.isArray(raw)) return [];
      const out: DirectorPrivateHook[] = [];
      for (const x of raw) {
        if (!x || typeof x !== "object" || Array.isArray(x)) continue;
        const o = x as Record<string, unknown>;
        const hookCode = typeof o.hook_code === "string" ? o.hook_code.trim() : "";
        const summary = typeof o.summary === "string" ? o.summary.trim() : "";
        if (!hookCode || !summary) continue;
        const tag = typeof o.tag === "string" ? o.tag.trim() : undefined;
        out.push({
          hook_code: hookCode,
          summary,
          ttl_turns: typeof o.ttl_turns === "number" && Number.isFinite(o.ttl_turns)
            ? Math.max(1, Math.trunc(o.ttl_turns))
            : 6,
          must_not_surface_directly: true,
          ...(tag ? { tag } : {}),
        });
        if (out.length >= 12) break;
      }
      return out;
    } finally {
      client.release();
    }
  })();

  try {
    if (timeoutMs <= 0) return await query;
    return await Promise.race([
      query,
      new Promise<DirectorPrivateHook[]>((resolve) =>
        setTimeout(() => resolve([]), timeoutMs)
      ),
    ]);
  } catch {
    return [];
  }
}

export type RecentBranchSeedsAndWarnings = {
  seeds: DirectorBranchSeed[];
  warnings: DirectorConsistencyWarning[];
};

/**
 * 从 world_engine_agenda_snapshots 中读取最近一条 snapshot 的
 * story_branch_seeds 和 consistency_warnings。
 * 用于将世界引擎规划的分支提示和连续性警告注入主笔 prompt。
 */
export async function loadRecentBranchSeedsAndWarnings(args: {
  sessionId: string;
  timeoutMs?: number;
}): Promise<RecentBranchSeedsAndWarnings> {
  if (!args.sessionId) return { seeds: [], warnings: [] };
  const cfg = resolveWorldDirectorConfig();
  const timeoutMs = args.timeoutMs ?? cfg.agendaQueryTimeoutMs;

  const query = (async (): Promise<RecentBranchSeedsAndWarnings> => {
    const client = await pool.connect();
    try {
      const r = await client.query<{ snapshot_json: Record<string, unknown> }>(
        `SELECT snapshot_json
         FROM world_engine_agenda_snapshots
         WHERE session_id = $1
         ORDER BY agenda_revision DESC
         LIMIT 1`,
        [args.sessionId]
      );
      if (r.rows.length === 0) return { seeds: [], warnings: [] };
      const raw = r.rows[0]?.snapshot_json;

      const seedsRaw = raw?.story_branch_seeds;
      const warningsRaw = raw?.consistency_warnings;

      const seeds: DirectorBranchSeed[] = [];
      if (Array.isArray(seedsRaw)) {
        for (const x of seedsRaw) {
          if (!x || typeof x !== "object" || Array.isArray(x)) continue;
          const o = x as Record<string, unknown>;
          const seedCode = typeof o.seed_code === "string" ? o.seed_code.trim() : "";
          const summary = typeof o.summary === "string" ? o.summary.trim() : "";
          if (!seedCode || !summary) continue;
          seeds.push({
            seed_code: seedCode,
            summary,
            confidence:
              typeof o.confidence === "number" && Number.isFinite(o.confidence)
                ? Math.max(0, Math.min(1, o.confidence))
                : 0,
          });
          if (seeds.length >= 12) break;
        }
      }

      const warnings: DirectorConsistencyWarning[] = [];
      if (Array.isArray(warningsRaw)) {
        for (const x of warningsRaw) {
          if (!x || typeof x !== "object" || Array.isArray(x)) continue;
          const o = x as Record<string, unknown>;
          const code = typeof o.code === "string" ? o.code.trim() : "";
          const message = typeof o.message === "string" ? o.message.trim() : "";
          const severity =
            o.severity === "high" || o.severity === "medium" ? o.severity : "low";
          if (!code || !message) continue;
          warnings.push({ code, message, severity });
          if (warnings.length >= 12) break;
        }
      }

      return { seeds, warnings };
    } finally {
      client.release();
    }
  })();

  try {
    if (timeoutMs <= 0) return await query;
    return await Promise.race([
      query,
      new Promise<RecentBranchSeedsAndWarnings>((resolve) =>
        setTimeout(() => resolve({ seeds: [], warnings: [] }), timeoutMs)
      ),
    ]);
  } catch {
    return { seeds: [], warnings: [] };
  }
}
