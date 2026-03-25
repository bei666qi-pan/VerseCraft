import test from "node:test";
import assert from "node:assert/strict";
import { moderateTextWithBaidu } from "@/lib/safety/client";
import type { FetchLike } from "@/lib/safety/baidu/tokenClient";

function makeResponse(jsonData: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => jsonData,
  } as unknown as Response;
}

function buildFetchImpl(kind: "fail" | "allow", counters: { token: number; censor: number }): FetchLike {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/oauth/2.0/token")) {
      counters.token += 1;
      return makeResponse({ access_token: "t", expires_in: 3600 });
    }
    if (url.includes("/text_censor/v2/user_defined")) {
      counters.censor += 1;
      if (kind === "allow") {
        return makeResponse({ conclusionType: 1, conclusion: "合规", data: [] });
      }
      return makeResponse({ conclusionType: 4, conclusion: "审核失败", error_msg: "x", data: [] });
    }
    throw new Error(`unexpected_url:${url}`);
  };
}

function setBaiduEnv(overrides: Partial<Record<string, string>> = {}) {
  process.env.BAUDU_SINAN_CIRCUIT_FAILURE_THRESHOLD = ""; // noop guard for typo
  process.env.BAIDU_SINAN_ENABLED = "true";
  process.env.BAIDU_SINAN_PROVIDER = "baidu_text_censor";
  process.env.BAIDU_SINAN_API_KEY = "ak";
  process.env.BAIDU_SINAN_SECRET_KEY = "sk";
  process.env.BAIDU_SINAN_AUTH_MODE = "oauth_access_token";
  process.env.BAIDU_SINAN_TIMEOUT_MS = "2500";
  process.env.BAIDU_SINAN_CONNECT_TIMEOUT_MS = "1200";
  process.env.BAIDU_SINAN_INPUT_ENABLED = "true";
  process.env.BAIDU_SINAN_OUTPUT_ENABLED = "true";
  process.env.BAIDU_SINAN_PUBLIC_CONTENT_ENABLED = "true";
  process.env.BAIDU_SINAN_FAIL_MODE_PRIVATE = "fail_soft";
  process.env.BAIDU_SINAN_FAIL_MODE_PUBLIC = "fail_closed";
  process.env.BAIDU_SINAN_CIRCUIT_WINDOW_MS = overrides.BAIDU_SINAN_CIRCUIT_WINDOW_MS ?? "1000";
  process.env.BAIDU_SINAN_CIRCUIT_COOLDOWN_MS = overrides.BAIDU_SINAN_CIRCUIT_COOLDOWN_MS ?? "10_000";
  process.env.BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD = overrides.BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD ?? "1";
  process.env.BAIDU_SINAN_LOG_RAW_TEXT = "false";
  process.env.BAIDU_SINAN_HASH_SALT = overrides.BAIDU_SINAN_HASH_SALT ?? `salt_${Date.now()}`;
  process.env.BAIDU_SINAN_STRICTNESS_PROFILE = overrides.BAIDU_SINAN_STRICTNESS_PROFILE ?? "balanced";

  for (const [k, v] of Object.entries(overrides)) {
    if (v == null) continue;
    process.env[k] = v;
  }
}

test("circuit breaker: fail_soft opens and skips provider (private input)", async () => {
  const counters = { token: 0, censor: 0 };
  setBaiduEnv({ BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD: "1", BAIDU_SINAN_HASH_SALT: "cb_test_private_1" });

  const fetchImpl = buildFetchImpl("fail", counters);
  const r1 = await moderateTextWithBaidu({ text: "any", scene: "private_story_action", stage: "input", traceId: "t1", fetchImpl });
  assert.equal(r1.evidence.errorKind, "service_error");
  assert.equal(r1.reasonCode.startsWith("baidu_audit_failed_fail_soft"), true);
  assert.ok(counters.token >= 1);
  assert.ok(counters.censor >= 1);

  const before = { ...counters };
  const r2 = await moderateTextWithBaidu({ text: "any", scene: "private_story_action", stage: "input", traceId: "t2", fetchImpl });
  assert.equal(r2.evidence.errorKind, "circuit_open");
  // Provider should be skipped.
  assert.equal(counters.token, before.token);
  assert.equal(counters.censor, before.censor);
});

test("circuit breaker: fail_closed opens and skips provider (public)", async () => {
  const counters = { token: 0, censor: 0 };
  setBaiduEnv({ BAIDU_SINAN_CIRCUIT_FAILURE_THRESHOLD: "1", BAIDU_SINAN_HASH_SALT: "cb_test_public_1", BAIDU_SINAN_FAIL_MODE_PUBLIC: "fail_closed" });

  const fetchImpl = buildFetchImpl("fail", counters);
  const r1 = await moderateTextWithBaidu({ text: "any", scene: "public_share", stage: "public", traceId: "t3", fetchImpl });
  assert.equal(r1.evidence.errorKind, "service_error");
  assert.equal(r1.decision, "block");

  const before = { ...counters };
  const r2 = await moderateTextWithBaidu({ text: "any", scene: "public_share", stage: "public", traceId: "t4", fetchImpl });
  assert.equal(r2.evidence.errorKind, "circuit_open");
  assert.equal(r2.decision, "block");
  assert.equal(counters.token, before.token);
  assert.equal(counters.censor, before.censor);
});

