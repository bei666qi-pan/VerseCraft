import test from "node:test";
import assert from "node:assert/strict";
import { computeProfessionState } from "./engine";
import { createDefaultProfessionState } from "./registry";

test("profession progression stages should be computed without breaking compat", () => {
  const prev = createDefaultProfessionState();
  const next = computeProfessionState({
    prev,
    stats: { sanity: 18, agility: 10, luck: 10, charm: 10, background: 10 },
    tasks: [],
    historicalMaxFloorScore: 0,
    mainThreatByFloor: {},
    codex: {},
    inventoryCount: 0,
    warehouseCount: 0,
    equippedWeapon: null,
  });
  const p = next.progressByProfession["守灯人"];
  assert.equal(typeof p.statQualified, "boolean");
  assert.equal(typeof p.certified, "boolean");
  // 新字段为可选，但在 compute 后应被填充为布尔。
  assert.equal(typeof p.inclinationVisible, "boolean");
  assert.equal(typeof p.observedByCertifier, "boolean");
  assert.equal(typeof p.trialOffered, "boolean");
  assert.equal(typeof p.trialAccepted, "boolean");
  assert.equal(typeof p.identityImprinted, "boolean");
  // 倾向可见：主属性达标应触发
  assert.equal(p.inclinationVisible, true);
});

test("trialOffered should become true when certifier is in codex", () => {
  const prev = createDefaultProfessionState();
  const next = computeProfessionState({
    prev,
    stats: { sanity: 18, agility: 10, luck: 10, charm: 10, background: 10 },
    tasks: [],
    historicalMaxFloorScore: 0,
    mainThreatByFloor: {},
    codex: { "N-008": { type: "npc", favorability: 0 } },
    inventoryCount: 0,
    warehouseCount: 0,
    equippedWeapon: null,
  });
  assert.equal(next.progressByProfession["守灯人"].observedByCertifier, true);
  assert.equal(next.progressByProfession["守灯人"].trialOffered, true);
});

