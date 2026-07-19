import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("play recovery clears a stale ticket and re-enters as a resume without duplicate logging", () => {
  const page = readFileSync("src/app/play/page.tsx", "utf8");
  assert.match(page, /shouldRecoverStaleChatQueueTicket\(/);
  assert.match(page, /clearPendingChatQueueAction\(\);/);
  // isResume=true avoids the normal `pushLog` branch; null drops the stale
  // ticket header so a fresh queue admission happens exactly once.
  assert.match(
    page,
    /await sendAction\(trimmed, bypassLengthCheck, true, isSystemAction, null, retriedAfterRateLimit, true\);/
  );
});
