import test from "node:test";
import assert from "node:assert/strict";
import {
  inferRequiredFields,
  checkFieldPresence,
  backfillMissingFields,
} from "./enforceRequiredFields";
import type { NormalizedPlayerIntent } from "./types";

function intent(overrides: Partial<NormalizedPlayerIntent> = {}): NormalizedPlayerIntent {
  return {
    kind: "explore",
    slots: {},
    riskTags: [],
    isSystemTransition: false,
    isFirstAction: false,
    ...overrides,
  };
}

// ── inferRequiredFields ──────────────────────────────────────────

test("inferRequiredFields: combat must have sanity_damage and consumes_time", () => {
  const spec = inferRequiredFields(intent({ kind: "combat" }));
  assert.ok(spec.mustHave.includes("sanity_damage"));
  assert.ok(spec.mustHave.includes("consumes_time"));
  assert.ok(spec.shouldHave.includes("is_death"));
  assert.ok(spec.shouldHave.includes("weapon_updates"));
});

test("inferRequiredFields: explore with locationHint must have consumes_time, should have player_location", () => {
  const spec = inferRequiredFields(
    intent({ kind: "explore", slots: { locationHint: "B1_PowerRoom" } })
  );
  assert.ok(spec.mustHave.includes("consumes_time"));
  assert.ok(spec.shouldHave.includes("player_location"));
  assert.ok(spec.mustNotHave.includes("is_death"));
});

test("inferRequiredFields: dialogue with target NPC should have relationship_updates", () => {
  const spec = inferRequiredFields(
    intent({ kind: "dialogue", slots: { target: "N-001" } })
  );
  assert.ok(spec.shouldHave.includes("relationship_updates"));
  assert.ok(spec.shouldHave.includes("codex_updates"));
});

test("inferRequiredFields: use_item with itemHint should have consumed_items", () => {
  const spec = inferRequiredFields(
    intent({ kind: "use_item", slots: { itemHint: "bandage" } })
  );
  assert.ok(spec.shouldHave.includes("consumed_items"));
  assert.ok(spec.mustNotHave.includes("is_death"));
});

test("inferRequiredFields: system_transition must NOT have state-changing fields", () => {
  const spec = inferRequiredFields(intent({ kind: "system_transition" }));
  assert.ok(spec.mustNotHave.includes("sanity_damage"));
  assert.ok(spec.mustNotHave.includes("is_death"));
  assert.ok(spec.mustNotHave.includes("relationship_updates"));
  assert.ok(spec.mustNotHave.includes("new_tasks"));
});

test("inferRequiredFields: meta must NOT have combat/inventory fields", () => {
  const spec = inferRequiredFields(intent({ kind: "meta" }));
  assert.ok(spec.mustNotHave.includes("sanity_damage"));
  assert.ok(spec.mustNotHave.includes("weapon_updates"));
  assert.ok(spec.mustNotHave.includes("consumed_items"));
  assert.ok(spec.mustNotHave.includes("awarded_items"));
});

test("inferRequiredFields: investigate should have codex_updates and awarded_items", () => {
  const spec = inferRequiredFields(intent({ kind: "investigate" }));
  assert.ok(spec.shouldHave.includes("codex_updates"));
  assert.ok(spec.shouldHave.includes("awarded_items"));
});

// ── checkFieldPresence ───────────────────────────────────────────

test("checkFieldPresence: passes when all required fields are present", () => {
  const report = checkFieldPresence(
    { consumes_time: true, sanity_damage: 3 },
    { mustHave: ["consumes_time", "sanity_damage"], shouldHave: [], mustNotHave: [] }
  );
  assert.equal(report.hardGatePassed, true);
  assert.deepEqual(report.missingRequired, []);
});

test("checkFieldPresence: fails when required field is missing", () => {
  const report = checkFieldPresence(
    { consumes_time: true },
    { mustHave: ["consumes_time", "sanity_damage"], shouldHave: [], mustNotHave: [] }
  );
  assert.equal(report.hardGatePassed, false);
  assert.ok(report.missingRequired.includes("sanity_damage"));
});

test("checkFieldPresence: detects forbidden fields", () => {
  const report = checkFieldPresence(
    { is_death: true, sanity_damage: 5 },
    { mustHave: [], shouldHave: [], mustNotHave: ["is_death"] }
  );
  assert.ok(report.forbiddenPresent.includes("is_death"));
});

test("checkFieldPresence: does not flag zero-value forbidden fields", () => {
  const report = checkFieldPresence(
    { sanity_damage: 0, is_death: false },
    { mustHave: [], shouldHave: [], mustNotHave: ["sanity_damage", "is_death"] }
  );
  assert.deepEqual(report.forbiddenPresent, []);
});

test("checkFieldPresence: flags missing recommended fields", () => {
  const report = checkFieldPresence(
    { consumes_time: true },
    {
      mustHave: ["consumes_time"],
      shouldHave: ["player_location", "codex_updates"],
      mustNotHave: [],
    }
  );
  assert.ok(report.missingRecommended.includes("player_location"));
  assert.ok(report.missingRecommended.includes("codex_updates"));
});

// ── backfillMissingFields ────────────────────────────────────────

test("backfillMissingFields: backfills player_location from slots.locationHint", () => {
  const result = backfillMissingFields({
    missingFields: ["player_location"],
    intent: intent({
      kind: "explore",
      slots: { locationHint: "B1_PowerRoom" },
    }),
    narrative: "",
    playerAction: "走向配电间",
  });
  assert.equal(result.backfilled.player_location, "B1_PowerRoom");
  assert.equal(result.didBackfill, true);
});

test("backfillMissingFields: backfills player_location from narrative movement verb", () => {
  const result = backfillMissingFields({
    missingFields: ["player_location"],
    intent: intent({ kind: "explore" }),
    narrative: "我推开厚重的铁门，走进B1_PowerRoom，一股机油味扑面而来。",
    playerAction: "推开门进去",
  });
  assert.equal(result.backfilled.player_location, "B1_PowerRoom");
});

test("backfillMissingFields: backfills consumes_time to true", () => {
  const result = backfillMissingFields({
    missingFields: ["consumes_time"],
    intent: intent({ kind: "explore" }),
    narrative: "走廊灯管闪了一下。",
    playerAction: "查看四周",
  });
  assert.equal(result.backfilled.consumes_time, true);
});

test("backfillMissingFields: backfills sanity_damage for combat intent", () => {
  const result = backfillMissingFields({
    missingFields: ["sanity_damage"],
    intent: intent({ kind: "combat" }),
    narrative: "",
    playerAction: "攻击",
  });
  assert.equal(result.backfilled.sanity_damage, 1);
});

test("backfillMissingFields: backfills codex_updates from NPC mentions in narrative", () => {
  const result = backfillMissingFields({
    missingFields: ["codex_updates"],
    intent: intent({ kind: "dialogue", slots: { target: "N-008" } }),
    narrative: "老刘放下扳手，抬起头看了看我。电工老刘的眼神里有一丝犹豫。",
    playerAction: "问老刘关于地下室的事",
  });
  assert.equal(result.didBackfill, true);
  const updates = result.backfilled.codex_updates as Array<{ name: string }>;
  assert.ok(updates.some((u) => u.name === "老刘"));
});

test("backfillMissingFields: backfills relationship_updates from slots.target", () => {
  const result = backfillMissingFields({
    missingFields: ["relationship_updates"],
    intent: intent({
      kind: "dialogue",
      slots: { target: "N-001" },
    }),
    narrative: "",
    playerAction: "和林栀说话",
  });
  assert.equal(result.didBackfill, true);
  const updates = result.backfilled.relationship_updates as Array<{ npcId: string }>;
  assert.equal(updates[0].npcId, "N-001");
});

test("backfillMissingFields: marks field as failed when no strategy works", () => {
  const result = backfillMissingFields({
    missingFields: ["codex_updates"],
    intent: intent({ kind: "explore" }),
    narrative: "走廊深处什么都没有。",
    playerAction: "环顾四周",
  });
  assert.ok(result.failed.includes("codex_updates"));
  assert.equal(result.didBackfill, false);
});
