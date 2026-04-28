import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const screenshotDir = join(process.cwd(), ".runtime-data", "ui-reference-verify");

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("home and create paper reference UI", () => {
  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    test(`home matches paper shell at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?e2e=1");

      await expect(page.getByTestId("home-paper-page")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("文界工坊")).toBeVisible();
      await expect(page.getByText("锻造可能，实现梦想")).toBeVisible();
      await expect(page.getByTestId("home-start-new-button")).toBeVisible();
      await expect(page.getByTestId("home-continue-button")).toBeVisible();
      await expect(page.getByTestId("home-start-new-button")).toBeEnabled();
      await expect(page.getByTestId("home-continue-button")).toBeEnabled();
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: join(screenshotDir, `home-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });

    test(`create matches paper form at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/create?e2e=1");

      await expect(page.getByTestId("create-character-page")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("quick-create-character")).toBeVisible();
      await expect(page.getByText("基础档案")).toBeVisible();
      await expect(page.getByText("潜能赋予")).toBeVisible();
      await expect(page.getByTestId("create-remaining-points")).toBeVisible();
      await expect(page.getByTestId("create-submit-button")).toBeVisible();
      await expect(page.getByTestId("create-submit-button")).toBeDisabled();
      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: join(screenshotDir, `create-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });

      await page.getByTestId("quick-create-character").click();
      await expect(page.getByTestId("create-submit-button")).toBeEnabled();
    });
  }

  test("writes reference-sized high DPR screenshots", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 470, height: 836 },
      deviceScaleFactor: 2,
      isMobile: true,
    });
    const page = await context.newPage();

    await page.goto("/?e2e=1");
    await expect(page.getByTestId("home-paper-page")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: join(screenshotDir, "home-reference-dpr.png"),
      fullPage: false,
    });

    await page.goto("/create?e2e=1");
    await expect(page.getByTestId("create-character-page")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: join(screenshotDir, "create-reference-dpr.png"),
      fullPage: false,
    });
    await page.screenshot({
      path: join(screenshotDir, "create-reference-full-dpr.png"),
      fullPage: true,
    });

    await context.close();
  });
});
