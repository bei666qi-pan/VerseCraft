import test from "node:test";
import assert from "node:assert/strict";
import { LIGHT_FORGE_RECIPES } from "@/lib/registry/forge";
import { WEAPONS } from "@/lib/registry/weapons";

test("stage2 scope guard: forge remains minimal and focused", () => {
  // stage2: 允许新增“武器化”但仍需保持轻量（避免把整套工坊塞进 prompt packet）
  assert.ok(LIGHT_FORGE_RECIPES.length <= 16, `forge recipes too many: ${LIGHT_FORGE_RECIPES.length}`);
  const ops = new Set(LIGHT_FORGE_RECIPES.map((x) => x.operation));
  assert.deepEqual([...ops].sort(), ["infuse", "mod", "repair", "weaponize"]);
});

test("stage2 scope guard: weapon catalog stays compact", () => {
  assert.ok(WEAPONS.length <= 6, `weapon count too large for stage2: ${WEAPONS.length}`);
});

