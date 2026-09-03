import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  assessAdminOverviewResponse,
  buildAdminSessionCookie,
  verifyProductionAdmin,
} from "./admin-site.mjs";

test("admin session cookie is short lived and signed without exposing the password", () => {
  const password = "test-only-password";
  const cookie = buildAdminSessionCookie(password, { nowMs: 1_700_000_000_000, nonce: "fixed" });
  const value = cookie.split("=")[1];
  const [expiresAt, nonce, signature] = value.split(".");
  assert.equal(expiresAt, String(1_700_000_000 + 600));
  assert.equal(nonce, "fixed");
  assert.equal(signature, createHmac("sha256", password).update(`${expiresAt}.${nonce}`).digest("base64url"));
  assert.doesNotMatch(cookie, /test-only-password/);
});

test("admin overview attestation rejects unauthorized, degraded and incomplete responses", () => {
  assert.equal(assessAdminOverviewResponse(403, {}).ok, false);
  assert.equal(assessAdminOverviewResponse(200, { ok: true, degraded: true, data: {} }).ok, false);
  assert.equal(assessAdminOverviewResponse(200, { ok: true, degraded: false, data: {} }).ok, false);
  assert.deepEqual(
    assessAdminOverviewResponse(200, { ok: true, degraded: false, data: { cards: [], range: "today" } }),
    { ok: true, reason: null },
  );
});

test("production admin verifier sends a signed cookie and returns only non-sensitive evidence", async () => {
  let receivedCookie = "";
  const result = await verifyProductionAdmin({
    baseUrl: "https://versecraft.example",
    adminPassword: "test-only-password",
    fetchImpl: async (_url, init) => {
      receivedCookie = String(init.headers.Cookie ?? "");
      return Response.json({ ok: true, degraded: false, data: { cards: [], range: "today" } });
    },
  });
  assert.equal(receivedCookie.startsWith("admin_shadow_session="), true);
  assert.doesNotMatch(receivedCookie, /test-only-password/);
  assert.deepEqual(result, { ok: true, reason: null, status: 200 });
});
