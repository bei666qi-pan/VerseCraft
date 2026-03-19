import { env } from "@/lib/env";
import type { ModerationContext, ModerationResult } from "@/lib/security/types";

type AuditLevel = "silent" | "warn" | "info" | "debug";

function level(): AuditLevel {
  const v = env.securityAuditLogLevel;
  if (v === "silent" || v === "warn" || v === "info" || v === "debug") return v;
  return "warn";
}

export function auditModeration(context: ModerationContext, result: ModerationResult) {
  const l = level();
  if (l === "silent") return;

  const payload = {
    requestId: context.requestId,
    userId: context.userId ?? null,
    ip: context.ip ?? null,
    path: context.path ?? null,
    stage: context.stage,
    decision: result.decision,
    severity: result.severity,
    score: result.score,
    categories: result.categories,
    reason: result.reason,
  };

  if (l === "debug") {
    console.info("[security][moderation]", payload);
    return;
  }
  if (result.decision === "block" || result.severity === "high" || result.severity === "critical") {
    console.warn("[security][moderation]", payload);
    return;
  }
  if (l === "info") {
    console.info("[security][moderation]", payload);
  }
}
