import { NextResponse } from "next/server";
import { localizeGameplayHistory, localizeGameplayPresentation, localizeGameplayTasks } from "@/lib/ai/service";
import { LOCALIZABLE_TASK_TEXT_FIELDS, type LocalizableTaskText } from "@/lib/i18n/gameplayPresentation";
import { normalizeGameLanguage } from "@/lib/i18n/language";

export const runtime = "nodejs";

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseTaskTexts(value: unknown): LocalizableTaskText[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((task) => {
      const record = task && typeof task === "object" ? (task as Record<string, unknown>) : null;
      const id = text(record?.id, 160);
      const rawFields = record?.fields && typeof record.fields === "object" && !Array.isArray(record.fields)
        ? (record.fields as Record<string, unknown>)
        : null;
      const fields: LocalizableTaskText["fields"] = {};
      for (const key of LOCALIZABLE_TASK_TEXT_FIELDS) {
        const value = text(rawFields?.[key], 480);
        if (value) fields[key] = value;
      }
      return id && Object.keys(fields).length > 0 ? { id, fields } : null;
    })
    .filter((task): task is LocalizableTaskText => task !== null)
    .slice(0, 4);
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
  const tasks = parseTaskTexts(record.tasks);
  if (tasks.length > 0) {
    const result = await localizeGameplayTasks({
      tasks,
      language,
      ctx: {
        requestId: `language-tasks-${crypto.randomUUID()}`,
        sessionId: text(record.sessionId, 160) || null,
        path: "/api/play/localize",
      },
    });
    if (!result.ok) return NextResponse.json({ error: "localization_failed", reason: result.reason }, { status: 503 });
    return NextResponse.json({ tasks: result.value }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
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
