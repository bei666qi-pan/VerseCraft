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
  const contextPacketIdx = content.indexOf("optionsRegenContext: validated.optionsRegenContext");

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
  assert.ok(
    contextPacketIdx >= 0,
    "options_regen_only packet should consume dedicated optionsRegenContext to avoid context drift"
  );
});

test("api/chat: chat purpose header is validated before queue and options fast path", () => {
  const p = join(process.cwd(), "src/app/api/chat/route.ts");
  const content = readFileSync(p, "utf8");

  const resolveGateIdx = content.indexOf("async function resolveChatQueueGate");
  const internalIdx = content.indexOf("async function postChatInternal");
  const queueMismatchIdx = content.indexOf("createChatPurposeMismatchResponse()", resolveGateIdx);
  const queueSkipIdx = content.indexOf('validated.clientPurpose === "options_regen_only"', resolveGateIdx);
  const internalMismatchIdx = content.indexOf('NextResponse.json({ error: "chat_purpose_mismatch"', internalIdx);
  const fastPathIdx = content.indexOf('if (clientPurpose === "options_regen_only")', internalIdx);

  assert.ok(resolveGateIdx >= 0, "missing queue-gate function");
  assert.ok(internalIdx >= 0, "missing internal chat function");
  assert.ok(queueMismatchIdx >= 0, "missing queue-gate chat purpose mismatch guard");
  assert.ok(internalMismatchIdx >= 0, "missing internal chat purpose mismatch guard");
  assert.ok(queueMismatchIdx < queueSkipIdx, "mismatched purpose header must not bypass queue admission");
  assert.ok(internalMismatchIdx < fastPathIdx, "mismatched purpose header must not reach options fast path");
});
