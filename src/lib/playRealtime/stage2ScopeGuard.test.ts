import test from "node:test";
import assert from "node:assert/strict";
import { LIGHT_FORGE_RECIPES } from "@/lib/registry/forge";
import { WEAPONS } from "@/lib/registry/weapons";

test("stage2 scope guard: forge remains minimal and focused", () => {
  assert.ok(LIGHT_FORGE_RECIPES.length <= 12, `forge recipes too many: ${LIGHT_FORGE_RECIPES.length}`);
  const ops = new Set(LIGHT_FORGE_RECIPES.map((x) => x.operation));
  assert.deepEqual([...ops].sort(), ["infuse", "mod", "repair"]);
});

test("stage2 scope guard: weapon catalog stays compact", () => {
  assert.ok(WEAPONS.length <= 6, `weapon count too large for stage2: ${WEAPONS.length}`);
});

