/**
 * VerseCraft 后台统计的"应用时区"约定（仅用于读取侧的时刻范围过滤）。
 *
 * 背景（根因）：`src/lib/admin/timeRange.ts` 历史实现按纯 UTC 自然日计算"今日/昨日/
 * 近7天/近30天"边界。VerseCraft 面向中文用户，北京时间 0:00-8:00 期间 UTC 日历日
 * 仍是"昨天"，导致后台"今日"窗口在这 8 小时内实际展示的是北京昨天的数据，
 * 且不同函数各自用 `CURRENT_DATE`（依赖数据库会话时区）或纯 UTC 计算，
 * 出现"同一页面两套互不一致的今日定义"。
 *
 * 修复方式：中国大陆自 1991 年起不实行夏令时，北京时间固定为 UTC+8，
 * 因此只需一个固定 8 小时偏移，无需引入 IANA 时区数据库。
 *
 * 重要边界（务必阅读，不要越界使用）：
 * - 本文件的函数只应用于比较 timestamptz 列（如 analytics_events.event_time、
 *   guest_registry.first_seen_at、feedbacks.created_at 等）的读查询范围。
 * - 不要用本文件的函数重新计算或改写任何 `date_key`（DATE 类型）列的值。
 *   `date_key` 的写入语义由 `src/lib/analytics/dateKeys.ts` 的 `getUtcDateKey`
 *   （纯 UTC 自然日）决定，且被 `/api/chat/route.ts`、presence 心跳、
 *   Redis DAU 集合、幂等键、actor_daily_activity/actor_daily_tokens/
 *   admin_metrics_daily 等大量写入路径依赖。统一改写该写入语义属于更大范围的
 *   系统性变更（会影响上线路径与历史数据口径），不在本次改动范围内，
 *   需要单独评估和用户明确同意后再做。
 * - 因此涉及 `date_key` 列的查询，请继续使用 `getUtcDateKey` 现有 UTC 约定
 *   （必要时用 `(col AT TIME ZONE 'UTC')::date` 显式化，避免隐式依赖数据库
 *   会话时区），不要在这类查询里套用本文件的北京对齐边界，否则会引入新的
 *   （只是换了个位置的）口径不一致。
 */

export const APP_TIMEZONE_LABEL = "Asia/Shanghai" as const;

/** UTC+8，全年固定偏移（中国大陆不实行夏令时）。 */
const APP_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把真实 UTC 时刻平移到"数值上等于北京墙钟时间"的 Date（仅用于借用 getUTC* 读数）。 */
function toWallClock(d: Date): Date {
  return new Date(d.getTime() + APP_TIMEZONE_OFFSET_MS);
}

/** 把"北京墙钟数值"的 Date 换算回真实 UTC 时刻。 */
function fromWallClock(wall: Date): Date {
  return new Date(wall.getTime() - APP_TIMEZONE_OFFSET_MS);
}

/** 给定时刻所在北京自然日的 00:00:00.000（返回真实 UTC 时刻，用于 >= 过滤）。 */
export function appStartOfDayUtc(d: Date): Date {
  const wall = toWallClock(d);
  const startOfWall = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 0, 0, 0, 0));
  return fromWallClock(startOfWall);
}

/** 给定时刻所在北京自然日的 23:59:59.999（返回真实 UTC 时刻，用于 <= 过滤）。 */
export function appEndOfDayUtc(d: Date): Date {
  const wall = toWallClock(d);
  const endOfWall = new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), 23, 59, 59, 999));
  return fromWallClock(endOfWall);
}

/** 按北京日历天粒度加/减 N 天（月末/跨年/闰年安全，委托给 Date 的 setUTCDate 溢出规则）。 */
export function addAppDays(d: Date, deltaDays: number): Date {
  const wall = toWallClock(d);
  const nextWall = new Date(wall.getTime());
  nextWall.setUTCDate(nextWall.getUTCDate() + deltaDays);
  return fromWallClock(nextWall);
}

/**
 * 仅用于人类可读展示（例如自定义区间标签 "2026-07-06 ~ 2026-07-06"）的北京日期字符串。
 * 禁止把返回值当作 date_key 列的查询键使用。
 */
export function appDateLabel(d: Date): string {
  return toWallClock(d).toISOString().slice(0, 10);
}
