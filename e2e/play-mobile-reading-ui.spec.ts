import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

const narrative = [
  "海雾像未散的梦，将码头与灯塔都裹进潮湿的沉默里。",
  "你站在锈蚀的船杆边，手里攥着那封没有署名的信。",
  "信纸被水汽浸得微皱，墨迹却依旧清晰，像总在雾港等待，带着忧恨望的答案。",
].join("\n\n");

const options = [
  "靠近铁牌查看痕迹",
  "检查学生电子表",
  "沿血手印方向前进",
  "先躲进旁边教室",
];

async function seedPlayableState(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, story, actionOptions }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.put(
          JSON.stringify({
            state: {
              currentSaveSlot: "main_slot",
              saveSlots: {},
              isGameStarted: true,
              playerName: "测试读者",
              gender: "未说明",
              logs: [{ role: "assistant", content: story }],
              currentOptions: actionOptions,
              recentOptions: actionOptions,
              inputMode: "options",
              stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 },
              time: { day: 1, hour: 20 },
              playerLocation: "1F_Lobby",
              codex: {},
              tasks: [],
              warehouse: [],
              journalClues: [],
              weaponBag: [],
              activeMenu: null,
            },
            version: 1,
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
    { dbName: DB_NAME, storeName: STORE_NAME, key: KEY_MAIN, story: narrative, actionOptions: options }
  );
}

test.describe("mobile reading UI", () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ]) {
    test(`matches collapsed and expanded option states at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await seedPlayableState(page);

      const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);

      await expect(page.getByTestId("mobile-reading-shell")).toBeVisible();
      await expect(page.getByTestId("mobile-reading-header")).toContainText("VerseCraft");
      await expect(page.getByTestId("mobile-reading-header")).toContainText("第六章：雾港来信");
      await expect(page.getByTestId("mobile-story-viewport")).toBeVisible();
      await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
      await expect(page.getByTestId("echo-talent-button")).toBeVisible();
      await expect(page.getByTestId("manual-action-input")).toBeVisible();
      await expect(page.getByTestId("options-toggle-button")).toBeVisible();
      await expect(page.getByTestId("send-action-button")).toBeVisible();
      await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
      await expect(page.getByTestId("bottom-nav-character")).toBeVisible();
      await expect(page.getByTestId("bottom-nav-story")).toBeVisible();
      await expect(page.getByTestId("bottom-nav-codex")).toBeVisible();
      await expect(page.getByTestId("bottom-nav-settings")).toBeVisible();
      await expect(page.getByText(options[0])).toHaveCount(0);
      await expect(page.getByText("当前为选项模式，请直接点击上方选项推进文本")).toHaveCount(0);
      await expect(page.getByText("提交")).toHaveCount(0);

      await page.getByTestId("options-toggle-button").click();
      await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
      await expect(page.getByTestId("mobile-option-item")).toHaveCount(4);
      for (const option of options) {
        await expect(page.getByText(option)).toBeVisible();
      }
      await expect(page.getByTestId("options-toggle-button")).toHaveAttribute("aria-pressed", "true");

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("centers the phone shell on desktop without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await seedPlayableState(page);

    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);

    const shell = page.getByTestId("mobile-reading-shell");
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(482);
    expect(box?.x ?? 0).toBeGreaterThan(300);
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("keeps core controls visible in landscape", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await seedPlayableState(page);

    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);

    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByTestId("mobile-story-viewport")).toBeVisible();
    await expect(page.getByTestId("manual-action-input")).toBeVisible();
    await expect(page.getByTestId("send-action-button")).toBeVisible();
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
