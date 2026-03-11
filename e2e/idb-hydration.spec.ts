/**
 * IDB Hydration 破坏性测试
 * 验证：脏数据注入后，"读取世界线中..." 不会持续存在，应用能成功水合并进入主界面
 */
import { test, expect } from "@playwright/test";

const LOADING_TEXT = "读取世界线中...";
const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

// 注入脏数据到 IndexedDB（通过 page.evaluate 在浏览器上下文执行）
async function injectDirtyData(
  page: import("@playwright/test").Page,
  scenario: "object" | "malformed"
) {
  return page.evaluate(
    async ({ dbName, storeName, key, scenario: s }) => {
      return new Promise<boolean>((resolve) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, "readwrite");
          const store = tx.objectStore(storeName);
          if (s === "object") {
            store.put({ state: { legacy: true }, version: 0 }, key);
          } else {
            store.put('{"state":{"truncated"', key);
          }
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
        };
      });
    },
    { dbName: DB_NAME, storeName: STORE_NAME, key: KEY_MAIN, scenario }
  );
}

test.describe("IDB Hydration Destructive Tests", () => {
  test("TC1: 注入 Object 脏数据后，加载文本应消失且无持久白屏", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ok = await injectDirtyData(page, "object");
    expect(ok).toBe(true);

    await page.reload();

    const loadingEl = page.getByText(LOADING_TEXT);
    await expect(loadingEl).not.toBeVisible({ timeout: 6000 });
  });

  test("TC2: 注入残缺 JSON 后，应用应恢复默认状态而非卡死", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ok = await injectDirtyData(page, "malformed");
    expect(ok).toBe(true);

    await page.reload();

    const loadingEl = page.getByText(LOADING_TEXT);
    await expect(loadingEl).not.toBeVisible({ timeout: 6000 });
  });

  test("TC3: 路由切换后页面正常渲染无白屏", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const ok = await injectDirtyData(page, "object");
    expect(ok).toBe(true);

    await page.reload();
    await expect(page.getByText(LOADING_TEXT)).not.toBeVisible({
      timeout: 6000,
    });

    await page.goto("/create");
    await page.waitForLoadState("networkidle");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("body")).toBeVisible();
    const loadingStillVisible = await page.getByText(LOADING_TEXT).isVisible();
    expect(loadingStillVisible).toBe(false);
  });
});
