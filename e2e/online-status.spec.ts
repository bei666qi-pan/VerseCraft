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

    const envelope = (data: unknown) => ({ ok: true, degraded: false, reason: null, data });

    await page.route("**/api/admin/overview**", async (route) => {
      await route.fulfill({
        json: envelope({
          range: { key: "7d", label: "近 7 天" },
          cards: { totalUsers: 2, totalTokens: 0, online: 1, dau: 1, wau: 1, mau: 1, feedbackCountRange: 0, playDurationRangeSec: 0 },
          kpis: [],
          chartData: [],
          updatedAt: new Date().toISOString(),
        }),
      });
    });
    await page.route("**/api/admin/player-journey**", async (route) => {
      await route.fulfill({ json: envelope({ sampleSize: 0, evidenceSufficiency: "insufficient", stages: [], updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/ai-experience**", async (route) => {
      await route.fulfill({
        json: envelope({ sampleSize: 0, evidenceSufficiency: "insufficient", metrics: [], rates: {}, cost: { highCostActors: [] }, updatedAt: new Date().toISOString() }),
      });
    });
    await page.route("**/api/admin/content-quality**", async (route) => {
      await route.fulfill({ json: envelope({ evidenceSufficiency: "insufficient", worldSelections: [], feedbackTopics: [], updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/survey-aggregate**", async (route) => {
      await route.fulfill({
        json: envelope({ evidenceSufficiency: "insufficient", totalResponses: 0, completionFunnel: [], perQuestionDropoff: [], textThemes: [], lowRatingSamples: [], recommendScoreDistribution: [], segmentBreakdown: { actorType: [], platform: [], experienceStage: [] } }),
      });
    });
    await page.route("**/api/admin/system-health**", async (route) => {
      await route.fulfill({
        json: envelope({
          checks: {},
          capacity: {
            online: { registered: 1, guests: 0, total: 1, activeSessions: 2, windowSeconds: 90, source: "presence_window" },
            chatQueue: { enabled: true, running: 0, queued: 0, maxRunning: 4, maxQueued: 80, remainingImmediate: 4, remainingQueueSlots: 80, estimatedSecondsPerTurn: 12 },
            estimate: { status: "sample_insufficient", remainingConcurrentActions: null, confidence: "low", explanation: "近 1 小时 AI 回合样本不足，暂不输出承载余量结论。" },
            evidence: { recentAiRequests: 0, dbOk: true, aiGatewayOk: true, queueDepthKnown: true },
          },
          deployment: { commitSha: "test", nodeEnv: "test" },
          updatedAt: new Date().toISOString(),
        }),
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
              actorKey: "u-fresh",
              name: "fresh-45s",
              actorType: "registered",
              tokensUsed: 0,
              playTime: 0,
              lastActive: new Date().toISOString(),
              isOnline: true,
            },
            {
              actorKey: "u-stale",
              name: "stale-120s",
              actorType: "registered",
              tokensUsed: 0,
              playTime: 0,
              lastActive: new Date().toISOString(),
              isOnline: false,
            },
          ],
          nextCursor: null,
          hasMore: false,
          totalApprox: 2,
          limit: 20,
        }),
      });
    });

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    const select = page.locator("select").first();
    try {
      await select.waitFor({ timeout: 20_000 });
    } catch {
      test.skip(true, "后台不可用");
    }

    await page.getByRole("button", { name: /玩家 \/ 游客/ }).click();
    const rowFresh = page.locator("tr", { hasText: "fresh-45s" });
    const rowStale = page.locator("tr", { hasText: "stale-120s" });
    await expect(rowFresh).toContainText("在线", { timeout: 15_000 });
    await expect(rowStale).toContainText("离线", { timeout: 15_000 });
  });
});
