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
    });
    expect([200, 500]).toContain(overview.status());
    if (overview.status() === 200) {
      const body = await overview.json();
      expect(body).toHaveProperty("cards");
      expect(body).toHaveProperty("range");
    }

    const realtime = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
    });
    expect([200, 500]).toContain(realtime.status());

    const aiReport = await request.post("/api/admin/ai-insights?range=7d", {
      headers: { Cookie: cookie },
    });
    expect([200, 500]).toContain(aiReport.status());
    const aiBody = await aiReport.json();
    if (aiReport.status() === 200) {
      expect(aiBody).toHaveProperty("output");
      expect(aiBody).toHaveProperty("input");
    } else {
      expect(aiBody).toHaveProperty("degraded");
    }
  });
});

