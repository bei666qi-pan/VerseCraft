import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import {
  buildPreviewAccessSession,
  getPreviewAccessCookieName,
  type PreviewAccessEnv,
} from "@/lib/previewAccess";

function withEnv(patch: Record<string, string | undefined>, fn: () => void | Promise<void>): Promise<void> | void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) {
    prev[k] = process.env[k];
    const v = patch[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }

  const restore = () => {
    for (const k of Object.keys(patch)) {
      const old = prev[k];
      if (old === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = old;
      }
    }
  };

  try {
    const result = fn();
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).finally(restore);
    }
    restore();
    return undefined;
  } catch (error) {
    restore();
    throw error;
  }
}

const PREVIEW_ENV = {
  PREVIEW_ACCESS_ENABLED: "true",
  PREVIEW_ACCESS_HOSTS: "preview.versecraft.cn",
  PREVIEW_ACCESS_PASSWORD: "preview-password",
  PREVIEW_ACCESS_COOKIE_SECRET: "preview-cookie-secret-at-least-32-chars",
};

let requestCount = 0;

function makeRequest(path: string, host: string, init: RequestInit = {}) {
  requestCount += 1;
  const headers = new Headers(init.headers);
  headers.set("host", host);
  headers.set("x-forwarded-for", `198.51.100.${requestCount}`);
  return new NextRequest(`https://${host}${path}`, {
    ...init,
    headers,
  });
}

test("middleware redirects unauthorized preview pages to preview access", () =>
  withEnv(PREVIEW_ENV, async () => {
    const res = await middleware(makeRequest("/play?from=test", "preview.versecraft.cn"));
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    const location = res.headers.get("location");
    assert.ok(location);
    const url = new URL(location);
    assert.equal(url.pathname, "/preview-access");
    assert.equal(url.searchParams.get("next"), "/play?from=test");
  }));

test("middleware returns 401 JSON for unauthorized preview API requests", async () =>
  withEnv(PREVIEW_ENV, async () => {
    const res = await middleware(makeRequest("/api/build-id", "preview.versecraft.cn"));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.deepEqual(await res.json(), { error: "preview_access_required" });
  }));

test("middleware allows preview health check without preview cookie", () =>
  withEnv(PREVIEW_ENV, async () => {
    const res = await middleware(makeRequest("/api/health", "preview.versecraft.cn"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(res.headers.get("x-middleware-next"), "1");
  }));

test("middleware noindexes preview host even when the password gate is disabled", () =>
  withEnv({ PREVIEW_ACCESS_ENABLED: "false" }, async () => {
    const res = await middleware(makeRequest("/play", "preview.versecraft.cn"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(res.headers.get("x-middleware-next"), "1");
  }));

test("middleware does not noindex arbitrary configured hosts when gate is disabled", () =>
  withEnv(
    {
      PREVIEW_ACCESS_ENABLED: "false",
      PREVIEW_ACCESS_HOSTS: "versecraft.cn",
    },
    async () => {
      const res = await middleware(makeRequest("/play", "versecraft.cn"));
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-robots-tag"), null);
      assert.equal(res.headers.get("x-middleware-next"), "1");
    }
  ));

test("middleware does not enable preview gate on production host", () =>
  withEnv(PREVIEW_ENV, async () => {
    const res = await middleware(makeRequest("/play", "versecraft.cn"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-robots-tag"), null);
    assert.equal(res.headers.get("x-middleware-next"), "1");
  }));

test("middleware accepts a valid preview access cookie", () =>
  withEnv(PREVIEW_ENV, async () => {
    const env: PreviewAccessEnv = {
      password: PREVIEW_ENV.PREVIEW_ACCESS_PASSWORD,
      cookieSecret: PREVIEW_ENV.PREVIEW_ACCESS_COOKIE_SECRET,
      maxAgeSeconds: 60,
    };
    const session = await buildPreviewAccessSession({ env });
    assert.ok(session);
    const headers = new Headers({
      cookie: `${getPreviewAccessCookieName(env)}=${session.value}`,
    });
    const res = await middleware(makeRequest("/play", "preview.versecraft.cn", { headers }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.equal(res.headers.get("x-middleware-next"), "1");
  }));

test("middleware rejects preview hosts when gate secrets are missing", async () =>
  withEnv(
    {
      PREVIEW_ACCESS_ENABLED: "true",
      PREVIEW_ACCESS_HOSTS: "preview.versecraft.cn",
      PREVIEW_ACCESS_PASSWORD: undefined,
      PREVIEW_ACCESS_COOKIE_SECRET: undefined,
    },
    async () => {
      const res = await middleware(makeRequest("/api/build-id", "preview.versecraft.cn"));
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: "preview_access_not_configured" });
    }
  ));
