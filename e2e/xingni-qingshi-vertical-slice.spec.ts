import { expect, test, type Page, type Route } from "@playwright/test";

const DB_NAME = "keyval-store";
const STORE_NAME = "keyval";
const STORE_KEY = "versecraft-storage";

type XingniState = {
  kind: "xingni_taichu";
  cultivation: { realm: "炼气2层" | "炼气3层" | "炼气4层"; progress: number; qiSeaDamaged: boolean };
  spiritRoot: "青木" | "赤火" | "玄水";
  spiritStones: number;
  techniqueIds: string[];
  recipeIds: string[];
  reputation: number;
  credentials: Array<"combat" | "alchemy" | "refining">;
  ascensionTrial: "locked" | "eligible" | "passed";
  unlockedMapIds: string[];
};

const locationNames: Record<string, string> = {
  南城门: "QS_SOUTH_GATE",
  归雁客栈: "QS_GUOYAN_INN",
  散修坊市: "QS_CULTIVATOR_MARKET",
  百草堂: "QS_HERB_HALL",
  黑松岭: "QS_BLACK_PINE_RIDGE",
  灵泉洞: "QS_SPIRIT_SPRING_CAVE",
  县衙镇邪司: "QS_EXORCISM_OFFICE",
  升仙台: "QS_ASCENSION_TERRACE",
};

async function seedLegacyDarkMoonSlot(page: Page) {
  // Use a same-origin static asset so React/Zustand cannot hydrate and overwrite
  // the legacy fixture while it is being written.
  await page.goto("/icons/icon-192x192.png");
  await page.evaluate(async ({ dbName, storeName, key }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(JSON.stringify({ version: 3, state: {
        currentSaveSlot: "main_slot",
        worldId: "dark_moon_prologue",
        mapId: "dark_moon_apartment",
        unlockedMapIds: ["dark_moon_apartment"],
        worldState: null,
        saveSlots: { main_slot: { logs: [], stats: { sanity: 30, agility: 20, luck: 20, charm: 20, background: 20 }, inventory: [], time: { day: 0, hour: 0 }, codex: {}, historicalMaxSanity: 30, worldId: "dark_moon_prologue", mapId: "dark_moon_apartment" } },
        isGameStarted: false,
      }}), key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }, { dbName: DB_NAME, storeName: STORE_NAME, key: STORE_KEY });
}

function installXingniChatMock(page: Page, spiritRoot: XingniState["spiritRoot"] = "青木") {
  let state: XingniState = {
    kind: "xingni_taichu", cultivation: { realm: "炼气2层", progress: 0, qiSeaDamaged: true }, spiritRoot,
    spiritStones: 12, techniqueIds: ["xingni_breathing_foundation"], recipeIds: [], reputation: 0,
    credentials: [], ascensionTrial: "locked", unlockedMapIds: ["xingni_qingshi_county"],
  };
  const addCredential = (credential: "combat" | "alchemy" | "refining") => {
    state = { ...state, credentials: [...new Set([...state.credentials, credential])] };
    if (state.cultivation.realm === "炼气4层" && state.credentials.length >= 2) state = { ...state, ascensionTrial: "eligible" };
  };

  void page.route("**/api/chat/queue", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ disabled: true }) }));
  void page.route("**/api/chat", async (route: Route) => {
    const body = route.request().postDataJSON() as { messages?: Array<{ content?: string }> };
    const action = String(body.messages?.at(-1)?.content ?? "");
    let playerLocation: string | undefined;
    let awardedItems: Array<Record<string, unknown>> = [];
    const destination = Object.entries(locationNames).find(([name]) => action.includes(`前往${name}`));
    if (destination) playerLocation = destination[1];

    if (action.includes("采集灵叶")) {
      awardedItems = [
        { id: "xq_herb_spirit_leaf", name: "凝露灵叶", tier: "D", description: "聚气散灵材", tags: "xingni,herb", ownerId: "xingni_qingshi_county" },
        { id: "xq_herb_sun_seed", name: "阳籽", tier: "D", description: "聚气散灵材", tags: "xingni,herb", ownerId: "xingni_qingshi_county" },
      ];
    }
    if (action.includes("铁背獠猪")) addCredential("combat");
    if (action.includes("吐纳法修炼")) {
      if (state.cultivation.realm === "炼气2层" && state.cultivation.progress === 50) state = { ...state, cultivation: { realm: "炼气3层", progress: 0, qiSeaDamaged: false } };
      else if (state.cultivation.realm === "炼气3层" && state.cultivation.progress === 50) state = { ...state, cultivation: { realm: "炼气4层", progress: 0, qiSeaDamaged: false } };
      else state = { ...state, cultivation: { ...state.cultivation, progress: 50 } };
    }
    if (action.includes("炼制一份聚气散")) addCredential("alchemy");
    if (action.includes("修复残损法器")) addCredential("refining");
    if (action.includes("升仙试阵傀")) state = { ...state, ascensionTrial: "passed", unlockedMapIds: ["xingni_qingshi_county", "xingni_qingyun_ferry"] };

    const final = {
      is_action_legal: true, sanity_damage: 0, narrative: "他依照青石县登记规则完成了这一步。", is_death: false,
      consumes_time: false, options: ["观察四周", "检查资源", "询问消息", "暂作休整"],
      codex_updates: [{
        id: "XQ-N005",
        name: "柳三娘",
        type: "npc",
        known_info: "归雁客栈掌柜，修为炼气九层。",
        observation: "她在柜台后拨着算盘，留意每个进门的散修。",
      }],
      ...(playerLocation ? { player_location: playerLocation } : {}),
      awarded_items: awardedItems, consumed_items: [],
      world_delta: { worldId: "xingni_taichu", mapId: "xingni_qingshi_county", accepted: true, message: "ok", resolvedState: state, unlockedMapIds: state.unlockedMapIds },
    };
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: __VERSECRAFT_FINAL__:${JSON.stringify(final)}\n\n` });
  });
}

async function clickAndSettle(page: Page, testId: string) {
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/chat" && response.request().method() === "POST"),
    page.getByTestId(testId).click(),
  ]);
  await page.waitForTimeout(80);
}

async function runContextAction(page: Page, name: string) {
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === "/api/chat" && response.request().method() === "POST"),
    page.getByRole("button", { name }).click(),
  ]);
  await page.waitForTimeout(80);
}

test("星逆创建→青石县纵切→升仙试解锁出口，并保留暗月存档", async ({ page }) => {
  test.setTimeout(120_000);
  await seedLegacyDarkMoonSlot(page);
  installXingniChatMock(page);

  await page.goto("/intro");
  await page.getByTestId("intro-carousel-next").click();
  await expect(page.getByTestId("intro-world-card")).toHaveAttribute("data-world-id", "xingni-taichu");
  await page.getByTestId("intro-start-create").click();
  await expect(page).toHaveURL(/\/create\?world=xingni_taichu/, { timeout: 20_000 });
  await page.getByTestId("quick-create-character").click();
  await expect(page.getByTestId("create-spirit-root-selector")).toBeVisible();
  await page.getByTestId("create-submit-button").click();
  await expect(page).toHaveURL(/\/play/, { timeout: 20_000 });

  await page.getByTestId("bottom-nav-map").click();
  await expect(page.getByTestId("xingni-realm")).toHaveText("炼气2层");
  await clickAndSettle(page, "xingni-move-QS_SOUTH_GATE");
  await clickAndSettle(page, "xingni-move-QS_BLACK_PINE_RIDGE");
  await runContextAction(page, "采集登记灵材");
  await runContextAction(page, "挑战铁背獠猪");
  await clickAndSettle(page, "xingni-move-QS_SPIRIT_SPRING_CAVE");
  for (let i = 0; i < 4; i += 1) await runContextAction(page, "吐纳修炼");
  await expect(page.getByTestId("xingni-realm")).toHaveText("炼气4层");

  await clickAndSettle(page, "xingni-move-QS_BLACK_PINE_RIDGE");
  await clickAndSettle(page, "xingni-move-QS_SOUTH_GATE");
  await clickAndSettle(page, "xingni-move-QS_GUOYAN_INN");
  await clickAndSettle(page, "xingni-move-QS_CULTIVATOR_MARKET");
  await clickAndSettle(page, "xingni-move-QS_HERB_HALL");
  await runContextAction(page, "炼制聚气散");
  await clickAndSettle(page, "xingni-move-QS_CULTIVATOR_MARKET");
  await clickAndSettle(page, "xingni-move-QS_EXORCISM_OFFICE");
  await clickAndSettle(page, "xingni-move-QS_ASCENSION_TERRACE");
  await runContextAction(page, "挑战升仙试阵傀");
  await expect(page.getByTestId("xingni-locked-exit")).toContainText("已解锁 · 尚未开放");

  await page.reload();
  await page.getByTestId("bottom-nav-map").click();
  await expect(page.getByTestId("xingni-locked-exit")).toContainText("已解锁 · 尚未开放");
  const slotIds = await page.evaluate(async ({ dbName, storeName, key }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const req = indexedDB.open(dbName); req.onerror = () => reject(req.error); req.onsuccess = () => resolve(req.result); });
    const raw = await new Promise<string>((resolve, reject) => { const tx = db.transaction(storeName, "readonly"); const req = tx.objectStore(storeName).get(key); req.onerror = () => reject(req.error); req.onsuccess = () => resolve(String(req.result)); });
    db.close();
    return Object.keys(JSON.parse(raw).state.saveSlots ?? {});
  }, { dbName: DB_NAME, storeName: STORE_NAME, key: STORE_KEY });
  expect(slotIds).toContain("main_slot");
  expect(slotIds).toContain("main:xingni_taichu");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
]) {
  test(`星逆 /play 在 ${viewport.width}×${viewport.height} 下保持地图与行动层级`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    installXingniChatMock(page);

    await page.goto("/intro");
    await page.getByTestId("intro-carousel-next").click();
    await page.getByTestId("intro-start-create").click();
    await page.getByTestId("quick-create-character").click();
    await page.getByTestId("create-submit-button").click();
    await expect(page).toHaveURL(/\/play/, { timeout: 20_000 });

    const mapEntry = page.getByTestId("bottom-nav-map");
    await expect(mapEntry).toBeVisible({ timeout: 20_000 });
    await mapEntry.click();

    await expect(page.getByTestId("xingni-cultivation-panel")).toBeVisible();
    await expect(page.getByTestId("xingni-realm")).toHaveText("炼气2层");
    await expect(page.getByTestId("xingni-current-objective")).toContainText("在归雁客栈检查气海与行囊");
    await expect(page.getByTestId("xingni-vitality-summary")).toContainText("体力");
    await expect(page.getByTestId("xingni-present-npcs")).toContainText("柳三娘");
    await expect(page.getByTestId("xingni-map-panel")).toBeVisible();
    await expect(page.getByTestId("xingni-current-location")).toHaveText("归雁客栈");
    await expect(page.getByTestId("xingni-move-QS_SOUTH_GATE")).toBeVisible();
    await expect(page.getByTestId("xingni-locked-exit")).toContainText("升仙试后解锁");

    const contextAction = page.getByRole("button", { name: "向柳三娘打听消息" });
    await contextAction.scrollIntoViewIfNeeded();
    await expect(contextAction).toBeVisible();
    await expect(mapEntry).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth);

    await page.getByTestId("bottom-nav-codex").click();
    await expect(page.getByTestId("mobile-codex-xingni-scope")).toContainText("青石县 · 八方人物志");
    await expect(page.getByTestId("mobile-codex-global-count")).toContainText("1 / 8");
    await expect(page.getByTestId("mobile-codex-card")).toHaveCount(8);
    const liuCard = page.locator('[data-testid="mobile-codex-card"][data-codex-id="XQ-N005"]');
    await expect(liuCard.locator('img[alt="柳三娘"]')).toHaveAttribute(
      "src",
      "/assets/npc-avatars/xingni/XQ-N005.png"
    );
    await expect(page.locator('[data-codex-id^="N-"], [data-codex-id^="A-"]')).toHaveCount(0);
    await expect(page.getByText("全部楼层", { exact: true })).toHaveCount(0);

    const codexLayout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(codexLayout.documentWidth).toBeLessThanOrEqual(codexLayout.viewportWidth);
    expect(codexLayout.bodyWidth).toBeLessThanOrEqual(codexLayout.viewportWidth);
  });
}

for (const route of [
  { root: "青木" as const, credentials: ["combat", "alchemy"] as const },
  { root: "赤火" as const, credentials: ["combat", "refining"] as const },
  { root: "玄水" as const, credentials: ["alchemy", "refining"] as const },
]) {
  test(`星逆 ${route.root} 灵根可完成登记的双凭证路线`, async ({ page }) => {
    test.setTimeout(90_000);
    installXingniChatMock(page, route.root);
    await page.goto("/intro");
    await page.getByTestId("intro-carousel-next").click();
    await page.getByTestId("intro-start-create").click();
    await page.getByTestId("quick-create-character").click();
    await page.getByTestId(`create-spirit-root-${route.root}`).click();
    await page.getByTestId("create-submit-button").click();
    await expect(page).toHaveURL(/\/play/, { timeout: 20_000 });
    await page.getByTestId("bottom-nav-map").click();
    await expect(page.getByTestId("xingni-cultivation-panel")).toContainText(`${route.root}灵根`);
    // The authoritative route matrix is exercised in unit tests; this browser
    // case proves all three creation choices survive hydration into /play.
    for (const credential of route.credentials) await expect(page.getByText(`${credential === "combat" ? "战斗" : credential === "alchemy" ? "炼丹" : "炼器"}凭证 ○`)).toBeVisible();
  });
}
