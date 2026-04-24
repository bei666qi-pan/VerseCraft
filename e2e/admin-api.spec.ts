import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = createHmac("sha256", `${Date.now()}-${Math.random()}`)
    .update(adminPassword)
    .digest("base64url")
    .slice(0, 24);
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.describe("Admin API integration", () => {
  test.setTimeout(90_000);

  test("unauthorized requests should be rejected", async ({ request }) => {
    const targets = [
      "/api/admin/overview?range=7d",
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
      const data = body.ok === true && body.data !== undefined ? (body.data as Record<string, unknown>) : body;
      expect(data).toHaveProperty("cards");
      expect(data).toHaveProperty("range");
    }

    const realtime = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    expect([200, 500]).toContain(realtime.status());

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
  });
});

