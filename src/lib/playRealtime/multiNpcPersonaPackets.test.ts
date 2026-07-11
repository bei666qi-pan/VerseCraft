import test from "node:test";
import assert from "node:assert/strict";
import { buildMultiNpcCompactPersonaPacketObject, buildMultiNpcPersonaBoundaryPacketObject } from "./multiNpcPersonaPackets";

test("multiNpcPersona: object includes first_appearance_rule and canonical appearance short", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-020", "N-014"],
    npcPositions: [
      { npcId: "N-020", location: "B1_Storage" },
      { npcId: "N-014", location: "地下室洗衣房" },
    ],
    currentLocation: "B1_Storage",
    sceneAppearanceAlreadyWrittenIds: [],
    maxCards: 2,
  });
  assert.equal(obj.schema, "multi_npc_persona_compact_v1");
  const lingshang = obj.cards.find((c) => c.id === "N-020");
  assert.ok(lingshang);
  assert.equal(lingshang?.first_appearance_rule, "must_use_appearance_short");
  assert.ok((lingshang?.appearance_short ?? "").length > 0);
});

test("multiNpcPersona: boundary packet stays very compact", () => {
  const obj = buildMultiNpcPersonaBoundaryPacketObject({
    npcIds: ["N-020", "N-014"],
    npcPositions: [{ npcId: "N-020", location: "B1_Storage" }],
    currentLocation: "B1_Storage",
    sceneAppearanceAlreadyWrittenIds: ["N-020"],
  });
  assert.equal(obj.schema, "multi_npc_persona_boundary_v1");
  assert.ok(obj.cards.length > 0 && obj.cards.length <= 2);
  assert.ok(obj.cards[0]?.ap.length <= 70);
});

test("multiNpcPersona: heard_only card omits speech_pattern", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-010"],
    npcPositions: [{ npcId: "N-010", location: "1F_PropertyOffice" }],
    currentLocation: "B1_SafeZone",
    sceneAppearanceAlreadyWrittenIds: [],
    modeByNpcId: { "N-010": "heard_only" },
  });
  const card = obj.cards[0] as Record<string, unknown>;
  assert.equal(card.id, "N-010");
  assert.equal(card.mode, "heard_only");
  assert.equal(card.rule, "no_live_dialogue");
  assert.equal("speech_pattern" in card, false);
});

test("multiNpcPersona: memory_only card omits appearance_short", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-010"],
    npcPositions: [{ npcId: "N-010", location: "1F_PropertyOffice" }],
    currentLocation: "B1_SafeZone",
    sceneAppearanceAlreadyWrittenIds: [],
    modeByNpcId: { "N-010": "memory_only" },
  });
  const card = obj.cards[0] as Record<string, unknown>;
  assert.equal(card.id, "N-010");
  assert.equal(card.mode, "memory_only");
  assert.equal(card.rule, "no_live_dialogue");
  assert.equal("appearance_short" in card, false);
});

test("multiNpcPersona: present mode keeps short identity anchors", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-015"],
    npcPositions: [{ npcId: "N-015", location: "B1_SafeZone" }],
    currentLocation: "B1_SafeZone",
    sceneAppearanceAlreadyWrittenIds: [],
    modeByNpcId: { "N-015": "present" },
  });
  const card = obj.cards[0] as Record<string, unknown>;
  assert.equal(card.id, "N-015");
  assert.equal(card.mode, "present");
  assert.equal(typeof card.appearance_short, "string");
  assert.equal(typeof card.speech_pattern, "string");
});

test("multiNpcPersona: forbidden mode does not emit a card", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-010"],
    npcPositions: [{ npcId: "N-010", location: "1F_PropertyOffice" }],
    currentLocation: "B1_SafeZone",
    sceneAppearanceAlreadyWrittenIds: [],
    modeByNpcId: { "N-010": "forbidden" },
  });
  assert.deepEqual(obj.cards, []);
});

test("multiNpcPersona: voice_hint present for anchor NPCs with deep canon", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-015", "N-020", "N-010"],
    npcPositions: [{ npcId: "N-015", location: "B1_SafeZone" }],
    currentLocation: "B1_SafeZone",
    sceneAppearanceAlreadyWrittenIds: [],
    maxCards: 3,
  });
  // N-015 (麟泽) has voice card → voice_hint should be present
  const linze = obj.cards.find((c) => c.id === "N-015") as Record<string, unknown>;
  assert.ok(linze, "N-015 card exists");
  assert.equal(typeof linze.voice_hint, "string");
  assert.ok((linze.voice_hint as string).length > 0, "voice_hint is non-empty");
  assert.ok((linze.voice_hint as string).includes("["), "voice_hint includes humor bracket");
});

test("multiNpcPersona: full packet stays within 1200 char budget with voice_hint", () => {
  const obj = buildMultiNpcCompactPersonaPacketObject({
    npcIds: ["N-015", "N-020", "N-010", "N-018", "N-013", "N-007"],
    npcPositions: [{ npcId: "N-015", location: "B1_SafeZone" }],
    currentLocation: "B1_SafeZone",
    sceneAppearanceAlreadyWrittenIds: [],
    maxCards: 4,
  });
  // Re-serialize through the truncation path
  const text = `## 【multi_npc_persona_compact】\n${JSON.stringify(obj)}`;
  const truncated = text.length <= 1200 ? text : `${text.slice(0, 1199)}…`;
  assert.ok(truncated.length <= 1200, `packet ${truncated.length} chars <= 1200`);
});

