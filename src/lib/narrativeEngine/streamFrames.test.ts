import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStatusFramePayload as buildStatusFramePayloadCore,
  createSseResponse as createSseResponseCore,
  sseText as sseTextCore,
} from "@/lib/turnEngine/sse";
import {
  buildStatusFramePayload,
  createSseResponse,
  sseText,
} from "./streamFrames";

test("narrative stream frame wrappers preserve turnEngine SSE text behavior", () => {
  const payload = "__VERSECRAFT_FINAL__:{\"ok\":true}";

  assert.equal(sseText(payload), sseTextCore(payload));
});

test("narrative status frame wrapper preserves status envelope", () => {
  const args = {
    stage: "finalizing" as const,
    message: "closing",
    requestId: "req_ne_1",
    at: 42,
  };

  assert.equal(buildStatusFramePayload(args), buildStatusFramePayloadCore(args));
});

test("narrative SSE response wrapper preserves response contract", async () => {
  const wrapped = createSseResponse({
    requestId: "req_ne_2",
    payload: "{\"ok\":true}",
    extras: { "X-Test": "1" },
  });
  const core = createSseResponseCore({
    requestId: "req_ne_2",
    payload: "{\"ok\":true}",
    extras: { "X-Test": "1" },
  });

  assert.equal(wrapped.status, core.status);
  assert.equal(wrapped.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(wrapped.headers.get("x-versecraft-request-id"), "req_ne_2");
  assert.equal(await wrapped.text(), await core.text());
});
