import { createHash } from "node:crypto";
import { envRaw } from "@/lib/config/envRaw";
import { writeAuditTrail } from "@/lib/security/auditTrail";

export type InputAuditEvent = {
  traceId: string;
  scene: string;
  stage: "input";
  actor: {
    userIdHash?: string;
    sessionIdHash?: string;
    ipHash?: string;
  };
  decision: "allow" | "rewrite" | "fallback" | "reject";
  riskLevel: "allow" | "review" | "soft_block" | "hard_block";
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
  errorKind?: string;
  reasonCode: string;
  contentFingerprint?: string;
  rawTextSnippet?: string | null;
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function getSafetySalt(): string {
  // Prefer Baidu salt if present; otherwise fallback to a stable env.
  return envRaw("VC_SAFETY_HASH_SALT") ?? envRaw("BAIDU_SINAN_HASH_SALT") ?? envRaw("AUTH_SECRET")?.slice(0, 32) ?? "replace_me";
}

function shouldLogRawText(): boolean {
  const v = (envRaw("VC_SAFETY_LOG_RAW_TEXT") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function safetyAuditDbEnabled(): boolean {
  const v = (envRaw("VC_SAFETY_AUDIT_DB_ENABLED") ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function fingerprintText(text: string): string {
  const salt = getSafetySalt();
  return sha256Hex(`${salt}\n${text}`);
}

export function hashIdentifier(purpose: "user" | "session" | "ip", value: string): string {
  const salt = getSafetySalt();
  const v = String(value ?? "").trim();
  if (!v) return "";
  return sha256Hex(`${salt}\n${purpose}\n${v}`);
}

export function writeInputAuditEvent(event: InputAuditEvent): void {
  // Default: do NOT log raw text.
  const safeEvent = {
    ...event,
    rawTextSnippet: shouldLogRawText() ? event.rawTextSnippet : null,
  };
  console.info("[safety.input]", safeEvent);

  // Also bridge into legacy security audit trail (still console-based), without leaking raw text.
  try {
    const riskLevel =
      safeEvent.riskLevel === "hard_block"
        ? "black"
        : safeEvent.riskLevel === "soft_block" || safeEvent.riskLevel === "review"
          ? "gray"
          : "normal";
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
      sessionId: safeEvent.actor.sessionIdHash ?? null,
      userId: safeEvent.actor.userIdHash ?? null,
      ip: safeEvent.actor.ipHash,
      path: "/safety/input",
      stage: `input:${safeEvent.scene}`,
      riskLevel,
      triggeredRule: safeEvent.reasonCode,
      provider: (safeEvent.providerSummary?.providers ?? []).join(",") || "none",
      action,
      summary: [
        `providers=${(safeEvent.providerSummary?.providers ?? []).join("|")}`,
        `cats=${(safeEvent.providerSummary?.categories ?? []).join("|")}`,
        `wl=${safeEvent.whitelist?.worldviewTerms?.length ?? 0}/${safeEvent.whitelist?.gameplayActions?.length ?? 0}/${safeEvent.whitelist?.styleToneHints?.length ?? 0}`,
        `fallback=${safeEvent.fallbackUsed ? "1" : "0"}`,
        `fp=${safeEvent.contentFingerprint?.slice(0, 12) ?? "na"}`,
      ].join(" "),
    });
  } catch {
    // best-effort only
  }

  // Optional DB persistence (append-only). Best-effort and OFF by default.
  if (safetyAuditDbEnabled()) {
    void persistSafetyAuditEventToDb(safeEvent);
  }
}

async function persistSafetyAuditEventToDb(event: InputAuditEvent): Promise<void> {
  try {
    const [{ db }, { safetyAuditEvents }] = await Promise.all([
      import("@/db"),
      import("@/db/schema"),
    ]);
    const row: typeof safetyAuditEvents.$inferInsert = {
      traceId: event.traceId,
      scene: event.scene,
      stage: "input",
      decision: event.decision,
      riskLevel: event.riskLevel,
      reasonCode: event.reasonCode,
      contentFingerprint: event.contentFingerprint ?? "",
      actor: event.actor as Record<string, unknown>,
      providerSummary: (event.providerSummary ?? {}) as Record<string, unknown>,
      whitelist: (event.whitelist ?? {}) as Record<string, unknown>,
      meta: {
        fallbackUsed: event.fallbackUsed,
        errorKind: event.errorKind ?? null,
      },
    };
    await db.insert(safetyAuditEvents).values(row);
  } catch {
    // DB not ready / migration missing / transient errors must not impact main chain.
  }
}

