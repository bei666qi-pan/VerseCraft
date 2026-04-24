// src/lib/admin/formatDisplay.ts
/**
 * Server/API timestamps and UTC date_key values should be shown consistently.
 * All timestamptz fields are rendered in **UTC** with zh-CN numerals/labels.
 */
const UTC_ZH: Intl.DateTimeFormatOptions = {
  timeZone: "UTC",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const fmt = new Intl.DateTimeFormat("zh-CN", UTC_ZH);

export function formatZhCnUtcDateTime(value: string | Date | null | undefined): string {
  if (value == null) return "未知";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "未知";
  return fmt.format(d);
}

/** YYYY-MM-DD (UTC calendar day) as printed for charts / labels. */
export function formatUtcDateKeyLabel(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Short wall label for “now” ticks (UTC) in live charts. */
export function formatZhCnUtcTimeShort(value: Date = new Date()): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
