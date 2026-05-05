import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const ACHIEVEMENTS_KEY = "versecraft-achievements";

async function seedLocalHistory(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(
          JSON.stringify({
            state: {
              records: [
                {
                  survivalTimeText: "0 日 14 时",
                  grade: "E",
                  kills: 0,
                  maxFloor: 0,
                  maxFloorDisplay: "地下一层",
                  reviewLine1: "雾线仍在安全区外徘徊。",
                  reviewLine2: "",
                  createdAt: Date.parse("2026-05-05T10:00:00.000Z"),
                },
                {
                  survivalTimeText: "1 日 2 时",
                  grade: "C",
                  kills: 1,
                  maxFloor: 2,
                  maxFloorDisplay: "第二层",
                  reviewLine1: "你带回了一段可复盘的异常记录。",
                  reviewLine2: "",
                  createdAt: Date.parse("2026-05-05T11:00:00.000Z"),
                },
              ],
            },
            version: 0,
          }),
          key
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    { dbName: DB_NAME, storeName: STORE_NAME, key: ACHIEVEMENTS_KEY }
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("history UI", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    test(`renders local history in paper style at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedLocalHistory(page);

      await page.goto("/history", { waitUntil: "domcontentloaded", timeout: 45_000 });
      await expect(page.getByTestId("history-page")).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole("heading", { name: "历史记录" })).toBeVisible();
      await expect(page.getByTestId("history-record-card")).toHaveCount(2);
      await expect(page.getByText("存活时间").first()).toBeVisible();
      await expect(page.getByText("消灭诡异").first()).toBeVisible();
      await expect(page.getByText("最高抵达").first()).toBeVisible();
      await expect(page.getByTestId("history-close")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("home trophy icon opens history and old leaderboard hash is inert", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/?e2e=1#home-leaderboard", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.getByTestId("home-paper-page")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#home-leaderboard")).toHaveCount(0);
    await expect(page.getByText("排行榜")).toHaveCount(0);

    await page.getByLabel("打开历史记录").click();
    await expect(page).toHaveURL(/\/history(?:$|[?#/])/, { timeout: 15_000 });
    await expect(page.getByTestId("history-page")).toBeVisible();
  });
});
