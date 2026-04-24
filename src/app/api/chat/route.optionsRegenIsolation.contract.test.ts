import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: options_regen_only returns before turn commit side-effects", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");

  const fastPathIdx = content.indexOf('if (clientPurpose === "options_regen_only")');
  // Current implementation returns via `createSseResponse({ ... })` from the fast path.
  // Accept either form to keep this structural test tolerant to cosmetic refactors.
  const legacyReturnIdx = content.indexOf("return new Response(sseText(payload)", fastPathIdx);
  const createSseReturnIdx = content.indexOf("return createSseResponse(", fastPathIdx);
  const fastPathReturnIdx =
    legacyReturnIdx >= 0 && (createSseReturnIdx < 0 || legacyReturnIdx < createSseReturnIdx)
      ? legacyReturnIdx
      : createSseReturnIdx;
  const resolveTurnIdx = content.indexOf("resolveDmTurn(dmRecord)");
  const persistFactsIdx = content.indexOf("persistTurnFacts(");

  assert.ok(fastPathIdx >= 0, "missing options_regen_only fast path");
  assert.ok(fastPathReturnIdx >= 0, "missing options_regen_only early return");
  assert.ok(resolveTurnIdx >= 0, "missing resolveDmTurn in main path");
  assert.ok(
    persistFactsIdx >= 0,
    "missing persistTurnFacts in main path"
  );
  assert.ok(
    fastPathReturnIdx < resolveTurnIdx,
    "options_regen_only must return before turn commit resolver"
  );
  assert.ok(
    fastPathReturnIdx < persistFactsIdx,
    "options_regen_only must return before world fact persistence"
  );
});

