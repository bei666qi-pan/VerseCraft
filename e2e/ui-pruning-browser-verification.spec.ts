import { expect, test, type Page } from "@playwright/test";

const TARGET_TERMS = [
  "\u4efb\u52a1\u680f",
  "\u6e38\u620f\u6307\u5357",
  "\u7075\u611f\u624b\u8bb0",
  "\u4ed3\u5e93",
  "\u80cc\u5305",
  "\u5e93\u5b58",
  "\u6210\u5c31",
  "\u5956\u676f",
  "\u5fbd\u7ae0",
  "\u6b66\u5668",
  "\u6b66\u5668\u680f",
  "\u88c5\u5907",
  "Taskbar",
  "taskbar",
  "GameGuide",
  "guide-tab",
  "journal-tab",
  "warehouse-tab",
  "backpack-tab",
  "achievements-tab",
  "weapon-tab",
  "equipment-tab",
  "armory-tab",
  "arsenal-tab",
];

const INTERACTIVE_SELECTOR = [
  "button",
  "a",
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  "[tabindex]",
  "[data-onboarding]",
  "[data-testid]",
  "[aria-controls]",
].join(",");

async function assertNoPrunedInteractiveEntry(page: Page, context: string) {
  const offenders = await page.locator(INTERACTIVE_SELECTOR).evaluateAll((nodes, terms) => {
    const targetTerms = terms as string[];
    const isVisible = (el: Element) => {
      const node = el as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    return nodes
      .filter(isVisible)
      .map((el) => {
        const node = el as HTMLElement;
        return [
          node.tagName,
          node.getAttribute("role") ?? "",
          node.getAttribute("aria-label") ?? "",
          node.getAttribute("title") ?? "",
          node.getAttribute("data-testid") ?? "",
          node.getAttribute("data-onboarding") ?? "",
          node.getAttribute("aria-controls") ?? "",
          (node.textContent ?? "").trim().slice(0, 120),
        ].join("|");
      })
      .filter((snapshot) => targetTerms.some((term) => snapshot.includes(term)));
  }, TARGET_TERMS);

  expect(offenders, `${context} exposed pruned interactive entries`).toEqual([]);
}

async function assertTabDoesNotReachPrunedEntry(page: Page, context: string) {
  const focused: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    focused.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "";
        return [
          el.tagName,
          el.getAttribute("role") ?? "",
          el.getAttribute("aria-label") ?? "",
          el.getAttribute("title") ?? "",
          el.getAttribute("data-testid") ?? "",
          el.getAttribute("data-onboarding") ?? "",
          el.getAttribute("aria-controls") ?? "",
          (el.textContent ?? "").trim().slice(0, 80),
        ].join("|");
      })
    );
  }

  for (const snapshot of focused) {
    for (const term of TARGET_TERMS) {
      expect(snapshot, `${context} focused pruned entry ${term}`).not.toContain(term);
    }
  }
}

test.describe("UI pruning browser verification", () => {
  test("desktop and mobile play surfaces expose no pruned interactive entries", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 900, label: "desktop" },
      { width: 390, height: 844, label: "mobile" },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const res = await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status(), viewport.label).toBeLessThan(500);
      await assertNoPrunedInteractiveEntry(page, viewport.label);
      await assertTabDoesNotReachPrunedEntry(page, viewport.label);

      await page.keyboard.press("Control+K");
      await assertNoPrunedInteractiveEntry(page, `${viewport.label} after Control+K`);
      await page.keyboard.press("?");
      await assertNoPrunedInteractiveEntry(page, `${viewport.label} after shortcut hint key`);
    }
  });

  test("legacy pruned routes redirect to the narrative surface without panels", async ({ page }) => {
    const paths = [
      "/guide",
      "/help",
      "/tutorial",
      "/notes",
      "/journal",
      "/inspiration",
      "/inventory",
      "/warehouse",
      "/storage",
      "/achievements",
      "/weapons",
      "/armory",
      "/equipment",
      "/taskbar",
      "/toolbar",
      "/dock",
    ];

    for (const path of paths) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(res?.status(), path).toBeLessThan(500);
      await expect(page, path).toHaveURL(/\/play(?:$|[?#])/);
      await assertNoPrunedInteractiveEntry(page, path);
    }
  });
});
