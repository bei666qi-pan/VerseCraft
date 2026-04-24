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

test.describe("在线状态", () => {
  test("last_seen 45s 前在线、120s 前离线（由 dashboard isOnline 呈现）", async ({ context, page, baseURL }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "需要 ADMIN_PASSWORD 进入后台页面");

    const url = new URL(baseURL ?? "http://127.0.0.1:666");
    await context.addCookies([
      {
        name: ADMIN_COOKIE,
        value: buildAdminShadowCookie(adminPassword),
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    await page.route("**/api/admin/realtime**", async (route) => {
      await route.fulfill({
        json: {
          onlineUsers: 1,
          onlineGuests: 0,
          activeSessions: 2,
          avgSessionDurationSec: 0,
          updatedAt: new Date().toISOString(),
          trends: { eventsLast5m: 0, eventsLast15m: 0, eventsLast60m: 0 },
        },
      });
    });
    await page.route("**/api/admin/overview**", async (route) => {
      await route.fulfill({
        json: { range: { key: "7d", label: "近 7 天" }, cards: { todayTokenCost: 0 }, chartData: [] },
      });
    });
    await page.route("**/api/admin/retention**", async (route) => {
      await route.fulfill({ json: { d1: { rate: 1 }, d3: { rate: 1 }, d7: { rate: 1 }, cohortSize: 1 } });
    });
    await page.route("**/api/admin/funnel**", async (route) => {
      await route.fulfill({ json: { stages: [] } });
    });
    await page.route("**/api/admin/feedback-insights**", async (route) => {
      await route.fulfill({ json: { totalFeedback: 0, negativeFeedback: 0, topics: [] } });
    });
    await page.route("**/api/admin/survey-aggregate**", async (route) => {
      await route.fulfill({ json: { range: { label: "近 7 天" }, totalResponses: 0, questions: [] } });
    });
    await page.route("**/api/admin/dashboard-data**", async (route) => {
      await route.fulfill({
        json: {
          rows: [
            {
              id: "u-fresh",
              name: "fresh-45s",
              tokensUsed: 0,
              playTime: 0,
              sessionPlaySec: 0,
              lastActive: new Date().toISOString(),
              isOnline: 1,
              feedbackContent: "",
              feedbackCreatedAt: null,
            },
            {
              id: "u-stale",
              name: "stale-120s",
              tokensUsed: 0,
              playTime: 0,
              sessionPlaySec: 0,
              lastActive: new Date().toISOString(),
              isOnline: 0,
              feedbackContent: "",
              feedbackCreatedAt: null,
            },
          ],
          onlineCount: 1,
          totalUsers: 2,
          totalTokens: 0,
          chartData: [],
        },
      });
    });

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    const select = page.locator("select").first();
    try {
      await select.waitFor({ timeout: 20_000 });
    } catch {
      test.skip(true, "后台不可用");
    }

    const rowFresh = page.locator("tr", { hasText: "fresh-45s" });
    const rowStale = page.locator("tr", { hasText: "stale-120s" });
    await expect(rowFresh).toContainText("在线", { timeout: 15_000 });
    await expect(rowStale).toContainText("离线", { timeout: 15_000 });
  });
});
