import { expect, test } from "@playwright/test";

const viewports = [
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 900, height: 760 },
];

for (const viewport of viewports) {
  test(`settlement page is centered without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/settlement", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByTestId("settlement-paper-card")).toBeVisible({ timeout: 60_000 });

    const metrics = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('[data-testid="settlement-paper-card"]');
      const main = document.querySelector<HTMLElement>("main");
      if (!card || !main) throw new Error("settlement layout nodes missing");

      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      return {
        scrollX: window.scrollX,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        centerDelta: cardCenter - window.innerWidth / 2,
        mainOverflowX: getComputedStyle(main).overflowX,
      };
    });

    expect(metrics.scrollX).toBe(0);
    expect(metrics.overflow).toBeLessThanOrEqual(0);
    expect(Math.abs(metrics.centerDelta)).toBeLessThanOrEqual(1);
    expect(metrics.mainOverflowX).toBe("hidden");
  });
}
