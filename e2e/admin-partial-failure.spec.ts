import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = createHmac("sha256", `${Date.now()}-${Math.random()}`)
    .update(adminPassword)
    .digest("base64url")
    .slice(0, 24);
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.describe("Admin dashboard partial API failure", () => {
  test.setTimeout(90_000);

  test("single /api/admin/* 500 still renders other panels", async ({ page, context, baseURL }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "需要 ADMIN_PASSWORD 以进入后台页面");

    await page.route("**/api/admin/overview?**", (route) => {
      void route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "e2e_simulated_failure" }),
      });
    });

    const url = new URL(baseURL ?? "http://127.0.0.1:666");
    await context.addCookies([
      {
        name: ADMIN_COOKIE,
        value: buildAdminShadowCookie(adminPassword),
        domain: url.hostname,
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    await expect(page.locator("select").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "运营决策台" })).toBeVisible();
    await expect(page.getByTestId("admin-user-table-panel")).toBeVisible();
    await expect(page.getByTestId("admin-degraded-banner")).toBeVisible();
    expect(errors.length, `page errors: ${errors.join(" | ")}`).toBe(0);
  });
});
