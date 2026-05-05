import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
  expect(metrics.docScrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const n = Number.parseInt(normalized, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function expectFixedMobileChrome(page: Page, themeColor: string) {
  await expect
    .poll(() => page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? ""))
    .toBe(themeColor);

  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      innerHeight: window.innerHeight,
      scrollHeight: root.scrollHeight,
    };
  });
  const expectedRgb = hexToRgb(themeColor);
  expect(metrics.bodyBg).toBe(expectedRgb);
  expect(metrics.htmlBg).toBe(expectedRgb);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
}

test.describe("intro world selector UI", () => {
  for (const viewport of viewports) {
    test(`matches the mobile world selector shell at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const response = await page.goto("/intro", { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(response?.status()).toBeLessThan(500);

      await expect(page.getByText("VerseCraft")).toBeVisible();
      await expect(page.getByRole("heading", { name: "选择世界观" })).toBeVisible();
      await expect(page.getByText("AI 悬疑互动小说")).toBeVisible();
      await expect(page.getByTestId("intro-world-card")).toHaveAttribute("data-world-id", "darkmoon");
      await expect(page.getByTestId("intro-start-create-label")).toHaveText("进入公寓");

      const imageSrc = await page.getByAltText("序章暗月世界观卡片").getAttribute("src");
      expect(imageSrc).toMatch(/^\/assets\/intro\/darkmoon-card-.+\.jpg$/);

      await expectNoHorizontalOverflow(page);
      await expectFixedMobileChrome(page, "#f7f3ed");
    });
  }

  test("supports carousel placeholders, world intro modal, and navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/intro", { waitUntil: "domcontentloaded", timeout: 15_000 });

    await page.getByTestId("intro-world-info").click();
    await expect(page.getByTestId("intro-world-modal")).toBeVisible();
    await expect(page.getByText("你醒在如月公寓 B1 的冷光之下")).toBeVisible();
    await page.getByLabel("关闭世界观介绍").click();
    await expect(page.getByTestId("intro-world-modal")).toHaveCount(0);

    await page.getByTestId("intro-carousel-next").click();
    await expect(page.getByTestId("intro-world-card")).toHaveAttribute("data-world-id", "blank-1");
    await expect(page.getByTestId("intro-start-create")).toBeDisabled();
    await expect(page.getByTestId("intro-start-create-label")).toHaveText("世界观筹备中");
    await expect(page.getByTestId("intro-world-info")).toHaveCount(0);

    await page.getByLabel("切换到第 1 个世界观").click();
    await expect(page.getByTestId("intro-world-card")).toHaveAttribute("data-world-id", "darkmoon");
    await expect(page.getByTestId("intro-start-create")).toBeEnabled();

    await page.getByTestId("intro-start-create").click();
    await expect(page).toHaveURL(/\/create$/);
  });

  test("closes back to the home page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/intro", { waitUntil: "domcontentloaded", timeout: 15_000 });

    await page.getByLabel("关闭").click();
    await expect(page).toHaveURL(/\/$/);
  });
});
