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

const referenceLikeNarrative = [
  "等我再睁开眼的时候，头顶是一根快坏掉的灯管。",
  "它一明一灭，发出低低的嗡鸣，像某种濒死生物最后的喘息。",
  "我躺在冰冷潮湿的水泥地上，后脑还在一阵阵发疼，掌心按进灰里，摸到细碎的砂石和一点湿冷的水迹。空气里有霉味，夹杂铁锈味，还有一丝淡得几乎察觉不到的机油味。",
  "我动了动手指，关节有些僵硬，但能活动，应该是没断。",
].join("\n\n");

async function seedStoryState(page: Page) {
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
        const baseState = {
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
          playerName: "视觉测试者",
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
        tx.objectStore(storeName).put(JSON.stringify({ state: baseState, version: 1 }), key);
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
      story: referenceLikeNarrative,
      actionOptions: options,
      professionState: defaultProfessionState,
    }
  );
}

test.describe("mobile story visual alignment", () => {
  test("matches the reference-style immersive story state at 390x844", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedStoryState(page);
    const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(response?.status()).toBeLessThan(500);

    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mobile-reading-header")).toHaveCount(0);
    await expect(page.getByTestId("chapter-header-pill")).toHaveCount(0);
    await expect(page.getByTestId("manual-action-input")).toHaveAttribute("placeholder", "输入下一步行动或命令");
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("等我再睁开眼的时候")).toBeVisible();

    const metrics = await page.evaluate(() => {
      const story = document.querySelector<HTMLElement>('[data-testid="play-story-document"]');
      const firstPara = story?.querySelector<HTMLElement>("p");
      const dock = document.querySelector<HTMLElement>('[data-testid="mobile-action-dock"]');
      const nav = document.querySelector<HTMLElement>('[data-testid="mobile-bottom-nav"]');
      if (!story || !firstPara || !dock || !nav) throw new Error("missing visual targets");
      const storyRect = story.getBoundingClientRect();
      const firstRect = firstPara.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const firstStyle = getComputedStyle(firstPara);
      return {
        storyTop: firstRect.top,
        storyLeft: firstRect.left,
        fontSize: Number.parseFloat(firstStyle.fontSize),
        lineHeight: Number.parseFloat(firstStyle.lineHeight),
        color: firstStyle.color,
        dockBottom: Math.round(window.innerHeight - dockRect.bottom),
        navBottom: Math.round(window.innerHeight - navRect.bottom),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });

    expect(metrics.storyTop).toBeGreaterThanOrEqual(58);
    expect(metrics.storyTop).toBeLessThanOrEqual(78);
    expect(metrics.storyLeft).toBeGreaterThanOrEqual(28);
    expect(metrics.storyLeft).toBeLessThanOrEqual(36);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(21);
    expect(metrics.fontSize).toBeLessThanOrEqual(23);
    expect(metrics.lineHeight / metrics.fontSize).toBeGreaterThan(2);
    expect(metrics.color).not.toBe("rgb(255, 255, 255)");
    expect(metrics.dockBottom).toBeGreaterThan(70);
    expect(metrics.navBottom).toBe(0);
    expect(metrics.horizontalOverflow).toBe(false);

    const collapsedPath = test.info().outputPath("story-reference-collapsed-390.png");
    await page.screenshot({ path: collapsedPath, fullPage: false });
    test.info().annotations.push({ type: "screenshot", description: collapsedPath });

    await page.getByTestId("options-toggle-button").click();
    await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
    const expandedPath = test.info().outputPath("story-reference-expanded-390.png");
    await page.screenshot({ path: expandedPath, fullPage: false });
    test.info().annotations.push({ type: "screenshot", description: expandedPath });
  });
});
