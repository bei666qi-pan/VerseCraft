import { NextResponse } from "next/server";
import { writeAuditTrail } from "@/lib/security/auditTrail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IntegrityAuditPayload = {
  eventType?: string;
  occurredAt?: string;
  path?: string;
  expectedFingerprint?: string;
  actualFingerprint?: string;
  userAgent?: string;
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(req: Request) {
  let payload: IntegrityAuditPayload = {};
  try {
    payload = (await req.json()) as IntegrityAuditPayload;
  } catch {
    payload = {};
  }

  writeAuditTrail({
    requestId: `integrity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    path: asText(payload.path) || "/api/security/state-integrity",
    stage: asText(payload.eventType) || "client_state_integrity_violation",
    riskLevel: "black",
    action: "review",
    summary: `expected=${asText(payload.expectedFingerprint)} actual=${asText(payload.actualFingerprint)} ua=${asText(payload.userAgent).slice(0, 160)}`,
    ts: asText(payload.occurredAt) || new Date().toISOString(),
  });

  return NextResponse.json({ ok: true }, { status: 202 });
}
