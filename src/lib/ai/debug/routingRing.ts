// src/lib/ai/debug/routingRing.ts
import "server-only";

import type { AiRoutingReport } from "@/lib/ai/routing/types";

const MAX = 80;
const buffer: AiRoutingReport[] = [];

/** Stable routing log envelope type for log drains. */
export const AI_ROUTING_LOG_TYPE = "ai.routing" as const;

export function pushAiRoutingReport(report: AiRoutingReport): void {
  buffer.unshift({ ...report, attempts: [...report.attempts] });
  if (buffer.length > MAX) buffer.length = MAX;
  console.info(
    JSON.stringify({
      type: AI_ROUTING_LOG_TYPE,
      ts: new Date().toISOString(),
      ...report,
      attempts: report.attempts,
    })
  );
}

export function listRecentAiRoutingReports(): AiRoutingReport[] {
  return buffer.map((r) => ({ ...r, attempts: [...r.attempts] }));
}
