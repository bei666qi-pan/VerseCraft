import assert from "node:assert/strict";
import test from "node:test";
import { assertResolvedAddressesSafe, completionEndpoint, embeddingEndpoint, isRestrictedIp, parseManagedServiceUrl } from "./urlSafety";

test("managed service URL rejects credentials, insecure production URLs and restricted IPs", () => {
  assert.throws(() => parseManagedServiceUrl("https://u:p@example.com"));
  assert.throws(() => parseManagedServiceUrl("http://example.com"));
  assert.throws(() => parseManagedServiceUrl("https://127.0.0.1"));
  assert.equal(parseManagedServiceUrl("https://api.example.com/v1").hostname, "api.example.com");
  assert.equal(parseManagedServiceUrl("http://127.0.0.1:3000", { allowLocalhost: true }).port, "3000");
});
test("restricted IP and endpoint normalization cover managed transports", () => {
  assert.equal(isRestrictedIp("10.1.2.3"), true);
  assert.equal(isRestrictedIp("8.8.8.8"), false);
  assert.equal(completionEndpoint("https://api.example.com/v1"), "https://api.example.com/v1/chat/completions");
  assert.equal(embeddingEndpoint("https://ark.example.com", "ark_multimodal"), "https://ark.example.com/api/v3/embeddings/multimodal");
});

test("DNS rebinding is rejected when any resolved address is restricted", () => {
  assert.doesNotThrow(() => assertResolvedAddressesSafe([{ address: "8.8.8.8" }, { address: "1.1.1.1" }]));
  assert.throws(
    () => assertResolvedAddressesSafe([{ address: "8.8.8.8" }, { address: "169.254.169.254" }]),
    /service_url_restricted/,
  );
  assert.throws(() => assertResolvedAddressesSafe([]), /service_url_dns_empty/);
});
