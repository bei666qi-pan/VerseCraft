import { pool } from "@/db/index";
import { runOfflineReasonerTask } from "@/lib/ai/logicalTasks";
import type { ChatMessage } from "@/lib/ai/types/core";
import { getAppRedisClient } from "@/lib/ratelimit";
import { parseWorldEngineDeltaJson } from "./contracts";
import type { WorldEngineStructuredDelta, WorldEngineTickPayload } from "./contracts";

async function loadRecentWorldFacts(userId: string | null, sessionId: string): Promise<string[]> {
  if (!userId) return [];
  let client;
  try {
    client = await pool.connect();
  } catch {
    return [];
  }
  try {
    const r = await client.query<{ raw_fact: string }>(
      `SELECT raw_fact
       FROM world_player_facts
       WHERE user_id = $1 AND session_id = $2
       ORDER BY id DESC
       LIMIT 24`,
      [userId, sessionId]
    );
    return r.rows.map((x) => String(x.raw_fact ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  } finally {
    client.release();
  }
}

function buildWorldEngineMessages(input: {
  payload: WorldEngineTickPayload;
  recentFacts: string[];
}): ChatMessage[] {
  const system = [
    "你是 VerseCraft 的离线 World Engine（后台推演器）。",
    "只输出单个 JSON 对象，不要 markdown，不要代码块，不要叙事正文。",
    "你不能输出玩家最终 narrative，只能输出世界状态增量建议。",
    "严格输出这 5 个顶层数组字段：",
    "npc_next_actions, world_events_to_schedule, story_branch_seeds, consistency_warnings, player_private_hooks",
  ].join("\n");

  const user = JSON.stringify(
    {
      session_id: input.payload.sessionId,
      turn_index: input.payload.turnIndex,
      latest_user_input: input.payload.latestUserInput.slice(0, 800),
      trigger_signals: input.payload.triggerSignals,
      risk_tags: input.payload.controlRiskTags,
      dm_narrative_preview: input.payload.dmNarrativePreview.slice(0, 1200),
      player_location: input.payload.playerLocation,
      npc_location_update_count: input.payload.npcLocationUpdateCount,
      recent_facts: input.recentFacts.slice(0, 24),
    },
    null,
    2
  );

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function writeWorldEngineOutputs(args: {
  payload: WorldEngineTickPayload;
  delta: WorldEngineStructuredDelta;
}): Promise<{ runId: number; worldRevision: bigint }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run = await client.query<{ run_id: string }>(
      `INSERT INTO world_engine_runs (
         dedup_key, request_id, user_id, session_id, trigger_signals,
         model_task, status, output_json, error_message
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'succeeded', $7::jsonb, NULL)
       ON CONFLICT (dedup_key) DO UPDATE SET updated_at = NOW()
       RETURNING run_id`,
      [
        args.payload.dedupKey,
        args.payload.requestId,
        args.payload.userId,
        args.payload.sessionId,
        JSON.stringify(args.payload.triggerSignals),
        "WORLDBUILD_OFFLINE",
        JSON.stringify(args.delta),
      ]
    );
    const runId = Number(run.rows[0]?.run_id ?? 0);

    for (const ev of args.delta.world_events_to_schedule) {
      await client.query(
        `INSERT INTO world_engine_event_queue (
           run_id, session_id, user_id, event_code, title, due_in_turns, priority, payload, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'pending')`,
        [runId, args.payload.sessionId, args.payload.userId, ev.event_code, ev.title, ev.due_in_turns, ev.priority, JSON.stringify(ev.payload)]
      );
    }

    const snapshot = {
      npc_next_actions: args.delta.npc_next_actions,
      story_branch_seeds: args.delta.story_branch_seeds,
      consistency_warnings: args.delta.consistency_warnings,
      player_private_hooks: args.delta.player_private_hooks,
      event_count: args.delta.world_events_to_schedule.length,
    };
    await client.query(
      `INSERT INTO world_engine_agenda_snapshots (
         run_id, session_id, user_id, agenda_revision, snapshot_json
       )
       VALUES (
         $1, $2, $3,
         (SELECT COALESCE(MAX(agenda_revision), 0) + 1
          FROM world_engine_agenda_snapshots
          WHERE session_id = $2),
         $4::jsonb
       )`,
      [runId, args.payload.sessionId, args.payload.userId, JSON.stringify(snapshot)]
    );

    const wr = await client.query<{ world_revision: string }>(
      `INSERT INTO vc_world_meta (id, world_revision)
       VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE
       SET world_revision = vc_world_meta.world_revision + 1
       RETURNING world_revision::text AS world_revision`
    );
    const worldRevision = BigInt(wr.rows[0]?.world_revision ?? "0");
    await client.query("COMMIT");

    const redis = await getAppRedisClient();
    if (redis) {
      void redis
        .set(
          `vc:we:agenda:${args.payload.sessionId}`,
          JSON.stringify(snapshot),
          { EX: 3600 }
        )
        .catch(() => {});
    }
    return { runId, worldRevision };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}

export async function runWorldEngineTick(payload: WorldEngineTickPayload): Promise<{
  ok: true;
  runId: number;
  worldRevision: bigint;
} | {
  ok: false;
  reason: string;
}> {
  const recentFacts = await loadRecentWorldFacts(payload.userId, payload.sessionId);
  const messages = buildWorldEngineMessages({ payload, recentFacts });
  const res = await runOfflineReasonerTask({
    kind: "worldbuild",
    messages,
    ctx: {
      requestId: payload.requestId,
      userId: payload.userId,
      sessionId: payload.sessionId,
      path: "/worker/world-engine",
      tags: ["world_engine", "offline_reasoner"],
    },
    requestTimeoutMs: 45_000,
    skipCache: true,
    devOverrides: {
      responseFormatJsonObject: true,
      temperature: 0.2,
      maxTokens: 1536,
    },
  });
  if (!res.ok) return { ok: false, reason: `reasoner_failed:${res.code}` };
  const parsed = parseWorldEngineDeltaJson(res.content ?? "");
  if (!parsed) return { ok: false, reason: "reasoner_invalid_json" };
  const out = await writeWorldEngineOutputs({ payload, delta: parsed });
  return { ok: true, runId: out.runId, worldRevision: out.worldRevision };
}

