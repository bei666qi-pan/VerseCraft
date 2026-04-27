import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviewAccessSession,
  decidePreviewAccessPassword,
  getPreviewAccessCookieName,
  sanitizePreviewAccessNext,
  verifyPreviewAccessSession,
  type PreviewAccessEnv,
} from "@/lib/previewAccess";

const TEST_ENV: PreviewAccessEnv = {
  password: "preview-password",
  cookieSecret: "preview-cookie-secret-at-least-32-chars",
  maxAgeSeconds: 60,
};

test("preview access session verifies a valid HMAC signature", () => {
  return (async () => {
    const session = await buildPreviewAccessSession({
      env: TEST_ENV,
      nowMs: 1_700_000_000_000,
      nonce: "nonce-1",
    });
    assert.ok(session);
    assert.equal(session.maxAge, 60);
    assert.equal(
      await verifyPreviewAccessSession(session.value, {
        env: TEST_ENV,
        nowMs: 1_700_000_030_000,
      }),
      true
    );
  })();
});

test("preview access cookie name defaults and accepts configured token names", () => {
  assert.equal(getPreviewAccessCookieName({}), "vc_preview_access");
  assert.equal(getPreviewAccessCookieName({ cookieName: "custom_preview_cookie" }), "custom_preview_cookie");
  assert.equal(getPreviewAccessCookieName({ cookieName: "bad cookie" }), "vc_preview_access");
});

test("preview access session rejects tampered payloads", async () => {
  const session = await buildPreviewAccessSession({
    env: TEST_ENV,
    nowMs: 1_700_000_000_000,
    nonce: "nonce-2",
  });
  assert.ok(session);
  const tampered = session.value.replace("nonce-2", "nonce-x");
  assert.equal(await verifyPreviewAccessSession(tampered, { env: TEST_ENV }), false);
});

test("preview access session rejects expired cookies", async () => {
  const session = await buildPreviewAccessSession({
    env: TEST_ENV,
    nowMs: 1_700_000_000_000,
    nonce: "nonce-3",
  });
  assert.ok(session);
  assert.equal(
    await verifyPreviewAccessSession(session.value, {
      env: TEST_ENV,
      nowMs: 1_700_000_061_000,
    }),
    false
  );
});

test("preview access refuses to issue a session when config is missing", async () => {
  assert.deepEqual(
    await decidePreviewAccessPassword("preview-password", {
      env: { password: "preview-password" },
    }),
    { ok: false, reason: "missing_config" }
  );
});

test("preview access wrong password does not issue a session", async () => {
  const decision = await decidePreviewAccessPassword("wrong-password", { env: TEST_ENV });
  assert.deepEqual(decision, { ok: false, reason: "invalid_password" });
});

test("preview access password success issues a signed session", async () => {
  const decision = await decidePreviewAccessPassword("preview-password", {
    env: TEST_ENV,
    nowMs: 1_700_000_000_000,
    nonce: "nonce-4",
  });
  assert.equal(decision.ok, true);
  if (decision.ok) {
    assert.equal(
      await verifyPreviewAccessSession(decision.session.value, {
        env: TEST_ENV,
        nowMs: 1_700_000_030_000,
      }),
      true
    );
  }
});

test("sanitizePreviewAccessNext only allows same-origin relative paths", () => {
  assert.equal(sanitizePreviewAccessNext("/play?x=1"), "/play?x=1");
  assert.equal(sanitizePreviewAccessNext("https://evil.example/play"), "/");
  assert.equal(sanitizePreviewAccessNext("//evil.example/play"), "/");
  assert.equal(sanitizePreviewAccessNext("/play\r\nSet-Cookie:x"), "/");
});
