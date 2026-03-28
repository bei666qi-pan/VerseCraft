import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeCluesWithDedupe,
  normalizeClueDraft,
  normalizeClueUpdateArray,
  stableClueIdFromContent,
} from "@/lib/domain/clueMerge";

test("normalizeClueDraft: rejects empty", () => {
  assert.equal(normalizeClueDraft({}, "t0"), null);
  assert.equal(normalizeClueDraft({ title: "" }, "t0"), null);
});

test("normalizeClueDraft: fills defaults and clamps", () => {
  const c = normalizeClueDraft({ title: " 电梯传闻 ", detail: " 多停一层 " }, "2026-01-01T00:00:00.000Z");
  assert.ok(c);
  assert.equal(c!.title, "电梯传闻");
  assert.equal(c!.kind, "unverified");
  assert.equal(c!.status, "unknown");
  assert.equal(c!.source, "dm");
});

test("stableClueIdFromContent is deterministic", () => {
  assert.equal(stableClueIdFromContent("a", "b"), stableClueIdFromContent("a", "b"));
});

test("mergeCluesWithDedupe: merges by id and unions relatedItemIds", () => {
  const a = normalizeClueDraft(
    { id: "c1", title: "t", detail: "d", relatedItemIds: ["I-1"] },
    "2026-01-01T00:00:00.000Z"
  )!;
  const b = normalizeClueDraft(
    { id: "c1", title: "t2", detail: "d2", relatedItemIds: ["I-2"], status: "pending_verify" },
    "2026-01-02T00:00:00.000Z"
  )!;
  const out = mergeCluesWithDedupe([a], [b], 50);
  assert.equal(out.length, 1);
  assert.ok(out[0]!.relatedItemIds.includes("I-1"));
  assert.ok(out[0]!.relatedItemIds.includes("I-2"));
  assert.equal(out[0]!.status, "pending_verify");
});

test("normalizeClueUpdateArray: filters invalid rows", () => {
  const rows = normalizeClueUpdateArray([{ title: "ok", detail: "x" }, null, 1], "t0");
  assert.equal(rows.length, 1);
});
