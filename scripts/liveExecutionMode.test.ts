import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { resolveCampaignExecution } from "./liveExecutionMode";

test("reachable probe is labelled live without spending a chat call", async () => {
  const server = createServer((_req, res) => {
    res.statusCode = 405;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const result = await resolveCampaignExecution({ baseUrl: `http://127.0.0.1:${address.port}` });
  assert.equal(result.mode, "live");
  assert.equal(result.reason, "http_405");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("unreachable probe fails closed unless fallback is explicit", async () => {
  await assert.rejects(
    resolveCampaignExecution({ baseUrl: "http://127.0.0.1:1", probeTimeoutMs: 250 }),
    /live SUT unreachable/,
  );
  const degraded = await resolveCampaignExecution({ baseUrl: "http://127.0.0.1:1", probeTimeoutMs: 250, allowMockFallback: true });
  assert.equal(degraded.mode, "live_degraded");
  assert.match(degraded.reason, /^probe_failed:/);
});

