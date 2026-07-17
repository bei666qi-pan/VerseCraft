import { NextResponse } from "next/server";
import { localizeGameplayPresentation } from "@/lib/ai/service";
import { normalizeGameLanguage } from "@/lib/i18n/language";

export const runtime = "nodejs";

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const record = body as Record<string, unknown>;
  const narrative = text(record.narrative, 6_000);
  const options = Array.isArray(record.options)
    ? record.options.map((option) => text(option, 240)).filter(Boolean).slice(0, 4)
    : [];
  if (!narrative) return NextResponse.json({ error: "missing_narrative" }, { status: 400 });

  const result = await localizeGameplayPresentation({
    narrative,
    options,
    language: normalizeGameLanguage(record.language),
    ctx: {
      requestId: `language-switch-${crypto.randomUUID()}`,
      sessionId: text(record.sessionId, 160) || null,
      path: "/api/play/localize",
    },
  });
  if (!result.ok) return NextResponse.json({ error: "localization_failed", reason: result.reason }, { status: 503 });
  return NextResponse.json(result.value, { status: 200, headers: { "Cache-Control": "no-store" } });
}
