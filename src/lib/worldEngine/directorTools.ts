// src/lib/worldEngine/directorTools.ts
/**
 * World Director（离线 reasoner）试点工具集：只读、会话隔离、按需检索。
 * 设计目标：在固定预载（24 条 facts / 16 条 agenda）不变的前提下，
 * 允许导演按关键词补充检索，而不是无限加大 prompt 预载。
 *
 * 仅由 AI_DIRECTOR_TOOL_LOOP_ENABLED=true 时的 worldEngine tick 消费；
 * 不进入任何在线 /api/chat 路径。纯函数部分在 ./directorToolsPure.ts。
 */
import { pool } from "@/db/index";
import { runToolLoop, type ToolRegistry } from "@/lib/ai/tools/runToolLoop";
import type { AIErrorResponse, AIResponse } from "@/lib/ai/types";
import type { ChatMessage } from "@/lib/ai/types/core";
import type { WorldRuntimeScope } from "./contracts";
import {
  DIRECTOR_TOOL_USAGE_HINT,
  GET_AGENDA_EVENTS_DEFINITION,
  SEARCH_WORLD_FACTS_DEFINITION,
  escapeLikePattern,
  normalizeAgendaArgs,
  normalizeSearchFactsArgs,
} from "./directorToolsPure";

export interface DirectorToolScope extends WorldRuntimeScope {
  userId: string | null;
}

async function searchWorldFacts(scope: DirectorToolScope, args: Record<string, unknown>): Promise<unknown> {
  if (!scope.userId) return { ok: true, facts: [], note: "no_user_scope" };
  const { contains, limit, offset } = normalizeSearchFactsArgs(args);
  let client;
  try {
    client = await pool.connect();
  } catch {
    return { ok: false, error: "db_unavailable" };
  }
  try {
    const params: unknown[] = [scope.userId, scope.sessionId, scope.worldId, scope.mapId];
    let where = "f.user_id = $1 AND f.session_id = $2";
    if (contains) {
      params.push(`%${escapeLikePattern(contains)}%`);
      where += ` AND f.raw_fact ILIKE $${params.length} ESCAPE '\\'`;
    }
    params.push(limit, offset);
    const r = await client.query<{ raw_fact: string }>(
      `SELECT f.raw_fact
       FROM world_player_facts f
       WHERE ${where}
         AND EXISTS (
           SELECT 1
           FROM world_knowledge_chunks c
           WHERE c.entity_id = f.entity_id
             AND c.world_id = $3
             AND (c.map_id = $4 OR (c.map_id IS NULL AND $3 = 'dark_moon_prologue' AND $4 = 'dark_moon_apartment'))
         )
       ORDER BY f.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const facts = r.rows.map((x) => String(x.raw_fact ?? "").trim()).filter(Boolean);
    return { ok: true, facts, count: facts.length };
  } catch {
    return { ok: false, error: "query_failed" };
  } finally {
    client.release();
  }
}

async function getAgendaEvents(scope: DirectorToolScope, args: Record<string, unknown>): Promise<unknown> {
  const { status, limit } = normalizeAgendaArgs(args);
  let client;
  try {
    client = await pool.connect();
  } catch {
    return { ok: false, error: "db_unavailable" };
  }
  try {
    const params: unknown[] = [scope.worldId, scope.mapId, scope.sessionId];
    let where = "world_id = $1 AND map_id = $2 AND session_id = $3";
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit);
    const r = await client.query<Record<string, unknown>>(
      `SELECT event_code, title, status, due_turn_index, expires_turn_index, salience, priority
       FROM world_engine_event_queue
       WHERE ${where}
       ORDER BY id DESC
       LIMIT $${params.length}`,
      params
    );
    return { ok: true, events: r.rows, count: r.rows.length };
  } catch {
    return { ok: false, error: "query_failed" };
  } finally {
    client.release();
  }
}

export function buildWorldDirectorToolRegistry(scope: DirectorToolScope): ToolRegistry {
  return {
    search_world_facts: {
      definition: SEARCH_WORLD_FACTS_DEFINITION,
      handler: (args) => searchWorldFacts(scope, args),
      timeoutMs: 3_000,
    },
    get_agenda_events: {
      definition: GET_AGENDA_EVENTS_DEFINITION,
      handler: (args) => getAgendaEvents(scope, args),
      timeoutMs: 3_000,
    },
  };
}

/**
 * Tool-loop 版导演推理：与 runOfflineReasonerTask(kind:"worldbuild") 返回结构对齐，
 * 便于 engine.ts 按 env flag 二选一而不改动后续 parse / validate / commit 流程。
 */
export async function runWorldDirectorReasonerWithTools(args: {
  messages: ChatMessage[];
  requestId: string;
  userId: string | null;
  sessionId: string;
  worldId: WorldRuntimeScope["worldId"];
  mapId: WorldRuntimeScope["mapId"];
  mode: string;
}): Promise<AIResponse | AIErrorResponse> {
  const registry = buildWorldDirectorToolRegistry({
    worldId: args.worldId,
    mapId: args.mapId,
    sessionId: args.sessionId,
    userId: args.userId,
  });
  const messages: ChatMessage[] = [
    ...args.messages.slice(0, 1),
    { role: "system", content: DIRECTOR_TOOL_USAGE_HINT },
    ...args.messages.slice(1),
  ];
  const result = await runToolLoop({
    task: "WORLDBUILD_OFFLINE",
    messages,
    tools: registry,
    ctx: {
      requestId: args.requestId,
      userId: args.userId,
      sessionId: args.sessionId,
      path: "/worker/world-engine",
      tags: { purpose: "world_director", mode: args.mode, toolLoop: true },
    },
    maxRounds: 3,
    totalBudgetMs: 70_000,
    requestTimeoutMs: 45_000,
    extraBody: {
      enable_thinking: false,
      thinking: { type: "disabled" },
    },
    devOverrides: {
      responseFormatJsonObject: true,
      temperature: 0.2,
      maxTokens: 2048,
    },
  });
  if (result.ok) {
    if (result.trace.totalToolCalls > 0) {
      console.info(
        JSON.stringify({
          type: "world_engine.tool_loop",
          requestId: args.requestId,
          sessionId: args.sessionId,
          rounds: result.trace.rounds.length,
          totalToolCalls: result.trace.totalToolCalls,
          failedToolCalls: result.trace.failedToolCalls,
          totalLatencyMs: result.trace.totalLatencyMs,
        })
      );
    }
    return result.response;
  }
  return {
    ok: false,
    code: result.code,
    message: result.message,
  };
}
