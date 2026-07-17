import { NextResponse } from "next/server";
import { localizeGameplayHistory, localizeGameplayPresentation } from "@/lib/ai/service";
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
  const language = normalizeGameLanguage(record.language);
  const entries = Array.isArray(record.entries)
    ? record.entries
        .map((entry) => {
          const item = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          return {
            index: Number(item?.index),
            content: text(item?.content, 4_000),
          };
        })
        .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0 && Boolean(entry.content))
        .slice(0, 6)
    : [];
  if (entries.length > 0) {
    const result = await localizeGameplayHistory({
      entries,
      language,
      ctx: {
        requestId: `language-history-${crypto.randomUUID()}`,
        sessionId: text(record.sessionId, 160) || null,
        path: "/api/play/localize",
      },
    });
    if (!result.ok) return NextResponse.json({ error: "localization_failed", reason: result.reason }, { status: 503 });
    return NextResponse.json({ entries: result.value }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  const narrative = text(record.narrative, 6_000);
  const options = Array.isArray(record.options)
    ? record.options.map((option) => text(option, 240)).filter(Boolean).slice(0, 4)
    : [];
  if (!narrative) return NextResponse.json({ error: "missing_narrative" }, { status: 400 });

  const result = await localizeGameplayPresentation({
    narrative,
    options,
    language,
    ctx: {
      requestId: `language-switch-${crypto.randomUUID()}`,
      sessionId: text(record.sessionId, 160) || null,
      path: "/api/play/localize",
    },
  });
  if (!result.ok) return NextResponse.json({ error: "localization_failed", reason: result.reason }, { status: 503 });
  return NextResponse.json(result.value, { status: 200, headers: { "Cache-Control": "no-store" } });
}
