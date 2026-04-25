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
    async ({ dbName, storeName, key, story, actionOptions, defaultCooldowns, stateOverrides }) => {
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
          talent: null,
          talentCooldowns: { ...defaultCooldowns },
        };
        store.put(JSON.stringify({ state: { ...baseState, ...stateOverrides }, version: 1 }), key);
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

async function expectTabFocusDoesNotFindPrunedEntries(page: Page) {
  const focusedSnapshots: string[] = [];
  for (let i = 0; i < 36; i++) {
    await page.keyboard.press("Tab");
    focusedSnapshots.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "";
        return [
          el.tagName,
          el.getAttribute("aria-label") ?? "",
          el.getAttribute("data-testid") ?? "",
          el.getAttribute("data-onboarding") ?? "",
          (el.textContent ?? "").trim().slice(0, 24),
        ].join("|");
      })
    );
  }

  for (const snapshot of focusedSnapshots) {
    for (const label of prunedLabels) expect(snapshot).not.toContain(label);
    for (const marker of prunedMarkers) expect(snapshot).not.toContain(marker);
  }
}

test.describe("mobile reading UI", () => {
  test("renders the mobile reading shell at 390x844 and captures collapsed and expanded screenshots", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = trackPageErrors(page);
    await openSeededPlay(page);

    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toBeVisible();
    await expect(page.getByTestId("mobile-reading-header")).toContainText("VerseCraft");
    await expect(page.getByTestId("mobile-reading-header")).toContainText("第六章：雾港来信");
    await expect(page.getByTestId("audio-toggle-button")).toBeVisible();
    await expect(page.getByTestId("mobile-story-viewport")).toBeVisible();
    await expect(page.getByTestId("mobile-action-dock")).toBeVisible();
    await expect(page.getByTestId("manual-action-input")).toBeVisible();
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

  test("keeps bottom navigation wired to story, character no-op, codex, and settings", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page);

    const initialUrl = page.url();
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("bottom-nav-character")).toHaveAttribute("aria-label", "角色，暂未开放");
    for (const testId of ["bottom-nav-character", "bottom-nav-story", "bottom-nav-codex", "bottom-nav-settings"]) {
      const iconCount = await page.getByTestId(testId).locator("svg").count();
      expect(iconCount).toBeGreaterThan(0);
    }

    await page.getByTestId("bottom-nav-character").click();
    expect(page.url()).toBe(initialUrl);
    await expect(page.locator("#unified-menu-content")).toBeHidden();

    await page.getByTestId("bottom-nav-codex").click();
    const menu = page.locator("#unified-menu-content");
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCount(1);
    await expect(page.getByTestId("bottom-nav-codex")).toHaveAttribute("aria-current", "page");
    await expect(menu.locator('[data-onboarding="codex-tab"]')).toHaveCount(1);
    await expect(menu.locator('[data-onboarding="settings-tab"]')).toHaveCount(1);
    await expect(menu.getByText("图鉴 · 目录")).toBeVisible();
    await expect(menu.locator('[data-onboarding="task-tab"]')).toHaveCount(0);
    await expect(menu.locator('[data-onboarding="guide-tab"]')).toHaveCount(0);
    await expect(menu.locator('[data-onboarding="journal-tab"]')).toHaveCount(0);
    await expect(menu.locator('[data-onboarding="warehouse-tab"]')).toHaveCount(0);
    await expect(menu.locator('[data-onboarding="achievements-tab"]')).toHaveCount(0);
    await expect(menu.locator('[data-onboarding="weapon-tab"]')).toHaveCount(0);

    await menu.getByRole("button", { name: "关闭" }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByTestId("bottom-nav-story")).toHaveAttribute("aria-current", "page");

    await page.getByTestId("bottom-nav-settings").click();
    await expect(menu).toBeVisible();
    await expect(page.getByTestId("bottom-nav-settings")).toHaveAttribute("aria-current", "page");
    await expect(menu.locator('[data-onboarding="settings-tab"]')).toHaveCount(1);
    await expect(menu.locator('[data-onboarding="codex-tab"]')).toHaveCount(1);
  });

  test("does not expose pruned UI entries by selector, role, or Tab focus", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSeededPlay(page);

    await expectNoPrunedEntries(page);
    await page.getByTestId("bottom-nav-settings").click();
    await expect(page.locator("#unified-menu-content")).toBeVisible();
    await expectNoPrunedEntries(page);
    await expectTabFocusDoesNotFindPrunedEntries(page);
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

      if (viewport.width >= 900) {
        const box = await shell.boundingBox();
        expect(box?.width).toBeLessThanOrEqual(482);
      }
    });
  }
});
