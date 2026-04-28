import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

const story = [
  "等我再睁开眼的时候，头顶是一根快坏掉的灯管。",
  "它一明一灭，发出低低的嗡鸣，像某种濒死生物最后的喘息。",
].join("\n\n");

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

function seededChapterState() {
  return {
    currentChapterId: "chapter-2",
    activeChapterId: "chapter-2",
    reviewChapterId: null,
    completedChapterIds: ["chapter-1"],
    unlockedChapterIds: ["chapter-1", "chapter-2"],
    lastChapterEndAt: 1,
    pendingChapterEndId: null,
    progressByChapterId: {
      "chapter-1": {
        chapterId: "chapter-1",
        status: "completed",
        startedAt: 1,
        completedAt: 2,
        turnCount: 4,
        narrativeCharCount: 1200,
        keyChoiceCount: 1,
        completedBeatIds: ["wake", "observe", "first-choice", "first-clue", "hook"],
        stateChangeCount: 1,
        lastObjectiveText: "确认处境",
        startedLogIndex: 0,
        completedLogIndex: 1,
      },
      "chapter-2": {
        chapterId: "chapter-2",
        status: "active",
        startedAt: 3,
        completedAt: null,
        turnCount: 0,
        narrativeCharCount: 0,
        keyChoiceCount: 0,
        completedBeatIds: [],
        stateChangeCount: 0,
        lastObjectiveText: "继续探索",
        startedLogIndex: 1,
        completedLogIndex: null,
      },
    },
    summariesByChapterId: {
      "chapter-1": {
        chapterId: "chapter-1",
        title: "暗月初醒",
        completedAt: 2,
        resultLines: ["你确认了当前区域存在异常。"],
        obtainedLines: [],
        lostLines: [],
        relationshipLines: [],
        clueLines: ["新的线索已经指向下一处调查点。"],
        nextObjective: "沿着刚出现的线索继续深入。",
        hook: "门后有回声。",
      },
    },
  };
}

async function seedPlayableState(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, actionOptions, chapterState, professionState, narrative }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });

      await new Promise<void>((resolve, reject) => {
        const logs = [{ role: "assistant", content: narrative }];
        const baseSlot = {
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
          chapterState,
        };
        const state = {
          currentSaveSlot: "main_slot",
          saveSlots: { main_slot: baseSlot },
          user: { name: "qi bei" },
          isGuest: false,
          isGameStarted: true,
          playerName: "qi bei",
          gender: "未说明",
          logs,
          currentOptions: actionOptions,
          recentOptions: actionOptions,
          inputMode: "options",
          stats: baseSlot.stats,
          historicalMaxSanity: 30,
          time: baseSlot.time,
          playerLocation: "B1_SafeZone",
          codex: {},
          tasks: [],
          warehouse: [],
          journalClues: [],
          weaponBag: [],
          activeMenu: null,
          volume: 50,
          talent: null,
          talentCooldowns: {},
          professionState,
          chapterState,
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
      actionOptions: options,
      chapterState: seededChapterState(),
      professionState: defaultProfessionState,
      narrative: story,
    }
  );
}

async function openSeededPlay(page: Page) {
  await seedPlayableState(page);
  const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
}

test.describe("mobile settings UI", () => {
  test("opens settings, guide, chapter switch, and applies reading preferences", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page);

    await page.getByTestId("bottom-nav-settings").click();
    await expect(page.locator("#unified-menu-content")).toBeHidden();
    await expect(page.getByTestId("mobile-settings-panel")).toBeVisible();
    await expect(page.getByTestId("settings-account-pill")).toContainText(/当前账号\s+qi bei/);
    await expect(page.getByText("阅读体验")).toBeVisible();
    await expect(page.getByTestId("settings-volume-percent")).toHaveText("50%");

    await page.getByTestId("settings-volume-slider").fill("68");
    await expect(page.getByTestId("settings-volume-percent")).toHaveText("68%");
    const mute = page.getByTestId("settings-mute-button");
    const initialMuteLabel = await mute.getAttribute("aria-label");
    await mute.click();
    await expect(mute).toHaveAttribute("aria-label", initialMuteLabel === "关闭声音" ? "开启声音" : "关闭声音");

    await page.getByTestId("open-game-guide-button").click();
    await expect(page.getByTestId("game-guide-modal")).toBeVisible();
    await expect(page.getByText("01 | 游戏是什么")).toBeVisible();
    await expect(page.getByText("06 | 时间与天赋")).toHaveCount(1);
    await page.getByTestId("game-guide-modal").getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.getByTestId("game-guide-modal")).toHaveCount(0);

    await page.getByTestId("open-chapter-switch-button").click();
    await expect(page.getByTestId("chapter-switch-modal")).toBeVisible();
    await expect(page.getByTestId("chapter-switch-item")).toHaveCount(2);
    await expect(page.locator('[data-testid="chapter-switch-item"][data-chapter-id="chapter-2"]')).toHaveAttribute("aria-current", "page");
    await page.getByTestId("chapter-switch-modal").getByRole("button", { name: "关闭", exact: true }).click();

    await page.getByTestId("reading-preference-textSize").getByRole("button", { name: "偏大", exact: true }).click();
    await page.getByTestId("reading-preference-lineHeight").getByRole("button", { name: "宽松", exact: true }).click();
    await page.getByTestId("bottom-nav-story").click();
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();

    const storyMetrics = await page.evaluate(() => {
      const narrative = document.querySelector<HTMLElement>('[data-testid="dm-narrative-block"]');
      if (!narrative) throw new Error("missing story narrative block");
      const style = getComputedStyle(narrative);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
      };
    });
    expect(storyMetrics.fontSize).toBeGreaterThanOrEqual(23);
    expect(storyMetrics.lineHeight).toBeGreaterThanOrEqual(51);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
    const persistedMetrics = await page.evaluate(() => {
      const narrative = document.querySelector<HTMLElement>('[data-testid="dm-narrative-block"]');
      if (!narrative) throw new Error("missing story narrative block after reload");
      const style = getComputedStyle(narrative);
      return Number.parseFloat(style.fontSize);
    });
    expect(persistedMetrics).toBeGreaterThanOrEqual(23);
  });
});
