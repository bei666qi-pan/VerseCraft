// src/lib/security/http.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  isCrossSiteStateChangingRequest,
  hasPotentialHeaderInjection,
  isSuspiciousPath,
} from "@/lib/security/http";

function makeReq(method: string, headers: Record<string, string>, pathname = "/api/chat/queue"): any {
  return {
    method,
    headers: new Map(Object.entries(headers)),
    nextUrl: new URL(`https://versecraft.example.com${pathname}`),
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

test("isCrossSiteStateChangingRequest allows in-app webview cross-site with same-site referer for api/chat", () => {
  const inAppUAs = [
    // WeChat / QQ (original set)
    "Mozilla/5.0 (Linux; Android 12; zh-cn) AppleWebKit/537.36 Version/4.0 Chrome/98.0.4758.87 MQQBrowser/14.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 MQQBrowser/17.0.0.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 12; rv:109.0) AppleWebKit/537.36 Chrome/109.0.0.0 Mobile Safari/537.36 Quark/8.9.6.1",
    "Mozilla/5.0 (Linux; U; Android 11; zh-cn; MI 9 Build/RKQ1.201112.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/105.0.0.0 baiduboxapp/13.24.0.10",
    // Newly added: Baidu variants
    "Mozilla/5.0 (Linux; Android 13; zh-CN) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 baiduapp/13.45.0.10",
    "Mozilla/5.0 (Linux; Android 11; zh-cn) AppleWebKit/537.36 Chrome/96.0.4664.45 Mobile Safari/537.36 baidubrowser/8.10",
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 bdbrowser/5.2 Mobile Safari/537.36",
    "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 baiduhd/6.8 Mobile",
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 baiduboxapp/13.0 swan/2.0 Mobile Safari/537.36",
    // Newly added: QQ variants
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/88.0.4324.93 Mobile Safari/537.36 MQQBrowser/14.0",
    "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/98.0 Mobile Safari/537.36 TBS/046001 QBCore/4.0",
    "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 QQ/8.9.28 Mobile Safari/537.36",
    // Newly added: WeChat Work
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 wxwork/4.1.0 MicroMessenger/8.0",
    // Newly added: UC Browser
    "Mozilla/5.0 (Linux; U; Android 9; en-US) AppleWebKit/537.36 Version/4.0 UCBrowser/13.2.0.1122 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Version/4.0 Chrome/78.0.3904.108 UWS/2.13.1.39 Mobile Safari/537.36 UCWEB/13.2.0.1122",
    // Newly added: MIUI Browser
    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/112.0.0.0 Mobile Safari/537.36 miuibrowser/16.0",
  ];

  for (const userAgent of inAppUAs) {
    assert.equal(
      isCrossSiteStateChangingRequest(
        makeReq(
          "POST",
          {
            "sec-fetch-site": "cross-site",
            "origin": "https://servicewechat.com",
            "referer": "https://versecraft.example.com/play",
            "host": "versecraft.example.com",
            "user-agent": userAgent,
          },
          "/api/chat"
        )
      ),
      false
    );
  }
});

test("isCrossSiteStateChangingRequest blocks in-app-like UA on non-whitelisted path", () => {
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq(
        "POST",
        {
          "sec-fetch-site": "cross-site",
          "origin": "https://servicewechat.com",
          "referer": "https://versecraft.example.com/play",
          "host": "versecraft.example.com",
          "user-agent": "Mozilla/5.0 (Linux; Android 12) MQQBrowser/14.0",
        },
        "/api/preferences"
      )
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

test("isCrossSiteStateChangingRequest allows sec-fetch-site:cross-site when Origin matches (WebView false positive)", () => {
  // Quark/Baidu etc. may set Sec-Fetch-Site: cross-site even for same-origin POST.
  assert.equal(
    isCrossSiteStateChangingRequest(
      makeReq("POST", {
        "sec-fetch-site": "cross-site",
        "origin": "https://versecraft.example.com",
        "referer": "https://versecraft.example.com/play",
        "host": "versecraft.example.com",
      })
    ),
    false
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
