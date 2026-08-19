import test from "node:test";
import assert from "node:assert/strict";
import { verifySameOrigin } from "./aiManagementSecurity";
import { probeAllBeforeCommit } from "./aiManagementActivation";

test("AI management mutations accept same origin and reject cross origin", () => {
  assert.equal(verifySameOrigin(new Request("https://versecraft.cn/api/admin/ai-management", { headers: { origin: "https://versecraft.cn", "sec-fetch-site": "same-origin" } })), true);
  assert.equal(verifySameOrigin(new Request("https://versecraft.cn/api/admin/ai-management", { headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" } })), false);
});

test("AI service activation never commits when any candidate probe fails", async () => {
  let commits = 0;
  await assert.rejects(() => probeAllBeforeCommit({
    candidates: ["primary", "fallback"],
    probe: async (candidate) => candidate === "fallback" ? { ok: false, reason: "service_test_failed" } : { ok: true },
    commit: async () => { commits += 1; },
  }), /service_test_failed/);
  assert.equal(commits, 0);

  await probeAllBeforeCommit({
    candidates: ["primary", "fallback"],
    probe: async () => ({ ok: true }),
    commit: async () => { commits += 1; },
  });
  assert.equal(commits, 1);
});
