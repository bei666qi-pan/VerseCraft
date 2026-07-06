// 注：本文件原先有 `import "server-only"`。已移除——本文件只做 URLSearchParams 解析和
// 日期运算，不含密钥/DB 访问，没有实际的"防止被打进客户端 bundle"风险；保留它会导致
// `server-only` 包在纯 Node（tsx --test，没有 --conditions=react-server）下直接抛错，
// 使这个文件永远没法有可执行的单元测试（这也是 timeRange.ts 此前一直没有单测文件的原因）。
// 该文件仍然只被服务端的 admin API route / admin lib 引用，未改变实际调用面。
import { getUtcDateKey } from "@/lib/analytics/dateKeys";
import { addAppDays, appDateLabel, appEndOfDayUtc, appStartOfDayUtc } from "@/lib/admin/appTimezone";

export type AdminRangePreset = "today" | "yesterday" | "7d" | "30d" | "custom";

export type AdminTimeRange = {
  preset: AdminRangePreset;
  /** 用户实际请求的 preset；仅当 custom 区间非法、回退为近7天时与 preset 不同。 */
  requestedPreset: AdminRangePreset;
  /** custom 区间非法（缺失/格式错误/start>end）导致回退为近7天时为 true。 */
  customRangeFallback: boolean;
  /**
   * 精确时刻边界（真实 UTC instant），按北京时间（UTC+8）对齐自然日边界，
   * 用于过滤 event_time / created_at / first_seen_at 等 timestamptz 列。
   * 根因修复说明见 src/lib/admin/appTimezone.ts 顶部注释。
   */
  start: Date;
  end: Date;
  /**
   * 注意：这两个 dateKey 字符串沿用 getUtcDateKey 既有的 UTC 自然日语义，
   * 与 actor_daily_activity / actor_daily_tokens / admin_metrics_daily 等表
   * date_key 列的写入口径保持一致——不要当作"北京自然日"使用，也不要用它们
   * 精确对应 start/end 所代表的北京日历天（两者在北京 0-8 点期间会相差一天，
   * 这是有意为之，详见 appTimezone.ts 顶部说明）。
   */
  startDateKey: string;
  endDateKey: string;
  label: string;
};

// ---- 以下仅用于推导 startDateKey/endDateKey，刻意保持纯 UTC 自然日语义，
// 与 date_key 列的既有写入约定一致，不做北京时区对齐。----
function legacyUtcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function legacyUtcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function legacyAddUtcDays(d: Date, delta: number): Date {
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
  const todayStart = appStartOfDayUtc(now);
  const todayEnd = appEndOfDayUtc(now);
  const legacyTodayStart = legacyUtcStartOfDay(now);
  const legacyTodayEnd = legacyUtcEndOfDay(now);

  const presetRaw = String(searchParams.get("range") ?? "7d").toLowerCase();
  const requestedPreset: AdminRangePreset =
    presetRaw === "today" || presetRaw === "yesterday" || presetRaw === "7d" || presetRaw === "30d" || presetRaw === "custom"
      ? (presetRaw as AdminRangePreset)
      : "7d";

  let preset: AdminRangePreset = requestedPreset;
  let customRangeFallback = false;
  let start = todayStart;
  let end = todayEnd;
  let legacyStart = legacyTodayStart;
  let legacyEnd = legacyTodayEnd;
  let label = "近7天";

  if (preset === "today") {
    label = "今日";
  } else if (preset === "yesterday") {
    const yesterdayRef = addAppDays(now, -1);
    start = appStartOfDayUtc(yesterdayRef);
    end = appEndOfDayUtc(yesterdayRef);
    legacyStart = legacyAddUtcDays(legacyTodayStart, -1);
    legacyEnd = legacyAddUtcDays(legacyTodayEnd, -1);
    label = "昨日";
  } else if (preset === "7d") {
    start = addAppDays(todayStart, -6);
    legacyStart = legacyAddUtcDays(legacyTodayStart, -6);
    label = "近7天";
  } else if (preset === "30d") {
    start = addAppDays(todayStart, -29);
    legacyStart = legacyAddUtcDays(legacyTodayStart, -29);
    label = "近30天";
  } else if (preset === "custom") {
    const customStart = parseCustomDate(searchParams.get("start"));
    const customEnd = parseCustomDate(searchParams.get("end"));
    if (customStart && customEnd && customStart <= customEnd) {
      start = appStartOfDayUtc(customStart);
      end = appEndOfDayUtc(customEnd);
      legacyStart = legacyUtcStartOfDay(customStart);
      legacyEnd = legacyUtcEndOfDay(customEnd);
      label = `${appDateLabel(start)} ~ ${appDateLabel(end)}`;
    } else {
      preset = "7d";
      customRangeFallback = true;
      start = addAppDays(todayStart, -6);
      legacyStart = legacyAddUtcDays(legacyTodayStart, -6);
      label = "近7天（自定义区间无效，已回退）";
    }
  }

  return {
    preset,
    requestedPreset,
    customRangeFallback,
    start,
    end,
    startDateKey: getUtcDateKey(legacyStart),
    endDateKey: getUtcDateKey(legacyEnd),
    label,
  };
}

