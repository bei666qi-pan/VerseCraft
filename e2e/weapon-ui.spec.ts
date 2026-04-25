import { test, expect } from "@playwright/test";

async function expectNoWeaponUi(page: import("@playwright/test").Page) {
  for (const label of ["武器", "武器栏", "装备", "兵器库", "军械库", "Weapon", "Weapons", "Equipment", "Armory", "Arsenal"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
  }

  for (const marker of ["weapon-tab", "equipment-tab", "armory-tab", "arsenal-tab"]) {
    await expect(page.locator(`[data-onboarding="${marker}"]`)).toHaveCount(0);
  }

  for (const testId of ["weapon", "weapon-button", "weapon-panel", "weapons", "equipment", "equipment-button", "armory", "arsenal"]) {
    await expect(page.locator(`[data-testid="${testId}"]`)).toHaveCount(0);
  }
}

test.describe("Pruned equipment and storage UI", () => {
  test("play page does not expose backpack, warehouse, or weapon panels", async ({ page }) => {
    const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
    expect(res?.status()).toBeLessThan(500);

    for (const label of ["背包", "仓库", "库存", "武器栏", "武器"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: label, exact: true })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: label, exact: true })).toHaveCount(0);
    }

    for (const marker of ["backpack-tab", "warehouse-tab", "weapon-tab"]) {
      await expect(page.locator(`[data-onboarding="${marker}"]`)).toHaveCount(0);
    }
    await expectNoWeaponUi(page);
  });

  test("legacy weapon routes do not expose weapon panels", async ({ page }) => {
    for (const path of ["/weapon", "/weapons", "/armory", "/arsenal", "/equipment", "/equip"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status()).toBeLessThan(500);
      await expect(page).toHaveURL(/\/play(?:$|[?#])/);
      await expectNoWeaponUi(page);
      await expect(page.locator("text=武器栏")).toHaveCount(0);
      await expect(page.locator("text=主手武器")).toHaveCount(0);
      await expect(page.locator("text=武器化预览")).toHaveCount(0);
    }
  });
});
