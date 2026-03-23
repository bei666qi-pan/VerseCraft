import "server-only";

import { pool } from "@/db/index";
import { isKgLayerEnabled } from "@/lib/config/kgEnv";
import { enqueueJob } from "./jobs";
import type { RouteResult } from "./routing";

/**
 * 旁路写入知识候选 / 用户事实；best-effort，表不存在 42P01 静默。
 * 不阻塞 /api/chat；由 route 以 void 调用。
 */
export async function ingestUserKnowledge(args: {
  userId: string | null;
  latestUserInput: string;
  route: RouteResult;
}): Promise<void> {
  if (!isKgLayerEnabled()) return;
  const text = (args.latestUserInput ?? "").trim();
  if (!text) return;

  let client;
  try {
    client = await pool.connect();
  } catch {
    return;
  }
  try {
    if (args.route.kind === "PRIVATE_FACT") {
      if (!args.userId) return;
      await client.query(
        `INSERT INTO vc_user_fact (user_id, fact_text) VALUES ($1, $2)`,
        [args.userId, text.slice(0, 8000)]
      );
      return;
    }
    if (args.route.kind === "PUBLIC_CANDIDATE") {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO vc_world_candidate (proposer_user_id, body, status) VALUES ($1, $2, 'ghost') RETURNING id::text AS id`,
        [args.userId, text.slice(0, 8000)]
      );
      const cid = ins.rows[0]?.id;
      if (cid) {
        void enqueueJob("JANITOR_REVIEW_CANDIDATE", { candidateId: Number(cid) }, { priority: 10 });
      }
    }
  } catch {
    /* best-effort：连接中断、超时等一律吞掉，不冒泡到 /api/chat */
  } finally {
    client.release();
  }
}
