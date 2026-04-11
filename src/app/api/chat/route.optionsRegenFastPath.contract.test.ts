import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("api/chat: options_regen_only fast path bypasses story-action risk and input moderation gates", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");

  const fastPathIdx = content.indexOf('clientPurpose === "options_regen_only"');
  const riskControlIdx = content.indexOf("checkRiskControl({ ip: clientIp, sessionId, userId })");
  const inputModerationIdx = content.indexOf("moderateInputOnServer({");

  assert.ok(fastPathIdx >= 0, "missing options_regen_only fast path");
  assert.ok(riskControlIdx >= 0, "missing risk-control gate");
  assert.ok(inputModerationIdx >= 0, "missing input moderation gate");
  assert.ok(
    fastPathIdx < riskControlIdx,
    "options_regen_only must run before main story risk-control, or repeated helper clicks can return 429"
  );
  assert.ok(
    fastPathIdx < inputModerationIdx,
    "options_regen_only must run before private story input moderation, or fixed helper text can return 403"
  );
});
