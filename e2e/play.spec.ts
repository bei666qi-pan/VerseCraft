import { test, expect } from "@playwright/test";

const TEST_USER = process.env.E2E_USER;
const TEST_PASS = process.env.E2E_PASS;

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

  test("任务入口唯一：设置页不渲染任务板，顶部任务按钮可打开任务栏", async ({ page }) => {
    test.setTimeout(60_000);
    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);

    const settingsBtn = page.locator('button[aria-label="设置"]');
    const taskBtn = page.locator('button[aria-label="任务栏"]');
    const hasHeader = (await settingsBtn.count()) > 0 && (await taskBtn.count()) > 0;
    test.skip(!hasHeader, "当前环境 /play 未进入可交互顶部栏态（通常仅登录态具备）。");

    // 打开设置（UnifiedMenuModal）
    await settingsBtn.click();
    await expect(page.locator("#unified-menu-content")).toBeVisible();

    // 设置页不再嵌入任务板（避免出现任务板核心文案）
    await expect(page.getByText("目标板")).toHaveCount(0);
    await expect(page.getByText("正在推进")).toHaveCount(0);
    await expect(page.getByText("还能试的方向")).toHaveCount(0);
    await expect(page.getByText("约定·托付·险情")).toHaveCount(0);

    // 关闭设置
    await page.getByRole("button", { name: "关闭" }).click();
    await expect(page.locator("#unified-menu-content")).toBeHidden();

    // 顶部任务按钮仍可打开任务栏（PlayTaskPanel）
    await taskBtn.click();
    await expect(page.getByRole("heading", { name: "待办手记" })).toBeVisible();
  });
});
