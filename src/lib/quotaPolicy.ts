export type QuotaActorType = "registered" | "guest";

export type QuotaDenialReason = "banned" | "token_limit" | "action_limit";

export const DEFAULT_GUEST_DAILY_TOKEN_LIMIT = 500_000;
export const DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT = 1_000_000;
export const DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT = 1_000_000;

export type TokenAllowanceInput = {
  actorType: QuotaActorType;
  registeredDailyTokenLimit: number;
  guestDailyTokenLimit: number;
  surveyBonusDailyTokenLimit: number;
  hasSurveyBonus?: boolean;
};

export type QuotaLimitNarrativeInput = {
  actorType: QuotaActorType;
  reason: QuotaDenialReason;
  dailyTokenLimit: number;
  surveyBonusDailyTokenLimit: number;
  hasSurveyBonus?: boolean;
  nextRefreshAt?: string | Date | null;
};

export type DailyQuotaWindow = {
  dateKey: string;
  nextRefreshAt: Date;
};

function safeNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.trunc(value));
}

export function computeDailyTokenLimit(input: TokenAllowanceInput): number {
  const registeredDailyTokenLimit = safeNonNegativeInt(
    input.registeredDailyTokenLimit,
    DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT
  );
  const guestDailyTokenLimit = safeNonNegativeInt(
    input.guestDailyTokenLimit,
    DEFAULT_GUEST_DAILY_TOKEN_LIMIT
  );
  const surveyBonusDailyTokenLimit = safeNonNegativeInt(
    input.surveyBonusDailyTokenLimit,
    DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT
  );

  if (input.actorType === "guest") return guestDailyTokenLimit;
  return registeredDailyTokenLimit + (input.hasSurveyBonus ? surveyBonusDailyTokenLimit : 0);
}

export function formatTokenLimitForChinese(value: number): string {
  const safe = safeNonNegativeInt(value, 0);
  if (safe > 0 && safe % 10_000 === 0) return `${safe / 10_000}万`;
  return safe.toLocaleString("zh-CN");
}

/**
 * 配额与 actor_daily_tokens 都以 UTC date key 结算；保持与既有 analytics 写入口径一致。
 * 玩家展示使用北京时间，避免“明天”在跨时区边界产生歧义。
 */
export function getDailyQuotaWindow(now = new Date()): DailyQuotaWindow {
  const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
  const dateKey = safeNow.toISOString().slice(0, 10);
  const nextRefreshAt = new Date(Date.UTC(
    safeNow.getUTCFullYear(),
    safeNow.getUTCMonth(),
    safeNow.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ));
  return { dateKey, nextRefreshAt };
}

export function formatQuotaRefreshTimeChinese(value: string | Date): string {
  const at = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(at.getTime())) return "北京时间下一日 08:00";
  const beijingWallClock = new Date(at.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = beijingWallClock.getUTCFullYear();
  const mm = String(beijingWallClock.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(beijingWallClock.getUTCDate()).padStart(2, "0");
  const hh = String(beijingWallClock.getUTCHours()).padStart(2, "0");
  const min = String(beijingWallClock.getUTCMinutes()).padStart(2, "0");
  return `北京时间 ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function buildQuotaLimitNarrative(input: QuotaLimitNarrativeInput): string {
  if (input.reason === "banned") {
    return "账号已被封禁，无法继续使用本平台。";
  }
  const refreshHint = input.nextRefreshAt ? `额度将于${formatQuotaRefreshTimeChinese(input.nextRefreshAt)}自动刷新。` : "";
  if (input.reason === "action_limit") return `今日动作次数已达上限。${refreshHint}`;

  const dailyLimit = formatTokenLimitForChinese(input.dailyTokenLimit);
  const surveyBonus = formatTokenLimitForChinese(input.surveyBonusDailyTokenLimit);
  if (input.actorType === "guest") {
    return `游客今日 ${dailyLimit} Token 体验额度已用完。${refreshHint}注册账号后每日额度会提升，也可以保存更稳定的游玩进度。`;
  }
  if (input.hasSurveyBonus) {
    return `今日 ${dailyLimit} Token 额度已用完，感谢你已经填写问卷。${refreshHint}`;
  }
  return `今日 ${dailyLimit} Token 额度已用完。${refreshHint}填写首页产品问卷后，今天会额外增加 ${surveyBonus} Token 额度。`;
}
