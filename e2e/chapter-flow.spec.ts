import { expect, test, type Locator, type Page } from "@playwright/test";

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

const prunedLabels = ["任务栏", "游戏指南", "灵感手记", "仓库", "背包", "库存", "成就", "武器", "武器栏", "装备"];
const prunedMarkers = [
  "taskbar",
  "guide",
  "journal",
  "warehouse",
  "backpack",
  "inventory",
  "achievements",
  "weapon",
  "equipment",
  "armory",
];
const gameyChapterTerms = [
  "本章完成",
  "获得",
  "失去",
  "关系变化",
  "理智 -1",
  "理智-1",
  "关系 +5",
  "关系+5",
  "任务完成",
  "章节进度",
  "行动结算",
  "待进入",
  "锁定",
];

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message + "\n" + (err.stack ?? "")));
  return errors;
}

function nearChapterEndState(now = Date.now()) {
  return {
    currentChapterId: "chapter-1",
    activeChapterId: "chapter-1",
    reviewChapterId: null,
    completedChapterIds: [],
    unlockedChapterIds: ["chapter-1"],
    summariesByChapterId: {},
    lastChapterEndAt: null,
    pendingChapterEndId: null,
    progressByChapterId: {
      "chapter-1": {
        chapterId: "chapter-1",
        status: "active",
        startedAt: now - 60_000,
        completedAt: null,
        turnCount: 2,
        narrativeCharCount: 820,
        keyChoiceCount: 0,
        completedBeatIds: ["wake", "observe", "first-choice"],
        stateChangeCount: 0,
        lastObjectiveText: "确认处境，找到第一条异常线索，理解行动会改变后果。",
        startedLogIndex: 0,
        completedLogIndex: null,
      },
      "chapter-2": {
        chapterId: "chapter-2",
        status: "locked",
        startedAt: null,
        completedAt: null,
        turnCount: 0,
        narrativeCharCount: 0,
        keyChoiceCount: 0,
        completedBeatIds: [],
        stateChangeCount: 0,
        lastObjectiveText: "沿第一章线索继续探索，面对第一个更明确的阻碍或 NPC 迹象。",
        startedLogIndex: null,
        completedLogIndex: null,
      },
    },
  };
}

function nearChapterEndDirectorState() {
  return {
    v: 1,
    arcId: "darkmoon-prologue",
    beatIndex: 2,
    tension: 12,
    stallCount: 0,
    lastProgressTurn: 1,
    recentProgressTurns: [1],
    recentIncidentCodes: [],
    recentPeakTurn: 0,
    cooldowns: {},
    openHookCodes: ["door-after-echo"],
    falseCalmTurns: 0,
    pressureBudget: 45,
    lastMandatoryIncidentTurn: 0,
    escapePressureBand: "low",
    chapter: {
      v: 1,
      currentChapterId: "chapter-1",
      chapterOrder: 1,
      chapterTitle: "暗月初醒",
      chapterPhase: "echo",
      promise: "门后的回声会把第一道异常推向下一页。",
      mainQuestion: "门后的回声究竟来自哪里？",
      emotionalTone: "悬疑、克制、余波未散",
      startedTurn: 0,
      minTurns: 3,
      targetTurns: [3, 6],
      softMaxTurns: 6,
      openThreadIds: ["door-after-echo"],
      resolvedThreadIds: ["first-small-question"],
      keyChoiceIds: ["first-clear-intervention"],
      echoedChoiceIds: [],
      mustEchoMemoryIds: ["door-after-echo"],
      forbiddenRevealIds: [],
      closeCandidate: null,
      nextChapterSeed: null,
      summaryForPlayer: null,
      summaryForModel: null,
    },
  };
}

async function seedChapterPlayState(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, actionOptions, chapterState, storyDirector, defaultProfession }) => {
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
        const logs = [
          {
            role: "assistant",
            content:
              "你在安全中枢醒来，灯管像被潮气浸透一样闪烁。门缝外有细微回声，像有人拖着湿鞋经过。",
          },
        ];
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
          professionState: defaultProfession,
          chapterState,
          storyDirector,
        };
        const state = {
          currentSaveSlot: "main_slot",
          saveSlots: { main_slot: baseSlot },
          isGameStarted: true,
          playerName: "章节测试者",
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
          talent: null,
          talentCooldowns: {},
          professionState: baseSlot.professionState,
          chapterState,
          storyDirector,
        };
        store.put(JSON.stringify({ state, version: 1 }), key);
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
      chapterState: nearChapterEndState(),
      storyDirector: nearChapterEndDirectorState(),
      defaultProfession: defaultProfessionState,
    }
  );
}

function buildChapterSseFinalFrame() {
  return `data: __VERSECRAFT_STATUS__:{"stage":"generating"}\n\n` +
    `data: __VERSECRAFT_FINAL__:${JSON.stringify({
      is_action_legal: true,
      sanity_damage: 1,
      narrative: "你靠近门缝，发现水迹只停在门槛内侧。电子表亮了一瞬，留下指向下一扇门的时间残影。",
      is_death: false,
      consumes_time: false,
      player_location: "B1_Corridor",
      options,
      task_updates: [
        {
          id: "chapter_first_intervention",
          title: "确认门后的回声",
          status: "active",
        },
      ],
      codex_updates: [
        {
          id: "A-CHAPTER-001",
          name: "门缝水迹",
          type: "anomaly",
          known_info: "水迹从门内向外停住，像被某个无形边界截断。",
        },
      ],
      clue_updates: [
        {
          id: "chapter_first_clue",
          title: "门缝水迹",
          summary: "水迹指向门后，却没有正常来源。",
          status: "active",
        },
      ],
      new_tasks: [
        {
          id: "chapter_2_objective",
          title: "沿门后回声继续调查",
          description: "沿第一条异常线索继续探索。",
          status: "active",
        },
      ],
    })}\n\n`;
}

async function installChatMock(page: Page) {
  await page.route("**/api/chat/queue", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ disabled: true }),
    });
  });
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: buildChapterSseFinalFrame(),
    });
  });
}

async function openSeededPlay(page: Page) {
  await seedChapterPlayState(page);
  const response = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
}

async function expectNoGameyChapterText(locator: Locator) {
  const text = await locator.innerText();
  for (const term of gameyChapterTerms) expect(text).not.toContain(term);
  expect(text).not.toMatch(/理智\s*[-+]\s*\d+/);
  expect(text).not.toMatch(/关系\s*[-+]\s*\d+/);
}

async function expectNoPrunedEntries(page: Page) {
  for (const label of prunedLabels) {
    await expect(page.getByRole("button", { name: new RegExp(label) })).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(label) })).toHaveCount(0);
  }
  const interactiveText = await page
    .locator('button, a, [role="tab"], [role="menuitem"], [aria-label], [data-testid], [data-onboarding]')
    .evaluateAll((nodes) =>
      nodes
        .map((node) =>
          [
            node.textContent ?? "",
            node.getAttribute("aria-label") ?? "",
            node.getAttribute("data-testid") ?? "",
            node.getAttribute("data-onboarding") ?? "",
          ].join(" ")
        )
        .join("\n")
    );
  for (const label of prunedLabels) expect(interactiveText).not.toContain(label);
  for (const marker of prunedMarkers) expect(interactiveText).not.toContain(marker);
}

test.describe("chapter flow", () => {
  const mobileChapterViewports = [
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ];

  for (const viewport of mobileChapterViewports) {
    test(`completes chapter one, enters chapter two, reviews chapter one, and returns at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = trackPageErrors(page);
    await openSeededPlay(page);
    await installChatMock(page);

    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toContainText("第一章：暗月初醒");
    await expect(page.getByTestId("chapter-header-pill")).toHaveCount(0);
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();

    await page.getByTestId("manual-action-input").fill("查看门缝水迹");
    await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/chat") && req.method() === "POST"),
      page.getByTestId("send-action-button").click(),
    ]);

    await expect(page.getByTestId("chapter-end-sheet")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chapter-end-sheet")).toContainText("本章回望");
    await expect(page.getByTestId("chapter-end-sheet")).toContainText("前情回望");
    await expect(page.getByTestId("chapter-end-sheet")).toContainText("继续下一章");
    await expect(page.getByTestId("chapter-end-sheet")).toContainText("回看本章");
    await expectNoGameyChapterText(page.getByTestId("chapter-end-sheet"));
    await expect(page.getByTestId("mobile-action-dock")).toHaveCount(0);

    await page.getByTestId("chapter-next-button").click();
    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toContainText("第二章：门后回声");
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();

    await page.getByTestId("bottom-nav-story").click();
    await expect(page.getByTestId("chapter-navigator")).toBeVisible();
    await expect(page.getByTestId("chapter-navigator")).toContainText("小说目录");
    await expectNoGameyChapterText(page.getByTestId("chapter-navigator"));
    const chapterOneItem = page.locator('[data-testid="chapter-nav-item"][data-chapter-id="chapter-1"]');
    const chapterTwoItem = page.locator('[data-testid="chapter-nav-item"][data-chapter-id="chapter-2"]');
    await expect(chapterOneItem).toContainText("第一章：暗月初醒");
    await expect(chapterOneItem).toContainText(/回响|回声|异常|门缝|明确介入/);
    await expect(chapterTwoItem).toContainText("第二章：门后回声");
    await expect(chapterTwoItem).toContainText("正在阅读");
    await expect(chapterTwoItem).toHaveAttribute("aria-current", "page");
    await page.locator('[data-testid="chapter-nav-item"][data-chapter-id="chapter-1"]').click();
    await expect(page.getByTestId("chapter-review-panel")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByText("前情回望，不影响正在阅读的章节")).toBeVisible();
    await expect(page.getByTestId("mobile-action-dock")).toHaveCount(0);

    await page.getByTestId("chapter-return-current").click();
    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toContainText("第二章：门后回声");
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();

    await page.getByTestId("bottom-nav-codex").click();
    await expect(page.getByTestId("mobile-codex-panel")).toBeVisible();
    await page.getByTestId("bottom-nav-settings").click();
    await expect(page.locator("#unified-menu-content")).toBeHidden();
    await expect(page.getByTestId("mobile-settings-panel")).toBeVisible();
    await page.getByTestId("bottom-nav-story").click();
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();

    await expectNoPrunedEntries(page);
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
    });
  }

  for (const route of ["/guide", "/journal", "/warehouse", "/achievements", "/weapons", "/taskbar"]) {
    test(`keeps old route ${route} from exposing pruned UI`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedChapterPlayState(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(response?.status()).toBeLessThan(500);
      await expect(page.getByText("Application error")).toHaveCount(0);
      await expectNoPrunedEntries(page);
    });
  }
});
