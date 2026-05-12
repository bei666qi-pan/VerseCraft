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

test.describe("Admin survey display", () => {
  test("renders full question distribution and player survey answers", async ({ context, page, baseURL }) => {
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
      await route.fulfill({ json: envelope({ cards: {}, kpis: [], chartData: [], updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/player-journey**", async (route) => {
      await route.fulfill({ json: envelope({ sampleSize: 0, evidenceSufficiency: "insufficient", stages: [], updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/ai-experience**", async (route) => {
      await route.fulfill({ json: envelope({ sampleSize: 0, evidenceSufficiency: "insufficient", metrics: [], rates: {}, cost: { highCostActors: [] }, updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/content-quality**", async (route) => {
      await route.fulfill({ json: envelope({ evidenceSufficiency: "insufficient", worldSelections: [], feedbackTopics: [], updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/event-health**", async (route) => {
      await route.fulfill({ json: envelope({ totalEvents: 0, rates: {}, eventsByName: [], eventCoverage: [], updatedAt: new Date().toISOString() }) });
    });
    await page.route("**/api/admin/system-health**", async (route) => {
      await route.fulfill({ json: envelope({ checks: {}, updatedAt: new Date().toISOString(), deployment: { commitSha: "test", nodeEnv: "test" } }) });
    });
    await page.route("**/api/admin/audit-logs**", async (route) => {
      await route.fulfill({ json: envelope({ rows: [], nextCursor: null, hasMore: false }) });
    });
    await page.route("**/api/admin/survey-aggregate**", async (route) => {
      await route.fulfill({
        json: envelope({
          evidenceSufficiency: "insufficient",
          totalResponses: 2,
          questions: [
            {
              id: "discoverySource",
              title: "你从哪里知道 VerseCraft？",
              kind: "single",
              sampleCount: 2,
              options: [{ value: "friend", label: "朋友推荐", count: 2, pct: 100 }],
            },
            { id: "topFixOne", title: "最优先修复的问题", kind: "text", sampleCount: 2, textCount: 1 },
          ],
          completionFunnel: [{ eventName: "survey_submitted", label: "提交成功", count: 2, stepConversionRate: 1, totalConversionRate: 1 }],
          perQuestionDropoff: [{ questionId: "discoverySource", title: "你从哪里知道 VerseCraft？", stepIndex: 0, viewed: 2, nextCount: 2, dropOffCount: 0, dropOffRate: 0 }],
          textThemes: [{ theme: "等待太久", count: 1, pct: 50 }],
          lowRatingSamples: [],
          recommendScoreDistribution: [{ bucket: "very_willing", label: "很愿意", count: 2, pct: 100 }],
          segmentBreakdown: {
            actorType: [{ segment: "guest", count: 2, pct: 100 }],
            platform: [{ segment: "mobile", count: 2, pct: 100 }],
            experienceStage: [{ segment: "first_time", label: "第一次来", count: 2, pct: 100 }],
          },
        }),
      });
    });
    await page.route("**/api/admin/users?**", async (route) => {
      await route.fulfill({
        json: envelope({
          rows: [
            {
              actorKey: "g:survey-user",
              name: "游客1001",
              actorType: "guest",
              tokensUsed: 42,
              playTime: 60,
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
    await page.route("**/api/admin/users/**", async (route) => {
      await route.fulfill({
        json: envelope({
          actorKey: "g:survey-user",
          basic: { name: "游客1001", actorType: "guest", tokensUsed: 42, playTime: 60, lastActive: new Date().toISOString() },
          riskTags: [],
          suggestedOpsActions: [],
          recentFeedback: [],
          recentSurvey: [
            {
              surveyKey: "product_research_home",
              surveyVersion: "1.3.0",
              overallRating: 3,
              recommendScore: null,
              createdAt: new Date().toISOString(),
              answerSummary: [
                { questionId: "discoverySource", title: "你从哪里知道 VerseCraft？", kind: "single", value: "friend", label: "朋友推荐", filled: true },
                { questionId: "topFixOne", title: "如果只能让你提一个最该优先修掉的问题，你会写什么？", kind: "text", value: "等待太久", label: "等待太久", filled: true },
              ],
              openTextSummary: ["等待太久"],
            },
          ],
          recentEvents: [],
          contentPath: { worlds: [], chapters: [], npcs: [] },
          aiExperience: { requestCount: 0, avgLatency: 0, failureCount: 0, fallbackCount: 0, slowRequestCount: 0, tokenCost: 42 },
        }),
      });
    });

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("select").first().waitFor({ timeout: 20_000 });

    await page.getByRole("button", { name: /问卷与反馈/ }).click();
    await expect(page.getByTestId("admin-survey-question-distribution")).toContainText("你从哪里知道 VerseCraft？");
    await expect(page.getByTestId("admin-survey-question-distribution")).toContainText("朋友推荐");
    await expect(page.getByTestId("admin-survey-question-distribution")).toContainText("有效文本 1 / 样本 2");
    await expect(page.getByText("游客", { exact: true })).toBeVisible();
    await expect(page.getByText("mobile")).toBeVisible();

    await page.getByRole("button", { name: /玩家明细/ }).click();
    await page.getByRole("button", { name: "查看" }).click();
    await expect(page.getByText("最近问卷")).toBeVisible();
    await expect(page.getByText("朋友推荐").last()).toBeVisible();
    await expect(page.getByText("开放文本：等待太久")).toBeVisible();
  });
});
