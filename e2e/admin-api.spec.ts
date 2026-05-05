import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = randomUUID().replace(/-/g, "");
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.describe("Admin API integration", () => {
  test.setTimeout(90_000);

  test("unauthorized requests should be rejected", async ({ request }) => {
    const targets = [
      "/api/admin/overview?range=7d",
      "/api/admin/player-journey?range=7d",
      "/api/admin/ai-experience?range=7d",
      "/api/admin/content-quality?range=7d",
      "/api/admin/system-health",
      "/api/admin/users?limit=5",
      "/api/admin/audit-logs?limit=5",
      "/api/admin/realtime",
      "/api/admin/retention?range=7d",
      "/api/admin/funnel?range=7d",
      "/api/admin/feedback-insights?range=7d",
      "/api/admin/ai-insights?range=7d",
    ];
    for (const path of targets) {
      const res = await request.get(path);
      expect(res.status(), `${path} should be 403`).toBe(403);
    }
    const aiPost = await request.post("/api/admin/ai-insights?range=7d");
    expect(aiPost.status()).toBe(403);
    const rebuildPost = await request.post("/api/admin/rebuild-daily?days=1");
    expect(rebuildPost.status()).toBe(403);

    const cronPost = await request.post("/api/admin/cron/rebuild-daily?days=1", {
      headers: { "x-cron-secret": process.env.ADMIN_PASSWORD ?? "wrong" },
    });
    expect(cronPost.status()).toBe(403);
  });

  test("authorized requests should return data or degraded response", async ({ request }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "需要 ADMIN_PASSWORD 以构造 shadow cookie");
    const cookie = `${ADMIN_COOKIE}=${buildAdminShadowCookie(adminPassword)}`;

    const overview = await request.get("/api/admin/overview?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    expect([200, 500]).toContain(overview.status());
    if (overview.status() === 200) {
      const body = (await overview.json()) as Record<string, unknown>;
      const data = body.data !== undefined ? (body.data as Record<string, unknown>) : body;
      expect(data).toHaveProperty("cards");
      expect(data).toHaveProperty("range");
    }

    const realtime = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    expect([200, 500]).toContain(realtime.status());

    const backofficeTargets = [
      "/api/admin/player-journey?range=7d",
      "/api/admin/ai-experience?range=7d",
      "/api/admin/content-quality?range=7d",
      "/api/admin/system-health",
      "/api/admin/users?limit=5",
      "/api/admin/audit-logs?limit=5",
    ];
    for (const path of backofficeTargets) {
      const res = await request.get(path, {
        headers: { Cookie: cookie },
        timeout: 20_000,
      });
      expect([200, 500], `${path} should return an envelope`).toContain(res.status());
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("ok");
      expect(body).toHaveProperty("degraded");
    }

    const aiReport = await request.post("/api/admin/ai-insights?range=7d", {
      headers: { Cookie: cookie },
      timeout: 40_000,
    });
    expect([200, 500]).toContain(aiReport.status());
    const aiBody = (await aiReport.json()) as Record<string, unknown>;
    if (aiReport.status() === 200) {
      if (aiBody.ok === true && aiBody.data != null) {
        const data = aiBody.data as Record<string, unknown>;
        expect(data).toHaveProperty("output");
        expect(data).toHaveProperty("input");
      } else {
        expect(aiBody.ok === false || aiBody.degraded === true).toBeTruthy();
      }
    } else {
      expect(aiBody.ok === false || aiBody.degraded === true).toBeTruthy();
    }

    const rebuild = await request.post("/api/admin/rebuild-daily?days=1", {
      headers: { Cookie: cookie },
      timeout: 30_000,
    });
    expect([200, 500]).toContain(rebuild.status());
    const rebuildBody = (await rebuild.json()) as Record<string, unknown>;
    expect(rebuildBody).toHaveProperty("ok");
    expect(rebuildBody).toHaveProperty("degraded");
  });
});

