import { describe, it, expect } from "vitest";
import { rerankCandidates } from "./rerank";
import type { RerankContext } from "./rerank";
import type { RetrievalCandidate } from "../types";

function makeCandidate(
  factKey: string,
  canonicalText: string,
  overrides: Partial<RetrievalCandidate["fact"]> & { score?: number } = {},
): RetrievalCandidate {
  const { score = 100, ...factOverrides } = overrides;
  return {
    fact: {
      identity: { factKey },
      layer: "shared_public_lore",
      factType: "event",
      canonicalText,
      source: { kind: "registry" },
      ...factOverrides,
    },
    score,
  };
}

function emptyContext(): RerankContext {
  return {
    playerLocation: null,
    recentlyEncounteredEntities: [],
    actorNpcId: null,
    presentNpcIds: [],
    locationId: null,
    activeTaskIds: [],
    threatLevel: null,
    scenePressure: null,
    playerKnownFactIds: [],
  };
}

describe("rerankCandidates", () => {
  it("(1) playerLocation boost: +50 when fact key or text contains playerLocation", () => {
    const candidates = [
      makeCandidate("blackwood_forest_trail", "The trail winds through the forest."),
      makeCandidate("unrelated_fact", "Something else entirely."),
    ];
    const ctx: RerankContext = { ...emptyContext(), playerLocation: "blackwood" };

    const result = rerankCandidates(candidates, ctx);

    // blackwood fact should get +50
    const boosted = result.find((c) => c.fact.identity.factKey === "blackwood_forest_trail");
    const other = result.find((c) => c.fact.identity.factKey === "unrelated_fact");
    expect(boosted).toBeTruthy();
    expect(other).toBeTruthy();
    expect(boosted.score).toBe(150); // 100 + 50
    expect(other.score).toBe(100);
  });

  it("(1b) playerLocation boost via canonicalText match", () => {
    const candidates = [
      makeCandidate("fact_1", "You are standing in Blackwood Village square."),
    ];
    const ctx: RerankContext = { ...emptyContext(), playerLocation: "blackwood" };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(150);
  });

  it("(1c) playerLocation is null → no boost applied", () => {
    const candidates = [
      makeCandidate("blackwood_fact", "Something about blackwood."),
    ];
    const ctx: RerankContext = { ...emptyContext(), playerLocation: null };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(100);
  });

  it("(2) recentlyEncounteredEntities boost: +30 per matching entity", () => {
    const candidates = [
      makeCandidate("elder_orin_greeting", "Elder Orin nods solemnly."),
      makeCandidate("unrelated", "Nothing to do with Orin."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      recentlyEncounteredEntities: ["elder_orin"],
    };

    const result = rerankCandidates(candidates, ctx);

    const boosted = result.find((c) => c.fact.identity.factKey === "elder_orin_greeting");
    const other = result.find((c) => c.fact.identity.factKey === "unrelated");
    expect(boosted).toBeTruthy();
    expect(other).toBeTruthy();
    expect(boosted.score).toBe(130); // 100 + 30
    expect(other.score).toBe(100);
  });

  it("(2b) recentlyEncounteredEntities match via canonicalText", () => {
    const candidates = [
      makeCandidate("fact_x", "You recall elder_orin speaking of the rift."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      recentlyEncounteredEntities: ["elder_orin"],
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(130);
  });

  it("(2c) multiple encountered entities each give +30", () => {
    const candidate = makeCandidate("npc_1_npc_2_meeting", "npc_1 and npc_2 met.");
    const ctx: RerankContext = {
      ...emptyContext(),
      recentlyEncounteredEntities: ["npc_1", "npc_2"],
    };

    const result = rerankCandidates([candidate], ctx);
    expect(result[0].score).toBe(160); // 100 + 30 + 30
  });

  it("(3) presentNpcIds boost: +12 per matching NPC id", () => {
    const candidates = [
      makeCandidate("guard_captain", "The guard captain stands watch."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      presentNpcIds: ["guard_captain"],
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(112); // 100 + 12
  });

  it("(3b) presentNpcIds match via canonicalText", () => {
    const candidates = [
      makeCandidate("some_fact", "merchant_kai is nearby."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      presentNpcIds: ["merchant_kai"],
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(112);
  });

  it("(3c) multiple presentNpcIds each give +12", () => {
    const candidate = makeCandidate("town_square_scene", "guard_1 and guard_2 patrol the square.");
    const ctx: RerankContext = {
      ...emptyContext(),
      presentNpcIds: ["guard_1", "guard_2"],
    };

    const result = rerankCandidates([candidate], ctx);
    expect(result[0].score).toBe(124); // 100 + 12 + 12
  });

  it("(4) activeTaskIds boost: +8 per matching task id", () => {
    const candidates = [
      makeCandidate("task_find_herb", "Find the rare moon herb."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      activeTaskIds: ["find_herb"],
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(108); // 100 + 8
  });

  it("(4b) activeTaskIds match via canonicalText", () => {
    const candidates = [
      makeCandidate("misc_fact", "The journal mentions the deliver_package task."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      activeTaskIds: ["deliver_package"],
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(108);
  });

  it("(5) isHot boost: +10", () => {
    const candidates = [
      makeCandidate("hot_fact", "This is urgent!", { isHot: true }),
      makeCandidate("cold_fact", "This is not urgent.", { isHot: false }),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);

    const hot = result.find((c) => c.fact.identity.factKey === "hot_fact");
    const cold = result.find((c) => c.fact.identity.factKey === "cold_fact");
    expect(hot).toBeTruthy();
    expect(cold).toBeTruthy();
    expect(hot.score).toBe(110); // 100 + 10
    expect(cold.score).toBe(100);
  });

  it("(5b) isHot undefined → no boost", () => {
    const candidate = makeCandidate("maybe_hot", "...");
    // isHot defaults to undefined in makeCandidate (not in overrides)
    const ctx = emptyContext();

    const result = rerankCandidates([candidate], ctx);
    expect(result[0].score).toBe(100);
  });

  it("(6) user_private_lore layer boost: +25", () => {
    const candidates = [
      makeCandidate("private_memory", "I remember the secret.", { layer: "user_private_lore" }),
      makeCandidate("public_fact", "Everyone knows this.", { layer: "shared_public_lore" }),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);

    const priv = result.find((c) => c.fact.identity.factKey === "private_memory");
    const pub = result.find((c) => c.fact.identity.factKey === "public_fact");
    expect(priv).toBeTruthy();
    expect(pub).toBeTruthy();
    expect(priv.score).toBe(125); // 100 + 25
    expect(pub.score).toBe(100);
  });

  it("(7) rule factType boost: +18", () => {
    const candidates = [
      makeCandidate("combat_rule", "Combat follows these rules.", { factType: "rule" }),
      makeCandidate("normal_event", "Something happened.", { factType: "event" }),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);

    const rule = result.find((c) => c.fact.identity.factKey === "combat_rule");
    const event = result.find((c) => c.fact.identity.factKey === "normal_event");
    expect(rule).toBeTruthy();
    expect(event).toBeTruthy();
    expect(rule.score).toBe(118); // 100 + 18
    expect(event.score).toBe(100);
  });

  it("(7b) world_mechanism factType boost: +18", () => {
    const candidates = [
      makeCandidate("magic_system", "Magic works this way.", { factType: "world_mechanism" }),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(118); // 100 + 18
  });

  it("(8) empty context: no crash, scores unchanged", () => {
    const candidates = [
      makeCandidate("a", "first"),
      makeCandidate("b", "second"),
      makeCandidate("c", "third"),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);
    expect(result.length).toBe(3);
    const scores = result.map((c) => c.score);
    expect(scores).toEqual([100, 100, 100]);
  });

  it("(8b) undefined optional arrays in context don't crash", () => {
    const candidates = [makeCandidate("a", "first")];
    const ctx: RerankContext = {
      playerLocation: null,
      recentlyEncounteredEntities: [],
      // presentNpcIds, activeTaskIds, locationId, etc. all absent
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result.length).toBe(1);
    expect(result[0].score).toBe(100);
  });

  it("(9) score ordering: higher score candidates come first", () => {
    const candidates = [
      makeCandidate("low", "low score", { score: 10 }),
      makeCandidate("mid", "mid score", { score: 50 }),
      makeCandidate("high", "high score", { score: 90 }),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);
    const ordered = result.map((c) => c.fact.identity.factKey);
    expect(ordered).toEqual(["high", "mid", "low"]);
  });

  it("(9b) ties preserve stable ordering (original relative order)", () => {
    const candidates = [
      makeCandidate("a_first", "alpha", { score: 100 }),
      makeCandidate("b_second", "beta", { score: 100 }),
      makeCandidate("c_third", "gamma", { score: 100 }),
    ];
    const ctx = emptyContext();

    const result = rerankCandidates(candidates, ctx);
    const ordered = result.map((c) => c.fact.identity.factKey);
    // Array.sort is stable in V8/Node, so equal scores preserve insertion order
    expect(ordered).toEqual(["a_first", "b_second", "c_third"]);
  });

  it("(10) multiple boosts stack additively", () => {
    const candidate = makeCandidate(
      "blackwood_elder_orin_lore",
      "The elder_orin in blackwood told me a secret.",
      {
        layer: "user_private_lore",
        factType: "rule",
        isHot: true,
      },
    );
    const ctx: RerankContext = {
      playerLocation: "blackwood", // +50
      recentlyEncounteredEntities: ["elder_orin"], // +30
      actorNpcId: null,
      presentNpcIds: ["elder_orin"], // +12
      locationId: null,
      activeTaskIds: [],
    };

    const result = rerankCandidates([candidate], ctx);
    // 100 (base)
    // +50 (playerLocation match on "blackwood" in key)
    // +30 (recentlyEncountered "elder_orin" in key)
    // +12 (presentNpcIds "elder_orin" in key)
    // +25 (user_private_lore)
    // +18 (rule factType)
    // +10 (isHot)
    // Total: 245
    expect(result[0].score).toBe(245);
  });

  it("(bonus) actorNpcId boost: +22", () => {
    const candidates = [
      makeCandidate("player_character_info", "The player is a skilled mage."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      actorNpcId: "player_character",
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(122); // 100 + 22
  });

  it("(bonus) locationId boost: +18", () => {
    const candidates = [
      makeCandidate("tavern_interior", "The tavern is warm and lively."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      locationId: "tavern",
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(118); // 100 + 18
  });

  it("(bonus) playerKnownFactIds boost: +14", () => {
    const candidates = [
      makeCandidate("known_fact_42", "The player already knows this."),
      makeCandidate("unknown_fact", "This is new to the player."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      playerKnownFactIds: ["known_fact_42"],
    };

    const result = rerankCandidates(candidates, ctx);

    const known = result.find((c) => c.fact.identity.factKey === "known_fact_42");
    const unknown = result.find((c) => c.fact.identity.factKey === "unknown_fact");
    expect(known).toBeTruthy();
    expect(unknown).toBeTruthy();
    expect(known.score).toBe(114); // 100 + 14
    expect(unknown.score).toBe(100);
  });

  it("does not mutate input candidates", () => {
    const original = [
      makeCandidate("a", "first", { score: 50 }),
      makeCandidate("b", "second", { score: 30 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(original));
    const ctx: RerankContext = {
      ...emptyContext(),
      playerLocation: "whatever",
    };

    rerankCandidates(original, ctx);

    // original array and objects should be unchanged
    expect(original).toEqual(snapshot);
  });

  it("case-insensitive matching for text-based boosts", () => {
    const candidates = [
      makeCandidate("BLAcKwOoD_Gate", "The BLACKWOOD gate is ancient."),
    ];
    const ctx: RerankContext = {
      ...emptyContext(),
      playerLocation: "blackwood",
    };

    const result = rerankCandidates(candidates, ctx);
    expect(result[0].score).toBe(150); // 100 + 50 (case-insensitive)
  });
});
