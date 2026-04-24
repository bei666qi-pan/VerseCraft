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

test.describe("Admin duration rendering", () => {
  test("renders 3661 seconds with stable hour-minute-second order", async ({ context, page, baseURL }) => {
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

    await page.route("**/api/admin/overview**", async (route) => {
      await route.fulfill({
        json: {
          range: { key: "7d", label: "近 7 天" },
          cards: {
            todayNewUsers: 0,
            dau: 1,
            wau: 1,
            mau: 1,
            todayTokenCost: 0,
            playDurationRangeSec: 450,
            legacyUsersPlayTimeSecSum: 100,
            sessionPlayLiveSecSum: 450,
          },
          chartData: [],
        },
      });
    });
    await page.route("**/api/admin/realtime**", async (route) => {
      await route.fulfill({
        json: {
          onlineUsers: 1,
          onlineGuests: 0,
          activeSessions: 1,
          avgSessionDurationSec: 3661,
          trends: { eventsLast5m: 0, eventsLast15m: 0 },
        },
      });
    });
    await page.route("**/api/admin/dashboard-data**", async (route) => {
      await route.fulfill({
        json: {
          rows: [
            {
              id: "duration-user",
              name: "duration-user",
              tokensUsed: 0,
              playTime: 3661,
              sessionPlaySec: 300,
              lastActive: new Date().toISOString(),
              isOnline: 1,
              feedbackContent: "",
              feedbackCreatedAt: null,
              latestGameMaxFloor: 1,
              latestGameSurvivalSec: 3661,
            },
            {
              id: "session-user-2",
              name: "session-user-2",
              tokensUsed: 0,
              playTime: 0,
              sessionPlaySec: 150,
              lastActive: new Date().toISOString(),
              isOnline: 0,
              feedbackContent: "",
              feedbackCreatedAt: null,
              latestGameMaxFloor: null,
              latestGameSurvivalSec: null,
            },
          ],
          onlineCount: 1,
          totalUsers: 1,
          totalTokens: 0,
          chartData: [],
        },
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

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    const dashboardRangeSelect = page.locator("select").first();
    const fallbackRetryLink = page.locator('a[href="/saiduhsa"]').first();
    try {
      await dashboardRangeSelect.waitFor({ timeout: 20_000 });
    } catch (error) {
      if (await fallbackRetryLink.isVisible().catch(() => false)) {
        test.skip(true, "后台 SSR 数据源不可用，无法进入 dashboard 验证浏览器渲染");
      }
      throw error;
    }

    await expect(page.getByText("1 小时 1 分 1 秒").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("5 分 0 秒").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("2 分 30 秒").first()).toBeVisible({ timeout: 10_000 });
  });
});
