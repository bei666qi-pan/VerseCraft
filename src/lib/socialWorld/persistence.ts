import { normalizeNpcAgentState, normalizeNpcRelationEdge, normalizeSocialEvent } from "@/lib/socialWorld/state";
import type {
  NpcAgentState,
  NpcRelationEdge,
  SocialEvent,
  SocialWorldWriteResult,
} from "@/lib/socialWorld/types";
import type { MemorySpineEntry } from "@/lib/memorySpine/types";

export type SocialWorldPersistenceOptions = {
  userId?: string | null;
};

export type SocialWorldInsertEventsOptions = SocialWorldPersistenceOptions & {
  defaultTtlTurns?: number;
};

export type SocialWorldPersistenceAdapter = {
  loadNpcAgentStates(sessionId: string): Promise<NpcAgentState[]>;
  upsertNpcAgentStates(
    sessionId: string,
    states: readonly NpcAgentState[],
    opts?: SocialWorldPersistenceOptions
  ): Promise<SocialWorldWriteResult>;
  loadNpcRelationEdges(sessionId: string): Promise<NpcRelationEdge[]>;
  upsertNpcRelationEdges(
    sessionId: string,
    edges: readonly NpcRelationEdge[],
    opts?: SocialWorldPersistenceOptions
  ): Promise<SocialWorldWriteResult>;
  insertSocialEvents(
    sessionId: string,
    events: readonly SocialEvent[],
    dedupKey: string,
    opts?: SocialWorldInsertEventsOptions
  ): Promise<SocialWorldWriteResult>;
  loadDueSocialEventsForPrompt(sessionId: string, nowTurn: number, maxItems: number): Promise<SocialEvent[]>;
  loadRecentSocialEventsForCooldown?(
    sessionId: string,
    nowTurn: number,
    lookbackTurns: number
  ): Promise<SocialEvent[]>;
  countPendingSocialEvents?(sessionId: string): Promise<number>;
  markSocialEventsProjected(sessionId: string, eventIds: readonly string[]): Promise<number>;
  expireOldSocialEvents(sessionId: string, nowTurn: number): Promise<number>;
  upsertMemorySpineEntries?(
    sessionId: string,
    entries: readonly MemorySpineEntry[],
    opts?: SocialWorldPersistenceOptions
  ): Promise<SocialWorldWriteResult>;
};

export type SocialWorldPersistence = SocialWorldPersistenceAdapter;

const EMPTY_WRITE_RESULT: SocialWorldWriteResult = Object.freeze({ inserted: 0, updated: 0, skipped: 0 });

function normalizeSessionId(sessionId: string): string {
  return typeof sessionId === "string" ? sessionId.trim() : "";
}

function normalizeUserId(userId: string | null | undefined): string | null {
  const text = typeof userId === "string" ? userId.trim() : "";
  return text || null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const safe = Number.isFinite(numeric) ? Math.trunc(numeric) : fallback;
  return Math.max(min, Math.min(max, safe));
}

function canonicalNpcKey(ids: readonly string[]): string {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort().join("|");
}

function dueTurnOf(event: SocialEvent): number {
  return clampInt(event.dueTurn ?? event.turn, 0, 999999, 0);
}

function expiresTurnOf(event: SocialEvent, defaultTtlTurns: number): number {
  const due = dueTurnOf(event);
  return clampInt(event.expiresTurn ?? due + defaultTtlTurns, due, 999999, due + defaultTtlTurns);
}

function relevanceRank(event: SocialEvent): number {
  if (event.playerRelevance === "high") return 3;
  if (event.playerRelevance === "medium") return 2;
  if (event.playerRelevance === "low") return 1;
  return 0;
}

function isPromptEligible(event: SocialEvent, nowTurn: number): boolean {
  if (event.status !== "scheduled" && event.status !== "committed") return false;
  if (event.visibility === "private") return false;
  if (event.knowledgeScope === "dmOnly") return false;
  if (event.playerRelevance === "none") return false;
  if (dueTurnOf(event) > nowTurn) return false;
  if (event.expiresTurn != null && event.expiresTurn < nowTurn) return false;
  return true;
}

function normalizeLimit(maxItems: number): number {
  return Math.max(0, Math.min(8, Math.trunc(maxItems || 0)));
}

function emptyLoad<T>(): T[] {
  return [];
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function defaultWarn(operation: string, error: unknown): void {
  console.warn(`[socialWorld][persistence] ${operation} failed: ${errorReason(error)}`, error);
}

export function createSocialWorldPersistence(
  adapter: SocialWorldPersistenceAdapter,
  opts?: { warn?: (operation: string, error: unknown) => void }
): SocialWorldPersistence {
  const warn = opts?.warn ?? defaultWarn;
  return {
    async loadNpcAgentStates(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) return [];
      try {
        return await adapter.loadNpcAgentStates(normalizedSessionId);
      } catch (error) {
        warn("loadNpcAgentStates", error);
        return emptyLoad<NpcAgentState>();
      }
    },
    async upsertNpcAgentStates(sessionId, states, writeOpts) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId || states.length === 0) return { ...EMPTY_WRITE_RESULT };
      try {
        return await adapter.upsertNpcAgentStates(normalizedSessionId, states, writeOpts);
      } catch (error) {
        warn("upsertNpcAgentStates", error);
        return { ...EMPTY_WRITE_RESULT };
      }
    },
    async loadNpcRelationEdges(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) return [];
      try {
        return await adapter.loadNpcRelationEdges(normalizedSessionId);
      } catch (error) {
        warn("loadNpcRelationEdges", error);
        return emptyLoad<NpcRelationEdge>();
      }
    },
    async upsertNpcRelationEdges(sessionId, edges, writeOpts) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId || edges.length === 0) return { ...EMPTY_WRITE_RESULT };
      try {
        return await adapter.upsertNpcRelationEdges(normalizedSessionId, edges, writeOpts);
      } catch (error) {
        warn("upsertNpcRelationEdges", error);
        return { ...EMPTY_WRITE_RESULT };
      }
    },
    async insertSocialEvents(sessionId, events, dedupKey, writeOpts) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const normalizedDedupKey = dedupKey.trim();
      if (!normalizedSessionId || !normalizedDedupKey || events.length === 0) return { ...EMPTY_WRITE_RESULT };
      try {
        return await adapter.insertSocialEvents(normalizedSessionId, events, normalizedDedupKey, writeOpts);
      } catch (error) {
        warn("insertSocialEvents", error);
        return { ...EMPTY_WRITE_RESULT };
      }
    },
    async loadDueSocialEventsForPrompt(sessionId, nowTurn, maxItems) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const limit = normalizeLimit(maxItems);
      if (!normalizedSessionId || limit <= 0) return [];
      try {
        return await adapter.loadDueSocialEventsForPrompt(
          normalizedSessionId,
          clampInt(nowTurn, 0, 999999, 0),
          limit
        );
      } catch (error) {
        warn("loadDueSocialEventsForPrompt", error);
        return emptyLoad<SocialEvent>();
      }
    },
    async markSocialEventsProjected(sessionId, eventIds) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      const ids = [...new Set(eventIds.map((id) => id.trim()).filter(Boolean))];
      if (!normalizedSessionId || ids.length === 0) return 0;
      try {
        return await adapter.markSocialEventsProjected(normalizedSessionId, ids);
      } catch (error) {
        warn("markSocialEventsProjected", error);
        return 0;
      }
    },
    async expireOldSocialEvents(sessionId, nowTurn) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId) return 0;
      try {
        return await adapter.expireOldSocialEvents(normalizedSessionId, clampInt(nowTurn, 0, 999999, 0));
      } catch (error) {
        warn("expireOldSocialEvents", error);
        return 0;
      }
    },
    async loadRecentSocialEventsForCooldown(sessionId, nowTurn, lookbackTurns) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId || !adapter.loadRecentSocialEventsForCooldown) return [];
      try {
        return await adapter.loadRecentSocialEventsForCooldown(
          normalizedSessionId,
          clampInt(nowTurn, 0, 999999, 0),
          clampInt(lookbackTurns, 0, 48, 3)
        );
      } catch (error) {
        warn("loadRecentSocialEventsForCooldown", error);
        return emptyLoad<SocialEvent>();
      }
    },
    async countPendingSocialEvents(sessionId) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId || !adapter.countPendingSocialEvents) return 0;
      try {
        const count = await adapter.countPendingSocialEvents(normalizedSessionId);
        return Math.max(0, Math.trunc(Number(count) || 0));
      } catch (error) {
        warn("countPendingSocialEvents", error);
        return 0;
      }
    },
    async upsertMemorySpineEntries(sessionId, entries, writeOpts) {
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!normalizedSessionId || entries.length === 0 || !adapter.upsertMemorySpineEntries) {
        return { ...EMPTY_WRITE_RESULT };
      }
      try {
        return await adapter.upsertMemorySpineEntries(normalizedSessionId, entries, writeOpts);
      } catch (error) {
        warn("upsertMemorySpineEntries", error);
        return { ...EMPTY_WRITE_RESULT };
      }
    },
  };
}

export function createInMemorySocialWorldPersistence(): SocialWorldPersistence {
  const agentStates = new Map<string, Map<string, NpcAgentState>>();
  const relationEdges = new Map<string, Map<string, NpcRelationEdge>>();
  const memorySpineEntries = new Map<string, Map<string, MemorySpineEntry>>();
  const socialEvents = new Map<
    string,
    Array<{ event: SocialEvent; dedupKey: string; actorKey: string; targetKey: string; createdOrder: number }>
  >();
  let order = 0;

  const adapter: SocialWorldPersistenceAdapter = {
    async loadNpcAgentStates(sessionId) {
      return [...(agentStates.get(sessionId)?.values() ?? [])].map((state) => ({ ...state, agenda: [...state.agenda] }));
    },
    async upsertNpcAgentStates(sessionId, states) {
      let updated = 0;
      const bucket = agentStates.get(sessionId) ?? new Map<string, NpcAgentState>();
      agentStates.set(sessionId, bucket);
      for (const raw of states) {
        const state = normalizeNpcAgentState(raw, raw.lastActiveTurn);
        if (!state.npcId) continue;
        if (bucket.has(state.npcId)) updated += 1;
        bucket.set(state.npcId, state);
      }
      return { inserted: states.length - updated, updated, skipped: 0 };
    },
    async loadNpcRelationEdges(sessionId) {
      return [...(relationEdges.get(sessionId)?.values() ?? [])].map((edge) => ({
        ...edge,
        knownSharedFactIds: [...edge.knownSharedFactIds],
        unresolvedTensionCodes: [...edge.unresolvedTensionCodes],
      }));
    },
    async upsertNpcRelationEdges(sessionId, edges) {
      let updated = 0;
      const bucket = relationEdges.get(sessionId) ?? new Map<string, NpcRelationEdge>();
      relationEdges.set(sessionId, bucket);
      for (const raw of edges) {
        const edge = normalizeNpcRelationEdge(raw);
        if (!edge.fromNpcId || !edge.toNpcId) continue;
        const key = `${edge.fromNpcId}->${edge.toNpcId}`;
        if (bucket.has(key)) updated += 1;
        bucket.set(key, edge);
      }
      return { inserted: edges.length - updated, updated, skipped: 0 };
    },
    async insertSocialEvents(sessionId, events, dedupKey, opts) {
      let inserted = 0;
      let skipped = 0;
      const bucket = socialEvents.get(sessionId) ?? [];
      socialEvents.set(sessionId, bucket);
      for (const raw of events) {
        const event = normalizeSocialEvent(raw);
        const actorKey = canonicalNpcKey(event.actorNpcIds);
        const targetKey = canonicalNpcKey(event.targetNpcIds);
        const duplicate = bucket.some(
          (row) =>
            row.dedupKey === dedupKey &&
            row.event.type === event.type &&
            row.actorKey === actorKey &&
            row.targetKey === targetKey
        );
        if (duplicate) {
          skipped += 1;
          continue;
        }
        bucket.push({
          event: {
            ...event,
            dueTurn: dueTurnOf(event),
            expiresTurn: expiresTurnOf(event, opts?.defaultTtlTurns ?? 6),
          },
          dedupKey,
          actorKey,
          targetKey,
          createdOrder: order++,
        });
        inserted += 1;
      }
      return { inserted, updated: 0, skipped };
    },
    async loadDueSocialEventsForPrompt(sessionId, nowTurn, maxItems) {
      return (socialEvents.get(sessionId) ?? [])
        .filter((row) => isPromptEligible(row.event, nowTurn))
        .sort((a, b) => {
          const relevance = relevanceRank(b.event) - relevanceRank(a.event);
          if (relevance !== 0) return relevance;
          const due = dueTurnOf(a.event) - dueTurnOf(b.event);
          if (due !== 0) return due;
          return a.createdOrder - b.createdOrder;
        })
        .slice(0, normalizeLimit(maxItems))
        .map((row) => ({ ...row.event }));
    },
    async loadRecentSocialEventsForCooldown(sessionId, nowTurn, lookbackTurns) {
      const minTurn = Math.max(0, nowTurn - Math.max(0, Math.trunc(lookbackTurns)));
      return (socialEvents.get(sessionId) ?? [])
        .filter(
          (row) =>
            row.event.status !== "expired" &&
            row.event.turn >= minTurn &&
            row.event.turn <= nowTurn
        )
        .map((row) => ({ ...row.event }));
    },
    async countPendingSocialEvents(sessionId) {
      return (socialEvents.get(sessionId) ?? []).filter(
        (row) => row.event.status === "scheduled" || row.event.status === "committed"
      ).length;
    },
    async markSocialEventsProjected(sessionId, eventIds) {
      const ids = new Set(eventIds);
      let count = 0;
      for (const row of socialEvents.get(sessionId) ?? []) {
        if (!ids.has(row.event.id)) continue;
        row.event = { ...row.event, status: "revealed" };
        count += 1;
      }
      return count;
    },
    async expireOldSocialEvents(sessionId, nowTurn) {
      let count = 0;
      for (const row of socialEvents.get(sessionId) ?? []) {
        if (row.event.status === "revealed" || row.event.status === "expired") continue;
        if (row.event.expiresTurn != null && row.event.expiresTurn < nowTurn) {
          row.event = { ...row.event, status: "expired" };
          count += 1;
        }
      }
      return count;
    },
    async upsertMemorySpineEntries(sessionId, entries) {
      let inserted = 0;
      let updated = 0;
      const bucket = memorySpineEntries.get(sessionId) ?? new Map<string, MemorySpineEntry>();
      memorySpineEntries.set(sessionId, bucket);
      for (const entry of entries) {
        const key = entry.mergeKey || entry.id;
        if (!key) continue;
        if (bucket.has(key)) updated += 1;
        else inserted += 1;
        bucket.set(key, { ...entry, anchors: { ...entry.anchors }, recallTags: [...entry.recallTags] });
      }
      return { inserted, updated, skipped: 0 };
    },
  };

  return createSocialWorldPersistence(adapter, { warn: () => undefined });
}

type PgQueryClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

async function withPgClient<T>(fn: (client: PgQueryClient) => Promise<T>): Promise<T> {
  const { pool } = await import("@/db");
  const client = await pool.connect();
  try {
    return await fn(client as PgQueryClient);
  } finally {
    client.release();
  }
}

export const SOCIAL_MEMORY_SPINE_EMBED_KEY = "__vc_social_memory_spine_v1";

const pgAdapter: SocialWorldPersistenceAdapter = {
  async loadNpcAgentStates(sessionId) {
    const rows = await withPgClient(async (client) => {
      const result = await client.query(
        `SELECT state_json
         FROM npc_agent_state
         WHERE session_id = $1
         ORDER BY npc_id ASC`,
        [sessionId]
      );
      return result.rows;
    });
    return rows.map((row) => normalizeNpcAgentState(row.state_json, 0));
  },
  async upsertNpcAgentStates(sessionId, states, opts) {
    const userId = normalizeUserId(opts?.userId);
    let inserted = 0;
    let updated = 0;
    await withPgClient(async (client) => {
      for (const raw of states) {
        const state = normalizeNpcAgentState(raw, raw.lastActiveTurn);
        if (!state.npcId) continue;
        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO npc_agent_state (
             session_id, user_id, npc_id, state_json, status, last_active_turn, next_eligible_turn, updated_at
           )
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, CURRENT_TIMESTAMP)
           ON CONFLICT (session_id, npc_id) DO UPDATE SET
             user_id = COALESCE(EXCLUDED.user_id, npc_agent_state.user_id),
             state_json = EXCLUDED.state_json,
             status = EXCLUDED.status,
             last_active_turn = EXCLUDED.last_active_turn,
             next_eligible_turn = EXCLUDED.next_eligible_turn,
             updated_at = CURRENT_TIMESTAMP
           RETURNING (xmax = 0) AS inserted`,
          [
            sessionId,
            userId,
            state.npcId,
            JSON.stringify(state),
            state.status,
            state.lastActiveTurn,
            state.nextEligibleTurn,
          ]
        );
        if (result.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }
      return [];
    });
    return { inserted, updated, skipped: 0 };
  },
  async loadNpcRelationEdges(sessionId) {
    const rows = await withPgClient(async (client) => {
      const result = await client.query(
        `SELECT edge_json
         FROM npc_relation_edges
         WHERE session_id = $1
         ORDER BY from_npc_id ASC, to_npc_id ASC`,
        [sessionId]
      );
      return result.rows;
    });
    return rows.map((row) => normalizeNpcRelationEdge(row.edge_json));
  },
  async upsertNpcRelationEdges(sessionId, edges, opts) {
    const userId = normalizeUserId(opts?.userId);
    let inserted = 0;
    let updated = 0;
    await withPgClient(async (client) => {
      for (const raw of edges) {
        const edge = normalizeNpcRelationEdge(raw);
        if (!edge.fromNpcId || !edge.toNpcId) continue;
        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO npc_relation_edges (
             session_id, user_id, from_npc_id, to_npc_id, edge_json, updated_at
           )
           VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (session_id, from_npc_id, to_npc_id) DO UPDATE SET
             user_id = COALESCE(EXCLUDED.user_id, npc_relation_edges.user_id),
             edge_json = EXCLUDED.edge_json,
             updated_at = CURRENT_TIMESTAMP
           RETURNING (xmax = 0) AS inserted`,
          [sessionId, userId, edge.fromNpcId, edge.toNpcId, JSON.stringify(edge)]
        );
        if (result.rows[0]?.inserted) inserted += 1;
        else updated += 1;
      }
      return [];
    });
    return { inserted, updated, skipped: 0 };
  },
  async insertSocialEvents(sessionId, events, dedupKey, opts) {
    const userId = normalizeUserId(opts?.userId);
    let inserted = 0;
    let skipped = 0;
    await withPgClient(async (client) => {
      for (const raw of events) {
        const event = normalizeSocialEvent(raw);
        const actorKey = canonicalNpcKey(event.actorNpcIds);
        const targetKey = canonicalNpcKey(event.targetNpcIds);
        if (!actorKey || !targetKey) {
          skipped += 1;
          continue;
        }
        const dueTurn = dueTurnOf(event);
        const expiresTurn = expiresTurnOf(event, opts?.defaultTtlTurns ?? 6);
        const storedEvent = { ...event, dueTurn, expiresTurn };
        const result = await client.query<{ id: string | number }>(
          `INSERT INTO social_event_ledger (
             session_id, user_id, event_id, event_type, actor_key, target_key, dedup_key,
             turn_index, due_turn_index, expires_turn_index, visibility, player_relevance,
             escape_relevance, knowledge_scope, status, event_json
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12,
             $13, $14, $15, $16::jsonb
           )
           ON CONFLICT (session_id, event_type, actor_key, target_key, dedup_key) DO NOTHING
           RETURNING id`,
          [
            sessionId,
            userId,
            storedEvent.id,
            storedEvent.type,
            actorKey,
            targetKey,
            dedupKey,
            storedEvent.turn,
            dueTurn,
            expiresTurn,
            storedEvent.visibility,
            storedEvent.playerRelevance,
            storedEvent.escapeRelevance,
            storedEvent.knowledgeScope,
            storedEvent.status,
            JSON.stringify(storedEvent),
          ]
        );
        if (result.rows[0]) inserted += 1;
        else skipped += 1;
      }
      return [];
    });
    return { inserted, updated: 0, skipped };
  },
  async loadDueSocialEventsForPrompt(sessionId, nowTurn, maxItems) {
    const rows = await withPgClient(async (client) => {
      const result = await client.query(
        `SELECT event_json
         FROM social_event_ledger
         WHERE session_id = $1
           AND status IN ('scheduled', 'committed')
           AND visibility <> 'private'
           AND knowledge_scope <> 'dmOnly'
           AND player_relevance <> 'none'
           AND due_turn_index <= $2
           AND (expires_turn_index IS NULL OR expires_turn_index >= $2)
         ORDER BY CASE player_relevance
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 1
                    ELSE 0
                  END DESC,
                  due_turn_index ASC,
                  id ASC
         LIMIT $3`,
        [sessionId, nowTurn, normalizeLimit(maxItems)]
      );
      return result.rows;
    });
    return rows.map((row) => normalizeSocialEvent(row.event_json));
  },
  async loadRecentSocialEventsForCooldown(sessionId, nowTurn, lookbackTurns) {
    const fromTurn = Math.max(0, Math.trunc(nowTurn) - Math.max(0, Math.trunc(lookbackTurns)));
    const rows = await withPgClient(async (client) => {
      const result = await client.query(
        `SELECT event_json
         FROM social_event_ledger
         WHERE session_id = $1
           AND status IN ('scheduled', 'committed', 'revealed')
           AND turn_index >= $2
           AND turn_index <= $3
         ORDER BY turn_index DESC, id DESC
         LIMIT 32`,
        [sessionId, fromTurn, nowTurn]
      );
      return result.rows;
    });
    return rows.map((row) => normalizeSocialEvent(row.event_json));
  },
  async countPendingSocialEvents(sessionId) {
    const rows = await withPgClient(async (client) => {
      const result = await client.query<{ count: string | number }>(
        `SELECT COUNT(*)::int AS count
         FROM social_event_ledger
         WHERE session_id = $1
           AND status IN ('scheduled', 'committed')`,
        [sessionId]
      );
      return result.rows;
    });
    return Number(rows[0]?.count ?? 0);
  },
  async markSocialEventsProjected(sessionId, eventIds) {
    const rows = await withPgClient(async (client) => {
      const result = await client.query(
        `UPDATE social_event_ledger
         SET status = 'revealed',
             projected_at = COALESCE(projected_at, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1
           AND event_id = ANY($2::varchar[])
           AND status IN ('scheduled', 'committed')
         RETURNING id`,
        [sessionId, [...eventIds]]
      );
      return [{ count: result.rowCount ?? result.rows.length }];
    });
    return Number(rows[0]?.count ?? 0);
  },
  async expireOldSocialEvents(sessionId, nowTurn) {
    const rows = await withPgClient(async (client) => {
      const result = await client.query(
        `UPDATE social_event_ledger
         SET status = 'expired',
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1
           AND status IN ('candidate', 'scheduled', 'committed')
           AND expires_turn_index IS NOT NULL
           AND expires_turn_index < $2
         RETURNING id`,
        [sessionId, nowTurn]
      );
      return [{ count: result.rowCount ?? result.rows.length }];
    });
    return Number(rows[0]?.count ?? 0);
  },
  async upsertMemorySpineEntries(_sessionId, entries, opts) {
    const userId = normalizeUserId(opts?.userId);
    if (!userId || entries.length === 0) return { inserted: 0, updated: 0, skipped: entries.length };
    const rows = await withPgClient(async (client) => {
      const existing = await client.query<{ player_status: Record<string, unknown> | null }>(
        `SELECT player_status
         FROM game_session_memory
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      const playerStatus =
        existing.rows[0]?.player_status &&
        typeof existing.rows[0].player_status === "object" &&
        !Array.isArray(existing.rows[0].player_status)
          ? existing.rows[0].player_status
          : {};
      const prevRaw = playerStatus[SOCIAL_MEMORY_SPINE_EMBED_KEY];
      const prevEntries = Array.isArray(prevRaw) ? prevRaw : [];
      const byKey = new Map<string, unknown>();
      for (const item of prevEntries) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        const key = String(row.mergeKey ?? row.id ?? "").trim();
        if (key) byKey.set(key, row);
      }
      let inserted = 0;
      let updated = 0;
      for (const entry of entries) {
        const key = entry.mergeKey || entry.id;
        if (!key) continue;
        if (byKey.has(key)) updated += 1;
        else inserted += 1;
        byKey.set(key, entry);
      }
      const nextEntries = [...byKey.values()].slice(-64);
      const nextPlayerStatus = {
        ...playerStatus,
        [SOCIAL_MEMORY_SPINE_EMBED_KEY]: nextEntries,
      };
      await client.query(
        `INSERT INTO game_session_memory (user_id, player_status, npc_relationships)
         VALUES ($1, $2::jsonb, '{}'::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET
           player_status = EXCLUDED.player_status,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, JSON.stringify(nextPlayerStatus)]
      );
      return [{ inserted, updated }];
    });
    return { inserted: Number(rows[0]?.inserted ?? 0), updated: Number(rows[0]?.updated ?? 0), skipped: 0 };
  },
};

const defaultPersistence = createSocialWorldPersistence(pgAdapter);

export function loadNpcAgentStates(sessionId: string): Promise<NpcAgentState[]> {
  return defaultPersistence.loadNpcAgentStates(sessionId);
}

export function upsertNpcAgentStates(
  sessionId: string,
  states: readonly NpcAgentState[],
  opts?: SocialWorldPersistenceOptions
): Promise<SocialWorldWriteResult> {
  return defaultPersistence.upsertNpcAgentStates(sessionId, states, opts);
}

export function loadNpcRelationEdges(sessionId: string): Promise<NpcRelationEdge[]> {
  return defaultPersistence.loadNpcRelationEdges(sessionId);
}

export function upsertNpcRelationEdges(
  sessionId: string,
  edges: readonly NpcRelationEdge[],
  opts?: SocialWorldPersistenceOptions
): Promise<SocialWorldWriteResult> {
  return defaultPersistence.upsertNpcRelationEdges(sessionId, edges, opts);
}

export function insertSocialEvents(
  sessionId: string,
  events: readonly SocialEvent[],
  dedupKey: string,
  opts?: SocialWorldInsertEventsOptions
): Promise<SocialWorldWriteResult> {
  return defaultPersistence.insertSocialEvents(sessionId, events, dedupKey, opts);
}

export function loadDueSocialEventsForPrompt(
  sessionId: string,
  nowTurn: number,
  maxItems: number
): Promise<SocialEvent[]> {
  return defaultPersistence.loadDueSocialEventsForPrompt(sessionId, nowTurn, maxItems);
}

export function loadRecentSocialEventsForCooldown(
  sessionId: string,
  nowTurn: number,
  lookbackTurns: number
): Promise<SocialEvent[]> {
  return defaultPersistence.loadRecentSocialEventsForCooldown
    ? defaultPersistence.loadRecentSocialEventsForCooldown(sessionId, nowTurn, lookbackTurns)
    : Promise.resolve([]);
}

export function countPendingSocialEvents(sessionId: string): Promise<number> {
  return defaultPersistence.countPendingSocialEvents
    ? defaultPersistence.countPendingSocialEvents(sessionId)
    : Promise.resolve(0);
}

export function markSocialEventsProjected(sessionId: string, eventIds: readonly string[]): Promise<number> {
  return defaultPersistence.markSocialEventsProjected(sessionId, eventIds);
}

export function expireOldSocialEvents(sessionId: string, nowTurn: number): Promise<number> {
  return defaultPersistence.expireOldSocialEvents(sessionId, nowTurn);
}

export function upsertMemorySpineEntries(
  sessionId: string,
  entries: readonly MemorySpineEntry[],
  opts?: SocialWorldPersistenceOptions
): Promise<SocialWorldWriteResult> {
  return defaultPersistence.upsertMemorySpineEntries
    ? defaultPersistence.upsertMemorySpineEntries(sessionId, entries, opts)
    : Promise.resolve({ inserted: 0, updated: 0, skipped: 0 });
}
