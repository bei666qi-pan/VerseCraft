import test from "node:test";
import assert from "node:assert/strict";
import { buildStatusFramePayload, buildSseHeaders, createSseResponse, encodeSseEventPayload, sseText } from "@/lib/turnEngine/sse";
import {
  accumulateDmFromSseEvent,
  extractFinalPayloadFromSseDocument,
  foldSseTextToDmRaw,
  takeCompleteSseEvents,
} from "@/features/play/stream/sseFrame";

test("encodeSseEventPayload splits multiline payload into data lines", () => {
  const encoded = encodeSseEventPayload("line1\nline2");
  assert.equal(encoded, "data: line1\ndata: line2\n\n");
});

test("buildSseHeaders keeps request id and cache semantics", () => {
  const headers = buildSseHeaders("req_123", { "X-Test": "1" });
  assert.equal(headers["Cache-Control"], "no-cache, no-transform");
  assert.equal(headers["x-versecraft-request-id"], "req_123");
  assert.equal(headers["X-Test"], "1");
});

test("createSseResponse returns event-stream response", async () => {
  const response = createSseResponse({
    requestId: "req_123",
    payload: '{"ok":true}',
    extras: { "X-Test": "1" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(response.headers.get("x-versecraft-request-id"), "req_123");
  assert.equal(response.headers.get("x-test"), "1");
  assert.match(await response.text(), /^data: /);
});

test("buildStatusFramePayload emits stable status envelope", () => {
  const payload = buildStatusFramePayload({
    stage: "finalizing",
    message: "closing",
    requestId: "req_123",
    at: 42,
  });
  assert.equal(
    payload,
    '__VERSECRAFT_STATUS__:{"stage":"finalizing","message":"closing","requestId":"req_123","at":42}'
  );
});

// --- Phase-5: SSE envelope contract, round-tripped through the client decoder ---
// These tests lock down the three guarantees the client depends on:
//   1. __VERSECRAFT_STATUS__ frames MUST not corrupt the DM buffer.
//   2. __VERSECRAFT_FINAL__ frame MUST override any streamed-partial buffer.
//   3. Large final payloads MUST survive SSE multi-chunk framing.

test("contract: status frames are stripped before DM accumulation", () => {
  const statusFrame = sseText(
    buildStatusFramePayload({ stage: "streaming", message: "warm", requestId: "r1", at: 1 })
  );
  const partial = sseText('{"narrative":"hi","is_action_legal":true,"sanity_damage":0,"is_death":false}');
  const doc = statusFrame + partial;
  const raw = foldSseTextToDmRaw(doc);
  assert.ok(!raw.includes("__VERSECRAFT_STATUS__"), "status marker must not leak into DM raw");
  assert.ok(raw.includes('"narrative":"hi"'));
});

test("contract: final frame overrides earlier partial chunks", () => {
  const partial = sseText('{"narrative":"partial","is_action_legal":true');
  const final = sseText(
    '__VERSECRAFT_FINAL__:' +
      '{"narrative":"DONE","is_action_legal":true,"sanity_damage":0,"is_death":false}'
  );
  const raw = foldSseTextToDmRaw(partial + final);
  assert.ok(raw.includes('"narrative":"DONE"'));
  assert.ok(!raw.includes('"narrative":"partial"'));
  const out = extractFinalPayloadFromSseDocument(partial + final);
  assert.equal(out.found, true);
  assert.ok(out.payload.startsWith("{"));
});

test("contract: large DM payload survives repeated framing", () => {
  // Simulate a ~32KB narrative split into several SSE frames. The client must
  // reassemble the exact JSON even across many chunks.
  const narrative = "很长的叙事。".repeat(3000); // ~15k chars
  const finalJson = JSON.stringify({
    narrative,
    is_action_legal: true,
    sanity_damage: 0,
    is_death: false,
  });
  const full = sseText(`__VERSECRAFT_FINAL__:${finalJson}`);
  // Break into 4 arbitrary chunks; takeCompleteSseEvents should still find one event.
  const midA = Math.floor(full.length * 0.25);
  const midB = Math.floor(full.length * 0.55);
  const midC = Math.floor(full.length * 0.85);
  const chunks = [
    full.slice(0, midA),
    full.slice(midA, midB),
    full.slice(midB, midC),
    full.slice(midC),
  ];
  const reassembled = chunks.join("");
  const { events } = takeCompleteSseEvents(reassembled);
  assert.equal(events.length, 1, "single SSE event even when chunks arrive separately");
  const raw = foldSseTextToDmRaw(reassembled);
  assert.equal(raw, finalJson, "final payload must round-trip bit-for-bit");
});

test("contract: incremental accumulator ignores an orphan status frame between chunks", () => {
  let raw = "";
  ({ raw } = accumulateDmFromSseEvent('data: {"narrative":"a', raw));
  ({ raw } = accumulateDmFromSseEvent(
    'data: __VERSECRAFT_STATUS__:{"stage":"generating","requestId":"r1"}',
    raw
  ));
  ({ raw } = accumulateDmFromSseEvent('data: b"}', raw));
  // Status event MUST be a no-op; chunks a and b must concatenate contiguously.
  assert.equal(raw, '{"narrative":"ab"}');
});

test("contract: encode/decode round-trip preserves newline-only payloads", () => {
  const payload = 'line1\nline2\nline3';
  const encoded = encodeSseEventPayload(payload);
  assert.equal(encoded, "data: line1\ndata: line2\ndata: line3\n\n");
  // Client-side folding restores exactly the original payload.
  const folded = foldSseTextToDmRaw(encoded);
  assert.equal(folded, payload);
});
