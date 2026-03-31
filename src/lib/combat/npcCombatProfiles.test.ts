import test from "node:test";
import assert from "node:assert/strict";
import { getHiddenNpcCombatProfile } from "./npcCombatProfiles";

test("getHiddenNpcCombatProfile: major npc 有稳定风格标签", () => {
  const n015 = getHiddenNpcCombatProfile({ npcId: "N-015" });
  assert.ok(n015.styleTags.includes("boundary_guard"));
  assert.ok(n015.styleTags.includes("close_quarters"));

  const n007 = getHiddenNpcCombatProfile({ npcId: "N-007" });
  assert.ok(n007.styleTags.includes("mirror_counter"));
});

test("getHiddenNpcCombatProfile: dangerForPlayer 不返回裸数字", () => {
  const out = getHiddenNpcCombatProfile({ npcId: "N-010" });
  assert.ok(typeof out.dangerForPlayer === "string");
  assert.ok(!/\d/.test(out.displayName));
});

