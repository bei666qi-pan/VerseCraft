import test from "node:test";
import assert from "node:assert/strict";
import { resolveGameplayEventIdentity } from "@/lib/analytics/gameplayEventIdentity";

test("resolveGameplayEventIdentity prefers authenticated user identity", () => {
  const resolved = resolveGameplayEventIdentity(
    {
      guestId: "guest_local_123",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
      payload: { source: "home" },
    },
    "user_1"
  );

  assert.equal(resolved.userId, "user_1");
  assert.equal(resolved.guestId, "guest_local_123");
  assert.equal(resolved.actorId, "u:user_1");
  assert.equal(resolved.actorType, "user");
  assert.equal(resolved.sessionId, "sess_user_1");
  assert.equal(resolved.platform, "mobile");
  assert.deepEqual(resolved.payload, { source: "home" });
});

test("resolveGameplayEventIdentity keeps guest identity and builds stable guest session", () => {
  const resolved = resolveGameplayEventIdentity(
    {
      guestId: "guest_abcdef1234567890",
      payload: { entryState: "guest_fresh" },
    },
    null
  );

  assert.equal(resolved.userId, null);
  assert.equal(resolved.guestId, "guest_abcdef1234567890");
  assert.equal(resolved.actorId, "g:guest_abcdef1234567890");
  assert.equal(resolved.actorType, "guest");
  assert.equal(resolved.sessionId, "home_g_guest_abcdef1234567890");
  assert.deepEqual(resolved.payload, { entryState: "guest_fresh" });
});

test("resolveGameplayEventIdentity infers guest identity from legacy guest sessionId", () => {
  const resolved = resolveGameplayEventIdentity(
    {
      sessionId: "guest_legacy_123",
      eventVersion: "2",
      payload: {},
    },
    null
  );

  assert.equal(resolved.guestId, "guest_legacy_123");
  assert.equal(resolved.actorId, "g:guest_legacy_123");
  assert.equal(resolved.sessionId, "guest_legacy_123");
  assert.deepEqual(resolved.payload, { eventVersion: "2" });
});

test("resolveGameplayEventIdentity marks missing guest id without blocking event", () => {
  const resolved = resolveGameplayEventIdentity(
    {
      sessionId: null,
      payload: { source: "settlement" },
    },
    null
  );

  assert.equal(resolved.guestId, null);
  assert.equal(resolved.actorId, null);
  assert.equal(resolved.actorType, null);
  assert.equal(resolved.sessionId, "anon_session");
  assert.deepEqual(resolved.payload, {
    source: "settlement",
    dataQuality: { missingGuestId: true },
  });
});

test("resolveGameplayEventIdentity derives platform and honors explicit platform", () => {
  const mobile = resolveGameplayEventIdentity(
    {
      guestId: "guest_mobile",
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit Mobile",
    },
    null
  );
  const explicit = resolveGameplayEventIdentity(
    {
      guestId: "guest_desktop",
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148",
      platform: "desktop",
    },
    null
  );

  assert.equal(mobile.platform, "mobile");
  assert.equal(explicit.platform, "desktop");
});
