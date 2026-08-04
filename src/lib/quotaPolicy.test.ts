import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_GUEST_DAILY_TOKEN_LIMIT,
  DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
  DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
  buildQuotaLimitNarrative,
  computeDailyTokenLimit,
  formatQuotaRefreshTimeChinese,
  getDailyQuotaWindow,
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

test("daily quota window uses UTC date keys and advances at the next UTC midnight", () => {
  const beforeBoundary = getDailyQuotaWindow(new Date("2026-07-20T23:59:59.000Z"));
  const afterBoundary = getDailyQuotaWindow(new Date("2026-07-21T00:00:00.000Z"));

  assert.deepEqual(beforeBoundary, {
    dateKey: "2026-07-20",
    nextRefreshAt: new Date("2026-07-21T00:00:00.000Z"),
  });
  assert.deepEqual(afterBoundary, {
    dateKey: "2026-07-21",
    nextRefreshAt: new Date("2026-07-22T00:00:00.000Z"),
  });
});

test("quota denial names the next refresh in Beijing time for users and guests", () => {
  const nextRefreshAt = "2026-07-21T00:00:00.000Z";
  assert.equal(formatQuotaRefreshTimeChinese(nextRefreshAt), "北京时间 2026-07-21 08:00");

  const guestNarrative = buildQuotaLimitNarrative({
    actorType: "guest",
    reason: "token_limit",
    dailyTokenLimit: DEFAULT_GUEST_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    nextRefreshAt,
  });
  const actionNarrative = buildQuotaLimitNarrative({
    actorType: "registered",
    reason: "action_limit",
    dailyTokenLimit: DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    nextRefreshAt,
  });
  const bannedNarrative = buildQuotaLimitNarrative({
    actorType: "registered",
    reason: "banned",
    dailyTokenLimit: DEFAULT_REGISTERED_DAILY_TOKEN_LIMIT,
    surveyBonusDailyTokenLimit: DEFAULT_SURVEY_BONUS_DAILY_TOKEN_LIMIT,
    nextRefreshAt,
  });

  assert.match(guestNarrative, /额度将于北京时间 2026-07-21 08:00自动刷新/);
  assert.match(actionNarrative, /额度将于北京时间 2026-07-21 08:00自动刷新/);
  assert.doesNotMatch(bannedNarrative, /刷新/);
});
