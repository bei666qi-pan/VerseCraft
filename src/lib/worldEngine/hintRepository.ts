import "server-only";

import type { PoolClient } from "pg";
import { pool } from "@/db/index";
import type { WorldRuntimeScope } from "./contracts";
import {
  isDirectorHintApplicable,
  type DirectorHintEnvelope,
} from "./hintEnvelope";

export async function insertDirectorHintEnvelope(
  envelope: DirectorHintEnvelope,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `INSERT INTO world_engine_hint_envelopes (
       hint_id, run_id, world_id, map_id, session_id, world_revision,
       valid_from_turn, valid_through_turn, phase, envelope_json, lifecycle
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
     ON CONFLICT (hint_id) DO NOTHING`,
    [
      envelope.hintId,
      envelope.runId,
      envelope.worldId,
      envelope.mapId,
      envelope.sessionId,
      envelope.worldRevision,
      envelope.validFromTurn,
      envelope.validThroughTurn,
      envelope.phase,
      JSON.stringify(envelope),
      envelope.lifecycle,
    ],
  );
}

export async function loadApplicableDirectorHintEnvelope(args: {
  scope: WorldRuntimeScope;
  turnIndex: number;
  timeoutMs?: number;
}): Promise<DirectorHintEnvelope | null> {
  const timeoutMs = Math.max(1, Math.min(500, args.timeoutMs ?? 80));
  const query = (async () => {
    const client = await pool.connect();
    try {
      const result = await client.query<{ envelope_json: DirectorHintEnvelope }>(
        `SELECT envelope_json
         FROM world_engine_hint_envelopes
         WHERE world_id = $1 AND map_id = $2 AND session_id = $3
           AND lifecycle = 'active'
           AND valid_from_turn <= $4 AND valid_through_turn >= $4
         ORDER BY world_revision DESC, id DESC
         LIMIT 1`,
        [args.scope.worldId, args.scope.mapId, args.scope.sessionId, args.turnIndex],
      );
      const envelope = result.rows[0]?.envelope_json ?? null;
      return envelope && isDirectorHintApplicable(envelope, args.scope, args.turnIndex) ? envelope : null;
    } finally {
      client.release();
    }
  })();
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      query.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
