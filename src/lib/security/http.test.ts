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

// --- Referer fallback for in-app WebViews ---

test("isCrossSiteStateChangingRequest allows sec-fetch-site:none + Origin:null with same-origin Referer", () => {
  // WeChat/QQ WebView: opaque origin + same-origin referer → not cross-site.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "null",
        "referer": "https://versecraft.example.com/play",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest blocks sec-fetch-site:none + Origin:null with cross-site Referer", () => {
  // In-app WebView with opaque origin but referer pointing to an external site → block.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "null",
        "referer": "https://evil.example.com/page",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest allows Origin matching x-forwarded-host + x-forwarded-proto", () => {
  // Reverse-proxy: browser sends origin for the public host; server sees x-forwarded-*.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "https://public.versecraft.example.com",
        "host": "internal.local",
        "x-forwarded-host": "public.versecraft.example.com",
        "x-forwarded-proto": "https",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest blocks Origin mismatching all candidate origins", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "https://evil.example.com",
        "host": "versecraft.example.com",
        "x-forwarded-host": "public.versecraft.example.com",
        "x-forwarded-proto": "https",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest allows missing Origin with same-origin Referer", () => {
  // Some in-app browsers omit Origin but include a same-origin Referer.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "referer": "https://versecraft.example.com/play",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest blocks missing Origin with cross-site Referer", () => {
  // No Origin but Referer is cross-site → block.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "referer": "https://evil.example.com/page",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest allows sec-fetch-site:none + no Origin + no Referer", () => {
  // Most permissive fallback: privacy-sensitive browsers that suppress
  // both Origin and Referer. Allow as same-origin (XHR/fetch + credentials: include
  // already enforces same-origin at the browser level).
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "host": "versecraft.example.com",
      })
    ),
    false
  );
});

test("isCrossSiteStateChangingRequest still blocks explicit cross-site regardless of Referer", () => {
  // sec-fetch-site:cross-site must always be blocked.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "cross-site",
        "origin": "https://versecraft.example.com",
        "referer": "https://versecraft.example.com/play",
        "host": "versecraft.example.com",
      })
    ),
    true
  );
});

test("isCrossSiteStateChangingRequest allows Origin:null with http Referer after HTTPS redirect", () => {
  // Browser was redirected from HTTP to HTTPS by reverse proxy.
  // Referer retains the original http:// scheme, which must still match
  // a candidate origin for the Referer fallback to work.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "none",
        "origin": "null",
        "referer": "http://versecraft.example.com/play",
        "host": "versecraft.example.com",
        "x-forwarded-host": "versecraft.example.com",
        "x-forwarded-proto": "https",
      })
    ),
    false
  );
});
