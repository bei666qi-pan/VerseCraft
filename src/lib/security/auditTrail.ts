type AuditEvent = {
  requestId: string;
  sessionId?: string | null;
  userId?: string | null;
  ip?: string;
  path?: string;
  stage: string;
  riskLevel: "normal" | "gray" | "black";
  triggeredRule?: string;
  provider?: string;
  action: "allow" | "review" | "degrade" | "terminate" | "block";
  rateLimited?: boolean;
  summary?: string;
  ts?: string;
};

function mask(value: string | null | undefined, keep = 3): string {
  if (!value) return "none";
  const v = String(value);
  if (v.length <= keep * 2) return `${v.slice(0, 1)}***${v.slice(-1)}`;
  return `${v.slice(0, keep)}***${v.slice(-keep)}`;
}

export function writeAuditTrail(event: AuditEvent) {
  try {
    const payload = {
      ts: event.ts ?? new Date().toISOString(),
      requestId: event.requestId,
      sessionId: mask(event.sessionId),
      userId: mask(event.userId),
      ip: mask(event.ip),
      path: event.path ?? "/api/chat",
      stage: event.stage,
      riskLevel: event.riskLevel,
      triggeredRule: event.triggeredRule ?? "none",
      provider: event.provider ?? "none",
      action: event.action,
      rateLimited: Boolean(event.rateLimited),
      summary: event.summary ?? "",
    };
    console.info("[security][audit_trail]", payload);
  } catch {
    // log failure must not impact main chain
  }
}
