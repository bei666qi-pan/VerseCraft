import test from "node:test";
import assert from "node:assert/strict";
import { renderNarrativeFromDelta } from "@/lib/turnEngine/renderNarrative";
import type { StateDelta } from "@/lib/turnEngine/types";
import type { EpistemicFilterResult } from "@/lib/turnEngine/epistemic/types";

function makeDelta(overrides: Partial<StateDelta> = {}): StateDelta {
  return {
    isActionLegal: true,
    isDeath: false,
    sanityDamage: 0,
    consumesTime: true,
    playerLocation: null,
    originiumDelta: null,
    timeCost: null,
    mustDegrade: false,
    awardedItems: [],
    consumedItems: [],
    taskUpdates: [],
    codexUpdates: [],
    clueUpdates: [],
    relationshipUpdates: [],
    npcLocationUpdates: [],
    bgmTrack: null,
    threatDelta: 0,
    threatNote: null,
    narrativeDirective: null,
    ...overrides,
  };
}

function makeEpistemicFilter(): EpistemicFilterResult {
  return {
    facts: { dmOnly: [], scenePublic: [], playerOnly: [], actorScoped: [], residue: [] },
    telemetry: {
      actorId: "player",
      actorIsXinlanException: false,
      revealGatedCount: 2,
      bucketCounts: { dmOnly: 3, scenePublic: 5, playerOnly: 2, actorScoped: 4, residue: 1 },
      totalInputFacts: 15,
    },
    debug: {},
  } as unknown as EpistemicFilterResult;
}

// ── Basic pass-through ──

test("renderNarrativeFromDelta passes through existing dmRecord fields unchanged", () => {
  const dm = { narrative: "hello", is_action_legal: true, sanity_damage: 0, is_death: false, consumes_time: true };
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta: makeDelta() });
  assert.equal(result.dmRecord.narrative, "hello");
  assert.equal(result.dmRecord.is_action_legal, true);
  assert.equal(result.notes.length, 0);
});

// ── Delta fills holes ──

test("renderNarrativeFromDelta fills missing is_action_legal from delta", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ isActionLegal: false });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.is_action_legal, false);
  assert.ok(result.notes.includes("filled_is_action_legal_from_delta"));
});

test("renderNarrativeFromDelta does NOT overwrite existing is_action_legal", () => {
  const dm = { narrative: "x", is_action_legal: true };
  const delta = makeDelta({ isActionLegal: false });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.is_action_legal, true);
  assert.ok(!result.notes.includes("filled_is_action_legal_from_delta"));
});

test("renderNarrativeFromDelta fills missing consumes_time", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ consumesTime: false });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.consumes_time, false);
  assert.ok(result.notes.includes("filled_consumes_time_from_delta"));
});

test("renderNarrativeFromDelta fills missing sanity_damage", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ sanityDamage: 3 });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.sanity_damage, 3);
  assert.ok(result.notes.includes("filled_sanity_damage_from_delta"));
});

test("renderNarrativeFromDelta fills missing is_death", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ isDeath: true });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.is_death, true);
  assert.ok(result.notes.includes("filled_is_death_from_delta"));
});

test("renderNarrativeFromDelta fills missing player_location", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ playerLocation: "2F_Corridor" });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.player_location, "2F_Corridor");
  assert.ok(result.notes.includes("filled_player_location_from_delta"));
});

test("renderNarrativeFromDelta fills missing currency_change", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ originiumDelta: -2 });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.currency_change, -2);
  assert.ok(result.notes.includes("filled_currency_change_from_delta"));
});

test("renderNarrativeFromDelta fills missing time_cost", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({ timeCost: "5 minutes" });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.time_cost, "5 minutes");
  assert.ok(result.notes.includes("filled_time_cost_from_delta"));
});

// ── Must-degrade path ──

test("renderNarrativeFromDelta mustDegrade fills safety frame", () => {
  const dm = { narrative: "blocked content" };
  const delta = makeDelta({ mustDegrade: true });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  assert.equal(result.dmRecord.is_action_legal, false);
  assert.equal(result.dmRecord.consumes_time, false);
  assert.ok(result.notes.includes("filled_is_action_legal_false_from_delta"));
  assert.ok(result.notes.includes("filled_consumes_time_false_from_delta"));
});

test("renderNarrativeFromDelta mustDegrade preserves existing booleans", () => {
  const dm = { narrative: "x", is_action_legal: true, consumes_time: true };
  const delta = makeDelta({ mustDegrade: true });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  // Existing values preserved
  assert.equal(result.dmRecord.is_action_legal, true);
  assert.equal(result.dmRecord.consumes_time, true);
});

// ── Epistemic filter meta (side channel) ──

test("renderNarrativeFromDelta captures epistemic filter meta without mutating dmRecord", () => {
  const dm = { narrative: "test" };
  const delta = makeDelta();
  const filter = makeEpistemicFilter();
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta, epistemicFilter: filter });

  // Side channel populated
  assert.ok(result.epistemicFilterMeta !== null);
  assert.equal(result.epistemicFilterMeta!.actor_id, "player");
  assert.equal(result.epistemicFilterMeta!.reveal_gated_count, 2);
  assert.equal(result.epistemicFilterMeta!.bucket_counts.dmOnly, 3);
  assert.equal(result.epistemicFilterMeta!.total_input_facts, 15);
  assert.ok(result.notes.includes("captured_epistemic_filter_meta"));

  // dmRecord NOT mutated with meta
  assert.equal((result.dmRecord as Record<string, unknown>).__epistemic_filter_meta, undefined);
});

test("renderNarrativeFromDelta epistemicFilter null yields null meta", () => {
  const result = renderNarrativeFromDelta({ dmRecord: { narrative: "x" }, delta: makeDelta(), epistemicFilter: null });
  assert.equal(result.epistemicFilterMeta, null);
});

test("renderNarrativeFromDelta epistemicFilter undefined yields null meta", () => {
  const result = renderNarrativeFromDelta({ dmRecord: { narrative: "x" }, delta: makeDelta() });
  assert.equal(result.epistemicFilterMeta, null);
});

// ── Non-destructive: never overwrites model-provided fields ──

test("renderNarrativeFromDelta preserves all model-provided fields", () => {
  const dm = {
    narrative: "full story",
    is_action_legal: true,
    sanity_damage: 2,
    is_death: false,
    consumes_time: true,
    player_location: "1F_Lobby",
    currency_change: 5,
    options: [{ text: "继续" }],
  };
  const delta = makeDelta({
    isActionLegal: false,
    sanityDamage: 99,
    isDeath: true,
    consumesTime: false,
    playerLocation: "99F",
    originiumDelta: -99,
  });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  // All original values preserved
  assert.equal(result.dmRecord.narrative, "full story");
  assert.equal(result.dmRecord.is_action_legal, true);
  assert.equal(result.dmRecord.sanity_damage, 2);
  assert.equal(result.dmRecord.is_death, false);
  assert.equal(result.dmRecord.consumes_time, true);
  assert.equal(result.dmRecord.player_location, "1F_Lobby");
  assert.equal(result.dmRecord.currency_change, 5);
  assert.deepStrictEqual(result.dmRecord.options, [{ text: "继续" }]);
  // No fill notes
  assert.equal(result.notes.length, 0);
});

// ── Edge cases ──

test("renderNarrativeFromDelta handles empty dmRecord", () => {
  const delta = makeDelta({ isActionLegal: true, consumesTime: true, sanityDamage: 0 });
  const result = renderNarrativeFromDelta({ dmRecord: {}, delta });
  assert.equal(result.dmRecord.is_action_legal, true);
  assert.equal(result.dmRecord.consumes_time, true);
  assert.equal(result.dmRecord.sanity_damage, 0);
  assert.ok(result.notes.length >= 3);
});

test("renderNarrativeFromDelta handles null delta fields as no-op", () => {
  const dm = { narrative: "x" };
  const delta = makeDelta({
    isActionLegal: null as unknown as boolean,
    sanityDamage: null as unknown as number,
    playerLocation: null,
    originiumDelta: null,
  });
  const result = renderNarrativeFromDelta({ dmRecord: dm, delta });
  // No fills when delta values are null; null-filled fields get null value
  assert.equal(result.dmRecord.is_action_legal, undefined);
  assert.equal(result.dmRecord.sanity_damage, null);
  assert.equal(result.notes.length, 3); // consumes_time, sanity_damage, is_death
});

// ── Structural contract: notes is always an array ──

test("renderNarrativeFromDelta always returns notes array", () => {
  const result = renderNarrativeFromDelta({ dmRecord: {}, delta: makeDelta() });
  assert.ok(Array.isArray(result.notes));
});

test("renderNarrativeFromDelta dmRecord is always an object", () => {
  const result = renderNarrativeFromDelta({ dmRecord: {}, delta: makeDelta() });
  assert.equal(typeof result.dmRecord, "object");
});
