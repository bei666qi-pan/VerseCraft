// src/lib/presence/onlineWindow.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { isWithinOnlineWindow, ONLINE_WINDOW_SECONDS } from "@/lib/presence/onlineWindow";

test("isWithinOnlineWindow: aligns with SQL `last_seen >= now() - 90s` (89s, 90s in; 91s out)", () => {
  const now = Date.UTC(2024, 0, 1, 0, 0, 0);
  const t89 = now - 89 * 1000;
  const t90 = now - 90 * 1000;
  const t91 = now - 91 * 1000;
  assert.equal(isWithinOnlineWindow(t89, now, 90), true);
  assert.equal(isWithinOnlineWindow(t90, now, 90), true);
  assert.equal(isWithinOnlineWindow(t91, now, 90), false);
});

test("isWithinOnlineWindow: aliases match 89/90/91 second labels", () => {
  const now = 1_000_000_000_000;
  const w = ONLINE_WINDOW_SECONDS;
  assert.equal(isWithinOnlineWindow(now - (w - 1) * 1000, now, w), true);
  assert.equal(isWithinOnlineWindow(now - w * 1000, now, w), true);
  assert.equal(isWithinOnlineWindow(now - (w + 1) * 1000, now, w), false);
});
