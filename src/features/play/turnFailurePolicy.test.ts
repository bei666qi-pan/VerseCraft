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
  assert.equal(classifyPlayTurnFailure({ status: 502, upstreamStatus: 401, code: "UPSTREAM_AUTH_FAILED" }), "auth_or_config");
  assert.equal(classifyPlayTurnFailure({ status: 500, code: "JSON_PARSE_FAILED" }), "internal");
  assert.equal(classifyPlayTurnFailure({ status: 200, code: "VALIDATOR_REPAIR_FAILED" }), "internal");
});

test("only website/gateway failures are player-visible fallback", () => {
  assert.equal(shouldShowFailureAsNarrative("network_or_gateway"), true);
  assert.equal(shouldShowFailureAsNarrative("site_busy"), true);
  assert.equal(shouldShowFailureAsNarrative("auth_or_config"), true);
  assert.equal(shouldShowFailureAsNarrative("internal"), false);

  assert.match(getPlayTurnFailureMessage("network_or_gateway"), /网站|网关/);
  assert.match(getPlayTurnFailureMessage("site_busy"), /网站|繁忙/);
  assert.match(getPlayTurnFailureMessage("auth_or_config"), /网站|服务/);
  assert.equal(getPlayTurnFailureMessage("internal"), "");
});
