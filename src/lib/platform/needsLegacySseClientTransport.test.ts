// src/lib/platform/needsLegacySseClientTransport.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  needsLegacySseClientTransportFromUserAgent,
  LEGACY_SSE_TRANSPORT_UA_MARKERS,
} from "@/lib/platform/needsLegacySseClientTransport";

test("needsLegacySseClientTransportFromUserAgent matches known in-app browsers", () => {
  assert.equal(needsLegacySseClientTransportFromUserAgent("Mozilla/5.0 MicroMessenger/8.0"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("Mozilla/5.0 baiduboxapp/13.0"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("Quark/6.0 Mobile Safari/537.36"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("UCBrowser/15.0"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("MQQBrowser/14.0"), false);
});

test("needsLegacySseClientTransportFromUserAgent ignores desktop Chrome", () => {
  assert.equal(
    needsLegacySseClientTransportFromUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    false
  );
});

test("markers list stays conservative (no bare android/chrome)", () => {
  for (const m of LEGACY_SSE_TRANSPORT_UA_MARKERS) {
    assert.equal(m.includes("android"), false);
    assert.equal(m === "chrome", false);
  }
});
