import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GUEST_DAILY_TOKEN_LIMIT,
  DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
  DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
  buildQuotaLimitNarrative,
  computeDailyTokenLimit,
} from "@/lib/quotaPolicy";

test("guest token allowance defaults to 500k and prompts registration on limit", () => {
  const limit = computeDailyTokenLimit({
    actorType: "guest",
    registeredDailyTokenLimit: DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
    guestDailyTokenLimit: DEFAULT_GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
  });

  assert.equal(limit, 500_000);
  const narrative = buildQuotaLimitNarrative({
    actorType: "guest",
    reason: "token_limit",
    dailyTokenLimit: limit,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
  });
  assert.match(narrative, /注册账号/);
  assert.match(narrative, /50万/);
});

test("registered token allowance defaults to 1m and survey bonus adds another 1m", () => {
  const base = computeDailyTokenLimit({
    actorType: "registered",
    registeredDailyTokenLimit: DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
    guestDailyTokenLimit: DEFAULT_GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    hasSurveyBonus: false,
  });
  const withSurvey = computeDailyTokenLimit({
    actorType: "registered",
    registeredDailyTokenLimit: DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
    guestDailyTokenLimit: DEFAULT_GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    hasSurveyBonus: true,
  });

  assert.equal(base, 1_000_000);
  assert.equal(withSurvey, 2_000_000);
});

test("registered token limit narrative asks for survey before bonus is used", () => {
  const narrative = buildQuotaLimitNarrative({
    actorType: "registered",
    reason: "token_limit",
    dailyTokenLimit: DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    hasSurveyBonus: false,
  });

  assert.match(narrative, /问卷/);
  assert.match(narrative, /额外增加 100万 Token/);
});
