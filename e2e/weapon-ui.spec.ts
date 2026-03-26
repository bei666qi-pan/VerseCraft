import { test, expect } from "@playwright/test";

async function createGuestCharacterWithWeaponizableStart(page: any) {
  test.setTimeout(90_000);
  // e2e=1 bypasses server moderation pipeline in dev, avoiding DB/AI dependency.
  await page.goto("/create?e2e=1", { waitUntil: "domcontentloaded", timeout: 20_000 });
  await page.getByPlaceholder("请输入 2-6 字").fill("测试者");
  await page.getByPlaceholder("仅限 2-6 个中文字符").fill("冷静");

  // Choose a talent (required).
  await page.getByRole("button", { name: "时间回溯" }).click();

  // Allocate all 30 points into 背景/出身 to force B/A starting item (weaponizable).
  const incBackground = page.getByRole("button", { name: "增加出身" });
  for (let i = 0; i < 30; i++) {
    await incBackground.click();
  }

  await page.locator("button", { hasText: "开卷" }).click({ force: true });
  await page.waitForURL(/\/play/, { timeout: 60_000 });
}

test.describe("Weapon UI smoke (guest)", () => {
  test("settings: weapon slot panel renders and shows empty slot hint", async ({ page }) => {
    await createGuestCharacterWithWeaponizableStart(page);

    await page.getByRole("button", { name: "设置" }).click();

    await expect(page.getByRole("heading", { name: "武器栏" })).toBeVisible();
    await expect(page.getByText("空槽").first()).toBeVisible();
    await expect(page.getByText("装备/卸下/更换均需消耗").first()).toBeVisible();
  });

  test("backpack: weaponizable tag is visible for high-tier starting item", async ({ page }) => {
    await createGuestCharacterWithWeaponizableStart(page);

    await page.getByRole("button", { name: "设置" }).click();
    await page.getByRole("button", { name: "灵感手记" }).click();

    // High value regression: inventory item should be tagged as weaponizable (C+).
    await expect(page.locator("span", { hasText: "可武器化" }).first()).toBeVisible();
  });
});

