// src/lib/ai/debug/observabilityRing.ts
import { createHash } from "node:crypto";
import type { AiLogicalRole } from "@/lib/ai/models/logicalRoles";
import type { TaskType } from "@/lib/ai/types/core";

const MAX = 120;
const buffer: AiObservabilityRecord[] = [];

/** Stable observability log envelope type for log drains. */
export const AI_OBSERVABILITY_LOG_TYPE = "ai.observability" as const;

export interface AiObservabilityRecord {
  requestId: string;
  task: TaskType;
  logicalRole?: AiLogicalRole;
  gatewayModel?: string;
  providerId?: string;
  phase: string;
  latencyMs?: number;
  totalTokens?: number;
  stream?: boolean;
  cacheHit?: boolean;
  fallbackCount?: number;
  estCostUsd?: number;
  userIdHash?: string;
  message?: string;
  ttftMs?: number;
  stableCharLen?: number;
  dynamicCharLen?: number;
  cachedPromptTokens?: number;
}

function hashUser(userId: string | null | undefined): string | undefined {
  if (!userId) return undefined;
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export function pushAiObservability(rec: AiObservabilityRecord & { userId?: string | null }): void {
  const { userId, ...rest } = rec;
  const row: AiObservabilityRecord = {
    ...rest,
    userIdHash: hashUser(userId),
  };
  buffer.unshift({ ...row });
  if (buffer.length > MAX) buffer.length = MAX;
  console.info(
    JSON.stringify({
      type: AI_OBSERVABILITY_LOG_TYPE,
      ts: new Date().toISOString(),
      ...row,
    })
  );
}

export function listRecentAiObservability(): AiObservabilityRecord[] {
  return buffer.map((r) => ({ ...r }));
}
