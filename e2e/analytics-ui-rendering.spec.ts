import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = randomUUID().replace(/-/g, "");
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

const RANGES = ["today", "yesterday", "7d", "30d"] as const;

test.describe("Admin dashboard UI rendering — no NaN/undefined/null", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ context, page, baseURL }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(
      !adminPassword,
      "需要 ADMIN_PASSWORD 以进入后台页面",
    );

    const url = new URL(baseURL ?? "http://[::1]:666");
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

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    // 等待 dashboard 加载完成：存在范围选择 <select>
    const dashboardRangeSelect = page.locator("select").first();
    const fallbackRetryLink = page.locator('a[href="/saiduhsa"]').first();
    try {
      await dashboardRangeSelect.waitFor({ timeout: 20_000 });
    } catch {
      await fallbackRetryLink.waitFor({ timeout: 20_000 });
    }

    expect(
      errors.length,
      `page errors: ${errors.join(" | ")}`,
    ).toBe(0);
  });

  function assertNoNaN(pageText: string, context: string): void {
    const lower = pageText.toLowerCase();
    const hasNan = lower.includes("nan");
    const hasUndefined = lower.includes("undefined");
    const hasNull = lower.includes("null");
    if (hasNan) {
      // 提取附近文本用于定位
      const idx = lower.indexOf("nan");
      const snippet = pageText.slice(Math.max(0, idx - 30), idx + 30);
      throw new Error(
        `[${context}] 发现 "NaN": "${snippet}"`,
      );
    }
    if (hasUndefined) {
      const idx = lower.indexOf("undefined");
      const snippet = pageText.slice(Math.max(0, idx - 30), idx + 30);
      throw new Error(
        `[${context}] 发现 "undefined": "${snippet}"`,
      );
    }
    if (hasNull) {
      // "null" 可能出现在正常文本中（如 "nullable"），做更严格的检查
      // 检查是否为独立单词 "null"
      if (/\bnull\b/i.test(pageText)) {
        const idx = lower.search(/\bnull\b/);
        const snippet = pageText.slice(Math.max(0, idx - 20), idx + 20);
        throw new Error(
          `[${context}] 发现独立 "null": "${snippet}"`,
        );
      }
    }
  }

  async function switchTab(page: ReturnType<typeof test["info"]> extends never ? never : ReturnType<typeof test["info"]>["page"], tabName: string): Promise<void> {
    // 使用精确文本匹配的按钮
    const tabButton = page.locator("nav button", {
      hasText: tabName,
    });
    await tabButton.click();
    // 等待 tab 内容区域渲染
    await page.waitForTimeout(500);
  }

  test("Overview tab: all KPI card values are valid", async ({ page }) => {
    // 默认在总览 tab — 等待 KPIs 渲染
    await page.waitForSelector("section.space-y-4", { timeout: 10_000 });
    await page.waitForTimeout(500);

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "总览");
  });

  test("Date range switch: no NaN after switching ranges", async ({ page }) => {
    // 等待初始 dashboard 渲染
    await page.waitForSelector("select", { timeout: 10_000 });

    const rangeSelect = page.locator("select").first();

    for (const range of RANGES) {
      await rangeSelect.selectOption(range);
      // 等待数据刷新
      await page.waitForTimeout(1500);

      const bodyText = await page.textContent("main");
      expect(bodyText).toBeTruthy();
      assertNoNaN(bodyText!, `range=${range}`);
    }
  });

  test("Player journey tab: funnel percentages are valid", async ({ page }) => {
    await switchTab(page as any, "玩家旅程");
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "玩家旅程");
  });

  test("AI experience tab: rates are valid", async ({ page }) => {
    await switchTab(page as any, "AI 体验");
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "AI 体验");
  });

  test("Content quality tab: percentage values are valid", async ({ page }) => {
    await switchTab(page as any, "内容质量");
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "内容质量");
  });

  test("Event health tab: ratios are proper numbers", async ({ page }) => {
    await switchTab(page as any, "数据质量");
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "数据质量");
  });

  test("System health tab: online count and capacity are numbers", async ({ page }) => {
    await switchTab(page as any, "系统健康");
    await page.waitForTimeout(1500);

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "系统健康");
  });

  test("Users tab: user list renders without NaN in columns", async ({ page }) => {
    await switchTab(page as any, "玩家 / 游客");
    await page.waitForTimeout(2000);

    // 等待用户表格渲染（可能有数据也可能显示"暂无用户数据"）
    const tablePanel = page.locator('[data-testid="admin-user-table-panel"]');
    await tablePanel.waitFor({ timeout: 10_000 });

    const bodyText = await page.textContent("main");
    expect(bodyText).toBeTruthy();
    assertNoNaN(bodyText!, "玩家 / 游客");
  });
});
