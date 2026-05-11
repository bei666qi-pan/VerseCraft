// src/lib/security/http.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  isCrossSiteStateChangingRequest,
  hasPotentialHeaderInjection,
  isSuspiciousPath,
} from "@/lib/security/http";

function makeReq(method: string, headers: Record<string, string>): any {
  return {
    method,
    headers: new Map(Object.entries(headers)),
    nextUrl: new URL("https://versecraft.example.com/api/chat/queue"),
  };
}

test("isCrossSiteStateChangingRequest passes same-origin fetch site", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "same-origin",
        "origin": "https://versecraft.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest passes same-site fetch site with matching origin", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "same-site",
        "origin": "https://versecraft.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest blocks same-site fetch site with mismatched origin", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "same-site",
        "origin": "https://other.example.com",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest blocks explicit cross-site", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "cross-site",
        "origin": "https://evil.example.com",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest allows sec-fetch-site:none with matching origin", () => {
  // Some in-app WebViews (WeChat/QQ/Quark/Baidu) send sec-fetch-site: none
  // for same-origin fetch/XHR. This must NOT be treated as cross-site.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "https://versecraft.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest blocks sec-fetch-site:none with mismatched origin", () => {
  // When sec-fetch-site is "none" AND origin doesn't match, still block.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "https://evil.example.com",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest passes when sec-fetch-site is missing and origin matches", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "origin": "https://versecraft.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest passes GET without check", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("GET", {
        "sec-fetch-site": "cross-site",
        "origin": "https://evil.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest passes when both headers are missing", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", { "host": "versecraft.example.com" })
    ),
    false
  );
});

// Regression: in-app browsers sending case-variant sec-fetch-site
test("isCrossSiteStateChangingRequest handles uppercase sec-fetch-site", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "CROSS-SITE",
        "origin": "https://evil.example.com",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "SAME-ORIGIN",
        "origin": "https://versecraft.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest handles whitespace in sec-fetch-site", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": " same-origin ",
        "origin": "https://versecraft.example.com",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("hasPotentialHeaderInjection detects CRLF", () => {
  assert.equal(hasPotentialHeaderInjection("safe"), false);
  assert.equal(hasPotentialHeaderInjection("bad\r\n"), true);
  assert.equal(hasPotentialHeaderInjection("bad\n"), true);
});

test("isSuspiciousPath detects traversal", () => {
  assert.equal(isSuspiciousPath("/api/chat"), false);
  assert.equal(isSuspiciousPath("/../etc/passwd"), true);
});
