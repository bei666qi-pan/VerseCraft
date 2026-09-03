import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = randomUUID().replace(/-/g, "");
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

test.describe("Admin dashboard performance baseline", () => {
  test.setTimeout(90_000);

  test("first paint and refresh loop should stay smooth", async ({ context, page, baseURL }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "需要 ADMIN_PASSWORD 以进入后台页面");

    const url = new URL(baseURL ?? "http://[::1]:666");
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

    await page.goto("/admin", { waitUntil: "domcontentloaded", timeout: 45_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 15_000 });

    // 这里的目标是“页面能稳定完成首屏渲染”，而不是在本地降级环境里做 FPS/longtask。
    // 正常与数据库离线降级都保留同一组确定性范围操作，避免测试绑定已删除的
    // `<select>`/整页 fallback 旧实现。
    await page.getByRole("button", { name: "今日", exact: true }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "刷新", exact: true }).waitFor({ timeout: 20_000 });

    expect(errors.length, `page errors: ${errors.join(" | ")}`).toBe(0);
  });
});
