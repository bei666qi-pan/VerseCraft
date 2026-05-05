import assert from "node:assert/strict";
import test from "node:test";
import {
  OPTIONS_REGEN_FAILURE_HINT,
  parseOptionsFromSsePayload,
  type OptionsRegenParseConfig,
} from "./optionsRegenParsing";

const OPTIONS = [
  "我靠近门缝听动静",
  "我检查走廊地面",
  "我向安全区后撤",
  "我询问身旁的人",
];

function asSse(payload: string): string {
  return `data: ${payload}\n\n`;
}

function config(overrides: Partial<OptionsRegenParseConfig> = {}): OptionsRegenParseConfig {
  return {
    normalizeOptions: (rawOptions) =>
      Array.isArray(rawOptions)
        ? rawOptions.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
        : [],
    runSemanticQualityGate: (candidateOptions) => ({ accepted: candidateOptions.slice(0, 4), rejectCodes: [] }),
    ...overrides,
  };
}

test("parseOptionsFromSsePayload: ok=false options regen response does not call tryParseDM", () => {
  let tryParseDmCalled = false;
  const result = parseOptionsFromSsePayload(
    asSse(JSON.stringify({
      ok: false,
      reason: "upstream_generate_failed",
      turn_mode: "decision_required",
      decision_required: true,
      decision_options: [],
      options: [],
      debug_reason_codes: ["parse_failed"],
    })),
    config({
      requestId: "vc_test_options_0001",
      tryParseDm: () => {
        tryParseDmCalled = true;
        return null;
      },
    })
  );

  assert.equal(tryParseDmCalled, false);
  assert.equal(result.parseFailed, true);
  assert.deepEqual(result.options, []);
  assert.equal(result.failure?.reason, "upstream_generate_failed");
  assert.deepEqual(result.failure?.debugReasonCodes, ["parse_failed"]);
});

test("parseOptionsFromSsePayload: ok=false path keeps user-facing options fallback hint specific", () => {
  assert.equal(
    OPTIONS_REGEN_FAILURE_HINT,
    "这次没有整理出可靠选项，你可以手动输入行动，或再次尝试生成。"
  );
});

test("parseOptionsFromSsePayload: ok=false does not emit tryParseDM console error", () => {
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) => {
    errors.push(String(args[0] ?? ""));
  };
  try {
    parseOptionsFromSsePayload(
      asSse(JSON.stringify({ ok: false, reason: "upstream_generate_failed", options: [], debug_reason_codes: ["parse_failed"] })),
      config()
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.some((line) => line.includes("[tryParseDM]")), false);
});

test("parseOptionsFromSsePayload: ok=true options regen response lands options", () => {
  const result = parseOptionsFromSsePayload(
    asSse(JSON.stringify({ ok: true, reason: "ok", options: OPTIONS, decision_options: OPTIONS })),
    config()
  );

  assert.equal(result.parseFailed, false);
  assert.deepEqual(result.options, OPTIONS);
  assert.equal(result.failure, null);
});

test("parseOptionsFromSsePayload: legacy options-only JSON stays compatible", () => {
  const result = parseOptionsFromSsePayload(asSse(JSON.stringify({ options: OPTIONS })), config());

  assert.equal(result.parseFailed, false);
  assert.deepEqual(result.options, OPTIONS);
});

test("parseOptionsFromSsePayload: full DM JSON with options still extracts options", () => {
  const dm = {
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "门缝后传来很轻的拖拽声。",
    is_death: false,
    options: OPTIONS,
  };
  const result = parseOptionsFromSsePayload(asSse(JSON.stringify(dm)), config());

  assert.equal(result.parseFailed, false);
  assert.deepEqual(result.options, OPTIONS);
});

test("parseOptionsFromSsePayload: status frame plus final frame parses final options only", () => {
  const sse = [
    'data: __VERSECRAFT_STATUS__:{"stage":"first_sse_write","message":"行动已送出","requestId":"vc_test_status_0001"}',
    "",
    `data: __VERSECRAFT_FINAL__:${JSON.stringify({ ok: true, reason: "ok", options: OPTIONS })}`,
    "",
  ].join("\n");
  const result = parseOptionsFromSsePayload(sse, config());

  assert.equal(result.requestId, "vc_test_status_0001");
  assert.equal(result.parseFailed, false);
  assert.deepEqual(result.options, OPTIONS);
});

test("parseOptionsFromSsePayload: options-only status frames do not pollute raw final payload", () => {
  const sse = [
    'data: __VERSECRAFT_STATUS__:{"stage":"context_building","message":"status","requestId":"vc_test_options_status"}',
    "",
    `data: ${JSON.stringify({ ok: true, reason: "ok", options: OPTIONS, decision_options: OPTIONS })}`,
    "",
  ].join("\n");
  const result = parseOptionsFromSsePayload(sse, config());

  assert.equal(result.requestId, "vc_test_options_status");
  assert.equal(result.parseFailed, false);
  assert.deepEqual(result.options, OPTIONS);
});
