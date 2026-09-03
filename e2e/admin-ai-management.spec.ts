import { test, expect } from "@playwright/test";

test("admin gate hides the console from unauthenticated visitors", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "后台登录" })).toBeVisible();
  await expect(page.getByTestId("admin-ai-management")).toHaveCount(0);
});

test.describe("authenticated AI console", () => {
  test.skip(!process.env.ADMIN_PASSWORD, "需要 ADMIN_PASSWORD 登录后台");
  test("shows exactly four plain-language destinations without secret-view action", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel(/管理密码|后台密码|密码/).fill(process.env.ADMIN_PASSWORD!);
    await page.getByRole("button", { name: /进入|登录/ }).click();
    const nav = page.getByRole("navigation", { name: "后台主导航" });
    await expect(nav.getByRole("button")).toHaveCount(4);
    for (const label of ["运营概览", "AI 管理", "玩家与反馈", "系统状态"]) await expect(nav.getByRole("button", { name: label })).toBeVisible();
    await nav.getByRole("button", { name: "AI 管理" }).click();
    await expect(page.getByText("Token 消耗")).toBeVisible();
    await expect(page.getByText("人民币预计费用")).toBeVisible();
    await expect(page.getByRole("button", { name: /查看.*Key|显示.*Key/ })).toHaveCount(0);
  });
});
