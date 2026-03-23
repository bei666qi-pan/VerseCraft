import "server-only";

import { pool } from "@/db/index";

/**
 * 冷事实归档：30 天无命中或未设置 last_hit_at 的热事实移出热池，降低 IVFFlat 索引体积。
 */
export async function runWeeklyFactCompaction(): Promise<number> {
  let client;
  try {
    client = await pool.connect();
  } catch {
    return 0;
  }
  try {
    const r = await client.query(
      `
      UPDATE vc_world_fact
      SET is_hot = FALSE,
          archived_at = NOW()
      WHERE is_hot = TRUE
        AND (last_hit_at IS NULL OR last_hit_at < NOW() - INTERVAL '30 days')
      `
    );
    return r.rowCount ?? 0;
  } catch {
    return 0;
  } finally {
    client.release();
  }
}
