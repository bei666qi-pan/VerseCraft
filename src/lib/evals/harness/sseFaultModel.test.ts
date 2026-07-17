import assert from "node:assert/strict";
import test from "node:test";
import { encodeSseEventPayload } from "@/lib/turnEngine/sse";
import { decodeVerseCraftSseChunks } from "./sseFaultModel";

const enc = new TextEncoder();
const final = { narrative: "灯灭了。\n门仍锁着。", is_action_legal: true, sanity_damage: 0, is_death: false };
const stream = [
  encodeSseEventPayload('__VERSECRAFT_STATUS__:{"aiStatus":"ok"}'),
  encodeSseEventPayload("可见正文"),
  encodeSseEventPayload(`__VERSECRAFT_FINAL__:${JSON.stringify(final)}`),
].join("");

test("fault model survives every byte boundary and CRLF proxy normalization", () => {
  const crlf = stream.replace(/\n/g, "\r\n");
  for (let size = 1; size <= 31; size += 1) {
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < crlf.length; i += size) chunks.push(enc.encode(crlf.slice(i, i + size)));
    const result = decodeVerseCraftSseChunks(chunks);
    assert.deepEqual(result.finalJson, final);
    assert.equal(result.visibleText, "可见正文");
  }
});

test("truncated or malformed final never becomes authoritative", () => {
  const truncated = enc.encode(encodeSseEventPayload(`__VERSECRAFT_FINAL__:${JSON.stringify(final)}`).slice(0, -8));
  assert.equal(decodeVerseCraftSseChunks([truncated]).finalJson, null);
  const malformed = decodeVerseCraftSseChunks([enc.encode(encodeSseEventPayload("__VERSECRAFT_FINAL__:{bad"))]);
  assert.equal(malformed.finalJson, null);
  assert.equal(malformed.malformedFinalCount, 1);
});

test("unknown controls are ignored and the latest valid final wins deterministically", () => {
  const newer = { ...final, narrative: "权威终帧" };
  const payload = encodeSseEventPayload("__VERSECRAFT_FUTURE__:{}")
    + encodeSseEventPayload(`__VERSECRAFT_FINAL__:${JSON.stringify(final)}`)
    + encodeSseEventPayload(`__VERSECRAFT_FINAL__:${JSON.stringify(newer)}`);
  const result = decodeVerseCraftSseChunks([enc.encode(payload)]);
  assert.deepEqual(result.finalJson, newer);
  assert.equal(result.finalFrameCount, 2);
  assert.equal(result.visibleText, "");
});

test("multiline SSE data is reconstructed according to the SSE specification", () => {
  const result = decodeVerseCraftSseChunks([enc.encode("data: 第一行\ndata: 第二行\n\n")]);
  assert.equal(result.visibleText, "第一行\n第二行");
});
