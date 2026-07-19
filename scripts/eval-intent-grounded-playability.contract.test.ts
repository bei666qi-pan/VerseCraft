import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("trace narrative review uses options actually applied by the client", () => {
  const source = readFileSync("scripts/eval-intent-grounded-playability.ts", "utf8");
  assert.match(source, /function visibleOptionsForTraceStep/);
  assert.match(source, /regeneration\.source === "api_chat_options_regen_only"/);
  assert.match(source, /optionsSource: regenerationApplied \? "client_regenerated" : "main_turn"/);
  assert.match(source, /const visibleOptions = visibleOptionsForTraceStep\(step\)/);
});
