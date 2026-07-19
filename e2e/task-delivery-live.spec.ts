import { expect, test, type Page } from "@playwright/test";

const shouldRunLive = process.env.E2E_AI_LIVE === "1";

async function seedDeliverableTaskState(page: Page, withRegisteredLetter = true): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(async (withRegisteredLetter) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("keyval-store");
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("keyval")) request.result.createObjectStore("keyval");
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const deliveryTask = {
      id: "t_delivery_letter_b1",
      title: "交付挂号信",
      desc: "把登记在行囊里的挂号信交给配电间的老刘。",
      issuerId: "N-008",
      issuerName: "电工老刘",
      type: "main",
      reward: { originium: 0 },
      status: "active",
      floorTier: "B1",
      guidanceLevel: "standard",
      hiddenTriggerConditions: [],
      claimMode: "auto",
      npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      highRiskHighReward: false,
      worldConsequences: [],
    };
    const professionState = { currentProfession: null, unlockedProfessions: [], eligibilityByProfession: {}, progressByProfession: {}, activePerks: [], professionFlags: {}, professionCooldowns: {} };
    const state = {
      currentSaveSlot: "main_slot",
      saveSlots: {},
      isGameStarted: true,
      isGuest: true,
      guestId: "task-delivery-live",
      playerName: "任务交付测试者",
      gender: "未说明",
      logs: [{ role: "assistant", content: "老刘在配电间等你把登记信件交过去。" }],
      time: { day: 2, hour: 10 },
      stats: { sanity: 20, agility: 8, luck: 6, charm: 5, background: 9 },
      historicalMaxSanity: 20,
      inventory: withRegisteredLetter ? [{ id: "I-B08", name: "挂号信", description: "登记在行囊中的信件", type: "clue" }] : [],
      warehouse: [],
      codex: { "N-008": { id: "N-008", name: "电工老刘", type: "npc", description: "配电间的服务者" } },
      tasks: [deliveryTask],
      playerLocation: "B1_PowerRoom",
      dynamicNpcStates: { "N-008": { npcId: "N-008", locationId: "B1_PowerRoom" } },
      mainThreatByFloor: {},
      talent: null,
      talentCooldowns: {},
      weaponBag: [],
      equippedWeapon: null,
      journalClues: [],
      originium: 0,
      professionState,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("keyval", "readwrite");
      transaction.objectStore("keyval").put(JSON.stringify({ state, version: 3 }), "versecraft-storage");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  }, withRegisteredLetter);
}

function extractFinal(body: string): Record<string, unknown> {
  const prefix = "__VERSECRAFT_FINAL__:";
  const line = body.split(/\r?\n/).find((item) => item.startsWith(`data: ${prefix}`));
  if (!line) throw new Error("missing authoritative final SSE frame");
  return JSON.parse(line.slice(`data: ${prefix}`.length)) as Record<string, unknown>;
}

test.describe("/play real gateway task delivery", () => {
  test("a natural-language delivery consumes the registered item and visibly completes the task", async ({ page }) => {
    test.skip(!shouldRunLive, "Set E2E_AI_LIVE=1 to run the opt-in real gateway task delivery flow.");
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDeliverableTaskState(page);
    await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 20_000 });

    const input = page.getByTestId("manual-action-input");
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill("把已持有的挂号信交给老刘完成委托");
    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/chat" &&
      response.request().method() === "POST" &&
      response.status() === 200 &&
      (response.request().postData() ?? "").includes("把已持有的挂号信交给老刘完成委托")
    );
    await page.getByTestId("send-action-button").click();
    const response = await responsePromise;
    const final = extractFinal(await response.text());
    const requestPayload = JSON.parse(response.request().postData() ?? "{}") as { clientState?: { inventoryItemIds?: unknown; activeTaskIds?: unknown; playerLocation?: unknown } };

    expect(response.headers()["content-type"] ?? "").toContain("text/event-stream");
    expect(requestPayload.clientState?.inventoryItemIds, "browser request must include the held delivery item").toEqual(expect.arrayContaining(["I-B08"]));
    expect(requestPayload.clientState?.activeTaskIds, "browser request must include the active delivery task").toEqual(expect.arrayContaining(["t_delivery_letter_b1"]));
    expect(requestPayload.clientState?.playerLocation, "browser request must preserve the delivery location").toBe("B1_PowerRoom");
    const finalDiagnostic = JSON.stringify(final);
    expect(final.consumed_items, finalDiagnostic).toEqual(expect.arrayContaining(["I-B08"]));
    expect(final.task_updates, finalDiagnostic).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "t_delivery_letter_b1", status: "completed" }),
    ]));

    await expect(input).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("bottom-nav-tasks").click();
    const panel = page.getByTestId("mobile-task-panel");
    await expect(panel).toContainText("已完成 1", { timeout: 20_000 });
    await panel.getByRole("button", { name: /已完成 1/ }).click();
    await expect(panel).toContainText("交付挂号信");
  });

  test("a claimed but absent letter stays active and is never fabricated into a completion", async ({ page }) => {
    test.skip(!shouldRunLive, "Set E2E_AI_LIVE=1 to run the opt-in real gateway task delivery flow.");
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await seedDeliverableTaskState(page, false);
    await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 20_000 });

    const input = page.getByTestId("manual-action-input");
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill("把我声称持有的挂号信交给老刘完成委托；如果行囊没有登记信件，任务不得完成。 ");
    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/chat" &&
      response.request().method() === "POST" &&
      response.status() === 200 &&
      (response.request().postData() ?? "").includes("行囊没有登记信件")
    );
    await page.getByTestId("send-action-button").click();
    const response = await responsePromise;
    const final = extractFinal(await response.text());
    const requestPayload = JSON.parse(response.request().postData() ?? "{}") as { clientState?: { inventoryItemIds?: unknown; activeTaskIds?: unknown } };

    expect(requestPayload.clientState?.inventoryItemIds).toEqual([]);
    expect(requestPayload.clientState?.activeTaskIds).toEqual(expect.arrayContaining(["t_delivery_letter_b1"]));
    expect(final.consumed_items).toEqual([]);
    expect(final.task_updates ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "t_delivery_letter_b1", status: "completed" }),
    ]));
    expect(String(final.narrative)).toContain("不能凭空取出信件");

    await page.getByTestId("bottom-nav-tasks").click();
    const panel = page.getByTestId("mobile-task-panel");
    await expect(panel).toContainText("交付挂号信", { timeout: 20_000 });
    await expect(panel).toContainText("当前目标");
  });
});
