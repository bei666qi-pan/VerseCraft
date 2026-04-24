/**
 * Central duration **display** helpers. All values are **wall-clock seconds** (integer-ish)
 * from DB or API unless noted otherwise. Do not interpret `users.playTime` as “game hours”
 * in the sense of narrative time — the column stores **seconds** (see `DURATION_DB_FIELD_UNITS`).
 */
export const DURATION_UNIT_SECONDS = "SECONDS" as const;

/**
 * Authoritative contract: these columns / metrics are stored as **integer seconds** in PostgreSQL
 * and Redis counters that increment **seconds** (e.g. `playTimeDeltaSec`).
 */
export const DURATION_DB_FIELD_UNITS = {
  "users.playTime": DURATION_UNIT_SECONDS,
  "users.todayPlayTime": DURATION_UNIT_SECONDS,
  "user_sessions.total_play_duration_sec": DURATION_UNIT_SECONDS,
  "user_daily_tokens.daily_play_duration_sec": DURATION_UNIT_SECONDS,
  "admin_metrics_daily.total_play_duration_sec": DURATION_UNIT_SECONDS,
} as const;

export type DurationDisplayStyle = "hms" | "h_m" | "compact_cn";

export type FormatDurationSecondsOptions = {
  style?: DurationDisplayStyle;
};

function sanitizeSeconds(sec: number): number {
  return Number.isFinite(sec) ? Math.max(0, Math.trunc(sec)) : 0;
}

/** Floor to whole minutes for **display** only; negative / non-finite → 0. */
export function secondsToMinutes(sec: number): number {
  return Math.floor(sanitizeSeconds(sec) / 60);
}

/** Floor to whole hours for **display** only; negative / non-finite → 0. */
export function secondsToHours(sec: number): number {
  return Math.floor(sanitizeSeconds(sec) / 3600);
}

/**
 * Format a duration given **seconds** (never minutes or “game hours” as a number without conversion).
 * Hour/minute/second order is always `H → M → S` in `hms` style to avoid “swapped” UI bugs.
 */
export function formatDurationSeconds(
  sec: number,
  opts: FormatDurationSecondsOptions = {}
): string {
  const safe = sanitizeSeconds(sec);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const style = opts.style ?? "hms";

  if (style === "h_m") {
    if (hours <= 0) return `${minutes} 分`;
    return `${hours} 小时 ${minutes} 分`;
  }

  if (style === "compact_cn") {
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}秒`);
    return parts.join("");
  }

  if (hours <= 0 && minutes <= 0) return `${seconds} 秒`;
  if (hours <= 0) return `${minutes} 分 ${seconds} 秒`;
  return `${hours} 小时 ${minutes} 分 ${seconds} 秒`;
}

/**
 * Shorthand for table cells fed from `DURATION_DB_FIELD_UNITS` fields (coerces JSON/string edges).
 */
export function formatPlayTimeFromDbSeconds(sec: unknown): string {
  const n = typeof sec === "number" ? sec : Number(sec);
  return formatDurationSeconds(Number.isFinite(n) ? n : 0);
}
