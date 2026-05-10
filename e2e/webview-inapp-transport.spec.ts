import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

const options = ["靠近铁牌查看痕迹", "检查学生电子表", "沿血手印方向前进", "先躲进旁边教室"];
const mainNarrative = "你靠近铁牌，锈迹下浮出一道新的划痕。雾声短暂后退，给你留下继续判断的余地。";

const IN_APP_BROWSER_CASES = [
  {
    name: "WeChat MicroMessenger",
    uaSubstring: "micromessenger",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) " +
      "Mobile/15E148 MicroMessenger/8.0.0 Language/zh_CN",
  },
  {
    name: "QQ Browser shell",
    uaSubstring: "qqbrowser",
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; zh-cn; Pixel 6 Build/SP2A.220405.004) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Version/4.0 Chrome/98.0.4758.87 QQBrowser/14.0 Mobile Safari/537.36",
  },
  {
    name: "Quark",
    uaSubstring: "quark",
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; zh-CN) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 " +
      "Chrome/112.0.0.0 Quark/7.2.0.650 Mobile Safari/537.36",
  },
  {
    name: "Baidu app",
    uaSubstring: "baiduboxapp",
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; zh-CN) AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Version/4.0 Chrome/96.0.4664.45 Mobile Safari/537.36 baiduboxapp/13.40.0.10",
  },
] as const;

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
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = route.request().postDataJSON() as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }
    const isOptionsOnly = parsedBody?.clientPurpose === "options_regen_only";
    const finalPayload = isOptionsOnly
      ? {
          ok: true,
          reason: "options_regen_ok",
          options,
          debug_reason_codes: [],
        }
      : {
          is_action_legal: true,
          sanity_damage: 0,
          narrative: mainNarrative,
          is_death: false,
          consumes_time: false,
          options,
        };
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "x-versecraft-request-id": "e2e_webview_req_1",
      },
      body:
        `data: __VERSECRAFT_STATUS__:${JSON.stringify({ stage: "generating", message: "生成中", requestId: "e2e_webview_req_1" })}\n\n` +
        `data: __VERSECRAFT_FINAL__:${JSON.stringify(finalPayload)}\n\n`,
    });
  });
}

async function blockFetchForChatEndpoint(page: Page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    (window as unknown as { __vcFetchChatCalls?: number }).__vcFetchChatCalls = 0;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === "string" || input instanceof URL
          ? String(input)
          : input && typeof input === "object" && "url" in input
            ? String(input.url)
            : "";
      const path = new URL(rawUrl, window.location.href).pathname;
      if (path === "/api/chat") {
        (window as unknown as { __vcFetchChatCalls?: number }).__vcFetchChatCalls =
          ((window as unknown as { __vcFetchChatCalls?: number }).__vcFetchChatCalls ?? 0) + 1;
        return Promise.reject(new Error("fetch /api/chat must not be used in legacy in-app transport"));
      }
      return nativeFetch(input, init);
    }) as typeof window.fetch;
  });
}

async function expectNoFetchChatCalls(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __vcFetchChatCalls?: number }).__vcFetchChatCalls ?? 0))
    .toBe(0);
}

async function runXHRTransportScenario(page: Page, uaSubstring: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  await blockFetchForChatEndpoint(page);

  const opening = "雾声贴着墙根流动，安全中枢的灯光像潮水一样忽明忽暗。";
  await seedPlayState(page, opening, options);
  await installChatMock(page);

  const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });

  const ua = await page.evaluate(() => navigator.userAgent);
  expect(ua.toLowerCase()).toContain(uaSubstring);

  await page.getByTestId("manual-action-input").fill("查看铁牌");
  await page.getByTestId("send-action-button").click();

  await expect
    .poll(() => page.getByTestId("mobile-story-viewport").innerText(), { timeout: 20_000 })
    .toContain(mainNarrative);

  await page.getByTestId("options-toggle-button").click();
  await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
  await expect(page.getByTestId("mobile-option-item")).toHaveCount(options.length);
  await expectNoFetchChatCalls(page);

  expect(clientErrors, `page errors: ${clientErrors.join("; ")}`).toHaveLength(0);
}

async function runXHROptionsRegenScenario(page: Page, uaSubstring: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  await blockFetchForChatEndpoint(page);

  const opening = "雾声贴着墙根流动，安全中枢的灯光像潮水一样忽明忽暗。";
  await seedPlayState(page, opening, []);
  await installChatMock(page);

  const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });

  const ua = await page.evaluate(() => navigator.userAgent);
  expect(ua.toLowerCase()).toContain(uaSubstring);

  await page.getByTestId("options-toggle-button").click();
  await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("mobile-option-item")).toHaveCount(options.length, { timeout: 20_000 });
  await expectNoFetchChatCalls(page);

  expect(clientErrors, `page errors: ${clientErrors.join("; ")}`).toHaveLength(0);
}

test.describe("in-app browser SSE transport (XHR path)", () => {
  for (const browserCase of IN_APP_BROWSER_CASES) {
    test.describe(browserCase.name, () => {
      test.use({ userAgent: browserCase.userAgent });

      test("main chat uses legacy transport and commits narrative + options", async ({ page }) => {
        await runXHRTransportScenario(page, browserCase.uaSubstring);
      });

      test("options regen uses legacy transport and commits generated options", async ({ page }) => {
        await runXHROptionsRegenScenario(page, browserCase.uaSubstring);
      });
    });
  }
});

test.describe("fetch stream compatibility fallback", () => {
  test("main chat commits full SSE text when Response.body is unavailable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlayState(page, "走廊灯光贴着墙根晃动。", options);
    await page.addInitScript(
      ({ narrative, actionOptions }) => {
        const nativeFetch = window.fetch.bind(window);
        window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          const rawUrl =
            typeof input === "string" || input instanceof URL
              ? String(input)
              : input && typeof input === "object" && "url" in input
                ? String(input.url)
                : "";
          const path = new URL(rawUrl, window.location.href).pathname;
          if (path !== "/api/chat") return nativeFetch(input, init);
          const payload = {
            is_action_legal: true,
            sanity_damage: 0,
            narrative,
            is_death: false,
            consumes_time: false,
            options: actionOptions,
          };
          const text =
            `data: __VERSECRAFT_STATUS__:${JSON.stringify({ stage: "generating", requestId: "body_null_req" })}\n\n` +
            `data: __VERSECRAFT_FINAL__:${JSON.stringify(payload)}\n\n`;
          return Promise.resolve({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: new Headers({
              "content-type": "text/event-stream; charset=utf-8",
              "x-versecraft-request-id": "body_null_req",
            }),
            body: null,
            text: async () => text,
          } as Response);
        }) as typeof window.fetch;
      },
      { narrative: mainNarrative, actionOptions: options }
    );

    await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("manual-action-input").fill("查看铁牌");
    await page.getByTestId("send-action-button").click();
    await expect
      .poll(() => page.getByTestId("mobile-story-viewport").innerText(), { timeout: 20_000 })
      .toContain(mainNarrative);
  });
});
