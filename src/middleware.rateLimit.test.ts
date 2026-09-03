// src/middleware.rateLimit.test.ts
//
// 回归背景：生产环境曾出现 manifest.webmanifest / `_rsc=` 页面预取 / 普通页面导航
// 被中间件限流误伤，密集返回 429，导致玩家端出现"叙事无法正常加载"的连锁故障
// （客户端在拿不到正常 SSE 响应后走异常兜底路径）。
//
// 根因：
// 1) `config.matcher` 的静态资源后缀白名单里漏掉了 `.webmanifest`，导致
//    `/manifest.webmanifest` 被当成普通页面纳入限流，而不是像 .png/.css/.js 一样直接跳过中间件。
// 2) 页面导航 / RSC 预取与其余零散 `/api/*` 路由共用同一个 10 次/秒的 `generalLimiter`，
//    而一次真实页面打开（文档 + 多个 `_rsc=` 预取 + 静态壳资源）很容易在 1 秒内超过 10 次请求，
//    尤其是共享出口 IP（NAT / 企业网络）场景下更容易被打满。
//
// 本文件锁定修复后的预期行为，防止后续改动无意中回退。
import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy as middleware, config } from "@/proxy";
import {
  VERSECRAFT_CHAT_PURPOSE_HEADER,
  VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY,
} from "@/lib/chatPurpose";
import { CHAT_QUEUE_CLIENT_FINGERPRINT_HEADER } from "@/lib/chatQueue/types";

function makeRequest(path: string, ip: string, init: RequestInit = {}): NextRequest {
  const headers = new Headers(init.headers);
  headers.set("host", "versecraft.cn");
  headers.set("x-forwarded-for", ip);
  return new NextRequest(`https://versecraft.cn${path}`, { ...init, headers });
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(patch)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// --- 1) matcher 静态资源排除规则 -------------------------------------------------

const catchAllPattern = config.matcher[config.matcher.length - 1];
const catchAllRegex = new RegExp(catchAllPattern);

test("middleware matcher excludes manifest.webmanifest so it never enters the rate limiter", () => {
  assert.equal(catchAllRegex.test("/manifest.webmanifest"), false);
});

test("middleware matcher keeps covering normal page routes", () => {
  assert.equal(catchAllRegex.test("/play"), true);
  assert.equal(catchAllRegex.test("/"), true);
  assert.equal(catchAllRegex.test("/intro"), true);
  assert.equal(catchAllRegex.test("/create"), true);
});

test("middleware matcher keeps pre-existing static asset exclusions intact", () => {
  for (const p of ["/icons/icon-192x192.png", "/app.css", "/chunk.js", "/font.woff2", "/data.xml"]) {
    assert.equal(catchAllRegex.test(p), false, `${p} should stay excluded from middleware`);
  }
});

// --- 2) 页面导航 / RSC 预取 使用更宽松的独立桶 -------------------------------------

test("page navigation tolerates a realistic prefetch burst (up to 30/s) without 429", async () => {
  const ip = "203.0.113.10";
  for (let i = 0; i < 30; i++) {
    const path = i % 2 === 0 ? "/play" : "/play?_rsc=abc123";
    const res = await middleware(makeRequest(path, ip));
    assert.equal(res.status, 200, `request #${i + 1} should not be rate limited`);
  }
});

test("page navigation bucket still blocks the 31st request within the same 1s window", async () => {
  const ip = "203.0.113.11";
  for (let i = 0; i < 30; i++) {
    await middleware(makeRequest("/play", ip));
  }
  const res = await middleware(makeRequest("/play", ip));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "rate_limited", message: "请求过于频繁，请稍后再试。" });
});

test("page navigation limiter keys are isolated per IP", async () => {
  const ipA = "203.0.113.20";
  const ipB = "203.0.113.21";
  for (let i = 0; i < 30; i++) {
    await middleware(makeRequest("/play", ipA));
  }
  const exhaustedA = await middleware(makeRequest("/play", ipA));
  assert.equal(exhaustedA.status, 429);

  const freshB = await middleware(makeRequest("/play", ipB));
  assert.equal(freshB.status, 200);
});

// --- 3) 其余零散 /api/* 路由维持原有更严格的限流，未被本次改动放宽 -------------------

test("misc /api/* routes keep the stricter 10/s general limiter unchanged", async () => {
  const ip = "203.0.113.12";
  for (let i = 0; i < 10; i++) {
    const res = await middleware(makeRequest("/api/build-id", ip));
    assert.equal(res.status, 200, `request #${i + 1} should pass`);
  }
  const res = await middleware(makeRequest("/api/build-id", ip));
  assert.equal(res.status, 429);
});

test("page limiter and misc-api limiter are independent buckets", async () => {
  const ip = "203.0.113.13";
  for (let i = 0; i < 10; i++) {
    await middleware(makeRequest("/api/build-id", ip));
  }
  const exhaustedApi = await middleware(makeRequest("/api/build-id", ip));
  assert.equal(exhaustedApi.status, 429);

  // 打满零散 API 桶不应连带影响页面导航桶。
  const pageRes = await middleware(makeRequest("/play", ip));
  assert.equal(pageRes.status, 200);
});

// --- 4) /api/chat 与 /api/chat/queue/* 的专属限流保持不变、互不干扰 -----------------

test("/api/chat keeps its own 20/s limiter, isolated from page navigation traffic", async () => {
  const ip = "203.0.113.14";
  for (let i = 0; i < 30; i++) {
    await middleware(makeRequest("/play", ip));
  }
  const exhaustedPage = await middleware(makeRequest("/play", ip));
  assert.equal(exhaustedPage.status, 429);

  // /api/chat 走独立的 llmLimiter，不受页面桶耗尽影响。
  const chatRes = await middleware(makeRequest("/api/chat", ip, { method: "POST" }));
  assert.equal(chatRes.status, 200);
});

test("/api/chat rate limit remains 20/s", async () => {
  const ip = "203.0.113.15";
  for (let i = 0; i < 20; i++) {
    const response = await middleware(makeRequest("/api/chat", ip, { method: "POST" }));
    assert.equal(response.status, 200, `request #${i + 1} should pass`);
  }
  const exhausted = await middleware(makeRequest("/api/chat", ip, { method: "POST" }));
  assert.equal(exhausted.status, 429);
});

test("a first anonymous chat after visiting /play is isolated from an exhausted shared IP bucket", async () => {
  const ip = "203.0.113.18";
  for (let i = 0; i < 20; i++) {
    const res = await middleware(makeRequest("/api/chat", ip, { method: "POST" }));
    assert.equal(res.status, 200);
  }

  const pageRes = await middleware(makeRequest("/play", ip));
  const browserIdentity = pageRes.cookies.get("versecraft_chat_limit_identity")?.value;
  assert.match(browserIdentity ?? "", /^vcrl_[a-zA-Z0-9_-]{16,96}$/);

  const firstAction = await middleware(makeRequest("/api/chat", ip, {
    method: "POST",
    headers: { cookie: `versecraft_chat_limit_identity=${browserIdentity}` },
  }));
  assert.equal(firstAction.status, 200);
});

test("anonymous chat identity can be disabled for rollback", async () => {
  await withEnv({ VERSECRAFT_ENABLE_ANONYMOUS_CHAT_LIMIT_IDENTITY: "false" }, async () => {
    const res = await middleware(makeRequest("/play", "203.0.113.19"));
    assert.equal(res.cookies.get("versecraft_chat_limit_identity"), undefined);
  });
});

test("options-only chat limit is isolated by browser fingerprint on a shared IP", async () => {
  const ip = "203.0.113.17";
  const headers = (fingerprint: string) => ({
    [VERSECRAFT_CHAT_PURPOSE_HEADER]: VERSECRAFT_CHAT_PURPOSE_OPTIONS_REGEN_ONLY,
    [CHAT_QUEUE_CLIENT_FINGERPRINT_HEADER]: fingerprint,
  });

  for (let i = 0; i < 6; i++) {
    const response = await middleware(makeRequest("/api/chat", ip, {
      method: "POST",
      headers: headers("browser-one-123456"),
    }));
    assert.equal(response.status, 200, `browser one request #${i + 1} should pass`);
  }

  const exhausted = await middleware(makeRequest("/api/chat", ip, {
    method: "POST",
    headers: headers("browser-one-123456"),
  }));
  assert.equal(exhausted.status, 429);

  const otherBrowser = await middleware(makeRequest("/api/chat", ip, {
    method: "POST",
    headers: headers("browser-two-123456"),
  }));
  assert.equal(otherBrowser.status, 200);
});

test("/api/chat/queue/status keeps its own 20/s limiter, separate from the misc-api bucket", async () => {
  const ip = "203.0.113.16";
  for (let i = 0; i < 20; i++) {
    const res = await middleware(makeRequest("/api/chat/queue/status", ip));
    assert.equal(res.status, 200, `request #${i + 1} should pass`);
  }
  const res = await middleware(makeRequest("/api/chat/queue/status", ip));
  assert.equal(res.status, 429);
});
