import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: defer main-turn options skips post-resolve LLM regen when gated", () => {
  // deferMainTurnOptions logic 已内联回 route.ts；options regen 决策收口至 optionsRegenDecision.ts。
  const content = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
  const regenPath = join(process.cwd(), "src/app/api/chat/optionsRegenDecision.ts");
  const regenContent = readFileSync(regenPath, "utf8");

  const deferDecl = content.indexOf("const deferPlayableOptsToSeparateRequest =");
  assert.ok(deferDecl >= 0, "missing deferPlayableOptsToSeparateRequest");
  assert.match(
    content.slice(deferDecl, deferDecl + 240),
    /clientPurpose !== "options_regen_only" && !isMockScenario/,
    "normal main turns must keep optional options repair off the FINAL critical path",
  );

  const gateIdx = content.indexOf("!deferPlayableOptsToSeparateRequest", deferDecl);
  assert.ok(gateIdx >= 0, "defer gate must skip at least one LLM options path");

  // post-resolve empty-options regen condition 拆分至两个文件：
  // enableOptionsAutoRegenOnEmpty + resolvedOptCount < 2 在 optionsRegenDecision.ts，
  // !deferPlayableOptsToSeparateRequest gate 在 route.ts。
  assert.ok(
    regenContent.includes("enableOptionsAutoRegenOnEmpty") &&
      regenContent.includes("resolvedOptCount < 2") &&
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
