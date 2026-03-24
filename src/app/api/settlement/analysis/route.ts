import { NextResponse } from "next/server";
import { getCachedSettlementAnalysis, refreshSettlementAnalysis, type SettlementAnalysisInput } from "@/lib/settlement/aiReview";

function asInput(body: unknown): SettlementAnalysisInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.sessionId !== "string" || !b.sessionId) return null;
  const player = b.player as Record<string, unknown> | undefined;
  if (!player) return null;
  return {
    sessionId: b.sessionId,
    player: {
      grade: String(player.grade ?? ""),
      survivalHours: Number(player.survivalHours ?? 0),
      maxFloor: Number(player.maxFloor ?? 0),
      kills: Number(player.kills ?? 0),
      isDead: Boolean(player.isDead),
    },
    signals: {
      playerLocation: typeof (b.signals as Record<string, unknown> | undefined)?.playerLocation === "string"
        ? String((b.signals as Record<string, unknown>).playerLocation)
        : undefined,
      keyEvents: Array.isArray((b.signals as Record<string, unknown> | undefined)?.keyEvents)
        ? ((b.signals as Record<string, unknown>).keyEvents as unknown[]).map((x) => String(x)).slice(0, 20)
        : [],
    },
    evidenceQuality: b.evidenceQuality === "enough" ? "enough" : "insufficient",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "missing_session_id" }, { status: 400 });
  }
  const cached = await getCachedSettlementAnalysis(sessionId);
  if (!cached) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ source: "snapshot", ...cached }, {
    headers: { "Cache-Control": "private, max-age=120, stale-while-revalidate=600" },
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const input = asInput(body);
  if (!input) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const result = await refreshSettlementAnalysis(input);
  return NextResponse.json(
    { source: "refresh", ...result },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } }
  );
}
