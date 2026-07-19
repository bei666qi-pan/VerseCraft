import { expect, test, type Page } from "@playwright/test";

const shouldRunLive = process.env.E2E_AI_LIVE === "1";

async function seedPlayableState(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("keyval")) request.result.createObjectStore("keyval");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const professionState = { currentProfession: null, unlockedProfessions: [], eligibilityByProfession: {}, progressByProfession: {}, activePerks: [], professionFlags: {}, professionCooldowns: {} };
    const state = {
      currentSaveSlot: "main_slot",
      saveSlots: {
        main_slot: {
          logs: [{ role: "assistant", content: "真实浏览器回合开始前，走廊尽头的灯闪了一下。" }],
          currentOptions: ["检查灯光", "观察走廊", "查看门牌", "原地等待"],
          time: { day: 1, hour: 20 },
          stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 },
          inventory: [], codex: {}, historicalMaxSanity: 30, originium: 0, tasks: [],
          playerLocation: "1F_Lobby", dynamicNpcStates: {}, mainThreatByFloor: {},
          talent: null, talentCooldowns: {}, professionState,
        },
      },
      isGameStarted: true, playerName: "真实回合测试者", gender: "未说明",
      logs: [{ role: "assistant", content: "真实浏览器回合开始前，走廊尽头的灯闪了一下。" }],
      currentOptions: ["检查灯光", "观察走廊", "查看门牌", "原地等待"], recentOptions: ["检查灯光", "观察走廊", "查看门牌", "原地等待"], inputMode: "options",
      stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 }, historicalMaxSanity: 30,
      time: { day: 1, hour: 20 }, playerLocation: "1F_Lobby", inventory: [], codex: {}, tasks: [], warehouse: [], journalClues: [], weaponBag: [], activeMenu: null,
      dynamicNpcStates: {}, mainThreatByFloor: {}, talent: null, talentCooldowns: {}, professionState,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("keyval", "readwrite");
      transaction.objectStore("keyval").put(JSON.stringify({ state, version: 3 }), "versecraft-storage");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

function extractFinal(body: string): Record<string, unknown> {
  const prefix = "__VERSECRAFT_FINAL__:";
  const line = body.split(/\r?\n/).find((item) => item.startsWith(`data: ${prefix}`));
  if (!line) throw new Error("missing authoritative final SSE frame");
  return JSON.parse(line.slice(`data: ${prefix}`.length)) as Record<string, unknown>;
}

test.describe("/play real gateway turn", () => {
  test("actual browser input commits an authoritative live DM turn", async ({ page }) => {
    test.skip(!shouldRunLive, "Set E2E_AI_LIVE=1 to run the opt-in real gateway browser turn.");
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await seedPlayableState(page);
    await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 20_000 });
    const input = page.getByTestId("manual-action-input");
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill("检查一楼大厅的灯光和门牌，不要凭空获得道具或完成任务。");

    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/chat" &&
      response.request().method() === "POST" &&
      response.status() === 200 &&
      (response.request().postData() ?? "").includes("检查一楼大厅的灯光和门牌")
    );
    await page.getByTestId("send-action-button").click();
    const response = await responsePromise;
    const responseBody = await response.text();
    expect(response.status(), `unexpected /api/chat response: ${responseBody.slice(0, 800)}`).toBe(200);
    expect(response.headers()["content-type"] ?? "").toContain("text/event-stream");
    const final = extractFinal(responseBody);
    expect(typeof final.narrative).toBe("string");
    expect(String(final.narrative).trim().length).toBeGreaterThan(0);
    expect(typeof final.is_action_legal).toBe("boolean");

    await expect(input).toHaveValue("");
    await expect(input).toBeEnabled({ timeout: 30_000 });
    await expect(page.locator("body")).toContainText(String(final.narrative).slice(0, 12), { timeout: 30_000 });
    await expect(page.getByText("本回合未提交")).toHaveCount(0);
    await expect(page.getByText("Application error")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
