import { test, expect } from "@playwright/test";

const TEST_USER = process.env.E2E_USER;
const TEST_PASS = process.env.E2E_PASS;

async function expectNoTaskbarEntry(page: import("@playwright/test").Page) {
  const selectors = [
    'button[aria-label="任务栏"]',
    '[role="button"][aria-label="任务栏"]',
    '[aria-label="任务栏"]',
    '[data-testid="taskbar"]',
    '[data-testid="taskbar-button"]',
    '[data-onboarding="task-btn"]',
    '[data-onboarding="task-tab"]',
    '[aria-controls="taskbar"]',
  ];

  for (const selector of selectors) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: "任务栏", exact: true })).toHaveCount(0);
}

async function expectNoGuideOrJournalEntry(page: import("@playwright/test").Page) {
  const selectors = [
    'button[aria-label="游戏指南"]',
    'a[aria-label="游戏指南"]',
    '[role="button"][aria-label="游戏指南"]',
    '[role="link"][aria-label="游戏指南"]',
    'button[aria-label="灵感手记"]',
    'a[aria-label="灵感手记"]',
    '[role="button"][aria-label="灵感手记"]',
    '[role="link"][aria-label="灵感手记"]',
    '[data-onboarding="guide-tab"]',
    '[data-onboarding="journal-tab"]',
    '[data-testid="guide"]',
    '[data-testid="guide-button"]',
    '[data-testid="journal"]',
    '[data-testid="journal-button"]',
    '[aria-controls="guide"]',
    '[aria-controls="guide-panel"]',
    '[aria-controls="journal"]',
    '[aria-controls="journal-panel"]',
  ];

  for (const selector of selectors) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  for (const label of ["游戏指南", "灵感手记"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
  }
}

async function expectNoWarehouseEntry(page: import("@playwright/test").Page) {
  const selectors = [
    'button[aria-label="仓库"]',
    'a[aria-label="仓库"]',
    '[role="button"][aria-label="仓库"]',
    '[role="link"][aria-label="仓库"]',
    'button[aria-label="背包"]',
    'a[aria-label="背包"]',
    '[role="button"][aria-label="背包"]',
    '[role="link"][aria-label="背包"]',
    'button[aria-label="库存"]',
    'a[aria-label="库存"]',
    '[data-onboarding="warehouse-tab"]',
    '[data-onboarding="backpack-tab"]',
    '[data-testid="warehouse"]',
    '[data-testid="warehouse-button"]',
    '[data-testid="inventory"]',
    '[data-testid="inventory-button"]',
    '[data-testid="backpack"]',
    '[data-testid="backpack-button"]',
    '[aria-controls="warehouse"]',
    '[aria-controls="warehouse-panel"]',
    '[aria-controls="inventory"]',
    '[aria-controls="inventory-panel"]',
    '[aria-controls="backpack"]',
    '[aria-controls="backpack-panel"]',
  ];

  for (const selector of selectors) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  for (const label of ["仓库", "背包", "库存", "行囊"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
  }
}

async function expectNoAchievementEntry(page: import("@playwright/test").Page) {
  const selectors = [
    'button[aria-label="成就"]',
    'a[aria-label="成就"]',
    '[role="button"][aria-label="成就"]',
    '[role="link"][aria-label="成就"]',
    'button[aria-label="奖杯"]',
    'a[aria-label="奖杯"]',
    '[role="button"][aria-label="奖杯"]',
    '[role="link"][aria-label="奖杯"]',
    'button[aria-label="徽章"]',
    'a[aria-label="徽章"]',
    '[role="button"][aria-label="徽章"]',
    '[role="link"][aria-label="徽章"]',
    '[data-onboarding="achievements-tab"]',
    '[data-testid="achievements"]',
    '[data-testid="achievement-button"]',
    '[data-testid="achievements-button"]',
    '[data-testid="badge"]',
    '[data-testid="trophy"]',
    '[aria-controls="achievements"]',
    '[aria-controls="achievements-panel"]',
    '[aria-controls="achievement-panel"]',
  ];

  for (const selector of selectors) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  for (const label of ["成就", "奖杯", "徽章", "Achievement", "Achievements", "Badge", "Trophy"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
  }
}

async function expectNoWeaponEntry(page: import("@playwright/test").Page) {
  const selectors = [
    'button[aria-label="武器"]',
    'a[aria-label="武器"]',
    '[role="button"][aria-label="武器"]',
    '[role="link"][aria-label="武器"]',
    'button[aria-label="武器栏"]',
    'a[aria-label="武器栏"]',
    '[role="button"][aria-label="武器栏"]',
    '[role="link"][aria-label="武器栏"]',
    'button[aria-label="装备"]',
    'a[aria-label="装备"]',
    '[role="button"][aria-label="装备"]',
    '[role="link"][aria-label="装备"]',
    '[data-onboarding="weapon-tab"]',
    '[data-onboarding="equipment-tab"]',
    '[data-onboarding="armory-tab"]',
    '[data-onboarding="arsenal-tab"]',
    '[data-testid="weapon"]',
    '[data-testid="weapon-button"]',
    '[data-testid="weapon-panel"]',
    '[data-testid="weapons"]',
    '[data-testid="equipment"]',
    '[data-testid="equipment-button"]',
    '[data-testid="armory"]',
    '[data-testid="arsenal"]',
    '[aria-controls="weapon"]',
    '[aria-controls="weapon-panel"]',
    '[aria-controls="weapons"]',
    '[aria-controls="equipment"]',
    '[aria-controls="armory"]',
    '[aria-controls="arsenal"]',
  ];

  for (const selector of selectors) {
    await expect(page.locator(selector)).toHaveCount(0);
  }
  for (const label of ["武器", "武器栏", "装备", "兵器库", "军械库", "Weapon", "Weapons", "Equipment", "Armory", "Arsenal"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
  }
}

test.describe("Play page", () => {
  test("loads without client-side exception", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message + "\n" + (err.stack ?? ""));
    });

    if (TEST_USER && TEST_PASS) {
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.getByRole("button", { name: /建立档案|系统接入/ }).click();
      await page.waitForTimeout(500);
      await page.getByPlaceholder("账号").fill(TEST_USER);
      await page.getByPlaceholder("密码").fill(TEST_PASS);
      await page.getByRole("button", { name: /登录|正在连接/ }).click();
      await page.waitForTimeout(3000);
    }

    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15000 });
    expect(res?.status()).toBeLessThan(500);

    await page.waitForTimeout(5000);

    const body = await page.locator("body").innerText();
    const hasAppError = body.includes("Application error") || body.includes("client-side exception");
    expect(hasAppError, `Unexpected error overlay. Errors: ${errors.slice(0, 3).join(" | ")}`).toBe(false);
    const hookErrors = errors.filter((e) => e.includes("310") || e.includes("more hooks"));
    expect(hookErrors.length, `React hooks error: ${hookErrors.join("; ")}`).toBe(0);
  });

  test("首页与主游戏页不暴露任务栏入口", async ({ page }) => {
    for (const path of ["/", "/play"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expectNoTaskbarEntry(page);
      await expectNoGuideOrJournalEntry(page);
      await expectNoWarehouseEntry(page);
      await expectNoAchievementEntry(page);
      await expectNoWeaponEntry(page);
    }
  });

  test("游玩页：移除目标功能入口；设置中枢仅保留可见标签页", async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);

    const settingsBtn = page.locator('button[aria-label="设置"]');
    const hasHeader = (await settingsBtn.count()) > 0;
    await expectNoTaskbarEntry(page);
    await expectNoGuideOrJournalEntry(page);
    await expectNoWarehouseEntry(page);
    await expectNoAchievementEntry(page);
    await expectNoWeaponEntry(page);

    for (const label of ["任务栏", "游戏指南", "灵感手记", "仓库", "成就", "武器"]) {
      await expect(page.locator(`button[aria-label="${label}"]`)).toHaveCount(0);
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }

    if (!hasHeader) {
      test.info().annotations.push({
        type: "note",
        description: "当前环境 /play 未进入可交互顶部栏态；已完成 DOM 入口缺席断言，跳过设置中枢展开断言。",
      });
      return;
    }

    await settingsBtn.click();
    await expect(page.locator("#unified-menu-content")).toBeVisible();
    const menu = page.locator("#unified-menu-content");
    for (const marker of [
      "backpack-tab",
      "warehouse-tab",
      "achievements-tab",
      "task-tab",
      "guide-tab",
      "journal-tab",
      "weapon-tab",
    ]) {
      await expect(menu.locator(`[data-onboarding="${marker}"]`)).toHaveCount(0);
    }
    await expect(menu.locator('[data-onboarding="settings-tab"]')).toHaveCount(1);
    await expect(menu.locator('[data-onboarding="codex-tab"]')).toHaveCount(1);

    await page.getByRole("button", { name: "关闭" }).click();
    await expect(page.locator("#unified-menu-content")).toBeHidden();
  });

  test("旧指南与手记路由不会打开独立 UI", async ({ page }) => {
    for (const path of ["/guide", "/help", "/tutorial", "/manual", "/notes", "/journal", "/inspiration", "/memo"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/play(?:$|[?#])/);
      await expectNoTaskbarEntry(page);
      await expectNoGuideOrJournalEntry(page);
      await expectNoAchievementEntry(page);
      await expectNoWeaponEntry(page);
      await expect(page.locator("text=30 秒快速上手")).toHaveCount(0);
      await expect(page.locator("text=一句话总结")).toHaveCount(0);
    }
  });

  test("旧仓库与库存路由不会打开独立 UI", async ({ page }) => {
    for (const path of ["/inventory", "/warehouse", "/storage", "/bag", "/backpack", "/items", "/repository"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/play(?:$|[?#])/);
      await expectNoTaskbarEntry(page);
      await expectNoWarehouseEntry(page);
      await expectNoAchievementEntry(page);
      await expectNoWeaponEntry(page);
      await expect(page.locator("text=仓库")).toHaveCount(0);
      await expect(page.locator("text=背包")).toHaveCount(0);
      await expect(page.locator("text=库存")).toHaveCount(0);
    }
  });

  test("旧成就路由不会打开独立 UI", async ({ page }) => {
    for (const path of ["/achievement", "/achievements", "/badge", "/badges", "/trophy", "/trophies"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/play(?:$|[?#])/);
      await expectNoTaskbarEntry(page);
      await expectNoAchievementEntry(page);
      await expectNoWeaponEntry(page);
      await expect(page.locator("text=成就")).toHaveCount(0);
      await expect(page.locator("text=奖杯")).toHaveCount(0);
      await expect(page.locator("text=徽章")).toHaveCount(0);
    }
  });

  test("旧武器路由不会打开独立 UI", async ({ page }) => {
    for (const path of ["/weapon", "/weapons", "/armory", "/arsenal", "/equipment", "/equip"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/play(?:$|[?#])/);
      await expectNoTaskbarEntry(page);
      await expectNoWeaponEntry(page);
      await expect(page.locator("text=武器栏")).toHaveCount(0);
      await expect(page.locator("text=主手武器")).toHaveCount(0);
      await expect(page.locator("text=武器化预览")).toHaveCount(0);
    }
  });

  test("旧任务栏与导航容器路由不会打开独立 UI", async ({ page }) => {
    for (const path of ["/taskbar", "/tasks", "/task", "/toolbar", "/dock", "/bottom-bar", "/sidebar", "/action-bar"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/play(?:$|[?#])/);
      await expectNoTaskbarEntry(page);
      await expectNoGuideOrJournalEntry(page);
      await expectNoWarehouseEntry(page);
      await expectNoAchievementEntry(page);
      await expectNoWeaponEntry(page);
    }
  });

  test("Tab 导航不会聚焦任务栏、指南、手记、仓库、成就或武器入口", async ({ page }) => {
    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);
    await expectNoTaskbarEntry(page);
    await expectNoGuideOrJournalEntry(page);
    await expectNoWarehouseEntry(page);
    await expectNoAchievementEntry(page);
    await expectNoWeaponEntry(page);

    const focusedSnapshots: string[] = [];
    for (let i = 0; i < 30; i++) {
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
            (el.textContent ?? "").trim().slice(0, 20),
          ].join("|");
        })
      );
    }

    for (const snapshot of focusedSnapshots) {
      expect(snapshot).not.toContain("任务栏");
      expect(snapshot).not.toContain("taskbar");
      expect(snapshot).not.toContain("task-btn");
      expect(snapshot).not.toContain("task-tab");
      expect(snapshot).not.toContain("游戏指南");
      expect(snapshot).not.toContain("灵感手记");
      expect(snapshot).not.toContain("guide-tab");
      expect(snapshot).not.toContain("journal-tab");
      expect(snapshot).not.toContain("仓库");
      expect(snapshot).not.toContain("背包");
      expect(snapshot).not.toContain("库存");
      expect(snapshot).not.toContain("warehouse");
      expect(snapshot).not.toContain("backpack");
      expect(snapshot).not.toContain("inventory");
      expect(snapshot).not.toContain("成就");
      expect(snapshot).not.toContain("奖杯");
      expect(snapshot).not.toContain("徽章");
      expect(snapshot).not.toContain("achievement");
      expect(snapshot).not.toContain("achievements-tab");
      expect(snapshot).not.toContain("badge");
      expect(snapshot).not.toContain("trophy");
      expect(snapshot).not.toContain("武器");
      expect(snapshot).not.toContain("武器栏");
      expect(snapshot).not.toContain("装备");
      expect(snapshot).not.toContain("weapon");
      expect(snapshot).not.toContain("weapon-tab");
      expect(snapshot).not.toContain("equipment");
      expect(snapshot).not.toContain("armory");
      expect(snapshot).not.toContain("arsenal");
    }
  });
});
