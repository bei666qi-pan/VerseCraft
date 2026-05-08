import { expect, type Page } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const KEY_MAIN = "versecraft-storage";

type EndingScenario = "death" | "doom" | "true_escape" | "costly_escape" | "false_escape";

type EndingMockOptions = {
  scenario: EndingScenario;
  action: string;
  expectedOutcome: EndingScenario;
};

const ORDINARY_OPTIONS = ["查看门缝", "检查电表", "继续调查", "返回安全区"];

const OUTCOME_TITLE_PATTERN: Record<EndingScenario, RegExp> = {
  death: /死亡|姝讳骸/,
  doom: /终焉|缁堢剦/,
  true_escape: /真正逃离|鐪熸閫冪/,
  costly_escape: /代价逃离|浠ｄ环閫冪/,
  false_escape: /假逃离|鍋囬€冪/,
};

const DEFAULT_PROFESSION_STATE = {
  currentProfession: null,
  unlockedProfessions: [],
  eligibilityByProfession: {},
  progressByProfession: {},
  activePerks: [],
  professionFlags: {},
  professionCooldowns: {},
};

function createInitialEndingState() {
  return {
    phase: "playing",
    eligibility: null,
    finalChoice: null,
    deathContext: null,
    finalNarrative: null,
    settlementSnapshot: null,
    redirectedAt: null,
    settledAt: null,
    idempotencyKey: null,
  };
}

function createChapterState(now = Date.now()) {
  return {
    currentChapterId: "chapter-1",
    activeChapterId: "chapter-1",
    reviewChapterId: null,
    chapterTitlesById: {
      "chapter-1": "暗月初醒",
    },
    completedChapterIds: [],
    unlockedChapterIds: ["chapter-1"],
    summariesByChapterId: {},
    lastChapterEndAt: null,
    pendingChapterEndId: null,
    progressByChapterId: {
      "chapter-1": {
        chapterId: "chapter-1",
        status: "active",
        startedAt: now - 60_000,
        completedAt: null,
        turnCount: 1,
        narrativeCharCount: 420,
        keyChoiceCount: 0,
        completedBeatIds: ["wake", "observe"],
        stateChangeCount: 0,
        lastObjectiveText: "确认处境，找到第一条异常线索。",
        startedLogIndex: 0,
        completedLogIndex: null,
      },
      "chapter-2": {
        chapterId: "chapter-2",
        status: "locked",
        startedAt: null,
        completedAt: null,
        turnCount: 0,
        narrativeCharCount: 0,
        keyChoiceCount: 0,
        completedBeatIds: [],
        stateChangeCount: 0,
        lastObjectiveText: "沿第一章线索继续探索。",
        startedLogIndex: null,
        completedLogIndex: null,
      },
    },
  };
}

function createEscapeMainline(scenario: EndingScenario) {
  if (scenario !== "true_escape" && scenario !== "costly_escape" && scenario !== "false_escape") {
    return {
      v: 1,
      stage: "trapped",
      routeFragments: [],
      knownConditions: [],
      metConditions: [],
      blockers: [{ code: "unknown_exit", label: "你还不知道出口到底在哪里。", severity: "high" }],
      falseLeads: [],
      allyRequirements: [],
      costRequirements: [],
      pendingFinalAction: null,
      finalWindow: { open: false, dueTurn: 0, expiresTurn: 0, locationId: null, hint: "" },
      outcomeHint: { outcome: "none", title: "未逃离", toneLine: "" },
      lastAdvancedAtHour: 0,
      lastChangedBy: "e2e",
      historyDigest: [],
    };
  }

  const requiredConditions = [
    {
      code: "get_exit_route_map",
      label: "确认真正出口路线",
      kind: "route_hint",
      required: true,
      discoveredAtHour: 10,
    },
    {
      code: "obtain_b2_access",
      label: "取得地下二层通行权",
      kind: "access_grant",
      required: true,
      discoveredAtHour: 11,
    },
    {
      code: "secure_key_item",
      label: "带上门后的校徽钥匙",
      kind: "escape_condition",
      required: true,
      discoveredAtHour: 12,
    },
    {
      code: "gain_trust_from_gatekeeper",
      label: "让守门人相信你没有被替换",
      kind: "escape_condition",
      required: true,
      discoveredAtHour: 13,
    },
    {
      code: "survive_cost_trial",
      label: "承受出口前的代价试炼",
      kind: "cost_or_sacrifice",
      required: true,
      discoveredAtHour: 14,
    },
  ];

  return {
    v: 1,
    stage: "final_window_open",
    routeFragments: [{ code: "true_gate", label: "地下二层真正的门", confidence: 1 }],
    knownConditions: [
      ...requiredConditions,
      {
        code: "invalidate_false_route",
        label: "排除镜面假出口",
        kind: "false_lead",
        required: false,
        discoveredAtHour: 15,
      },
      {
        code: "choose_sacrifice",
        label: "确认是否用记忆支付代价",
        kind: "cost_or_sacrifice",
        required: false,
        discoveredAtHour: 16,
      },
    ],
    metConditions:
      scenario === "false_escape"
        ? ["get_exit_route_map", "obtain_b2_access", "secure_key_item", "gain_trust_from_gatekeeper", "survive_cost_trial"]
        : [
            "get_exit_route_map",
            "obtain_b2_access",
            "secure_key_item",
            "gain_trust_from_gatekeeper",
            "survive_cost_trial",
            "invalidate_false_route",
          ],
    blockers: [],
    falseLeads:
      scenario === "false_escape" ? [{ code: "mirror_exit", label: "镜中出口", hintedAtHour: 16 }] : [],
    allyRequirements: [],
    costRequirements: scenario === "costly_escape" ? ["leave_memory_at_gate"] : [],
    pendingFinalAction: null,
    finalWindow: { open: true, dueTurn: 1, expiresTurn: 200, locationId: "B2_Exit", hint: "最终窗口已打开。" },
    outcomeHint: { outcome: "none", title: "未逃离", toneLine: "" },
    lastAdvancedAtHour: 16,
    lastChangedBy: "e2e",
    historyDigest: ["final_window_open"],
  };
}

function createJournalClues(nowIso: string) {
  return [
    {
      id: "e2e_clue_mirror_exit",
      title: "镜面出口会复制人的影子",
      detail: "镜面出口看似温柔，但会把通过者复制进更深的循环。",
      kind: "trace",
      status: "verified",
      source: "dm",
      visibility: "shown",
      importance: 3,
      relatedNpcIds: [],
      relatedLocationIds: ["B2_Exit"],
      relatedItemIds: [],
      relatedObjectiveId: null,
      acquisitionSource: "e2e_seed",
      triggerSource: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "e2e_clue_school_badge_key",
      title: "校徽钥匙能稳定真正出口",
      detail: "校徽钥匙会让地下二层真正的门短暂稳定。",
      kind: "trace",
      status: "verified",
      source: "dm",
      visibility: "shown",
      importance: 3,
      relatedNpcIds: [],
      relatedLocationIds: ["B2_Exit"],
      relatedItemIds: ["school_badge_key"],
      relatedObjectiveId: null,
      acquisitionSource: "e2e_seed",
      triggerSource: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

function scenarioTime(scenario: EndingScenario) {
  if (scenario === "doom") return { day: 10, hour: 5 };
  if (scenario === "death") return { day: 2, hour: 6 };
  return { day: 3, hour: 8 };
}

function scenarioLocation(scenario: EndingScenario) {
  if (scenario === "death") return "4F_Corridor";
  if (scenario === "doom") return "10F_Rooftop";
  if (scenario === "true_escape" || scenario === "costly_escape" || scenario === "false_escape") return "B2_Exit";
  return "B1_SafeZone";
}

function createPersistedState(scenario: EndingScenario) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const runId = `e2e-ending-${scenario}-${now}`;
  const time = scenarioTime(scenario);
  const playerLocation = scenarioLocation(scenario);
  const journalClues = createJournalClues(nowIso);
  const logs = [
    {
      role: "assistant",
      content:
        "你在公寓深处停下脚步。旧墙纸像潮湿的皮肤一样贴在走廊上，门缝后传来细小的回声。",
    },
  ];
  const stats = { sanity: scenario === "death" ? 8 : 30, agility: 18, luck: 16, charm: 14, background: 12 };
  const baseSlot = {
    slotMeta: {
      slotId: "main_slot",
      label: "终局 E2E",
      createdAt: new Date(now - 120_000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      runId,
      schemaVersion: 2,
    },
    logs,
    currentOptions: ORDINARY_OPTIONS,
    time,
    stats,
    inventory: scenario.includes("escape") ? [{ id: "school_badge_key", name: "校徽钥匙", quantity: 1 }] : [],
    warehouse: [],
    codex: {
      anomaly_gate: { name: "地下二层的门", description: "它只承认真正完成条件的人。" },
    },
    journalClues,
    historicalMaxSanity: 30,
    historicalMaxFloorScore: scenario.includes("escape") ? 8 : scenario === "doom" ? 10 : 4,
    originium: 12,
    tasks: [],
    playerLocation,
    talent: null,
    talentCooldowns: {},
    professionState: DEFAULT_PROFESSION_STATE,
    chapterState: createChapterState(now),
    escapeMainline: createEscapeMainline(scenario),
    endingState: createInitialEndingState(),
    endingSettlementSnapshot: null,
  };

  return {
    currentSaveSlot: "main_slot",
    saveSlots: { main_slot: baseSlot },
    isGameStarted: true,
    playerName: "终局测试者",
    gender: "未说明",
    logs,
    currentOptions: ORDINARY_OPTIONS,
    recentOptions: ORDINARY_OPTIONS,
    inputMode: "text",
    stats,
    historicalMaxSanity: 30,
    historicalMaxFloorScore: baseSlot.historicalMaxFloorScore,
    time,
    playerLocation,
    codex: baseSlot.codex,
    tasks: [],
    warehouse: [],
    inventory: baseSlot.inventory,
    journalClues,
    weaponBag: [],
    activeMenu: null,
    talent: null,
    talentCooldowns: {},
    professionState: DEFAULT_PROFESSION_STATE,
    chapterState: baseSlot.chapterState,
    escapeMainline: baseSlot.escapeMainline,
    endingState: createInitialEndingState(),
    hasCheckedCodex: true,
  };
}

function buildNormalTurnDm(scenario: EndingScenario) {
  const base = {
    is_action_legal: true,
    sanity_damage: 0,
    is_death: false,
    consumes_time: false,
    player_location: scenarioLocation(scenario),
    options: ORDINARY_OPTIONS,
    new_tasks: [],
    task_updates: [],
    codex_updates: [],
    relationship_updates: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    currency_change: 0,
  };

  if (scenario === "death") {
    return {
      ...base,
      sanity_damage: 999,
      is_death: true,
      death_cause: "被黑影夺走最后一段清醒",
      narrative: "黑影从门缝里抬起头。你的最后一个动作被它按进墙内，意识在冷光中断裂。",
      options: [],
    };
  }

  if (scenario === "doom") {
    return {
      ...base,
      narrative: "第十日的钟声穿过走廊。你继续向前，但所有门牌都在同一秒翻成空白。",
    };
  }

  if (scenario === "true_escape") {
    return {
      ...base,
      narrative: "你推开真正的门，校徽钥匙在掌心发热。镜面出口被排除后，地下二层的风终于有了方向。",
      world_flags: ["true_exit_action"],
    };
  }

  if (scenario === "costly_escape") {
    return {
      ...base,
      narrative: "你选择付出代价通过出口，门承认你的路线，也从你身后拿走了一段再也无法复述的记忆。",
      world_flags: ["cost_paid"],
    };
  }

  return {
    ...base,
    narrative: "你相信镜中出口，镜面用温柔的光接住你。门外的风很像自由，影子却没有跟上你的脚步。",
    world_flags: ["mirror_exit"],
  };
}

function buildFinaleTurnDm(scenario: EndingScenario) {
  const narrative = [
    `最终叙事确认 outcome=${scenario}。你回想起校徽钥匙，也回想起镜面出口会复制人的影子。`,
    "公寓没有再给出普通任务，也没有发放奖励。所有走廊都退到你身后，只留下能被回看的行动、线索与代价。",
    "这段终章只为本局结算服务。它收束玩家已经做出的选择，不再打开新的调查方向，也不再生成普通下一步选项。",
    "你曾经在门缝前停留，曾经辨认地下二层的风，也曾经判断哪扇门值得相信。终局把这些判断一一归档。",
    "于是故事停在这里，等待结算页记录标题、评级、存活时间、最高抵达、关键选择和本局写作稿。",
  ].join("\n\n");

  return {
    is_action_legal: true,
    sanity_damage: 0,
    narrative,
    is_death: false,
    consumes_time: false,
    turn_mode: "system_transition",
    options: ["查看结算", "导出本局写作稿", "回看全文"],
    new_tasks: [],
    task_updates: [],
    awarded_items: [],
    awarded_warehouse_items: [],
    currency_change: 0,
    ending_finale: {
      outcome: scenario,
      narrative,
      recalled: ["校徽钥匙", "镜面出口会复制人的影子"],
      options: ["查看结算", "导出本局写作稿", "回看全文"],
    },
  };
}

function sseFinal(payload: unknown) {
  return (
    `data: __VERSECRAFT_STATUS__:{"stage":"generating"}\n\n` +
    `data: __VERSECRAFT_FINAL__:${JSON.stringify(payload)}\n\n`
  );
}

export async function installEndingMocks(page: Page, scenario: EndingScenario) {
  let chatCallCount = 0;

  await page.route("**/api/chat/queue", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ disabled: true }),
    });
  });
  await page.route("**/api/chat/queue/**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ disabled: true }),
    });
  });
  await page.route("**/api/presence/heartbeat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/analytics/heartbeat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/chat", async (route) => {
    chatCallCount += 1;
    const payload =
      chatCallCount === 1 || scenario === "death" ? buildNormalTurnDm(scenario) : buildFinaleTurnDm(scenario);
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
      body: sseFinal(payload),
    });
  });
}

export async function seedEndingPlayState(page: Page, scenario: EndingScenario) {
  await page.goto("/api/presence/heartbeat", { waitUntil: "domcontentloaded", timeout: 15_000 });
  const state = createPersistedState(scenario);
  await page.evaluate(
    async ({ dbName, storeName, key, persistedState }) => {
      localStorage.clear();
      sessionStorage.clear();
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
        store.clear();
        store.put(JSON.stringify({ state: persistedState, version: 1 }), key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    },
    { dbName: DB_NAME, storeName: STORE_NAME, key: KEY_MAIN, persistedState: state }
  );
}

async function submitPlayAction(page: Page, action: string) {
  await expect(page.getByTestId("manual-action-input")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("manual-action-input").fill(action);
  await Promise.all([
    page.waitForRequest((req) => new URL(req.url()).pathname === "/api/chat" && req.method() === "POST"),
    page.getByTestId("send-action-button").click(),
  ]);
}

async function readPersistedOutcome(page: Page): Promise<string | null> {
  return page.evaluate(
    async ({ dbName, storeName, key }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
      });
      const raw = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        tx.oncomplete = () => db.close();
      });
      if (typeof raw !== "string") return null;
      const parsed = JSON.parse(raw);
      return parsed?.state?.endingState?.settlementSnapshot?.outcome ?? null;
    },
    { dbName: DB_NAME, storeName: STORE_NAME, key: KEY_MAIN }
  );
}

async function finishNonDeathEnding(page: Page) {
  await expect(page.getByTestId("ending-final-choice-panel")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("manual-action-input")).toHaveCount(0);
  await page.getByTestId("ending-final-choice").first().click();
  await expect(page.getByTestId("ending-final-narrative-sheet")).toBeVisible({ timeout: 45_000 });
  await page.getByTestId("ending-view-settlement").click();
}

async function expectSettlementPage(page: Page, scenario: EndingScenario) {
  await page.waitForURL(/\/settlement$/, { timeout: 45_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(OUTCOME_TITLE_PATTERN[scenario], {
    timeout: 20_000,
  });
  await expect(page.getByText(/评级|璇勭骇|^[SABCDE]$/).first()).toBeVisible();
  await expect(page.getByText(/存活时间|瀛樻椿/).first()).toBeVisible();
  await expect(page.getByTestId("settlement-export-writing")).toBeVisible();
  await expect(page.getByTestId("manual-action-input")).toHaveCount(0);
  await expect(page.getByTestId("mobile-action-dock")).toHaveCount(0);
  await expect(page.getByTestId("mobile-options-dropdown")).toHaveCount(0);
  await expect(page.getByText(/查看门缝|检查电表|继续调查|返回安全区/)).toHaveCount(0);

  if (scenario === "death") {
    await expect(page.getByText(/死因|姝诲洜|sanity_depleted|黑影/).first()).toBeVisible();
  }

  await expect.poll(() => readPersistedOutcome(page), { timeout: 6_000 }).toBe(scenario);
  await page.waitForTimeout(1_200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(OUTCOME_TITLE_PATTERN[scenario], {
    timeout: 20_000,
  });
  await expect.poll(() => readPersistedOutcome(page), { timeout: 6_000 }).toBe(scenario);
  await expect(page.getByTestId("settlement-export-writing")).toBeVisible();
}

export async function runEndingE2E(page: Page, options: EndingMockOptions) {
  const clientErrors: string[] = [];
  page.on("pageerror", (error) => {
    clientErrors.push(`${error.message}\n${error.stack ?? ""}`.trim());
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      clientErrors.push(`console.error: ${message.text()}`);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await installEndingMocks(page, options.scenario);
  await seedEndingPlayState(page, options.scenario);
  await page.goto("/play", { waitUntil: "domcontentloaded", timeout: 20_000 });
  try {
    await expect(page.getByTestId("mobile-reading-shell")).toBeVisible({ timeout: 20_000 });
  } catch (error) {
    const details = clientErrors.length > 0 ? `\n\nClient errors:\n${clientErrors.join("\n\n")}` : "";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${details}`);
  }
  await submitPlayAction(page, options.action);

  if (options.scenario !== "death") {
    await finishNonDeathEnding(page);
  }

  await expectSettlementPage(page, options.expectedOutcome);
}
