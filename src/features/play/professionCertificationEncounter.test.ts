import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPersistedProfessionCertificationChoice,
  hasStructuredProfessionCertifierEncounter,
  resolveProfessionCertificationGate,
} from "./professionCertificationEncounter";

test("structured certifier codex update at 1F proves a profession encounter", () => {
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "1F_大厅",
      dmRecord: { codex_updates: [{ type: "npc", id: "N-008" }] },
    }),
    true
  );
});

test("relationship and location deltas can prove the same current-turn encounter", () => {
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "1F_走廊",
      dmRecord: { relationship_updates: [{ npcId: "N-014" }] },
    }),
    true
  );
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "1F_走廊",
      dmRecord: { npc_location_updates: [{ id: "N-011", to_location: "1F_走廊" }] },
    }),
    true
  );
});

test("a passive same-floor NPC location cannot fabricate a certifier encounter", () => {
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "1F_大厅",
      dmRecord: { dynamicNpcStates: { "N-008": { currentLocation: "1F_大厅" } } },
    }),
    false
  );
});

test("non-certifier, wrong floor, and narrative-only references do not unlock certification", () => {
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "1F_大厅",
      dmRecord: { codex_updates: [{ type: "npc", id: "N-999" }] },
    }),
    false
  );
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "3F_走廊",
      dmRecord: { codex_updates: [{ type: "npc", id: "N-008" }] },
    }),
    false
  );
  assert.equal(
    hasStructuredProfessionCertifierEncounter({
      playerLocation: "1F_大厅",
      dmRecord: { narrative: "老刘站在你面前，准备替你认证。" },
    }),
    false
  );
});

test("certification choice needs a structured encounter once, then preserves the confirmed encounter", () => {
  const eligibility = { 守灯人: true };
  const withoutEncounter = resolveProfessionCertificationGate({
    playerLocation: "1F_大厅",
    dmRecord: { dynamicNpcStates: { "N-008": { currentLocation: "1F_大厅" } } },
    hasMetProfessionCertifier: false,
    currentProfession: null,
    eligibilityByProfession: eligibility,
  });
  assert.deepEqual(withoutEncounter, { markEncounter: false, eligibleProfessions: [] });

  const directEncounter = resolveProfessionCertificationGate({
    playerLocation: "1F_大厅",
    dmRecord: { codex_updates: [{ type: "npc", id: "N-008" }] },
    hasMetProfessionCertifier: false,
    currentProfession: null,
    eligibilityByProfession: eligibility,
  });
  assert.deepEqual(directEncounter, { markEncounter: true, eligibleProfessions: ["守灯人"] });

  const laterCertification = resolveProfessionCertificationGate({
    playerLocation: "1F_大厅",
    dmRecord: {},
    hasMetProfessionCertifier: true,
    currentProfession: null,
    eligibilityByProfession: eligibility,
  });
  assert.deepEqual(laterCertification, { markEncounter: false, eligibleProfessions: ["守灯人"] });
});

test("persisted confirmed encounter rebuilds only the still-eligible certification choice", () => {
  assert.deepEqual(
    buildPersistedProfessionCertificationChoice({
      playerLocation: "1F_大厅",
      hasMetProfessionCertifier: true,
      currentProfession: null,
      eligibilityByProfession: { 守灯人: true, 巡迹客: false },
    }),
    {
      options: ["认证职业：守灯人"],
      mapping: { "认证职业：守灯人": "守灯人" },
    }
  );
  assert.deepEqual(
    buildPersistedProfessionCertificationChoice({
      playerLocation: "1F_大厅",
      hasMetProfessionCertifier: false,
      currentProfession: null,
      eligibilityByProfession: { 守灯人: true },
    }),
    { options: [], mapping: {} }
  );
});
