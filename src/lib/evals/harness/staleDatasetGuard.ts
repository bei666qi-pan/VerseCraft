/**
 * Stale Dataset Guard — 数据集过期检查
 *
 * 检查 gold set / eval dataset 的最后更新时间，
 * 超过 14 天未更新则发出警告，防止依赖过期真值数据。
 *
 * 设计原则：
 * - 纯函数，不访问 IO/DB/AI
 * - 可被各 eval 脚本和 harness runner 复用
 * - 仅 warn，不 block（避免因元数据问题阻断 CI）
 */

/** 默认过期阈值：14 天 */
export const DEFAULT_STALE_DAYS = 14;

/** 过期检查结果 */
export interface StaleCheckResult {
  /** 数据集路径或标识 */
  datasetId: string;
  /** 最后更新时间 */
  lastUpdated: string;
  /** 距今已过天数 */
  daysSinceUpdate: number;
  /** 是否过期 */
  isStale: boolean;
  /** 警告消息（过期时非空） */
  warning: string | null;
}

/**
 * 检查给定 lastUpdated 时间戳是否超过 staleDays 天。
 *
 * @param datasetId 数据集标识（用于日志）
 * @param lastUpdated ISO 8601 时间戳字符串
 * @param staleDays 过期天数阈值（默认 14）
 * @param now 当前时间（便于测试注入，默认 Date.now()）
 */
export function checkStaleDataset(
  datasetId: string,
  lastUpdated: string,
  staleDays: number = DEFAULT_STALE_DAYS,
  now: number = Date.now(),
): StaleCheckResult {
  const updatedAt = new Date(lastUpdated).getTime();

  if (Number.isNaN(updatedAt)) {
    return {
      datasetId,
      lastUpdated,
      daysSinceUpdate: -1,
      isStale: true,
      warning: `[stale-dataset] ${datasetId}: 无法解析 lastUpdated 时间戳 (${lastUpdated})，视为过期`,
    };
  }

  const diffMs = now - updatedAt;
  const daysSinceUpdate = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isStale = daysSinceUpdate > staleDays;
  const warning = isStale
    ? `[stale-dataset] ${datasetId}: 数据集已 ${daysSinceUpdate} 天未更新 (阈值: ${staleDays} 天)，黄金真值可能过期`
    : null;

  return {
    datasetId,
    lastUpdated,
    daysSinceUpdate,
    isStale,
    warning,
  };
}

/**
 * 从 gold set 元数据中提取 lastUpdated 并检查过期。
 *
 * @param datasetId 数据集标识
 * @param metadata 类似 GoldSetMetadata 的对象（至少包含 lastUpdated 字段）
 * @param staleDays 过期天数阈值
 * @param now 当前时间
 */
export function checkGoldSetStaleness(
  datasetId: string,
  metadata: { lastUpdated?: string } | null | undefined,
  staleDays: number = DEFAULT_STALE_DAYS,
  now: number = Date.now(),
): StaleCheckResult {
  const lastUpdated = metadata?.lastUpdated ?? "";
  if (!lastUpdated) {
    return {
      datasetId,
      lastUpdated: "",
      daysSinceUpdate: -1,
      isStale: true,
      warning: `[stale-dataset] ${datasetId}: 缺少 lastUpdated 字段，视为过期`,
    };
  }
  return checkStaleDataset(datasetId, lastUpdated, staleDays, now);
}

/**
 * 如果数据集过期，输出 warn 日志并返回 true。
 * 方便调用方使用：
 *   if (warnIfStale(result)) { ... handle stale ... }
 */
export function warnIfStale(result: StaleCheckResult): boolean {
  if (result.warning) {
    console.warn(`⚠️  ${result.warning}`);
    return true;
  }
  return false;
}
