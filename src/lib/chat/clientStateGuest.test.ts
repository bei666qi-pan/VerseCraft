// src/lib/chat/clientStateGuest.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { getGuestIdFromClientState } from "./clientStateGuest";

test("getGuestIdFromClientState: returns trimmed guest id from v1 client state", () => {
  assert.equal(getGuestIdFromClientState({ v: 1, guestId: "  g-abc-123  " }), "g-abc-123");
});

test("getGuestIdFromClientState: rejects empty or overlong", () => {
  assert.equal(getGuestIdFromClientState({ guestId: "" }), null);
  assert.equal(getGuestIdFromClientState({ guestId: "x".repeat(129) }), null);
  assert.equal(getGuestIdFromClientState(null), null);
});
