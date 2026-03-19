import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAuditTrail } from "@/lib/security/auditTrail";
import type {
  AuditInputEvent,
  AuditUploadRequest,
  AuditUploadResponse,
  CorrectionPayload,
} from "@/lib/security/auditProtocol";
import { MAX_SPEED_LIMIT } from "@/lib/security/auditProtocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RAW_BODY_BYTES = 1024 * 1024 * 2;
const MIN_HUMAN_INTERVAL_MS = 16;
const FREQ_ZSCORE_LIMIT = -2.8;

function buildNoStoreHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function parseAuditBody(raw: string): AuditUploadRequest | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AuditUploadRequest>;
    if (!Array.isArray(parsed.auditTrail)) return null;
    if (typeof parsed.clientStateChecksum !== "string") return null;
    if (!parsed.stateSnapshot || typeof parsed.stateSnapshot !== "object") return null;
    if (typeof parsed.signature !== "string") return null;
    if (typeof parsed.clientTimestamp !== "number") return null;
    return {
      auditTrail: parsed.auditTrail as AuditInputEvent[],
      clientStateChecksum: parsed.clientStateChecksum,
      stateSnapshot: parsed.stateSnapshot as Record<string, unknown>,
      signature: parsed.signature,
      clientTimestamp: parsed.clientTimestamp,
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : undefined,
    };
  } catch {
    return null;
  }
}

function signPayload(payload: {
  auditTrail: AuditInputEvent[];
  clientStateChecksum: string;
  clientTimestamp: number;
  stateSnapshot: Record<string, unknown>;
}): string {
  const secret = process.env.SECRET_KEY ?? "";
  if (!secret) return "";
  const canonical = stableStringify(payload);
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

function secureCompareHex(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length === 0 || bBuf.length === 0) return false;
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function calcSpeed(a: AuditInputEvent, b: AuditInputEvent): number {
  if (
    typeof a.x !== "number" ||
    typeof a.y !== "number" ||
    typeof b.x !== "number" ||
    typeof b.y !== "number"
  ) {
    return 0;
  }
  const dt = Math.max(1, b.timestamp - a.timestamp) / 1000;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  return dist / dt;
}

function checkPhysicsAndFrequency(
  trail: AuditInputEvent[]
): { ok: true; lastLegalTimestamp: number } | { ok: false; reason: "physics_violation" | "frequency_violation"; lastLegalTimestamp: number; flaggedEventId?: string } {
  if (trail.length === 0) return { ok: true, lastLegalTimestamp: 0 };
  const sorted = [...trail].sort((a, b) => a.timestamp - b.timestamp);
  let lastLegalTimestamp = sorted[0]?.timestamp ?? 0;

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    const dt = cur.timestamp - prev.timestamp;
    if (!Number.isFinite(dt) || dt <= 0) {
      return {
        ok: false,
        reason: "frequency_violation",
        lastLegalTimestamp,
        flaggedEventId: cur.id,
      };
    }

    const speed = calcSpeed(prev, cur);
    if (speed > MAX_SPEED_LIMIT) {
      return {
        ok: false,
        reason: "physics_violation",
        lastLegalTimestamp,
        flaggedEventId: cur.id,
      };
    }
    intervals.push(dt);
    lastLegalTimestamp = cur.timestamp;
  }

  if (intervals.length >= 6) {
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const std = Math.sqrt(Math.max(variance, 1));
    const minDt = Math.min(...intervals);
    const z = (minDt - mean) / std;
    if (minDt < MIN_HUMAN_INTERVAL_MS || z < FREQ_ZSCORE_LIMIT) {
      return {
        ok: false,
        reason: "frequency_violation",
        lastLegalTimestamp,
        flaggedEventId: sorted[Math.max(1, intervals.indexOf(minDt) + 1)]?.id,
      };
    }
  }

  return { ok: true, lastLegalTimestamp };
}

function correction(
  reason: CorrectionPayload["reason"],
  lastLegalTimestamp: number,
  resetStateSnapshot: Record<string, unknown>,
  flaggedEventId?: string
): CorrectionPayload {
  return {
    shouldRollback: reason !== "none",
    reason,
    lastLegalTimestamp,
    resetStateSnapshot,
    serverTimestamp: Date.now(),
    ...(flaggedEventId ? { flaggedEventId } : {}),
  };
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!raw || raw.length > MAX_RAW_BODY_BYTES) {
      const res: AuditUploadResponse = {
        ok: false,
        correction: correction("signature_invalid", 0, {}),
      };
      return NextResponse.json(res, { status: 200, headers: buildNoStoreHeaders() });
    }

    const parsed = parseAuditBody(raw);
    if (!parsed) {
      const res: AuditUploadResponse = {
        ok: false,
        correction: correction("signature_invalid", 0, {}),
      };
      return NextResponse.json(res, { status: 200, headers: buildNoStoreHeaders() });
    }

    const expected = signPayload({
      auditTrail: parsed.auditTrail,
      clientStateChecksum: parsed.clientStateChecksum,
      clientTimestamp: parsed.clientTimestamp,
      stateSnapshot: parsed.stateSnapshot,
    });

    const signatureOk = expected.length > 0 && secureCompareHex(expected, parsed.signature);
    if (!signatureOk) {
      writeAuditTrail({
        requestId: `audit_${Date.now()}`,
        sessionId: parsed.sessionId ?? null,
        stage: "audit_signature",
        riskLevel: "black",
        action: "block",
        summary: "signature_invalid",
      });
      const res: AuditUploadResponse = {
        ok: false,
        correction: correction("signature_invalid", 0, parsed.stateSnapshot),
      };
      return NextResponse.json(res, { status: 200, headers: buildNoStoreHeaders() });
    }

    const checks = checkPhysicsAndFrequency(parsed.auditTrail);
    if (!checks.ok) {
      writeAuditTrail({
        requestId: `audit_${Date.now()}`,
        sessionId: parsed.sessionId ?? null,
        stage: "audit_behavior",
        riskLevel: "black",
        action: "review",
        summary: checks.reason,
      });
      const res: AuditUploadResponse = {
        ok: false,
        correction: correction(
          checks.reason,
          checks.lastLegalTimestamp,
          parsed.stateSnapshot,
          checks.flaggedEventId
        ),
      };
      return NextResponse.json(res, { status: 200, headers: buildNoStoreHeaders() });
    }

    const res: AuditUploadResponse = {
      ok: true,
      correction: correction("none", checks.lastLegalTimestamp, parsed.stateSnapshot),
    };
    return NextResponse.json(res, { status: 200, headers: buildNoStoreHeaders() });
  } catch {
    const res: AuditUploadResponse = {
      ok: false,
      correction: correction("signature_invalid", 0, {}),
    };
    return NextResponse.json(res, { status: 200, headers: buildNoStoreHeaders() });
  }
}

