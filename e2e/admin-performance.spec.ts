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

test.describe("Admin dashboard performance baseline", () => {
  test("first paint and refresh loop should stay smooth", async ({ context, page, baseURL }) => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "需要 ADMIN_PASSWORD 以进入后台页面");

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

    await page.goto("/saiduhsa", { waitUntil: "domcontentloaded", timeout: 20_000 });
    await expect(page.getByText("运营决策台")).toBeVisible({ timeout: 15_000 });

    const perf = await page.evaluate(async () => {
      const anyWindow = window as Window & {
        __longTaskCount?: number;
        __maxLongTaskMs?: number;
      };
      anyWindow.__longTaskCount = 0;
      anyWindow.__maxLongTaskMs = 0;
      const PerfObs = (window as unknown as { PerformanceObserver?: typeof PerformanceObserver }).PerformanceObserver;
      let observer: PerformanceObserver | null = null;
      if (PerfObs) {
        observer = new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          for (const e of entries) {
            anyWindow.__longTaskCount = (anyWindow.__longTaskCount ?? 0) + 1;
            anyWindow.__maxLongTaskMs = Math.max(anyWindow.__maxLongTaskMs ?? 0, e.duration);
          }
        });
        observer.observe({ type: "longtask", buffered: true });
      }
      const start = performance.now();
      let frames = 0;
      await new Promise<void>((resolve) => {
        const tick = () => {
          frames += 1;
          if (performance.now() - start >= 7000) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      observer?.disconnect();
      const elapsed = performance.now() - start;
      const fps = frames / (elapsed / 1000);
      return {
        fps,
        longTaskCount: anyWindow.__longTaskCount ?? 0,
        maxLongTaskMs: anyWindow.__maxLongTaskMs ?? 0,
      };
    });

    expect(errors.length, `page errors: ${errors.join(" | ")}`).toBe(0);
    expect(perf.fps).toBeGreaterThan(20);
    expect(perf.maxLongTaskMs).toBeLessThan(400);
    expect(perf.longTaskCount).toBeLessThan(20);
  });
});

