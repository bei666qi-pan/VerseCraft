import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMalformedDmSafeFallback,
  buildValidatedPartialNarrativeCandidate,
} from "./malformedDmSafeFallback";

test("validated partial narrative candidate accepts prose but no malformed structure", () => {
  const out = buildValidatedPartialNarrativeCandidate({
    requestId: "req-partial",
    narrative: "我贴着墙根停下脚步，听见楼梯间传来一阵由远及近的回声。",
  });
  assert.ok(out);
  assert.equal(out.narrative, "我贴着墙根停下脚步，听见楼梯间传来一阵由远及近的回声。");
  assert.equal(out.is_action_legal, true);
  assert.equal(out.sanity_damage, 0);
  assert.equal(out.is_death, false);
  assert.equal(out.consumes_time, false);
  assert.deepEqual(out.options, []);
  assert.deepEqual(out.relationship_updates, []);
  assert.deepEqual(out.awarded_items, []);
  assert.deepEqual(out._commit_flags, ["malformed_dm_validated_partial_narrative_v1"]);
  assert.equal(
    (out.internal_meta as Record<string, unknown>).structured_fields_accepted,
    false,
  );
});

test("validated partial narrative candidate rejects fragments and protocol markers", () => {
  assert.equal(
    buildValidatedPartialNarrativeCandidate({ requestId: "req-short", narrative: "门响了。" }),
    null,
  );
  assert.equal(
    buildValidatedPartialNarrativeCandidate({
      requestId: "req-marker",
      narrative: "我停在原地观察。__VERSECRAFT_FINAL__:{\"is_death\":true}",
    }),
    null,
  );
  assert.equal(
    buildValidatedPartialNarrativeCandidate({
      requestId: "req-typed-marker",
      narrative: '门后传来轻响。","is_death" string="false">false',
    }),
    null,
  );
});

test("malformed DM safe fallback is protocol-complete and commits no state", () => {
  const out = buildMalformedDmSafeFallback({ requestId: "req-1", language: "zh-CN" });
  assert.equal(out.is_action_legal, false);
  assert.equal(out.sanity_damage, 0);
  assert.equal(out.is_death, false);
  assert.equal(out.consumes_time, false);
  assert.deepEqual(out.options, []);
  assert.deepEqual(out.npc_location_updates, []);
  assert.deepEqual(out.awarded_items, []);
  assert.match(String(out.narrative), /没有提交任何未经确认的状态变化/);
  assert.deepEqual(out._commit_flags, ["malformed_dm_safe_fallback_v1"]);
});

test("malformed DM safe fallback honors the English session language", () => {
  const out = buildMalformedDmSafeFallback({ requestId: "req-2", language: "en-US" });
  assert.match(String(out.narrative), /commits no unconfirmed state change/);
});

test("malformed DM safe fallback records a bounded structured repair reason", () => {
  const out = buildMalformedDmSafeFallback({
    requestId: "req-3",
    language: "zh-CN",
    repairFailureReason: "repair_normalization_rejected",
  });
  assert.equal((out.internal_meta as Record<string, unknown>).reason, "repair_normalization_rejected");
  assert.equal(
    (out.security_meta as Record<string, unknown>).reason,
    "malformed_dm_repair_normalization_rejected",
  );
});
