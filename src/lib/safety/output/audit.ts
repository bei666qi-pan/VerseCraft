import { envRaw } from "@/lib/config/envRaw";
import { writeAuditTrail } from "@/lib/security/auditTrail";
import { hashIdentifier } from "@/lib/safety/input/audit";
import type { ModerationDecision, ModerationScene, ModerationStage, RiskLevel } from "@/lib/safety/policy/model";

export type OutputAuditEvent = {
  traceId: string;
  scene: ModerationScene;
  stage: ModerationStage;
  decision: ModerationDecision;
  riskLevel: RiskLevel;
  reasonCode: string;
  providerSummary?: {
    providers: string[];
    maxRisk?: "normal" | "gray" | "black";
    categories?: string[];
    score?: number;
    errorKinds?: string[];
  };
  whitelist?: {
    worldviewTerms: string[];
    gameplayActions: string[];
    styleToneHints: string[];
    contextConsistent: boolean;
  };
  fallbackUsed: boolean;
  rewriteUsed: boolean;
  failMode: "fail_soft" | "fail_closed";
  latencyMs: number;
  providerErrorType?: string;
  actor: {
    userIdHash?: string;
    sessionIdHash?: string;
    ipHash?: string;
  };
  contentFingerprint?: string;
};

function auditDbEnabled(): boolean {
  const v = (envRaw("VC_SAFETY_AUDIT_DB_ENABLED") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export async function writeOutputAuditEvent(args: OutputAuditEvent & { rawTextSnippet?: string | null }) {
  const contentFingerprint = args.contentFingerprint ?? "";
  const safeEvent: OutputAuditEvent = { ...args, contentFingerprint };

  // 1) Legacy console audit trail (masked identifiers).
  try {
    const riskLevel =
      safeEvent.riskLevel === "hard_block"
        ? "black"
        : safeEvent.riskLevel === "soft_block" || safeEvent.riskLevel === "review" ? "gray" : "normal";
    const action =
      safeEvent.decision === "reject"
        ? "block"
        : safeEvent.decision === "fallback"
          ? "degrade"
          : safeEvent.decision === "rewrite"
            ? "review"
            : "allow";

    writeAuditTrail({
      requestId: safeEvent.traceId,
      sessionId: safeEvent.actor.sessionIdHash,
      userId: safeEvent.actor.userIdHash,
      ip: safeEvent.actor.ipHash,
      stage: `output:${safeEvent.scene}`,
      riskLevel,
      triggeredRule: safeEvent.reasonCode,
      provider: (safeEvent.providerSummary?.providers ?? []).join(",") || "none",
      action,
      summary: [
        `providers=${(safeEvent.providerSummary?.providers ?? []).join("|")}`,
        `cats=${safeEvent.providerSummary?.categories?.join("|") ?? "na"}`,
        `fallback=${safeEvent.fallbackUsed ? "1" : "0"}`,
        `rewrite=${safeEvent.rewriteUsed ? "1" : "0"}`,
        `failMode=${safeEvent.failMode}`,
        `lat=${Math.round(safeEvent.latencyMs)}ms`,
        `providerErr=${safeEvent.providerErrorType ?? "none"}`,
        `fp=${safeEvent.contentFingerprint?.slice(0, 12) ?? "na"}`,
      ].join(" "),
    });
  } catch {
    // best effort only
  }

  // 2) Optional DB persistence (append-only, minimal fields).
  if (!auditDbEnabled()) return;
  try {
    const [{ db }, { safetyAuditEvents }] = await Promise.all([import("@/db"), import("@/db/schema")]);
    const row: typeof safetyAuditEvents.$inferInsert = {
      traceId: safeEvent.traceId,
      scene: safeEvent.scene,
      stage: safeEvent.stage,
      decision: safeEvent.decision,
      riskLevel: String(safeEvent.riskLevel),
      reasonCode: safeEvent.reasonCode,
      contentFingerprint: safeEvent.contentFingerprint ?? "",
      actor: safeEvent.actor as Record<string, unknown>,
      providerSummary: (safeEvent.providerSummary ?? {}) as Record<string, unknown>,
      whitelist: (safeEvent.whitelist ?? {}) as Record<string, unknown>,
      meta: {
        fallbackUsed: safeEvent.fallbackUsed,
        rewriteUsed: safeEvent.rewriteUsed,
        failMode: safeEvent.failMode,
        latencyMs: safeEvent.latencyMs,
        providerErrorType: safeEvent.providerErrorType ?? null,
      },
    };
    await db.insert(safetyAuditEvents).values(row);
  } catch {
    // best-effort
  }
}

export function buildOutputActorHashes(args: { userId?: string; sessionId?: string; ip?: string }): OutputAuditEvent["actor"] {
  return {
    userIdHash: args.userId ? hashIdentifier("user", args.userId) : undefined,
    sessionIdHash: args.sessionId ? hashIdentifier("session", args.sessionId) : undefined,
    ipHash: args.ip ? hashIdentifier("ip", args.ip) : undefined,
  };
}

