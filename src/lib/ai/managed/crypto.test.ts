import assert from "node:assert/strict";
import test from "node:test";
import { decryptApiKey, encryptApiKey, keyLastFour } from "./crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");
test("managed API keys round-trip with record-bound AAD", () => {
  const encrypted = encryptApiKey("sk-secret-7K2P", "svc_1", KEY);
  assert.equal(decryptApiKey(encrypted, "svc_1", KEY), "sk-secret-7K2P");
  assert.equal(keyLastFour("sk-secret-7K2P"), "7K2P");
});
test("managed API key rejects wrong record and tampering", () => {
  const encrypted = encryptApiKey("secret", "svc_1", KEY);
  assert.throws(() => decryptApiKey(encrypted, "svc_2", KEY));
  assert.throws(() => decryptApiKey(`${encrypted.slice(0, -1)}A`, "svc_1", KEY));
});
