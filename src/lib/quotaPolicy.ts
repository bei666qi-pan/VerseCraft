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

export function buildQuotaLimitNarrative(input: QuotaLimitNarrativeInput): string {
  if (input.reason === "banned") {
    return "账号已被封禁，无法继续使用本平台。";
  }
  if (input.reason === "action_limit") {
    return "今日动作次数已达上限，请明天再试。";
  }

  const dailyLimit = formatTokenLimitForChinese(input.dailyTokenLimit);
  const surveyBonus = formatTokenLimitForChinese(input.surveyBonusDailyTokenLimit);
  if (input.actorType === "guest") {
    return `游客今日 ${dailyLimit} Token 体验额度已用完。注册账号后每日额度会提升，也可以保存更稳定的游玩进度。`;
  }
  if (input.hasSurveyBonus) {
    return `今日 ${dailyLimit} Token 额度已用完，感谢你已经填写问卷。请明天再继续。`;
  }
  return `今日 ${dailyLimit} Token 额度已用完。填写首页产品问卷后，今天会额外增加 ${surveyBonus} Token 额度。`;
}
