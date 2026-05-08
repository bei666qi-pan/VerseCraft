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

