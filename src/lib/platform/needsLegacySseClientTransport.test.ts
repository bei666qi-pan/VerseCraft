// src/lib/platform/needsLegacySseClientTransport.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  needsLegacySseClientTransportFromUserAgent,
  needsLegacySseClientTransportFromUserAgentDataBrands,
  LEGACY_SSE_TRANSPORT_UA_MARKERS,
} from "@/lib/platform/needsLegacySseClientTransport";

test("needsLegacySseClientTransportFromUserAgent matches known in-app browsers", () => {
  assert.equal(needsLegacySseClientTransportFromUserAgent("Mozilla/5.0 MicroMessenger/8.0"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("Mozilla/5.0 baiduboxapp/13.0"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("Quark/6.0 Mobile Safari/537.36"), true);
  assert.equal(needsLegacySseClientTransportFromUserAgent("UCBrowser/15.0"), true);
  assert.equal(
    needsLegacySseClientTransportFromUserAgent(
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/88.0.4324.93 Mobile Safari/537.36 MQQBrowser/14.0"
    ),
    true
  );
  assert.equal(
    needsLegacySseClientTransportFromUserAgent(
      "Mozilla/5.0 (Linux; U; Android 9; en-US; SM-G960F Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 UCBrowser/13.2.0.1122 Mobile Safari/537.36"
    ),
    true
  );
  assert.equal(
    needsLegacySseClientTransportFromUserAgent(
      "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UWS/2.13.1.39 Mobile Safari/537.36 UCWEB/13.2.0.1122"
    ),
    true
  );
  assert.equal(
    needsLegacySseClientTransportFromUserAgent(
      "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 bdbrowser/5.2 Mobile Safari/537.36"
    ),
    true
  );
});

test("needsLegacySseClientTransportFromUserAgent ignores desktop Chrome", () => {
  assert.equal(
    needsLegacySseClientTransportFromUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    false
  );
});

test("needsLegacySseClientTransportFromUserAgentDataBrands detects QQ and UC hints", () => {
  assert.equal(needsLegacySseClientTransportFromUserAgentDataBrands([{ brand: "Google Chrome" }]), false);
  assert.equal(needsLegacySseClientTransportFromUserAgentDataBrands([{ brand: "QQBrowser" }]), true);
  assert.equal(needsLegacySseClientTransportFromUserAgentDataBrands([{ brand: "UCBrowser" }]), true);
  assert.equal(needsLegacySseClientTransportFromUserAgentDataBrands([{ brand: "Quark" }]), true);
});

test("markers list stays conservative (no bare android/chrome)", () => {
  for (const m of LEGACY_SSE_TRANSPORT_UA_MARKERS) {
    assert.equal(m.includes("android"), false);
    assert.equal(m === "chrome", false);
  }
});
