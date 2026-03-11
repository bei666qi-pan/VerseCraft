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
});
