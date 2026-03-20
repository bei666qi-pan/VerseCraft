import "server-only";

export type AdminRangePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

export type AdminTimeRange = {
  preset: AdminRangePreset;
  start: Date;
  end: Date;
  startDateKey: string;
  endDateKey: string;
  label: string;
};

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function utcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function addDaysUtc(d: Date, delta: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}

function parseCustomDate(input: string | null): Date | null {
  if (!input) return null;
  const t = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function parseAdminTimeRangeFromSearchParams(searchParams: URLSearchParams): AdminTimeRange {
  const now = new Date();
  const todayStart = utcStartOfDay(now);
  const presetRaw = String(searchParams.get("range") ?? "7d").toLowerCase();
  const preset: AdminRangePreset =
    presetRaw === "today" || presetRaw === "yesterday" || presetRaw === "7d" || presetRaw === "30d" || presetRaw === "custom"
      ? (presetRaw as AdminRangePreset)
      : "7d";

  let start = todayStart;
  let end = utcEndOfDay(now);
  let label = "近7天";

  if (preset === "today") {
    start = todayStart;
    end = utcEndOfDay(now);
    label = "今日";
  } else if (preset === "yesterday") {
    const y = addDaysUtc(todayStart, -1);
    start = y;
    end = utcEndOfDay(y);
    label = "昨日";
  } else if (preset === "7d") {
    start = addDaysUtc(todayStart, -6);
    end = utcEndOfDay(now);
    label = "近7天";
  } else if (preset === "30d") {
    start = addDaysUtc(todayStart, -29);
    end = utcEndOfDay(now);
    label = "近30天";
  } else if (preset === "custom") {
    const customStart = parseCustomDate(searchParams.get("start"));
    const customEnd = parseCustomDate(searchParams.get("end"));
    if (customStart && customEnd && customStart <= customEnd) {
      start = utcStartOfDay(customStart);
      end = utcEndOfDay(customEnd);
      label = `${toDateKey(start)} ~ ${toDateKey(end)}`;
    } else {
      start = addDaysUtc(todayStart, -6);
      end = utcEndOfDay(now);
      label = "近7天";
    }
  }

  return {
    preset,
    start,
    end,
    startDateKey: toDateKey(start),
    endDateKey: toDateKey(end),
    label,
  };
}

