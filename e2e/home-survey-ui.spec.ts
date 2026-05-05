import { expect, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("home product survey", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    test(`uses mobile paper survey style at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/?e2e=1", { waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect(page.getByTestId("home-paper-page")).toBeVisible({ timeout: 30_000 });

      await page.getByLabel("产品问卷").click();
      const modal = page.getByTestId("home-survey-paper-modal");
      await expect(modal).toBeVisible();
      await expect(modal.getByRole("heading", { name: "产品问卷" })).toBeVisible();
      await expect(modal.getByText("进度")).toBeVisible({ timeout: 15_000 });
      await expect(modal.locator("select")).toBeVisible();
      await expect(modal.getByRole("link", { name: "用户协议" })).toBeVisible();
      await expect(modal.getByRole("link", { name: "隐私政策" })).toBeVisible();

      const metrics = await modal.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return {
          bg: getComputedStyle(node).backgroundColor,
          radius: Number.parseFloat(getComputedStyle(node).borderTopLeftRadius),
          left: rect.left,
          right: rect.right,
        };
      });
      expect(metrics.bg).toContain("0.96");
      expect(metrics.radius).toBeGreaterThanOrEqual(28);
      expect(metrics.left).toBeGreaterThanOrEqual(0);
      expect(metrics.right).toBeLessThanOrEqual(viewport.width);
      await expectNoHorizontalOverflow(page);
    });
  }
});
