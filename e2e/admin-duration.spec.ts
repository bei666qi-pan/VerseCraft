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

function envelope(data: unknown) {
  return { ok: true, degraded: false, reason: null, data };
}

test.describe("Admin duration rendering", () => {
  test("renders 3661 seconds with stable hour-minute-second order", async ({ context, page, baseURL }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "requires ADMIN_PASSWORD to enter the admin page");

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
        json: envelope({
          range: { key: "7d", label: "近 7 日" },
          cards: {
            totalUsers: 1,
            totalTokens: 0,
            online: 1,
            dau: 1,
            wau: 1,
            mau: 1,
            feedbackCountRange: 0,
            playDurationRangeSec: 3661,
          },
          kpis: [],
          chartData: [],
          updatedAt: new Date().toISOString(),
        }),
      });
    });
    await page.route("**/api/admin/player-journey**", async (route) => {
      await route.fulfill({
        json: envelope({ sampleSize: 0, evidenceSufficiency: "insufficient", stages: [], updatedAt: new Date().toISOString() }),
      });
    });
    await page.route("**/api/admin/ai-experience**", async (route) => {
      await route.fulfill({
        json: envelope({ sampleSize: 0, evidenceSufficiency: "insufficient", metrics: [], rates: {}, cost: { highCostActors: [] }, updatedAt: new Date().toISOString() }),
      });
    });
    await page.route("**/api/admin/content-quality**", async (route) => {
      await route.fulfill({
        json: envelope({ evidenceSufficiency: "insufficient", worldSelections: [], feedbackTopics: [], updatedAt: new Date().toISOString() }),
      });
    });
    await page.route("**/api/admin/survey-aggregate**", async (route) => {
      await route.fulfill({
        json: envelope({ evidenceSufficiency: "insufficient", totalResponses: 0, completionFunnel: [], perQuestionDropoff: [], textThemes: [], lowRatingSamples: [], recommendScoreDistribution: [], segmentBreakdown: { actorType: [], platform: [], experienceStage: [] } }),
      });
    });
    await page.route("**/api/admin/system-health**", async (route) => {
      await route.fulfill({
        json: envelope({ checks: {}, updatedAt: new Date().toISOString(), deployment: { commitSha: "test", nodeEnv: "test" } }),
      });
    });
    await page.route("**/api/admin/audit-logs**", async (route) => {
      await route.fulfill({ json: envelope({ rows: [], nextCursor: null, hasMore: false }) });
    });
    await page.route("**/api/admin/users**", async (route) => {
      await route.fulfill({
        json: envelope({
          rows: [
            {
              actorKey: "user:duration-user",
              name: "duration-user",
              actorType: "registered",
              tokensUsed: 0,
              playTime: 3661,
              lastActive: new Date().toISOString(),
              isOnline: true,
            },
          ],
          nextCursor: null,
          hasMore: false,
          totalApprox: 1,
          limit: 20,
        }),
      });
    });

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("select").first().waitFor({ timeout: 20_000 });
    await expect(page.locator("body")).toContainText(/1\s*小时\s*1\s*分\s*1\s*秒/, { timeout: 20_000 });

    await page.getByRole("button", { name: /玩家明细/ }).click();
    await expect(page.getByText("duration-user", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="admin-user-table-panel"]')).toContainText(/1\s*小时\s*1\s*分\s*1\s*秒/);
  });
});
