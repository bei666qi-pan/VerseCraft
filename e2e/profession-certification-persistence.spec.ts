import { expect, test, type Page } from "@playwright/test";

const shouldRunLive = process.env.E2E_AI_LIVE === "1";

async function seedReloadableCertificationState(page: Page): Promise<void> {
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
    const completedTask = (id: string) => ({
      id,
      title: id,
      desc: "已完成的认证前置",
      issuerId: "N-008",
      issuerName: "电工老刘",
      type: "main",
      reward: { originium: 0 },
      status: "completed",
      floorTier: "1",
      guidanceLevel: "standard",
      hiddenTriggerConditions: [],
      claimMode: "auto",
      npcProactiveGrant: { enabled: false, npcId: null, minFavorability: 0, preferredLocations: [], cooldownHours: 0 },
      highRiskHighReward: false,
      worldConsequences: [],
    });
    const professionState = {
      currentProfession: null,
      unlockedProfessions: [],
      eligibilityByProfession: { 守灯人: true, 巡迹客: false, 觅兆者: false, 齐日角: false, 溯源师: false },
      progressByProfession: {},
      activePerks: [],
      professionFlags: {},
      professionCooldowns: {},
    };
    const tasks = [completedTask("prof_trial_lampkeeper"), completedTask("certifier_proof")];
    // This is the state *after* a structured certifier encounter was committed
    // and then persisted. It intentionally excludes transient currentOptions.
    const state = {
      currentSaveSlot: "main_slot",
      saveSlots: {},
      isGameStarted: true,
      isGuest: true,
      guestId: "profession-reload-live",
      playerName: "认证重载测试者",
      gender: "未说明",
      logs: [{ role: "assistant", content: "老刘刚刚确认了你的试炼记录。" }],
      time: { day: 2, hour: 10 },
      stats: { sanity: 20, agility: 8, luck: 6, charm: 5, background: 9 },
      historicalMaxSanity: 20,
      inventory: [],
      warehouse: [],
      codex: { "N-008": { id: "N-008", name: "电工老刘", type: "npc", description: "认证签发者" } },
      tasks,
      playerLocation: "1F_Lobby",
      dynamicNpcStates: {},
      mainThreatByFloor: {
        "1": { floorId: "1", threatId: "A-001", phase: "suppressed", suppressionProgress: 80, lastResolvedAtHour: 9, counterHintsUsed: [] },
      },
      talent: null,
      talentCooldowns: {},
      weaponBag: [],
      equippedWeapon: null,
      journalClues: [],
      originium: 0,
      hasMetProfessionCertifier: true,
      professionState,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("keyval", "readwrite");
      transaction.objectStore("keyval").put(JSON.stringify({ state, version: 3 }), "versecraft-storage");
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

test.describe("/play persisted profession certification", () => {
  test("a persisted structured encounter restores a clickable certification choice after reload", async ({ page }) => {
    test.skip(!shouldRunLive, "Set E2E_AI_LIVE=1 to run the opt-in real gateway certification flow.");
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await seedReloadableCertificationState(page);
    await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 20_000 });

    await page.getByTestId("options-toggle-button").click();
    const certification = page.getByTestId("mobile-option-item").filter({ hasText: "认证职业：守灯人" });
    await expect(certification).toBeVisible({ timeout: 20_000 });

    const responsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/chat" &&
      response.request().method() === "POST" &&
      response.status() === 200 &&
      (response.request().postData() ?? "").includes("我选择认证职业：【守灯人】")
    );
    await certification.click();
    const response = await responsePromise;
    expect(response.headers()["content-type"] ?? "").toContain("text/event-stream");

    await page.getByTestId("bottom-nav-character").click();
    await expect(page.getByTestId("character-current-profession")).toContainText("守灯人", { timeout: 20_000 });
  });
});
