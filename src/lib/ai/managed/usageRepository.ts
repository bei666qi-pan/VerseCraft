import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { AiUsageRecord } from "./usage";
import { dedupeManagedUsageBatch } from "./usage";
import { rollupThenDeleteExpiredUsage } from "./usageRetention";

export async function persistManagedUsageBatch(batch: readonly AiUsageRecord[]): Promise<void> {
  if (batch.length === 0) return;
  for (const row of dedupeManagedUsageBatch(batch)) {
    await db.execute(sql`
      INSERT INTO ai_usage_events (idempotency_key, occurred_at, request_id, purpose, task, service_id, service_name, model_id, model_name,
        input_tokens, output_tokens, cached_input_tokens, total_tokens, usage_estimated, cost_cny_micros,
        input_price_cny_fen_per_million, output_price_cny_fen_per_million, latency_ms, outcome, error_category)
      VALUES (${row.idempotencyKey}, ${row.occurredAt}, ${row.requestId}, ${row.purpose}, ${row.task}, ${row.serviceId}, ${row.serviceName},
        ${row.modelId}, ${row.modelName}, ${row.inputTokens}, ${row.outputTokens}, ${row.cachedInputTokens}, ${row.totalTokens}, ${row.usageEstimated},
        ${row.costCnyMicros}, ${row.inputPriceCnyFenPerMillion}, ${row.outputPriceCnyFenPerMillion}, ${row.latencyMs}, ${row.outcome}, ${row.errorCategory})
      ON CONFLICT (idempotency_key) DO NOTHING
    `);
  }
}

export async function rollupAndCleanupManagedUsage(now = new Date()): Promise<{ rolledUp: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return db.transaction(async (tx) => {
    return rollupThenDeleteExpiredUsage({
      rollup: () => tx.execute(sql`
        INSERT INTO ai_usage_daily (date_key, purpose, service_id, service_name, model_id, model_name, request_count, success_count, estimated_count,
          input_tokens, output_tokens, cached_input_tokens, total_tokens, cost_cny_micros, updated_at)
        SELECT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date, purpose, COALESCE(service_id,'deleted'), service_name,
          COALESCE(model_id,'deleted'), model_name, COUNT(*)::int, COUNT(*) FILTER (WHERE outcome='success')::int,
          COUNT(*) FILTER (WHERE usage_estimated)::int, SUM(input_tokens), SUM(output_tokens), SUM(cached_input_tokens), SUM(total_tokens),
          CASE WHEN COUNT(cost_cny_micros)=COUNT(*) THEN SUM(cost_cny_micros) ELSE NULL END, CURRENT_TIMESTAMP
        FROM ai_usage_events WHERE occurred_at < ${cutoff}
        GROUP BY 1,2,3,4,5,6
        ON CONFLICT (date_key,purpose,service_id,model_id) DO UPDATE SET
          request_count=EXCLUDED.request_count, success_count=EXCLUDED.success_count, estimated_count=EXCLUDED.estimated_count,
          input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens, cached_input_tokens=EXCLUDED.cached_input_tokens,
          total_tokens=EXCLUDED.total_tokens, cost_cny_micros=EXCLUDED.cost_cny_micros, updated_at=CURRENT_TIMESTAMP
      `),
      remove: () => tx.execute(sql`DELETE FROM ai_usage_events WHERE occurred_at < ${cutoff} RETURNING id`),
    });
  });
}
