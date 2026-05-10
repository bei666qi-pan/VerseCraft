import { expect, test, type Page } from "@playwright/test";

test.use({
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) " +
    "Mobile/15E148 MicroMessenger/8.0.0 Language/zh_CN",
});

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

const options = ["靠近铁牌查看痕迹", "检查学生电子表", "沿血手印方向前进", "先躲进旁边教室"];

const defaultProfessionState = {
  currentProfession: null,
  unlockedProfessions: [],
  eligibilityByProfession: {
    守灯人: false,
    巡迹客: false,
    觅兆者: false,
    齐日角: false,
    溯源师: false,
  },
  progressByProfession: {
    守灯人: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_lampkeeper", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    巡迹客: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_pathfinder", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    觅兆者: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_omenseeker", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    齐日角: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_sunhorn", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    溯源师: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_traceorigin", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
  },
  activePerks: [],
  professionFlags: {},
  professionCooldowns: {},
};

async function seedPlayState(page: Page, story: string, actionOptions: string[]) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, story: st, actionOptions: ao, professionState }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

      await new Promise<void>((resolve, reject) => {
        const logs = [{ role: "assistant", content: st }];
        const state = {
          currentSaveSlot: "main_slot",
          saveSlots: {
            main_slot: {
              logs,
              currentOptions: ao,
              time: { day: 0, hour: 0 },
              stats: { sanity: 30, agility: 18, luck: 16, charm: 14, background: 12 },
              inventory: [],
              warehouse: [],
              codex: {},
              historicalMaxSanity: 30,
              originium: 12,
              tasks: [],
              playerLocation: "B1_SafeZone",
              talent: null,
              talentCooldowns: {},
              professionState,
            },
          },
          isGameStarted: true,
          playerName: "WebView 传输测试者",
          gender: "未说明",
          logs,
          currentOptions: ao,
          recentOptions: ao,
          inputMode: "options",
          stats: { sanity: 30, agility: 18, luck: 16, charm: 14, background: 12 },
          historicalMaxSanity: 30,
          time: { day: 0, hour: 0 },
          playerLocation: "B1_SafeZone",
          codex: {},
          tasks: [],
          warehouse: [],
          journalClues: [],
          weaponBag: [],
          activeMenu: null,
          talent: null,
          talentCooldowns: {},
          professionState,
        };

        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(JSON.stringify({ state, version: 1 }), key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    {
      dbName: DB_NAME,
      storeName: STORE_NAME,
      key: KEY_MAIN,
      story,
      actionOptions,
      professionState: defaultProfessionState,
    }
  );
}

async function installChatMock(page: Page) {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "x-versecraft-request-id": "e2e_webview_req_1",
      },
      body:
        `data: __VERSECRAFT_STATUS__:${JSON.stringify({ stage: "generating", message: "生成中", requestId: "e2e_webview_req_1" })}\n\n` +
        `data: __VERSECRAFT_FINAL__:${JSON.stringify({
          is_action_legal: true,
          sanity_damage: 0,
          narrative: "你靠近铁牌，锈迹下浮出一道新的划痕。雾声短暂后退，给你留下继续判断的余地。",
          is_death: false,
          consumes_time: false,
          options,
        })}\n\n`,
    });
  });
}

test.describe("in-app browser SSE transport (XHR path)", () => {
  test("main chat uses legacy transport and commits narrative + options", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const clientErrors: string[] = [];
    page.on("pageerror", (error) => clientErrors.push(error.message));

    const opening = "雾声贴着墙根流动，安全中枢的灯光像潮水一样忽明忽暗。";
    await seedPlayState(page, opening, options);
    await installChatMock(page);

    const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });

    const ua = await page.evaluate(() => navigator.userAgent);
    expect(ua.toLowerCase()).toContain("micromessenger");

    await page.getByTestId("manual-action-input").fill("查看铁牌");
    await page.getByTestId("send-action-button").click();

    await expect
      .poll(() => page.getByTestId("mobile-story-viewport").innerText(), { timeout: 20_000 })
      .toContain("你靠近铁牌，锈迹下浮出一道新的划痕");

    await page.getByTestId("options-toggle-button").click();
    await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
    await expect(page.getByTestId("mobile-option-item")).toHaveCount(options.length);

    expect(clientErrors, `page errors: ${clientErrors.join("; ")}`).toHaveLength(0);
  });
});
