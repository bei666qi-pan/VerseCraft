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

