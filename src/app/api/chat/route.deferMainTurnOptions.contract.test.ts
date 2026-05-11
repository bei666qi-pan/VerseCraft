import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: defer main-turn options skips post-resolve LLM regen when gated", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");

  const deferDecl = content.indexOf("const deferPlayableOptsToSeparateRequest =");
  assert.ok(deferDecl >= 0, "missing deferPlayableOptsToSeparateRequest");

  const gateIdx = content.indexOf("!deferPlayableOptsToSeparateRequest", deferDecl);
  assert.ok(gateIdx >= 0, "defer gate must skip at least one LLM options path");

  assert.ok(
    content.includes("rollout.enableOptionsAutoRegenOnEmpty") &&
      content.includes("resolvedOptCount < 2") &&
      content.includes("!deferPlayableOptsToSeparateRequest"),
    "post-resolve empty-options regen must honor defer gate"
  );
  const stripImport = content.indexOf('from "@/lib/play/deferMainTurnOptionsDelivery"');
  assert.ok(stripImport >= 0, "route must import deferMainTurnOptionsDelivery");

  const stringifyIdx = content.indexOf("finalizePayload = JSON.stringify(resolvedForClient)");
  const stripIdx = content.indexOf("stripPlayableOptionsForDeferredClientDelivery(resolvedForClient)");
  assert.ok(stringifyIdx >= 0 && stripIdx >= 0, "missing finalize/strip wiring");
  assert.ok(stripIdx < stringifyIdx, "strip must run before stringify(resolvedForClient)");
});
