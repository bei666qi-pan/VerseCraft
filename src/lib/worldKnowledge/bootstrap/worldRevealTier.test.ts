import assert from "node:assert/strict";
import test from "node:test";
import { APARTMENT_TRUTH } from "@/lib/registry/apartmentTruth";
import { buildCoreCanonFactsFromRegistry } from "./coreCanonMapping";
import { buildRegistryWorldKnowledgeDraft } from "./registryAdapters";

const DEEP_TERMS = ["龙胃", "七锚", "主锚", "纠错窗口", "空间权柄", "回声体"];

function assertNoDeepTerms(text: string, label: string) {
  for (const term of DEEP_TERMS) {
    assert.equal(text.includes(term), false, `${label} leaked ${term}`);
  }
}

test("surface apartment truth fact does not expose root truth", () => {
  const facts = buildCoreCanonFactsFromRegistry();
  const surface = facts.find((f) => f.identity.factKey === "core:apartment_truth");
  assert.ok(surface);
  assert.ok(surface!.tags?.includes("reveal_surface"));
  assert.notEqual(surface!.canonicalText.trim(), APARTMENT_TRUTH.trim());
  assertNoDeepTerms(surface!.canonicalText, "core:apartment_truth");

  const deep = facts.find((f) => f.identity.factKey === "core:apartment_truth:deep");
  assert.ok(deep);
  assert.ok(deep!.tags?.includes("reveal_deep"));
  assert.ok(deep!.canonicalText.includes("龙胃"));
});

test("bootstrap surface truth chunks stay surface-safe", () => {
  const draft = buildRegistryWorldKnowledgeDraft();
  const surface = draft.entities.find((entity) => entity.code === "truth:apartment");
  assert.ok(surface);
  assert.ok(surface!.tags.includes("reveal_surface"));
  assertNoDeepTerms(surface!.detail, "truth:apartment detail");

  const chunks = draft.chunks.filter((chunk) => chunk.entityCode === "truth:apartment");
  assert.ok(chunks.length >= 1);
  for (const chunk of chunks) assertNoDeepTerms(chunk.content, chunk.retrievalKey);

  const deep = draft.entities.find((entity) => entity.code === "truth:apartment_deep");
  assert.ok(deep);
  assert.ok(deep!.tags.includes("reveal_deep"));
});
