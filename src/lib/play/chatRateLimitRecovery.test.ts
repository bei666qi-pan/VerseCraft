import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocalRateLimitedPayload,
  isRecoverableModelRateLimit,
  dmIndicatesRecoverableModelRateLimit,
} from "./chatRateLimitRecovery";

test("isLocalRateLimitedPayload：本地限流标记（429 + rate_limited，且无 upstream/queue_full/risk_control 等词）判定为 true", () => {
  assert.equal(isLocalRateLimitedPayload({ status: 429, code: "rate_limited" }), true);
});

test("isLocalRateLimitedPayload：非 429 不算本地限流", () => {
  assert.equal(isLocalRateLimitedPayload({ status: 503, code: "rate_limited" }), false);
});

test("isLocalRateLimitedPayload：命中 upstream/queue_full/risk_control 等词时不算本地限流（避免误吞上游信号）", () => {
  assert.equal(isLocalRateLimitedPayload({ status: 429, code: "rate_limited", reason: "upstream_rate" }), false);
  assert.equal(isLocalRateLimitedPayload({ status: 429, body: "queue_full" }), false);
});

test("isRecoverableModelRateLimit：本地限流不算可恢复", () => {
  assert.equal(isRecoverableModelRateLimit({ status: 429, code: "rate_limited" }), false);
});

test("isRecoverableModelRateLimit：风控/配额/鉴权/封禁类关键字一律不可恢复", () => {
  for (const reason of ["risk_control", "queue_full", "quota", "auth", "forbidden", "banned", "invalid_ticket"]) {
    assert.equal(
      isRecoverableModelRateLimit({ reason }),
      false,
      `reason="${reason}" 应判定为不可恢复`
    );
  }
});

test("isRecoverableModelRateLimit：upstreamStatus 429/503 或本地 status 503 判定为可恢复", () => {
  assert.equal(isRecoverableModelRateLimit({ upstreamStatus: 429 }), true);
  assert.equal(isRecoverableModelRateLimit({ upstreamStatus: 503 }), true);
  assert.equal(isRecoverableModelRateLimit({ status: 503 }), true);
});

test("isRecoverableModelRateLimit：命中限流类关键字（rate_limit/overloaded/capacity等）判定为可恢复", () => {
  assert.equal(isRecoverableModelRateLimit({ code: "upstream_rate_limit" }), true);
  assert.equal(isRecoverableModelRateLimit({ reason: "model overloaded" }), true);
  assert.equal(isRecoverableModelRateLimit({ body: "capacity exceeded" }), true);
});

test("isRecoverableModelRateLimit：无任何匹配信号时判定为不可恢复（保守默认）", () => {
  assert.equal(isRecoverableModelRateLimit({}), false);
  assert.equal(isRecoverableModelRateLimit({ status: 500 }), false);
});

test("dmIndicatesRecoverableModelRateLimit：security_meta.kind=site_busy 视为可恢复（503 等价）", () => {
  assert.equal(dmIndicatesRecoverableModelRateLimit({ security_meta: { kind: "site_busy" } }), true);
});

test("dmIndicatesRecoverableModelRateLimit：internal_meta.upstream_status=429 视为可恢复", () => {
  assert.equal(
    dmIndicatesRecoverableModelRateLimit({ internal_meta: { upstream_status: 429 } }),
    true
  );
});

test("dmIndicatesRecoverableModelRateLimit：非对象/缺失 meta 时安全返回 false，不抛错", () => {
  assert.equal(dmIndicatesRecoverableModelRateLimit(null), false);
  assert.equal(dmIndicatesRecoverableModelRateLimit(undefined), false);
  assert.equal(dmIndicatesRecoverableModelRateLimit("string"), false);
  assert.equal(dmIndicatesRecoverableModelRateLimit([]), false);
  assert.equal(dmIndicatesRecoverableModelRateLimit({}), false);
});

test("dmIndicatesRecoverableModelRateLimit：命中风控关键字时即使有 site_busy 也应保持各自独立判断（reason 优先不可恢复）", () => {
  assert.equal(
    dmIndicatesRecoverableModelRateLimit({ security_meta: { kind: "site_busy", reason: "risk_control" } }),
    false,
    "reason=risk_control 应覆盖为不可恢复"
  );
});
