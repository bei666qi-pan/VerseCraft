import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPlayTurnFailure,
  getPlayTurnFailureMessage,
  shouldShowFailureAsNarrative,
} from "@/features/play/turnFailurePolicy";

test("classifyPlayTurnFailure only labels real timeout/gateway failures as network", () => {
  assert.equal(classifyPlayTurnFailure({ deadlineHit: true }), "network_or_gateway");
  assert.equal(classifyPlayTurnFailure({ status: 504 }), "network_or_gateway");
  assert.equal(classifyPlayTurnFailure({ errorMessage: "fetch failed: ECONNRESET" }), "network_or_gateway");
});

test("classifyPlayTurnFailure separates busy, auth, and internal failures", () => {
  assert.equal(classifyPlayTurnFailure({ status: 503 }), "site_busy");
  assert.equal(classifyPlayTurnFailure({ status: 429, body: '{"error":"rate_limited"}' }), "local_rate_limited");
  assert.equal(classifyPlayTurnFailure({ status: 429, reason: "upstream_rate_limit" }), "site_busy");
  assert.equal(classifyPlayTurnFailure({ status: 502, upstreamStatus: 401, code: "UPSTREAM_AUTH_FAILED" }), "auth_or_config");
  assert.equal(classifyPlayTurnFailure({ status: 500, code: "JSON_PARSE_FAILED" }), "internal");
  assert.equal(classifyPlayTurnFailure({ status: 200, code: "VALIDATOR_REPAIR_FAILED" }), "internal");
});

test("classifyPlayTurnFailure detects csrf check failures", () => {
  assert.equal(
    classifyPlayTurnFailure({ status: 403, body: '{"error":"csrf_check_failed"}' }),
    "csrf_failed"
  );
  assert.equal(
    classifyPlayTurnFailure({ status: 403, reason: "csrf_check_failed" }),
    "csrf_failed"
  );
  // csrf_check_failed takes priority over the auth_or_config 403 heuristic
  assert.equal(
    classifyPlayTurnFailure({ status: 403, code: "csrf_check_failed" }),
    "csrf_failed"
  );
});

test("only website/gateway failures are player-visible fallback", () => {
  assert.equal(shouldShowFailureAsNarrative("network_or_gateway"), true);
  assert.equal(shouldShowFailureAsNarrative("site_busy"), true);
  assert.equal(shouldShowFailureAsNarrative("local_rate_limited"), false);
  assert.equal(shouldShowFailureAsNarrative("auth_or_config"), true);
  assert.equal(shouldShowFailureAsNarrative("csrf_failed"), true);
  assert.equal(shouldShowFailureAsNarrative("internal"), false);

  assert.match(getPlayTurnFailureMessage("network_or_gateway"), /网站|网关/);
  assert.match(getPlayTurnFailureMessage("site_busy"), /网站|繁忙/);
  assert.doesNotMatch(getPlayTurnFailureMessage("local_rate_limited"), /网站|繁忙|网络|网关/);
  assert.match(getPlayTurnFailureMessage("auth_or_config"), /网站|服务/);
  assert.match(getPlayTurnFailureMessage("csrf_failed"), /浏览器|校验|刷新/);
  assert.equal(getPlayTurnFailureMessage("internal"), "");
});
