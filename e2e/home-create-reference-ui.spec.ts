import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotDir = join(process.cwd(), ".runtime-data", "ui-reference-verify");
const KEY_MAIN = "versecraft-storage";
const HOME_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const n = Number.parseInt(normalized, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function expectFixedPaperChrome(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? ""))
    .toBe("#f7f3ec");

  const metrics = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      innerHeight: window.innerHeight,
      scrollHeight: root.scrollHeight,
    };
  });
  const expectedRgb = hexToRgb("#f7f3ec");
  expect(metrics.bodyBg).toBe(expectedRgb);
  expect(metrics.htmlBg).toBe(expectedRgb);
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight + 1);
}

async function gotoAndExpectTestId(page: Page, url: string, testId: string) {
  await page.goto(url);
  const root = page.getByTestId(testId);
  try {
    await expect(root).toBeVisible({ timeout: 30_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(root).toBeVisible({ timeout: 30_000 });
  }
}

async function seedPlayableHomeSave(page: Page) {
  const updatedAt = new Date("2026-04-28T08:59:00.000Z").toISOString();
  const saveSlot = {
    historicalMaxSanity: 100,
    time: { day: 0, hour: 0 },
    inventory: [],
    logs: [{ id: "seed-home-log", type: "system", content: "首页继续行动视觉验证", timestamp: updatedAt }],
    tasks: [{ id: "seed-task", status: "active", title: "继续探索" }],
    playerLocation: "B1_SafeZone",
    slotMeta: {
      slotId: "main_slot",
      label: "主线存档",
      updatedAt,
      snapshotSummary: {
        day: 0,
        hour: 0,
        playerLocation: "B1_SafeZone",
        activeTasksCount: 1,
      },
    },
  };
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    {
      key: KEY_MAIN,
      value: JSON.stringify({
        state: {
          currentSaveSlot: "main_slot",
          saveSlots: { main_slot: saveSlot },
          user: null,
          guestId: "guest_home_e2e",
          isGuest: true,
          isHydrated: false,
        },
        version: 1,
      }),
    }
  );
}

test.describe("paper reference UI", () => {
  test.setTimeout(60_000);

  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  for (const viewport of HOME_VIEWPORTS) {
    test(`home without save hides continue at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await gotoAndExpectTestId(page, "/?e2e=1", "home-paper-page");
      await expect(page.getByRole("heading", { name: "文界工坊" })).toBeVisible();
      await expect(page.getByTestId("home-start-new-button")).toBeVisible();
      await expect(page.getByTestId("home-start-new-button")).toBeEnabled();
      await expect(page.getByTestId("home-continue-button")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "湘ICP备2025143231号-2" })).toHaveAttribute(
        "href",
        "https://beian.miit.gov.cn"
      );
      await expectNoHorizontalOverflow(page);
      await expectFixedPaperChrome(page);

      await page.screenshot({
        path: join(screenshotDir, `home-no-save-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });

    test(`home with save matches paper shell at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedPlayableHomeSave(page);
      await gotoAndExpectTestId(page, "/?e2e=1", "home-paper-page");
      await expect(page.getByText("本机留有可继续的记录。登录后可云端备份。")).toBeVisible();
      await expect(page.getByRole("heading", { name: "文界工坊" })).toBeVisible();
      await expect(page.getByTestId("home-start-new-button")).toBeVisible();
      await expect(page.getByTestId("home-continue-button")).toBeVisible();
      await expect(page.getByTestId("home-start-new-button")).toBeEnabled();
      await expect(page.getByTestId("home-continue-button")).toBeEnabled();
      await expect(page.getByText("QQ群 377493954")).toBeVisible();
      const footer = page.locator("footer");
      await expect(footer.getByRole("link", { name: "用户协议" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "隐私政策" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "联系我们" })).toBeVisible();
      await expect(footer.getByRole("button", { name: "阅读反馈 / 举报" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "内容规范" })).toBeVisible();
      await expect(footer.getByRole("link", { name: "湘ICP备2025143231号-2" })).toHaveAttribute(
        "href",
        "https://beian.miit.gov.cn"
      );
      await expectNoHorizontalOverflow(page);
      await expectFixedPaperChrome(page);

      await page.screenshot({
        path: join(screenshotDir, `home-with-save-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
    });

    test(`create matches paper form at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await gotoAndExpectTestId(page, "/create?e2e=1", "create-character-page");
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

  test("home continue with local save enters play instead of create", async ({ page }) => {
    const clientErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") clientErrors.push(msg.text());
    });
    page.on("pageerror", (error) => {
      clientErrors.push(error.message);
    });

    await page.setViewportSize(HOME_VIEWPORTS[0]!);
    await seedPlayableHomeSave(page);
    await gotoAndExpectTestId(page, "/?e2e=1", "home-paper-page");
    await page.getByTestId("home-continue-button").click();
    await expect(page.getByTestId("home-continue-record-modal")).toBeVisible();
    await expect(page.getByTestId("home-continue-record-row")).toHaveCount(1);
    await expect(page).not.toHaveURL(/\/create(?:$|[?#/])/);

    await page.getByTestId("home-continue-confirm-button").click();
    await expect(page).toHaveURL(/\/play(?:$|[?#/])/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/create(?:$|[?#/])/);
    expect(clientErrors.filter((message) => message.includes("localTs"))).toEqual([]);
  });

  test("writes reference-sized high DPR screenshots", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 470, height: 836 },
      deviceScaleFactor: 2,
      isMobile: true,
    });
    const page = await context.newPage();

    await gotoAndExpectTestId(page, "/?e2e=1", "home-paper-page");
    await page.screenshot({
      path: join(screenshotDir, "home-reference-dpr.png"),
      fullPage: false,
    });

    await gotoAndExpectTestId(page, "/create?e2e=1", "create-character-page");
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
