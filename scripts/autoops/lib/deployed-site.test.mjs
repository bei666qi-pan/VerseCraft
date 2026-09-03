import assert from "node:assert/strict";
import test from "node:test";
import {
  assessBuildIdPayload,
  assessCoolifyApplicationStatus,
  assessHealthPayload,
  verifyDeployedSite,
} from "./deployed-site.mjs";

const TARGET_SHA = "a".repeat(40);

test("deployment attestation requires healthy business JSON and the exact build id", () => {
  assert.deepEqual(
    assessHealthPayload({
      ok: true,
      status: "healthy",
      checks: { database: "ok", aiKey: "configured", worker: { ok: true, degraded: false } },
    }),
    { ok: true, reason: null },
  );
  assert.equal(assessHealthPayload({ ok: true, status: "degraded", checks: {} }).ok, false);
  assert.equal(assessHealthPayload("<html>old proxy page</html>").ok, false);
  assert.deepEqual(assessBuildIdPayload({ buildId: TARGET_SHA }, TARGET_SHA), { ok: true, reason: null });
  assert.equal(assessBuildIdPayload({ buildId: "b".repeat(40) }, TARGET_SHA).ok, false);
});

test("Coolify application attestation requires running:healthy exactly", () => {
  assert.deepEqual(assessCoolifyApplicationStatus("running:healthy"), { ok: true, reason: null });
  assert.equal(assessCoolifyApplicationStatus("running").ok, false);
  assert.equal(assessCoolifyApplicationStatus("running:unhealthy").ok, false);
  assert.equal(assessCoolifyApplicationStatus("finished").ok, false);
});

test("deployment attestation does not accept a healthy old release", async () => {
  let buildChecks = 0;
  const result = await verifyDeployedSite({
    healthUrl: "https://versecraft.example/api/health",
    expectedBuildId: TARGET_SHA,
    attempts: 2,
    delayMs: 0,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("/api/health")) {
        return Response.json({
          ok: true,
          status: "healthy",
          checks: { database: "ok", aiKey: "configured", worker: { ok: true, degraded: false } },
        });
      }
      buildChecks += 1;
      return Response.json({ buildId: buildChecks === 1 ? "b".repeat(40) : TARGET_SHA });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.attempt, 2);
  assert.equal(result.buildId, TARGET_SHA);
});
