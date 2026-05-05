import { expect, test, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

const options = ["靠近门缝听声", "检查学生电子表", "沿血手印方向前进", "先躲进旁边教室"];

const allTalentCooldowns = {
  时间回溯: 0,
  命运馈赠: 0,
  主角光环: 0,
  生命汇源: 0,
  洞察之眼: 0,
  丧钟回响: 0,
};

const defaultProfessionState = {
  currentProfession: null,
  unlockedProfessions: [],
  eligibilityByProfession: {
    守灯人: false,
    巡迹客: false,
    觅兆者: false,
    齐日角: false,
    溯源师: false,
  },
  progressByProfession: {
    守灯人: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_lampkeeper", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    巡迹客: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_pathfinder", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    觅兆者: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_omenseeker", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    齐日角: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_sunhorn", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
    溯源师: { statQualified: false, behaviorQualified: false, behaviorEvidenceCount: 0, behaviorEvidenceTarget: 2, trialTaskId: "profession_trial_traceorigin", trialTaskCompleted: false, certified: false, behaviorEvidenceKeys: [] },
  },
  activePerks: [],
  professionFlags: {},
  professionCooldowns: {},
};

async function seedPlayableState(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.evaluate(
    async ({ dbName, storeName, key, actionOptions, defaultCooldowns, defaultProfession }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
        };
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const baseState = {
          currentSaveSlot: "main_slot",
          saveSlots: {
            main_slot: {
              logs: [{ role: "assistant", content: "走廊尽头的灯闪了一下，门后有极轻的摩擦声。" }],
              currentOptions: actionOptions,
              time: { day: 1, hour: 20 },
              stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 },
              inventory: [],
              codex: {},
              historicalMaxSanity: 30,
              originium: 0,
              tasks: [],
              playerLocation: "1F_Lobby",
              dynamicNpcStates: {},
              mainThreatByFloor: {},
              talent: null,
              talentCooldowns: { ...defaultCooldowns },
              professionState: defaultProfession,
            },
          },
          isGameStarted: true,
          playerName: "测试读者",
          gender: "未说明",
          logs: [{ role: "assistant", content: "走廊尽头的灯闪了一下，门后有极轻的摩擦声。" }],
          currentOptions: actionOptions,
          recentOptions: actionOptions,
          inputMode: "options",
          stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 },
          historicalMaxSanity: 30,
          time: { day: 1, hour: 20 },
          playerLocation: "1F_Lobby",
          inventory: [],
          codex: {},
          tasks: [],
          warehouse: [],
          journalClues: [],
          weaponBag: [],
          activeMenu: null,
          dynamicNpcStates: {},
          mainThreatByFloor: {},
          talent: null,
          talentCooldowns: { ...defaultCooldowns },
          professionState: defaultProfession,
        };
        store.put(JSON.stringify({ state: baseState, version: 1 }), key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    {
      dbName: DB_NAME,
      storeName: STORE_NAME,
      key: KEY_MAIN,
      actionOptions: options,
      defaultCooldowns: allTalentCooldowns,
      defaultProfession: defaultProfessionState,
    }
  );
}

function buildSseFinalFrame() {
  return `data: __VERSECRAFT_FINAL__:${JSON.stringify({
    is_action_legal: true,
    sanity_damage: 0,
    narrative: "门后的摩擦声停住了，像有人隔着木板屏住呼吸。",
    is_death: false,
    consumes_time: false,
    options,
  })}\n\n`;
}

test.describe("chat queue UI", () => {
  test("shows position and ETA, then resumes the original stream without duplicate queue tickets", async ({ page }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    let queueSubmissions = 0;
    let chatSubmissions = 0;
    let allowReady = false;
    let chatQueueHeader: string | null = null;

    await page.route("**/api/chat/queue", async (route) => {
      queueSubmissions += 1;
      await route.fulfill({
        status: 202,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "1",
        },
        body: JSON.stringify({
          queueId: "vcq_e2e_player_wait",
          requestId: "rq-e2e-player-wait",
          status: "queued",
          position: 2,
          etaSeconds: 24,
          retryAfterSeconds: 1,
        }),
      });
    });

    await page.route("**/api/chat/queue/status?*", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": "1",
        },
        body: JSON.stringify({
          queueId: "vcq_e2e_player_wait",
          requestId: "rq-e2e-player-wait",
          status: allowReady ? "running" : "queued",
          position: allowReady ? 0 : 2,
          etaSeconds: allowReady ? 0 : 24,
          retryAfterSeconds: 1,
        }),
      });
    });

    await page.route("**/api/chat", async (route) => {
      chatSubmissions += 1;
      chatQueueHeader = route.request().headers()["x-versecraft-chat-queue-id"] ?? null;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "text/event-stream; charset=utf-8" },
        body: buildSseFinalFrame(),
      });
    });

    const viewports = [
      { width: 390, height: 844 },
      { width: 393, height: 852 },
      { width: 430, height: 932 },
    ];
    for (let viewportIndex = 0; viewportIndex < viewports.length; viewportIndex += 1) {
      const viewport = viewports[viewportIndex];
      await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${80 + viewportIndex}` });
      await page.setViewportSize(viewport);
      await seedPlayableState(page);
      await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 15_000 });
      await expect(page.getByTestId("mobile-action-dock")).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("manual-action-input").fill("查看门后");
      await page.getByTestId("send-action-button").click();
      await page.getByTestId("send-action-button").click({ force: true }).catch(() => undefined);

      const queuePanel = page.getByTestId("chat-queue-status");
      await expect(queuePanel).toContainText("当前生成通道繁忙，已为你保留本次行动", { timeout: 10_000 });
      await expect(queuePanel).toContainText("你前面还有 2 人");
      await expect(queuePanel).toContainText("预计等待约 24 秒");
      await expect(queuePanel).toContainText("不用重复提交");

      const layout = await page.evaluate(() => {
        const panel = document.querySelector<HTMLElement>('[data-testid="chat-queue-status"]');
        const dock = document.querySelector<HTMLElement>('[data-testid="mobile-action-dock"]');
        if (!panel || !dock) throw new Error("missing queue panel or action dock");
        const panelRect = panel.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        return {
          horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
          panelBottom: panelRect.bottom,
          dockTop: dockRect.top,
        };
      });
      expect(layout.horizontalOverflow, `${viewport.width}x${viewport.height} should not overflow horizontally`).toBeLessThanOrEqual(1);
      expect(layout.panelBottom, `${viewport.width}x${viewport.height} queue panel should not cover action dock`).toBeLessThan(
        layout.dockTop
      );

      const expectedChatSubmissions = chatSubmissions + 1;
      allowReady = true;
      await expect.poll(() => chatSubmissions, { timeout: 10_000 }).toBe(expectedChatSubmissions);
      await expect.poll(() => chatQueueHeader, { timeout: 10_000 }).toBe("vcq_e2e_player_wait");
      await expect(page.locator("body")).toContainText("门后的摩擦声停住了", { timeout: 10_000 });
      await expect(page.getByTestId("chat-queue-status")).toHaveCount(0);
      allowReady = false;
    }

    expect(queueSubmissions).toBe(3);
    expect(chatSubmissions).toBe(3);
    const hookErrors = errors.filter((e) => e.includes("310") || e.includes("more hooks"));
    expect(hookErrors, `React hook errors: ${hookErrors.join("; ")}`).toHaveLength(0);
  });
});
