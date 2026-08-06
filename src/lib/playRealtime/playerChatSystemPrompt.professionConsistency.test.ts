import assert from "node:assert/strict";
import test from "node:test";
import { buildStablePlayerDmSystemLines } from "./playerChatSystemPrompt";

// v6-20260806: Profession consistency, B1 forging, and weapon rules removed from stable prompt.
// Now enforced by code: registry canonical professions, applyB1ServiceExecutionGuard,
// resolveDmTurn weapons validation, and post-generation validators.

test("stable prompt no longer contains profession list", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  // Profession list now lives in registry; code validates profession assignments
  assert.ok(!text.includes("职业一致性"), "profession consistency section should not be in stable prompt");
  assert.ok(!text.includes("守灯人"), "specific profession names should not be in stable prompt");
  assert.ok(!text.includes("巡迹客"), "specific profession names should not be in stable prompt");
});

test("stable prompt no longer contains B1 forging guidance", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  // B1 forging handled by applyB1ServiceExecutionGuard at runtime
  assert.ok(!text.includes("B1_PowerRoom"), "B1_PowerRoom reference should not be in stable prompt");
  assert.ok(!text.includes("锻造引导"), "forging guidance should not be in stable prompt");
  // B1 safety rules retained in trimmed NPC consistency section
  assert.ok(text.includes("B1 安全护栏"), "B1 safety guard should remain");
  assert.ok(text.includes("地下一层(B1)"), "B1 map reference should remain");
});

test("stable prompt no longer enforces anti-fabrication", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  assert.ok(!text.includes("禁止生造其它职业名"), "profession fabrication rule moved to code enforcement");
});
