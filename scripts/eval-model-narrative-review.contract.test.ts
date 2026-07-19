import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("live trace review prefers the per-step client option regeneration evidence", () => {
  const source = readFileSync("scripts/eval-model-narrative-review.ts", "utf8");
  assert.match(source, /asRecord\(step\.clientOptionRegeneration\)/);
  assert.match(source, /optionsSource: regenApplied \? "client_regenerated" : "main_turn"/);
});
