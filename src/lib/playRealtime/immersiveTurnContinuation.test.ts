import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInternalNoNarrativeDmJson,
  buildVisibleSiteFailureDmJson,
  buildVisibleSiteFailureMessage,
} from "./immersiveTurnContinuation";

test("visible site fallback is reserved for real website or gateway failures", () => {
  assert.match(buildVisibleSiteFailureMessage("network_or_gateway"), /网站|网关/);
  assert.match(buildVisibleSiteFailureMessage("site_busy"), /网站|繁忙/);
  assert.match(buildVisibleSiteFailureMessage("auth_or_config"), /网站|服务/);
});

test("internal story-chain fallback produces no player-visible narrative", () => {
  const dm = JSON.parse(buildInternalNoNarrativeDmJson({ requestId: "r1", reason: "validator_internal" }));
  assert.equal(dm.is_action_legal, true);
  assert.equal(dm.consumes_time, false);
  assert.equal(dm.sanity_damage, 0);
  assert.equal(dm.narrative, "");
  assert.equal(dm.internal_meta.action, "internal_no_visible_fallback");
});

test("site fallback DM is contract-shaped and explicit", () => {
  const dm = JSON.parse(buildVisibleSiteFailureDmJson({ kind: "site_busy", requestId: "r2" }));
  assert.equal(dm.is_action_legal, false);
  assert.equal(dm.consumes_time, false);
  assert.match(dm.narrative, /网站|繁忙/);
  assert.equal(dm.internal_meta.action, "site_fallback");
});
