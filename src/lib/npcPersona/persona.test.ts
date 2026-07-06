/**
 * npcPersona 模块测试
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { NPC_PERSONA_CARDS, selectActivePersonaCards } from "./registry";
import { buildNpcPersonaPromptBlock, buildNpcPersonaPromptBlockCompact } from "./prompt";

describe("NPC_PERSONA_CARDS", () => {
  it("contains at least 5 registered NPCs", () => {
    const ids = Object.keys(NPC_PERSONA_CARDS);
    assert.ok(ids.length >= 5, `expected >=5 NPCs, got ${ids.length}`);
  });

  it("each card has required fields", () => {
    for (const card of Object.values(NPC_PERSONA_CARDS)) {
      assert.ok(card.npcId, `missing npcId for ${card.displayName}`);
      assert.ok(card.displayName, `missing displayName for ${card.npcId}`);
      assert.ok(card.voiceRules.length >= 2, `${card.displayName}: voiceRules too few`);
      assert.ok(card.knownFacts.length >= 1, `${card.displayName}: knownFacts empty`);
      assert.ok(card.currentGoal.length > 0, `${card.displayName}: currentGoal empty`);
      assert.ok(card.crisisBehavior.length > 0, `${card.displayName}: crisisBehavior empty`);
      assert.ok(card.hardConstraints.length >= 1, `${card.displayName}: hardConstraints empty`);
      // Big 5 values in range
      const b = card.big5;
      for (const [k, v] of Object.entries(b)) {
        assert.ok(v >= 1 && v <= 10, `${card.displayName}: big5.${k}=${v} out of range`);
      }
    }
  });
});

describe("selectActivePersonaCards", () => {
  it("returns cards for present NPCs", () => {
    const cards = selectActivePersonaCards(["N-007", "N-015"]);
    assert.ok(cards.length >= 1);
    assert.ok(cards.some((c) => c.npcId === "N-007"));
    assert.ok(cards.some((c) => c.npcId === "N-015"));
  });

  it("returns cards for mentioned NPCs", () => {
    const cards = selectActivePersonaCards([], ["N-008"]);
    assert.ok(cards.some((c) => c.npcId === "N-008"));
  });

  it("limits to max 3 cards", () => {
    const cards = selectActivePersonaCards(
      ["N-007", "N-015", "N-008", "N-010", "N-018"],
    );
    assert.ok(cards.length <= 3, `expected <=3, got ${cards.length}`);
  });

  it("returns empty for unknown NPCs", () => {
    const cards = selectActivePersonaCards(["N-999"]);
    assert.equal(cards.length, 0);
  });
});

describe("buildNpcPersonaPromptBlock", () => {
  const cards = selectActivePersonaCards(["N-007", "N-015"]);

  it("builds a non-empty prompt block", () => {
    const block = buildNpcPersonaPromptBlock({ cards });
    assert.ok(block.length > 0);
    assert.ok(block.includes("廖暗"));
    assert.ok(block.includes("麟泽"));
    assert.ok(block.includes("人格"));
    assert.ok(block.includes("口吻"));
  });

  it("respects maxChars", () => {
    const block = buildNpcPersonaPromptBlock({ cards, maxChars: 200 });
    assert.ok(block.length <= 200);
  });

  it("returns empty string for empty cards", () => {
    assert.equal(buildNpcPersonaPromptBlock({ cards: [] }), "");
  });
});

describe("buildNpcPersonaPromptBlockCompact", () => {
  const cards = selectActivePersonaCards(["N-007", "N-008"]);

  it("produces a compact single-line summary", () => {
    const block = buildNpcPersonaPromptBlockCompact({ cards, maxChars: 500 });
    assert.ok(block.length > 0);
    assert.ok(block.includes("NPC人格"));
    assert.ok(block.includes("廖暗"));
    assert.ok(block.includes("老刘"));
  });

  it("respects maxChars", () => {
    const block = buildNpcPersonaPromptBlockCompact({ cards, maxChars: 100 });
    assert.ok(block.length <= 100);
  });
});
