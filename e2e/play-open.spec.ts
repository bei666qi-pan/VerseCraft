import { test, expect } from "@playwright/test";

/**
 * 无登录轻量冒烟：/play 可加载且无 React 致命错误。
 * 不依赖大模型、数据库中有测试账号。
 */
test.describe("Play page (guest)", () => {
  test("loads /play without login and no client-side exception overlay", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message + "\n" + (err.stack ?? ""));
    });

    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);

    await page.waitForTimeout(2000);

    const body = await page.locator("body").innerText();
    const hasAppError = body.includes("Application error") || body.includes("client-side exception");
    expect(hasAppError, `Unexpected error overlay. Errors: ${errors.slice(0, 3).join(" | ")}`).toBe(false);
    const hookErrors = errors.filter((e) => e.includes("310") || e.includes("more hooks"));
    expect(hookErrors.length, `React hooks error: ${hookErrors.join("; ")}`).toBe(0);
  });
});
