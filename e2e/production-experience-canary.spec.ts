import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const ARTIFACT_DIR = join(process.cwd(), ".runtime-data", "production-experience-canary");
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const;

async function enterPlayableOpening(page: Page): Promise<void> {
  await page.goto("/create?e2e=1", { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.getByTestId("create-character-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("create-character-page").getByTestId("versecraft-brand-mark")).toHaveCount(1);
  await expect(page.getByTestId("quick-create-character").getByTestId("versecraft-brand-mark")).toHaveCount(0);

  await page.getByTestId("quick-create-character").click();
  await page.getByTestId("create-submit-button").click();
  await expect(page).toHaveURL(/\/play(?:$|[?#/])/, { timeout: 30_000 });
  await expect(page.getByTestId("manual-action-input")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("manual-action-input")).toBeEnabled({ timeout: 45_000 });
}

test.describe("production experience canary", () => {
  test.setTimeout(120_000);

  test.beforeAll(() => {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`opening remains playable with one header mark at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);

      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      let optionsRequestId: string | null = null;
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.url().endsWith("/api/chat") && response.request().postData()?.includes('"options_regen_only"')) {
          optionsRequestId = response.headers()["x-versecraft-request-id"] ?? null;
        }
      });

      await enterPlayableOpening(page);

      const header = page.getByTestId("mobile-reading-header");
      await expect(header).toBeVisible();
      await expect(header.getByTestId("versecraft-brand-mark")).toHaveCount(1);
      await expect(page.getByText("Application error")).toHaveCount(0);

      const toggle = page.getByTestId("options-toggle-button");
      if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();

      const options = page.getByTestId("mobile-option-item");
      await expect.poll(() => options.count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
      expect(await options.count()).toBeLessThanOrEqual(4);
      for (const option of await options.all()) await expect(option).toBeEnabled();

      expect(optionsRequestId).toMatch(/^vc_/);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);

      await page.screenshot({
        path: join(ARTIFACT_DIR, `opening-options-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });
  }
});
