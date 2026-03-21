// src/features/play/stream/sseFrame.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  accumulateDmFromSseEvent,
  normalizeSseNewlines,
  takeCompleteSseEvents,
} from "@/features/play/stream/sseFrame";

test("normalizeSseNewlines converts CRLF and lone CR", () => {
  assert.equal(normalizeSseNewlines("a\r\nb\rc"), "a\nb\nc");
});

test("takeCompleteSseEvents splits on blank line", () => {
  const { events, rest } = takeCompleteSseEvents("data: x\n\ndata: y\n\nz");
  assert.equal(events.length, 2);
  assert.equal(events[0], "data: x");
  assert.equal(events[1], "data: y");
  assert.equal(rest, "z");
});

test("accumulateDmFromSseEvent appends chunks and honors __VERSECRAFT_FINAL__", () => {
  let raw = "";
  ({ raw } = accumulateDmFromSseEvent("data: {\"a\":", raw));
  assert.equal(raw, "{\"a\":");
  ({ raw } = accumulateDmFromSseEvent("data: 1}", raw));
  assert.equal(raw, "{\"a\":1}");
  ({ raw } = accumulateDmFromSseEvent("data: __VERSECRAFT_FINAL__:{\"b\":2}", raw));
  assert.equal(raw, "{\"b\":2}");
});

test("accumulateDmFromSseEvent joins multiple data fields with newline (multiline SSE event)", () => {
  const event = `data: {"narrative":"line1
data: line2"}`;
  const { raw, sawNonEmptyData } = accumulateDmFromSseEvent(event, "");
  assert.equal(sawNonEmptyData, true);
  assert.equal(raw, '{"narrative":"line1\nline2"}');
});
