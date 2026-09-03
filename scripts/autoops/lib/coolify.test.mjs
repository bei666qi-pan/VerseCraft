import assert from "node:assert/strict";
import test from "node:test";
import {
  deploymentStatus,
  normalizeDeploymentList,
  planApplicationEnvMutation,
  selectTriggeredDeployment,
} from "./coolify.mjs";

test("Coolify env sync reads first, PATCHes existing keys and POSTs missing keys", () => {
  const existing = planApplicationEnvMutation(
    { data: [{ key: "ADMIN_PASSWORD", value: "old" }] },
    "ADMIN_PASSWORD",
    "new-secret",
  );
  assert.equal(existing.method, "PATCH");
  assert.deepEqual(existing.body, {
    key: "ADMIN_PASSWORD",
    value: "new-secret",
    is_preview: false,
    is_buildtime: false,
    is_literal: true,
  });

  const missing = planApplicationEnvMutation([], "ADMIN_PASSWORD", "new-secret");
  assert.equal(missing.method, "POST");
});

test("normalizes supported Coolify deployments envelopes", () => {
  const record = { deployment_uuid: "fresh", status: "queued" };
  assert.deepEqual(normalizeDeploymentList([record]), [record]);
  assert.deepEqual(normalizeDeploymentList({ data: [record] }), [record]);
  assert.deepEqual(normalizeDeploymentList({ deployments: [record] }), [record]);
  assert.deepEqual(normalizeDeploymentList({ data: { deployments: [record] } }), [record]);
  assert.deepEqual(normalizeDeploymentList({}), []);
});

test("uses the exact deployment UUID when the endpoint returns a status", () => {
  const direct = { deployment_uuid: "reported", status: "in_progress" };
  const selected = selectTriggeredDeployment([direct], {
    expectedUuid: "reported",
    applicationName: "versecraft",
    knownDeploymentIds: new Set(),
  });
  assert.equal(selected?.deployment_uuid, "reported");
  assert.equal(deploymentStatus(selected), "in_progress");
});

test("falls back to the newest unseen deployment for the target application", () => {
  const selected = selectTriggeredDeployment(
    [
      { deployment_uuid: "old", application_name: "versecraft", status: "in_progress", created_at: "2026-07-19T14:00:00Z" },
      { deployment_uuid: "new", application_name: "versecraft", status: "queued", created_at: "2026-07-19T14:02:00Z" },
      { deployment_uuid: "other", application_name: "preview", status: "queued", created_at: "2026-07-19T14:03:00Z" },
    ],
    {
      expectedUuid: "unresolvable-response-id",
      applicationName: "versecraft",
      knownDeploymentIds: new Set(["old"]),
    }
  );

  assert.equal(selected?.deployment_uuid, "new");
});

test("does not select an already-known deployment as a synthetic retry target", () => {
  const selected = selectTriggeredDeployment(
    [{ deployment_uuid: "old", application_name: "versecraft", status: "in_progress" }],
    {
      expectedUuid: "unresolvable-response-id",
      applicationName: "versecraft",
      knownDeploymentIds: new Set(["old"]),
    }
  );
  assert.equal(selected, null);
});
