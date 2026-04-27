import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPreviewEnvironmentSafe,
  fingerprintPreviewDatabaseUrl,
  isPreviewEnvironmentSignal,
} from "@/lib/config/previewGuards";

const PREVIEW_DB_URL = "postgres://user:pass@db.example.com:5432/versecraft_preview";
const PROD_DB_URL = "postgres://secret_user:secret_pass@prod-db.example.com:5432/versecraft_prod";

test("preview guard is disabled for normal production settings", () => {
  assert.equal(
    isPreviewEnvironmentSignal({
      environmentName: "production",
      appUrl: "https://versecraft.cn",
      nextPublicAppUrl: "https://versecraft.cn",
    }),
    false
  );
  assert.doesNotThrow(() =>
    assertPreviewEnvironmentSafe("postgres://user:pass@db.example.com:5432/versecraft", {
      environmentName: "production",
      appUrl: "https://versecraft.cn",
      nextPublicAppUrl: "https://versecraft.cn",
    })
  );
});

test("preview guard activates from ENVIRONMENT_NAME or preview host URLs", () => {
  assert.equal(isPreviewEnvironmentSignal({ environmentName: "preview" }), true);
  assert.equal(isPreviewEnvironmentSignal({ appUrl: "https://preview.versecraft.cn" }), true);
  assert.equal(
    isPreviewEnvironmentSignal({ nextPublicAppUrl: "https://preview.versecraft.cn" }),
    true
  );
});

test("preview guard accepts a preview database when preview is explicit", () => {
  assert.doesNotThrow(() =>
    assertPreviewEnvironmentSafe(PREVIEW_DB_URL, {
      environmentName: "preview",
      appUrl: "https://preview.versecraft.cn",
      nextPublicAppUrl: "https://preview.versecraft.cn",
    })
  );
});

test("preview guard rejects production-looking databases without leaking URL", () => {
  assert.throws(
    () =>
      assertPreviewEnvironmentSafe(PROD_DB_URL, {
        environmentName: "preview",
        appUrl: "https://preview.versecraft.cn",
        nextPublicAppUrl: "https://preview.versecraft.cn",
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /Preview environment guard failed: DATABASE_URL host or database name contains a production marker\./
      );
      assert.equal(error.message.includes(PROD_DB_URL), false);
      assert.equal(error.message.includes("secret_pass"), false);
      return true;
    }
  );
});

test("preview guard rejects a production database fingerprint", () => {
  const fingerprint = fingerprintPreviewDatabaseUrl(PROD_DB_URL);
  assert.throws(
    () =>
      assertPreviewEnvironmentSafe(PROD_DB_URL, {
        environmentName: "preview",
        productionDatabaseUrlFingerprint: fingerprint,
      }),
    /matches PRODUCTION_DATABASE_URL_FINGERPRINT/
  );
});

test("preview guard requires the configured preview database fingerprint when present", () => {
  const previewFingerprint = fingerprintPreviewDatabaseUrl(PREVIEW_DB_URL);
  assert.doesNotThrow(() =>
    assertPreviewEnvironmentSafe(PREVIEW_DB_URL, {
      environmentName: "preview",
      previewDatabaseUrlFingerprint: previewFingerprint,
    })
  );

  assert.throws(
    () =>
      assertPreviewEnvironmentSafe("postgres://user:pass@db.example.com:5432/other_preview", {
        environmentName: "preview",
        previewDatabaseUrlFingerprint: previewFingerprint,
      }),
    /does not match PREVIEW_DATABASE_URL_FINGERPRINT/
  );
});
