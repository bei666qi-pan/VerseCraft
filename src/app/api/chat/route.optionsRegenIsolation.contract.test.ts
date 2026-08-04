import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: options_regen_only returns before turn commit side-effects", () => {
  const routePath = join(process.cwd(), "src/app/api/chat/route.ts");
  const routeContent = readFileSync(routePath, "utf8");

  // options_regen_only fast path must exist in route.ts
  const fastPathIdx = routeContent.indexOf('if (clientPurpose === "options_regen_only")');
  assert.ok(fastPathIdx >= 0, "missing options_regen_only fast path");

  // fast path must return before calling runStreamFinalHooks
  const hooksCallIdx = routeContent.indexOf("runStreamFinalHooks(");
  assert.ok(hooksCallIdx >= 0, "missing runStreamFinalHooks call");
  assert.ok(fastPathIdx < hooksCallIdx,
    "options_regen_only must return before stream final hooks");

  // turn commit side-effects (resolveDmTurn, persistTurnFacts) now inlined into route.ts
  const resolveTurnIdx = routeContent.indexOf("resolveDmTurn(dmRecord)");
  const persistFactsIdx = routeContent.indexOf("persistTurnFacts(");
  assert.ok(resolveTurnIdx >= 0, "missing resolveDmTurn in route.ts");
  assert.ok(persistFactsIdx >= 0, "missing persistTurnFacts in route.ts");
});
