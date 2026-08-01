/**
 * Error Classification unit tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTraceErrors, NON_GAMEPLAY_CLASSES, REPAIRABLE_CLASSES } from "./errorClassification";

describe("classifyTraceErrors", () => {
  it("classifies AbortSignal timeout as infrastructure_failure", () => {
    assert.equal(
      classifyTraceErrors(["Live execution error: The operation was aborted due to timeout"]),
      "infrastructure_failure",
    );
  });

  it("classifies connection refused / fetch failed as infrastructure_failure", () => {
    assert.equal(classifyTraceErrors(["Live execution error: fetch failed"]), "infrastructure_failure");
    assert.equal(classifyTraceErrors(["Live execution error: connect ECONNREFUSED 127.0.0.1:666"]), "infrastructure_failure");
  });

  it("classifies 429/5xx as model_unavailable", () => {
    assert.equal(classifyTraceErrors(["HTTP 429: Too Many Requests"]), "model_unavailable");
    assert.equal(classifyTraceErrors(["HTTP 503: Service Unavailable"]), "model_unavailable");
  });

  it("classifies keys_missing status error as model_unavailable", () => {
    assert.equal(
      classifyTraceErrors(['Status error: {"type":"error","reason":"keys_missing"}']),
      "model_unavailable",
    );
  });

  it("classifies missing / broken final frame as parse_contract_defect", () => {
    assert.equal(classifyTraceErrors(["No __VERSECRAFT_FINAL__ frame received."]), "parse_contract_defect");
    assert.equal(classifyTraceErrors(["Failed to parse __VERSECRAFT_FINAL__ JSON: Unexpected token"]), "parse_contract_defect");
  });

  it("classifies 401/403 as external_blocked", () => {
    assert.equal(classifyTraceErrors(["HTTP 401: Unauthorized"]), "external_blocked");
    assert.equal(classifyTraceErrors(["HTTP 403: Forbidden"]), "external_blocked");
  });

  it("defaults unknown errors and empty list to product_defect", () => {
    assert.equal(classifyTraceErrors([]), "product_defect");
    assert.equal(classifyTraceErrors(["Some gameplay oddity"]), "product_defect");
  });

  it("classifies server site-fallback finals as infrastructure_failure", () => {
    assert.equal(classifyTraceErrors(["site_fallback: site_unavailable (stream_idle_timeout_45000ms)"]), "infrastructure_failure");
  });

  it("keeps class sets disjoint by intent", () => {
    for (const c of NON_GAMEPLAY_CLASSES) assert.ok(!REPAIRABLE_CLASSES.has(c));
  });
});
