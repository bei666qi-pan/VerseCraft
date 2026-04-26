import { expect, test, type Page } from "@playwright/test";

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

const longNarrative = Array.from({ length: 14 }, (_, index) =>
  `第 ${index + 1} 段：雾声贴着墙根流动，安全中枢的灯光像潮水一样忽明忽暗。你把指尖按在门框上，能感觉到某种轻微的震动仍在继续。`
).join("\n\n");

async function seedScrollablePlayState(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, story, actionOptions, professionState }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

      await new Promise<void>((resolve, reject) => {
        const logs = [{ role: "assistant", content: story }];
        const state = {
          currentSaveSlot: "main_slot",
          saveSlots: {
            main_slot: {
              logs,
              currentOptions: actionOptions,
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
          playerName: "移动滚动测试者",
          gender: "未说明",
          logs,
          currentOptions: actionOptions,
          recentOptions: actionOptions,
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
      story: longNarrative,
      actionOptions: options,
      professionState: defaultProfessionState,
    }
  );
}

async function installChatMock(page: Page) {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body:
        `data: __VERSECRAFT_STATUS__:{"stage":"generating"}\n\n` +
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

async function openSeededPlay(page: Page) {
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => clientErrors.push(error.message));
  await seedScrollablePlayState(page);
  await installChatMock(page);
  const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response?.status()).toBeLessThan(500);
  try {
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    const body = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
    console.log("mobile browser chrome openSeededPlay failure", {
      url: page.url(),
      clientErrors,
      body: body.slice(0, 500),
    });
    throw error;
  }
}

test.describe("mobile browser chrome compatibility", () => {
  test("uses document scrolling instead of an internal story scroller", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page);

    const metrics = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      const story = document.querySelector<HTMLElement>('[data-testid="play-story-document"]');
      const shell = document.querySelector<HTMLElement>('[data-testid="mobile-reading-shell"]');
      const header = document.querySelector<HTMLElement>('[data-testid="mobile-reading-header"]');
      const dock = document.querySelector<HTMLElement>('[data-testid="mobile-action-dock"]');
      const nav = document.querySelector<HTMLElement>('[data-testid="mobile-bottom-nav"]');
      if (!story || !shell || !header || !dock || !nav) throw new Error("mobile reading controls missing");

      window.scrollTo(0, Math.floor(root.scrollHeight / 2));

      return {
        bodyClass: document.body.classList.contains("vc-play-reading-page"),
        htmlClass: document.documentElement.classList.contains("vc-play-reading-page"),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        htmlBg: getComputedStyle(document.documentElement).backgroundColor,
        shellBg: getComputedStyle(shell).backgroundImage,
        rootScrollHeight: root.scrollHeight,
        innerHeight: window.innerHeight,
        scrollY: window.scrollY,
        documentScrollWidth: document.documentElement.scrollWidth,
        storyOverflowY: getComputedStyle(story).overflowY,
        storyIsInternalScroller:
          story.scrollHeight > story.clientHeight && ["auto", "scroll"].includes(getComputedStyle(story).overflowY),
        headerPosition: getComputedStyle(header).position,
        dockPosition: getComputedStyle(dock).position,
        navPosition: getComputedStyle(nav).position,
      };
    });

    expect(metrics.htmlClass).toBe(true);
    expect(metrics.bodyClass).toBe(true);
    expect(metrics.bodyBg).not.toBe("rgb(255, 255, 255)");
    expect(metrics.htmlBg).not.toBe("rgb(255, 255, 255)");
    expect(metrics.shellBg).toContain("linear-gradient");
    expect(metrics.rootScrollHeight).toBeGreaterThan(metrics.innerHeight + 200);
    expect(metrics.scrollY).toBeGreaterThan(0);
    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(391);
    expect(metrics.storyOverflowY).not.toBe("scroll");
    expect(metrics.storyOverflowY).not.toBe("auto");
    expect(metrics.storyIsInternalScroller).toBe(false);
    expect(metrics.headerPosition).toBe("sticky");
    expect(metrics.dockPosition).toBe("fixed");
    expect(metrics.navPosition).toBe("fixed");
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    test(`keeps controls usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openSeededPlay(page);

      await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
      await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
      await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();

      await page.getByTestId("options-toggle-button").click();
      await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
      await page.getByTestId("options-toggle-button").click();
      await expect(page.getByTestId("mobile-options-dropdown")).toHaveCount(0);

      await page.getByTestId("manual-action-input").fill("查看铁牌");
      await page.getByTestId("send-action-button").click();
      await expect(page.getByText("Application error")).toHaveCount(0);

      const layout = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        dockVisible: Boolean(document.querySelector('[data-testid="mobile-action-dock"]')),
        navVisible: Boolean(document.querySelector('[data-testid="mobile-bottom-nav"]')),
      }));
      expect(layout.horizontalOverflow).toBe(false);
      expect(layout.dockVisible).toBe(true);
      expect(layout.navVisible).toBe(true);
    });
  }
});
