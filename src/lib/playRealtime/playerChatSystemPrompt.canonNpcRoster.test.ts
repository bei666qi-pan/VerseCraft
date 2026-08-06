import assert from "node:assert/strict";
import test from "node:test";
import { buildStablePlayerDmSystemLines } from "./playerChatSystemPrompt";

// v6-20260806: NPC roster and anti-fabrication rules removed from stable prompt.
// Now enforced by runtime packets (npc_scene_authority_packet), registry canonical
// identity, and post-generation validators — not by prompt duplication.

test("stable prompt no longer contains the full canonical NPC roster", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  // Roster now lives in registry + runtime packets; not duplicated in stable prompt
  assert.ok(!text.includes("NPC 规范名册"), "full roster section should not be in stable prompt");
  assert.ok(!text.includes("陈婆婆N-001"), "individual NPC IDs should not be in stable prompt");
  assert.ok(!text.includes("N-015"), "N-015 should not be hardcoded in stable prompt");
});

test("stable prompt still references xinlan-anchor for narrative consistency", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  // xinlan-anchor retained in trimmed NPC consistency section
  assert.ok(text.includes("xinlan-anchor"), "xinlan-anchor should remain in stable prompt");
  assert.ok(text.includes("欣蓝"), "欣蓝 name should remain for the anchor");
});

test("stable prompt no longer enforces NPC alias fabrication via prompt", () => {
  const lines = buildStablePlayerDmSystemLines();
  const text = lines.join("\n");
  // Alias fabrication now enforced by registry canonical identity + post-generation validators
  assert.ok(!text.includes("禁止生造别名"), "anti-alias rule moved to code enforcement");
  assert.ok(!text.includes("禁止生造其它职业名"), "anti-fabrication rule moved to code enforcement");
});
