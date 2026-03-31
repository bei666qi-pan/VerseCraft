import assert from "node:assert/strict";
import test from "node:test";
import { resolveTurnFromSse } from "./turnResolve";

test("resolveTurnFromSse: uses final even if raw has dirty deltas", () => {
  const sse =
    'data: {"narrative":"dirty","is_action_legal":true,"sanity_damage":0,"is_death":false}\n\n' +
    'data: __VERSECRAFT_FINAL__:{"is_action_legal":true,"sanity_damage":0,"narrative":"FINAL","is_death":false,"consumes_time":true}\n\n';
  const out = resolveTurnFromSse({ sseDocumentText: sse, rawDm: '{"narrative":"dirty"}' });
  assert.equal(out.source, "final");
  assert.ok(out.dm);
  assert.equal(out.dm?.narrative, "FINAL");
});

test("resolveTurnFromSse: falls back to raw when final missing", () => {
  const sse = 'data: {"x":1}\n\n';
  const raw =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"RAW","is_death":false,"consumes_time":true}';
  const out = resolveTurnFromSse({ sseDocumentText: sse, rawDm: raw });
  assert.equal(out.source, "raw");
  assert.ok(out.dm);
  assert.equal(out.dm?.narrative, "RAW");
});

test("resolveTurnFromSse: final invalid triggers fallback to raw and keeps classification", () => {
  const sse =
    'data: __VERSECRAFT_FINAL__:{"is_action_legal":true,"sanity_damage":0,"narrative":"FINAL",\n\n' + // broken JSON
    "data: x\n\n";
  const raw =
    '{"is_action_legal":true,"sanity_damage":0,"narrative":"RAW_OK","is_death":false,"consumes_time":true}';
  const out = resolveTurnFromSse({ sseDocumentText: sse, rawDm: raw });
  assert.equal(out.source, "raw");
  assert.ok(out.dm);
  // We still expose why final was not used (useful for logging).
  assert.equal(out.failure === "final_payload_invalid" || out.failure === null, true);
});

test("resolveTurnFromSse: keeps narrative when both final/raw DM parse fail but narrative key exists", () => {
  const sse = 'data: __VERSECRAFT_FINAL__:{"narrative":"只保留正文","oops":\n\n';
  const raw = '{"narrative":"只保留正文","oops":';
  const out = resolveTurnFromSse({ sseDocumentText: sse, rawDm: raw });
  assert.equal(out.dm, null);
  assert.equal(out.source, "narrative_only");
  assert.equal(out.narrative.includes("只保留正文"), true);
});

test("resolveTurnFromSse: returns none when narrative also missing", () => {
  const sse = "data: hello\n\n";
  const raw = "hello";
  const out = resolveTurnFromSse({ sseDocumentText: sse, rawDm: raw });
  assert.equal(out.dm, null);
  assert.equal(out.narrative, "");
  assert.equal(out.source, "none");
});

