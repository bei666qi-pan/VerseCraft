import assert from "node:assert/strict";
import test from "node:test";
import { hasConcreteNarrativeContent, probeChatSse } from "@/lib/perf/chatSseProbe";
import { VERSECRAFT_FINAL_PREFIX, VERSECRAFT_STATUS_PREFIX } from "@/lib/turnEngine/sse";

test("concrete narrative detection ignores terminal JSON protocol fragments", () => {
  assert.equal(hasConcreteNarrativeContent('{"narrative":"'), false);
  assert.equal(hasConcreteNarrativeContent('{"narrative":"   '), false);
  assert.equal(hasConcreteNarrativeContent('{"narrative":"走'), true);
  assert.equal(hasConcreteNarrativeContent('{"narrative":"\\u8d70'), true);
});

test("concrete narrative detection supports a plain-text compatibility stream", () => {
  assert.equal(hasConcreteNarrativeContent(""), false);
  assert.equal(hasConcreteNarrativeContent("  门外传来脚步声"), true);
});

test("a deterministic FINAL-only turn counts as visible concrete narrative", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    `data: ${VERSECRAFT_STATUS_PREFIX}{"stage":"finalizing"}\n\ndata: ${VERSECRAFT_FINAL_PREFIX}{"narrative":"现场记录不支持这个行动。","options":["观察现场","核对记录","询问老板"]}\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
  try {
    const result = await probeChatSse({
      baseUrl: "http://probe.invalid",
      body: { latestUserInput: "测试" },
    });
    assert.equal(result.contractPass, true);
    assert.equal(typeof result.firstVisibleTextMs, "number");
    assert.equal(typeof result.firstNarrativeContentMs, "number");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
