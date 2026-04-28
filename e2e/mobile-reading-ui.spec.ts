import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";
const MAX_INPUT = 20;

const allTalentCooldowns = {
  时间回溯: 0,
  命运馈赠: 0,
  主角光环: 0,
  生命汇源: 0,
  洞察之眼: 0,
  丧钟回响: 0,
};

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

const b1Codex = {
  "N-008": {
    id: "N-008",
    name: "N-008",
    type: "npc",
    known_info: "他是公寓里少数真正懂电路的人，常年穿梭在配电间与各楼层之间修理故障。",
    personality: "脾气急，但会在关键时刻给出实际帮助。",
    traits: "灰色工作服、机油味、细小伤痕。",
    trust: 42,
  },
  "N-014": {
    id: "N-014",
    name: "洗衣房阿姨",
    type: "npc",
    known_info: "她经常在地下室洗衣房出现，能记住住户衣物上的异常痕迹。",
  },
  "N-015": {
    id: "N-015",
    name: "麟泽",
    type: "npc",
    known_info: "他在安全中枢附近停留，似乎一直关注楼内的异常变化。",
    currentLocation: "B1_SafeZone",
  },
  "N-020": {
    id: "N-020",
    name: "灵伤",
    type: "npc",
    known_info: "她的线索与地下储物间有关。",
    currentLocation: "B1_Storage",
  },
};

const prunedLabels = ["任务栏", "游戏指南", "灵感手记", "仓库", "背包", "库存", "成就", "武器", "武器栏", "装备"];
const prunedMarkers = [
  "taskbar",
  "task-btn",
  "task-tab",
  "guide",
  "guide-tab",
  "journal",
  "journal-tab",
  "warehouse",
  "warehouse-tab",
  "backpack",
  "backpack-tab",
  "inventory",
  "achievements",
  "achievements-tab",
  "achievement-button",
  "weapon",
  "weapon-tab",
  "equipment",
  "equipment-tab",
  "armory",
  "arsenal",
];

type SeedOverrides = Record<string, unknown>;

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    errors.push(err.message + "\n" + (err.stack ?? ""));
  });
  return errors;
}

async function seedPlayableState(page: Page, overrides: SeedOverrides = {}) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, story, actionOptions, defaultCooldowns, defaultProfession, stateOverrides }) => {
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
        const baseState = {
          currentSaveSlot: "main_slot",
          saveSlots: {
            main_slot: {
              logs: [{ role: "assistant", content: story }],
              currentOptions: actionOptions,
              time: { day: 1, hour: 20 },
              stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 },
              inventory: [],
              codex: {},
              historicalMaxSanity: 30,
              originium: 0,
              tasks: [],
              playerLocation: "1F_Lobby",
              dynamicNpcStates: {},
              mainThreatByFloor: {},
              talent: null,
              talentCooldowns: { ...defaultCooldowns },
              professionState: defaultProfession,
            },
          },
          isGameStarted: true,
          playerName: "测试读者",
          gender: "未说明",
          logs: [{ role: "assistant", content: story }],
          currentOptions: actionOptions,
          recentOptions: actionOptions,
          inputMode: "options",
          stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 },
          historicalMaxSanity: 30,
          time: { day: 1, hour: 20 },
          playerLocation: "1F_Lobby",
          codex: {},
          tasks: [],
          warehouse: [],
          journalClues: [],
          weaponBag: [],
          activeMenu: null,
          dynamicNpcStates: {},
          mainThreatByFloor: {},
          talent: null,
          talentCooldowns: { ...defaultCooldowns },
          professionState: defaultProfession,
        };
        const seededState = { ...baseState, ...stateOverrides };
        seededState.saveSlots = {
          ...seededState.saveSlots,
          main_slot: {
            ...seededState.saveSlots.main_slot,
            logs: seededState.logs,
            currentOptions: seededState.currentOptions,
            time: seededState.time,
            stats: seededState.stats,
            inventory: seededState.inventory,
            codex: seededState.codex,
            historicalMaxSanity: seededState.historicalMaxSanity,
            originium: seededState.originium,
            tasks: seededState.tasks,
            playerLocation: seededState.playerLocation,
            dynamicNpcStates: seededState.dynamicNpcStates,
            mainThreatByFloor: seededState.mainThreatByFloor,
            talent: seededState.talent,
            talentCooldowns: seededState.talentCooldowns,
            professionState: seededState.professionState,
          },
        };
        store.put(JSON.stringify({ state: seededState, version: 1 }), key);
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
      story: narrative,
      actionOptions: options,
      defaultCooldowns: allTalentCooldowns,
      defaultProfession: defaultProfessionState,
      stateOverrides: overrides,
    }
  );
}

function buildSseFinalFrame() {
  return `data: __VERSECRAFT_FINAL__:${JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "雾声压低，你的行动被世界接住。",
    is_death: false,
    consumes_time: false,
    options,
  })}\n\n`;
}

async function installChatSseMock(page: Page) {
  const submittedActions: string[] = [];
  await page.route("**/api/chat", async (route) => {
    submittedActions.push(lastUserMessage(route.request().postDataJSON() as Record<string, unknown>));
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: buildSseFinalFrame(),
    });
  });
  return submittedActions;
}

function lastUserMessage(body: Record<string, unknown>) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages[messages.length - 1] as { content?: unknown } | undefined;
  return typeof last?.content === "string" ? last.content : "";
}

async function openSeededPlay(page: Page, overrides: SeedOverrides = {}) {
  await seedPlayableState(page, overrides);
  const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
  expect(res?.status()).toBeLessThan(500);
  try {
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
  } catch {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 15_000 });
  }
  return res;
}

async function expectNoClientCrash(page: Page, errors: string[]) {
  const body = await page.locator("body").innerText();
  const hasAppError = body.includes("Application error") || body.includes("client-side exception");
  expect(hasAppError, `Unexpected error overlay. Errors: ${errors.slice(0, 3).join(" | ")}`).toBe(false);
  const hookErrors = errors.filter((e) => e.includes("310") || e.includes("more hooks"));
  expect(hookErrors, `React hooks error: ${hookErrors.join("; ")}`).toHaveLength(0);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectExpandedBottomStack(page: Page) {
  const metrics = await page.evaluate(() => {
    const dock = document.querySelector<HTMLElement>('[data-testid="mobile-action-dock"]');
    const input = document.querySelector<HTMLInputElement>('[data-testid="manual-action-input"]');
    const dropdown = document.querySelector<HTMLElement>('[data-testid="mobile-options-dropdown"]');
    const nav = document.querySelector<HTMLElement>('[data-testid="mobile-bottom-nav"]');
    if (!dock || !input || !dropdown || !nav) throw new Error("missing mobile bottom stack");
    const dockRect = dock.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const dropdownRect = dropdown.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    return {
      dockBottom: dockRect.bottom,
      dropdownTop: dropdownRect.top,
      dropdownBottom: dropdownRect.bottom,
      navTop: navRect.top,
      navHeight: navRect.height,
      inputWidth: inputRect.width,
      placeholder: input.placeholder,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  expect(metrics.placeholder).toBe("输入下一步行动或对白…");
  expect(metrics.inputWidth).toBeGreaterThanOrEqual(190);
  expect(metrics.dockBottom).toBeLessThanOrEqual(metrics.dropdownTop - 8);
  expect(metrics.dropdownBottom).toBeLessThanOrEqual(metrics.navTop - 8);
  expect(metrics.navHeight).toBeLessThanOrEqual(105);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);
}

async function expectNoPrunedEntries(page: Page) {
  for (const label of prunedLabels) {
    await expect(page.locator(`[aria-label="${label}"]`)).toHaveCount(0);
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
  }

  for (const marker of prunedMarkers) {
    await expect(page.locator(`[data-testid="${marker}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-onboarding="${marker}"]`)).toHaveCount(0);
  }
}

test.describe("mobile reading UI", () => {
  test("renders the mobile reading shell at 390x844 and captures collapsed and expanded screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = trackPageErrors(page);
    await openSeededPlay(page);

    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toContainText("第六章：雾港来信");
    await expect(page.getByTestId("chapter-header-pill")).toHaveCount(0);
    await expect(page.getByTestId("mobile-story-viewport")).toBeVisible();
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
    await expect(page.getByTestId("manual-action-input")).toBeVisible();
    await expect(page.getByTestId("manual-action-input")).toHaveAttribute("placeholder", "输入下一步行动或对白…");
    await expect(page.getByTestId("options-toggle-button")).toBeVisible();
    await expect(page.getByTestId("send-action-button")).toBeVisible();
    await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("Application error")).toHaveCount(0);
    await expect(page.getByText("client-side exception")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoClientCrash(page, errors);

    const collapsedPath = test.info().outputPath("mobile-reading-collapsed-390.png");
    await page.screenshot({ path: collapsedPath, fullPage: false });
    test.info().annotations.push({ type: "screenshot", description: collapsedPath });

    await page.getByTestId("options-toggle-button").click();
    await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
    await expect(page.getByTestId("mobile-option-item")).toHaveCount(options.length);
    await expectExpandedBottomStack(page);

    const expandedPath = test.info().outputPath("mobile-reading-expanded-390.png");
    await page.screenshot({ path: expandedPath, fullPage: false });
    test.info().annotations.push({ type: "screenshot", description: expandedPath });
    await expectNoHorizontalOverflow(page);
  });

  test("submits manual input through the existing SSE request path without crashing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = trackPageErrors(page);
    await openSeededPlay(page);
    const submittedActions = await installChatSseMock(page);

    const input = page.getByTestId("manual-action-input");
    await input.click();
    await expect(input).toBeFocused();
    await input.fill("靠近铁牌查看痕迹");
    await expect(input).toHaveAttribute("maxLength", String(MAX_INPUT));
    await expect(page.getByTestId("send-action-button")).toBeEnabled();

    await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/chat") && req.method() === "POST"),
      page.getByTestId("send-action-button").click(),
    ]);

    await expect(page.getByTestId("manual-action-input")).toHaveValue("");
    expect(submittedActions).toEqual(["靠近铁牌查看痕迹"]);
    await expectNoClientCrash(page, errors);
  });

  test("submits an option item directly once and collapses the dropdown", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page);
    const submittedActions = await installChatSseMock(page);

    await page.getByTestId("options-toggle-button").click();
    const optionItems = page.getByTestId("mobile-option-item");
    await expect(optionItems).toHaveCount(options.length);
    const optionElementsAreButtons = await optionItems.evaluateAll((nodes) =>
      nodes.every((node) => node instanceof HTMLButtonElement || node.getAttribute("role") === "button")
    );
    expect(optionElementsAreButtons).toBe(true);

    await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/chat") && req.method() === "POST"),
      optionItems.nth(1).click(),
    ]);

    await expect(page.getByTestId("mobile-options-dropdown")).toHaveCount(0);
    await expect(page.getByTestId("manual-action-input")).toHaveValue("");
    await expect.poll(() => submittedActions.length).toBe(1);
    expect(submittedActions).toEqual([options[1]]);
  });

  test("keeps bottom navigation wired to character, story, codex, and settings", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page, {
      stats: { sanity: 12, agility: 17, luck: 14, charm: 21, background: 2 },
      historicalMaxSanity: 19,
      originium: 12,
      time: { day: 0, hour: 0 },
      playerLocation: "B1_SafeZone",
      codex: b1Codex,
    });

    const initialUrl = page.url();
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("bottom-nav-character")).toHaveAttribute("aria-label", "打开角色");
    for (const testId of ["bottom-nav-character", "bottom-nav-story", "bottom-nav-codex", "bottom-nav-settings"]) {
      const iconCount = await page.getByTestId(testId).locator("svg").count();
      expect(iconCount).toBeGreaterThan(0);
    }

    await page.getByTestId("bottom-nav-character").click();
    expect(page.url()).toBe(initialUrl);
    await expect(page.locator("#unified-menu-content")).toBeHidden();
    await expect(page.getByTestId("bottom-nav-character")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mobile-character-panel")).toBeVisible();
    await expect(page.getByTestId("mobile-action-dock")).toHaveCount(0);
    await expect(page.getByTestId("character-current-profession")).toHaveText("无");
    await expect(page.getByTestId("character-current-time")).toHaveText("第 0 日 · 00:00");
    await expect(page.getByTestId("character-current-location")).toHaveText("B1 安全中枢");
    await expect(page.getByTestId("character-stat-sanity-value")).toHaveText("12 / 19");
    await expect(page.getByTestId("character-stat-agility-value")).toHaveText("17 / 50");
    await expect(page.getByTestId("character-originium-balance")).toHaveText("原石 12");

    await page.getByTestId("character-upgrade-agility").click();
    await expect(page.getByTestId("character-stat-agility-value")).toHaveText("18 / 50");
    await expect(page.getByTestId("character-originium-balance")).toHaveText("原石 9");

    await page.getByTestId("bottom-nav-story").click();
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mobile-character-panel")).toHaveCount(0);
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
    await expect(page.getByTestId("manual-action-input")).toBeVisible();
    await expect(page.getByTestId("options-toggle-button")).toBeVisible();
    await expect(page.getByTestId("echo-talent-button")).toBeVisible();

    await page.getByTestId("bottom-nav-codex").click();
    const menu = page.locator("#unified-menu-content");
    await expect(menu).toBeHidden();
    await expect(page.getByTestId("bottom-nav-codex")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mobile-codex-panel")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toContainText("图鉴");
    await expect(page.getByTestId("mobile-codex-count")).toHaveText("B1层已识别人物：4 / 4");
    await expect(page.getByTestId("mobile-codex-card")).toHaveCount(5);
    await expect(page.getByTestId("mobile-codex-card-strip").locator("img")).toHaveCount(4);
    await expect(page.getByTestId("mobile-codex-detail-panel")).toContainText("人物简介");
    await expect(page.getByTestId("mobile-codex-detail-panel")).toContainText("我所见");
    await expect(page.getByTestId("mobile-codex-detail-panel")).toContainText("关系印象");
    await expect(page.getByText("图鉴 · 目录")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "关闭", exact: true })).toBeHidden();

    await page.locator('[data-testid="mobile-codex-card"][data-codex-id="N-015"]').click();
    await expect(page.getByTestId("mobile-codex-detail-location")).toHaveText("B1 安全中枢");
    const codexText = await page.getByTestId("mobile-codex-panel").innerText();
    expect(codexText).not.toContain("B1_SafeZone");
    expect(codexText).not.toContain("B1_Storage");

    await page.getByTestId("bottom-nav-story").click();
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mobile-codex-panel")).toHaveCount(0);
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();

    await page.getByTestId("bottom-nav-settings").click();
    await expect(menu).toBeHidden();
    await expect(page.getByTestId("bottom-nav-settings")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("mobile-settings-panel")).toBeVisible();
    await expect(page.getByTestId("open-game-guide-button")).toBeVisible();
    await expect(page.getByTestId("settings-volume-slider")).toBeVisible();
    await expect(page.getByTestId("open-chapter-switch-button")).toBeVisible();
  });

  test("filters the mobile codex by current floor and runtime NPC locations", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await openSeededPlay(page, {
      playerLocation: "1F_Lobby",
      codex: {
        "A-001": {
          id: "A-001",
          name: "时差症候群",
          type: "anomaly",
          known_info: "一楼的时间异常已经被记录。",
        },
        "N-008": b1Codex["N-008"],
        "N-010": {
          id: "N-010",
          name: "欣蓝",
          type: "npc",
          known_info: "她的线索与一楼安全路线有关。",
          currentLocation: "1F_Lobby",
        },
      },
      dynamicNpcStates: {
        "N-008": { currentLocation: "1F_Lobby", isAlive: true },
      },
    });

    await page.getByTestId("bottom-nav-codex").click();
    await expect(page.getByTestId("mobile-codex-count")).toHaveText("1F已识别人物：3 / 4");
    await expect(page.locator('[data-testid="mobile-codex-card"][data-codex-id="N-008"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-codex-card"][data-codex-id="N-014"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="mobile-codex-card"][data-codex-id="A-001"]')).toBeVisible();
    await expect(page.getByTestId("mobile-codex-card-strip").locator("img")).toHaveCount(3);
  });

  test("shows runtime active threat anomalies on the current floor", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await openSeededPlay(page, {
      playerLocation: "2F_Corridor",
      codex: {
        "A-008": {
          id: "A-008",
          name: "深渊守门人",
          type: "anomaly",
          known_info: "它不该出现在这里，但主威胁状态已经记录了这次越界。",
        },
      },
      mainThreatByFloor: {
        "2": {
          threatId: "A-008",
          floorId: "2",
          phase: "active",
          suppressionProgress: 0,
          lastResolvedAtHour: null,
          counterHintsUsed: [],
        },
      },
    });

    await page.getByTestId("bottom-nav-codex").click();
    await expect(page.getByTestId("mobile-codex-count")).toHaveText("2F已识别人物：1 / 3");
    await expect(page.locator('[data-testid="mobile-codex-card"][data-codex-id="A-008"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-codex-card"][data-codex-id="A-002"]')).toBeVisible();
    await page.locator('[data-testid="mobile-codex-card"][data-codex-id="A-008"]').click();
    await expect(page.getByTestId("mobile-codex-detail-panel")).toContainText("异常简介");
  });

  test("shows a certified profession in the mobile character panel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page, {
      professionState: {
        ...defaultProfessionState,
        currentProfession: "齐日角",
        unlockedProfessions: ["齐日角"],
      },
    });

    await page.getByTestId("bottom-nav-character").click();
    await expect(page.getByTestId("mobile-character-panel")).toBeVisible();
    await expect(page.getByTestId("character-current-profession")).toHaveText("齐日角");
  });

  test("does not expose pruned UI entries by selector, role, or Tab focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page);

    await expectNoPrunedEntries(page);
    await page.getByTestId("bottom-nav-settings").click();
    await expect(page.locator("#unified-menu-content")).toBeHidden();
    await expect(page.getByTestId("mobile-settings-panel")).toBeVisible();
    await expect(page.locator('[data-onboarding="guide-tab"]')).toHaveCount(0);
    await expect(page.locator('[data-onboarding="journal-tab"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="guide"]')).toHaveCount(0);
  });

  test("wires audio and talent controls to existing state", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page, {
      talent: "生命汇源",
      talentCooldowns: { ...allTalentCooldowns },
      stats: { sanity: 10, agility: 20, luck: 20, charm: 20, background: 20 },
      historicalMaxSanity: 30,
    });

    const audio = page.getByTestId("audio-toggle-button");
    const initialAudioLabel = await audio.getAttribute("aria-label");
    await audio.click();
    await expect(audio).toHaveAttribute(
      "aria-label",
      initialAudioLabel === "关闭声音" ? "开启声音" : "关闭声音"
    );

    const talentButton = page.getByTestId("echo-talent-button");
    await expect(talentButton).toHaveAttribute("aria-label", "发动天赋：生命汇源");
    await expect(talentButton).toBeEnabled();
    await talentButton.click();
    await expect(talentButton).toBeDisabled();
    await expect(talentButton).toHaveAttribute("aria-label", /生命汇源，冷却:/);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
    { width: 1280, height: 900 },
  ]) {
    test(`keeps the reading shell usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openSeededPlay(page);

      const shell = page.getByTestId("mobile-reading-shell");
      await expect(shell).toBeVisible();
      await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
      await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
      await expect(page.getByTestId("mobile-bottom-nav")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      if (viewport.width <= 430) {
        await page.getByTestId("options-toggle-button").click();
        await expect(page.getByTestId("mobile-options-dropdown")).toBeVisible();
        await expectExpandedBottomStack(page);
      }

      if (viewport.width >= 900) {
        const box = await shell.boundingBox();
        expect(box?.width).toBeLessThanOrEqual(482);
      }
    });
  }
});
