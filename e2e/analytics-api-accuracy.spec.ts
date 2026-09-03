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

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function isFinitePositive(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0;
}

function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && d.toISOString() === value;
}

function validateEnvelope(body: Record<string, unknown>, endpoint: string) {
  expect(body, `${endpoint}: envelope should have "ok"`).toHaveProperty("ok");
  expect(body, `${endpoint}: envelope should have "degraded"`).toHaveProperty("degraded");
  expect(body, `${endpoint}: envelope should have "reason"`).toHaveProperty("reason");
  expect(typeof body.ok, `${endpoint}: ok should be boolean`).toBe("boolean");
  expect(typeof body.degraded, `${endpoint}: degraded should be boolean`).toBe("boolean");
}

function getData(body: Record<string, unknown>): Record<string, unknown> {
  return (body.data ?? body) as Record<string, unknown>;
}

test.describe.serial("Analytics API Data Integrity", () => {
  test.setTimeout(120_000);

  let cookie: string;

  test.afterEach(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });

  test.beforeAll(() => {
    const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
    test.skip(!adminPassword, "需要 ADMIN_PASSWORD 以构造 shadow cookie");
    cookie = `${ADMIN_COOKIE}=${buildAdminShadowCookie(adminPassword)}`;
  });

  // ──────────────────────────────────────────────
  // 1. Overview API data integrity
  // ──────────────────────────────────────────────
  test("overview API returns valid numeric data and correct structure", async ({ request }) => {
    const res = await request.get("/api/admin/overview?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "overview status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "overview");

    const data = getData(body);
    expect(data, "overview data should exist").toBeTruthy();
    expect(data, "overview should have cards").toHaveProperty("cards");
    expect(data, "overview should have range").toHaveProperty("range");
    expect(data, "overview should have kpis").toHaveProperty("kpis");
    expect(Array.isArray(data.kpis), "kpis should be an array").toBe(true);

    // cards: numeric fields
    const cards = data.cards as Record<string, unknown>;
    const numericCardFields = [
      "totalUsers", "totalTokens", "activeUsersRange", "newUsersRange",
      "tokenCostRange", "avgTokenPerActive", "feedbackCountRange",
      "gameCompletedRange", "todayNewUsers", "todayTokenCost",
      "dau", "wau", "mau", "playDurationRangeSec",
      "legacyUsersPlayTimeSecSum", "sessionPlayLiveSecSum",
      "guestsTotal", "guestsOnline", "guestsPlayDurationSec",
    ];
    for (const field of numericCardFields) {
      if (field in cards) {
        expect(isFinitePositive(cards[field]),
          `cards.${field} should be a finite number >= 0, got ${typeof cards[field]} ${cards[field]}`).toBe(true);
      } else {
        expect(cards, `cards should contain "${field}"`).toHaveProperty(field);
      }
    }

    // traffic shape
    if (data.traffic) {
      const traffic = data.traffic as Record<string, unknown>;
      if (traffic.sources) {
        expect(Array.isArray(traffic.sources), "traffic.sources should be array").toBe(true);
        for (const src of traffic.sources as Array<Record<string, unknown>>) {
          expect(src, "traffic source item").toHaveProperty("source");
          expect(isFinitePositive(src.pageViews), `traffic source ${src.source} pageViews`).toBe(true);
          expect(isFinitePositive(src.uniqueVisitors), `traffic source ${src.source} uniqueVisitors`).toBe(true);
        }
      }
    }

    // kpis: each should have label/value/unit
    const kpis = data.kpis as Array<Record<string, unknown>>;
    for (const kpi of kpis) {
      expect(kpi, "kpi item").toHaveProperty("metricId");
      expect(kpi, "kpi item").toHaveProperty("label");
      expect(kpi, "kpi item").toHaveProperty("value");
      // value can be null for unavailable metrics; if present, should be number or string
      if (kpi.value != null && kpi.unit !== "ratio" && kpi.unit !== "failure_ratio") {
        expect(isNumber(kpi.value) || typeof kpi.value === "string",
          `kpi ${kpi.metricId} value should be number or string`).toBe(true);
      }
    }
  });

  // ──────────────────────────────────────────────
  // 2. Player Journey API data integrity
  // ──────────────────────────────────────────────
  test("player-journey API returns valid funnel stages", async ({ request }) => {
    const res = await request.get("/api/admin/player-journey?range=7d&mode=strict&actorType=all&platform=all", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "player-journey status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "player-journey");

    const data = getData(body);
    expect(data, "player-journey data").toHaveProperty("stages");
    expect(data, "player-journey data").toHaveProperty("sampleSize");
    expect(isNumber(data.sampleSize), "sampleSize should be number").toBe(true);
    expect(isFinitePositive(data.sampleSize), "sampleSize should be finite").toBe(true);

    const stages = data.stages as Array<Record<string, unknown>>;
    for (const stage of stages) {
      expect(stage, "stage item").toHaveProperty("eventName");
      expect(stage, "stage item").toHaveProperty("count");
      expect(isFinitePositive(stage.count), `stage ${stage.eventName} count`).toBe(true);

      // stepConversionRate, totalConversionRate, dropOffCount must be numbers, not NaN
      if ("stepConversionRate" in stage) {
        expect(isNumber(stage.stepConversionRate),
          `stage ${stage.eventName} stepConversionRate should be a number, got ${typeof stage.stepConversionRate} ${stage.stepConversionRate}`).toBe(true);
        expect(!Number.isNaN(stage.stepConversionRate),
          `stage ${stage.eventName} stepConversionRate should not be NaN`).toBe(true);
      }
      if ("totalConversionRate" in stage) {
        expect(isNumber(stage.totalConversionRate),
          `stage ${stage.eventName} totalConversionRate should be a number`).toBe(true);
        expect(!Number.isNaN(stage.totalConversionRate),
          `stage ${stage.eventName} totalConversionRate should not be NaN`).toBe(true);
      }
      if ("dropOffCount" in stage) {
        expect(isFinitePositive(stage.dropOffCount),
          `stage ${stage.eventName} dropOffCount should be valid number`).toBe(true);
      }
    }
  });

  // ──────────────────────────────────────────────
  // 3. AI Experience API data integrity
  // ──────────────────────────────────────────────
  test("ai-experience API returns valid numbers for all metrics and cost", async ({ request }) => {
    const res = await request.get("/api/admin/ai-experience?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "ai-experience status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "ai-experience");

    const data = getData(body);
    expect(data, "ai-experience data").toHaveProperty("metrics");
    expect(data, "ai-experience data").toHaveProperty("rates");
    expect(data, "ai-experience data").toHaveProperty("cost");

    // metrics: each has valid value
    const metrics = data.metrics as Array<Record<string, unknown>>;
    for (const metric of metrics) {
      expect(metric, "metric item").toHaveProperty("metricId");
      expect(metric, "metric item").toHaveProperty("value");
      // value can be null for unavailable metrics (e.g. no data)
      if (metric.value != null) {
        expect(isNumber(metric.value),
          `metric ${metric.metricId} should be a number, got ${typeof metric.value} ${metric.value}`).toBe(true);
        if (isNumber(metric.value)) {
          expect(!Number.isNaN(metric.value),
            `metric ${metric.metricId} should not be NaN`).toBe(true);
        }
      }
      if (metric.unit) {
        expect(typeof metric.unit, `metric ${metric.metricId} unit should be a string`).toBe("string");
      }
    }

    // rates
    const rates = data.rates as Record<string, unknown>;
    const rateFields = ["successRate", "failureRate", "fallbackRate", "parseFailureRate"];
    for (const field of rateFields) {
      if (field in rates) {
        expect(isNumber(rates[field]),
          `rates.${field} should be a number, got ${typeof rates[field]}`).toBe(true);
        if (isNumber(rates[field])) {
          expect(!Number.isNaN(rates[field]), `rates.${field} should not be NaN`).toBe(true);
        }
      }
    }

    // cost.byRole
    if (data.cost) {
      const cost = data.cost as Record<string, unknown>;
      if (Array.isArray(cost.byRole)) {
        const byRole = cost.byRole as Array<Record<string, unknown>>;
        for (const roleItem of byRole) {
          expect(roleItem, "cost byRole item").toHaveProperty("role");
          const roleNumFields = ["requests", "promptTokens", "completionTokens", "totalTokens", "estimatedUsd"];
          for (const field of roleNumFields) {
            if (field in roleItem) {
              expect(isFinitePositive(roleItem[field]),
                `cost.byRole[${roleItem.role}].${field} should be valid number, got ${roleItem[field]}`).toBe(true);
            }
          }
        }
      }
      if ("totalTokens" in cost) {
        expect(isFinitePositive(cost.totalTokens), "cost.totalTokens should be valid number").toBe(true);
      }
      if ("estimatedTotalUsd" in cost) {
        expect(isFinitePositive(cost.estimatedTotalUsd), "cost.estimatedTotalUsd should be valid number").toBe(true);
      }
    }

    // sampleSize
    if ("sampleSize" in data) {
      expect(isFinitePositive(data.sampleSize), "sampleSize should be valid number").toBe(true);
    }
  });

  // ──────────────────────────────────────────────
  // 4. Content Quality API data integrity
  // ──────────────────────────────────────────────
  test("content-quality API returns numeric metrics", async ({ request }) => {
    const res = await request.get("/api/admin/content-quality?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "content-quality status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "content-quality");

    const data = getData(body);

    // world selections
    if (Array.isArray(data.worldSelections)) {
      for (const ws of data.worldSelections as Array<Record<string, unknown>>) {
        expect(ws, "worldSelection item").toHaveProperty("worldId");
        expect(isFinitePositive(ws.count), `worldSelection ${ws.worldId} count`).toBe(true);
      }
    }

    // chapters
    if (data.chapters) {
      const chapters = data.chapters as Record<string, unknown>;
      const chapterLists = ["entered", "completed", "abandoned", "rank"];
      for (const listName of chapterLists) {
        if (Array.isArray(chapters[listName])) {
          for (const item of chapters[listName] as Array<Record<string, unknown>>) {
            expect(isFinitePositive(item.count),
              `chapters.${listName} count should be number`).toBe(true);
          }
        }
      }
      const chapterRates = ["completionRate", "abandonRate"];
      for (const field of chapterRates) {
        if (field in chapters) {
          expect(isNumber(chapters[field]),
            `chapters.${field} should be a number`).toBe(true);
        }
      }
    }

    // npc interactions
    if (data.npcInteractions) {
      const npc = data.npcInteractions as Record<string, unknown>;
      if (Array.isArray(npc.rank)) {
        for (const item of npc.rank as Array<Record<string, unknown>>) {
          expect(isFinitePositive(item.count),
            `npcInteractions.rank count should be number`).toBe(true);
        }
      }
      if ("completionRate" in npc) {
        expect(isNumber(npc.completionRate), "npcInteractions.completionRate should be number").toBe(true);
      }
      if ("failureRate" in npc) {
        expect(isNumber(npc.failureRate), "npcInteractions.failureRate should be number").toBe(true);
      }
    }

    // validator issues
    if ("validatorIssues" in data && data.validatorIssues) {
      const vi = data.validatorIssues as Record<string, unknown>;
      if ("total" in vi) {
        expect(isFinitePositive(vi.total), "validatorIssues.total should be a number").toBe(true);
      }
    }

    // sampleSize
    if ("sampleSize" in data) {
      expect(isFinitePositive(data.sampleSize), "sampleSize should be valid number").toBe(true);
    }
  });

  // ──────────────────────────────────────────────
  // 5. Survey Aggregate API data integrity
  // ──────────────────────────────────────────────
  test("survey-aggregate API returns valid percentage and funnel data", async ({ request }) => {
    const res = await request.get("/api/admin/survey-aggregate?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "survey-aggregate status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "survey-aggregate");

    const data = getData(body);

    // themes[].pct should be a number
    if (Array.isArray(data.textThemes)) {
      for (const theme of data.textThemes as Array<Record<string, unknown>>) {
        expect(theme, "textTheme item").toHaveProperty("theme");
        expect(isFinitePositive(theme.count), `textTheme ${theme.theme} count`).toBe(true);
        expect(isNumber(theme.pct),
          `textTheme ${theme.theme} pct should be number, got ${typeof theme.pct}`).toBe(true);
        if (isNumber(theme.pct)) {
          expect(!Number.isNaN(theme.pct), `textTheme ${theme.theme} pct should not be NaN`).toBe(true);
        }
      }
    }

    // completionFunnel stages have valid counts
    if (Array.isArray(data.completionFunnel)) {
      const funnel = data.completionFunnel as Array<Record<string, unknown>>;
      for (const stage of funnel) {
        expect(stage, "funnel stage").toHaveProperty("eventName");
        expect(stage, "funnel stage").toHaveProperty("label");
        expect(isFinitePositive(stage.count),
          `funnel ${stage.eventName} count should be valid number`).toBe(true);
        if ("stepConversionRate" in stage) {
          expect(isNumber(stage.stepConversionRate),
            `funnel ${stage.eventName} stepConversionRate`).toBe(true);
          expect(!Number.isNaN(stage.stepConversionRate),
            `funnel ${stage.eventName} stepConversionRate should not be NaN`).toBe(true);
        }
        if ("totalConversionRate" in stage) {
          expect(isNumber(stage.totalConversionRate),
            `funnel ${stage.eventName} totalConversionRate`).toBe(true);
          expect(!Number.isNaN(stage.totalConversionRate),
            `funnel ${stage.eventName} totalConversionRate should not be NaN`).toBe(true);
        }
      }
    }

    // segment breakdown pcts
    if (data.segmentBreakdown) {
      const seg = data.segmentBreakdown as Record<string, unknown>;
      if (Array.isArray(seg.actorType)) {
        for (const item of seg.actorType as Array<Record<string, unknown>>) {
          expect(isNumber(item.pct), "segmentBreakdown.actorType pct should be number").toBe(true);
        }
      }
    }
  });

  // ──────────────────────────────────────────────
  // 6. Event Health API data integrity
  // ──────────────────────────────────────────────
  test("event-health API returns valid ratios and coverage data", async ({ request }) => {
    const res = await request.get("/api/admin/event-health?range=7d&limit=5", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "event-health status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "event-health");

    const data = getData(body);
    expect(data, "event-health should have totalEvents").toHaveProperty("totalEvents");
    expect(isFinitePositive(data.totalEvents), "totalEvents should be valid number").toBe(true);

    // rates are numbers between 0 and 1 (or up to total value ratio)
    if (data.rates) {
      const rates = data.rates as Record<string, unknown>;
      for (const [key, val] of Object.entries(rates)) {
        expect(isNumber(val),
          `rates.${key} should be a number, got ${typeof val}`).toBe(true);
        if (isNumber(val)) {
          expect(!Number.isNaN(val), `rates.${key} should not be NaN`).toBe(true);
        }
      }
    }

    // eventCoverage has covered/missing
    if (Array.isArray(data.eventCoverage)) {
      const coverage = data.eventCoverage as Array<Record<string, unknown>>;
      expect(coverage.length, "eventCoverage should not be empty").toBeGreaterThan(0);
      for (const item of coverage) {
        expect(item, "coverage item").toHaveProperty("eventName");
        expect(item, "coverage item").toHaveProperty("status");
        expect(["covered", "missing"]).toContain(item.status);
        expect(isFinitePositive(item.count), `coverage ${item.eventName} count`).toBe(true);
        expect(typeof item.covered, `coverage ${item.eventName} covered should be boolean`).toBe("boolean");
      }
    }

    // eventsByName has counts
    if (Array.isArray(data.eventsByName)) {
      for (const item of data.eventsByName as Array<Record<string, unknown>>) {
        expect(isFinitePositive(item.count),
          `eventsByName ${item.eventName} count should be number`).toBe(true);
      }
    }
  });

  // ──────────────────────────────────────────────
  // 7. System Health API data integrity
  // ──────────────────────────────────────────────
  test("system-health API returns valid capacity and check data", async ({ request }) => {
    const res = await request.get("/api/admin/system-health", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "system-health status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "system-health");

    const data = getData(body);

    // capacity.online.total is a number
    expect(data, "system-health should have capacity").toHaveProperty("capacity");
    const capacity = data.capacity as Record<string, unknown>;
    expect(capacity, "capacity should have online").toHaveProperty("online");
    const online = capacity.online as Record<string, unknown>;
    expect(isFinitePositive(online.total), "capacity.online.total should be a number").toBe(true);
    expect(isFinitePositive(online.registered), "capacity.online.registered should be a number").toBe(true);
    expect(isFinitePositive(online.guests), "capacity.online.guests should be a number").toBe(true);

    // chatQueue
    expect(capacity, "capacity should have chatQueue").toHaveProperty("chatQueue");
    const queue = capacity.chatQueue as Record<string, unknown>;
    expect(typeof queue.enabled, "chatQueue.enabled should be boolean").toBe("boolean");

    // checks have available-like booleans
    if (data.checks) {
      const checks = data.checks as Record<string, Record<string, unknown>>;
      expect(Object.keys(checks).length, "checks should not be empty").toBeGreaterThan(0);
      for (const [checkName, check] of Object.entries(checks)) {
        expect(check, `checks.${checkName}`).toHaveProperty("ok");
        expect(check, `checks.${checkName}`).toHaveProperty("degraded");
        expect(check, `checks.${checkName}`).toHaveProperty("reason");
        expect(check, `checks.${checkName}`).toHaveProperty("updatedAt");
        expect(typeof check.ok, `checks.${checkName}.ok should be boolean`).toBe("boolean");
        expect(typeof check.degraded, `checks.${checkName}.degraded should be boolean`).toBe("boolean");
        if (check.updatedAt) {
          expect(isValidIsoDate(check.updatedAt),
            `checks.${checkName}.updatedAt should be valid ISO date`).toBe(true);
        }
      }
    }
  });

  // ──────────────────────────────────────────────
  // 8. Realtime API data integrity
  // ──────────────────────────────────────────────
  test("realtime API returns valid online and event counts", async ({ request }) => {
    const res = await request.get("/api/admin/realtime", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "realtime status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "realtime");

    const data = getData(body);
    // Data may be null when degraded, skip detailed checks
    if (data == null) return;

    // onlineUsers, onlineGuests, activeSessions
    const numericFields = ["onlineUsers", "onlineGuests", "activeSessions"];
    for (const field of numericFields) {
      if (field in data) {
        expect(isFinitePositive(data[field]),
          `realtime.${field} should be a valid number, got ${data[field]}`).toBe(true);
      }
    }

    // trends
    if (data.trends) {
      const trends = data.trends as Record<string, unknown>;
      const trendFields = ["eventsLast5m", "eventsLast15m", "eventsLast60m"];
      for (const field of trendFields) {
        if (field in trends) {
          expect(isFinitePositive(trends[field]),
            `trends.${field} should be valid number`).toBe(true);
        }
      }
    }

    // updatedAt
    if (data.updatedAt) {
      expect(isValidIsoDate(data.updatedAt),
        "realtime.updatedAt should be valid ISO date").toBe(true);
    }
  });

  // ──────────────────────────────────────────────
  // 9. Retention API data integrity
  // ──────────────────────────────────────────────
  test("retention API returns valid D1/D3/D7 values", async ({ request }) => {
    const res = await request.get("/api/admin/retention?range=7d", {
      headers: { Cookie: cookie },
      timeout: 60_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "retention status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "retention");

    const data = getData(body);
    // Data may be null when degraded
    if (data == null) return;

    expect(isFinitePositive(data.cohortSize), "cohortSize should be valid number").toBe(true);

    // d1, d3, d7 each have count and rate
    const retentionDays = ["d1", "d3", "d7"];
    for (const day of retentionDays) {
      if (data[day]) {
        const d = data[day] as Record<string, unknown>;
        expect(isFinitePositive(d.count),
          `${day}.count should be valid number, got ${d.count}`).toBe(true);
        expect(isNumber(d.rate),
          `${day}.rate should be a number, got ${typeof d.rate}`).toBe(true);
        if (isNumber(d.rate)) {
          expect(!Number.isNaN(d.rate), `${day}.rate should not be NaN`).toBe(true);
          expect(d.rate, `${day}.rate should be >= 0`).toBeGreaterThanOrEqual(0);
          expect(d.rate, `${day}.rate should be <= 1`).toBeLessThanOrEqual(1);
        }
      }
    }

    // returningUsers, churnUsers
    if ("returningUsers" in data) {
      expect(isFinitePositive(data.returningUsers), "returningUsers should be valid number").toBe(true);
    }
    if ("churnUsers" in data) {
      expect(isFinitePositive(data.churnUsers), "churnUsers should be valid number").toBe(true);
    }

    // byActorKind
    if (data.byActorKind) {
      const byKind = data.byActorKind as Record<string, unknown>;
      for (const kind of ["registered", "guest", "all"]) {
        if (byKind[kind]) {
          const k = byKind[kind] as Record<string, unknown>;
          expect(isFinitePositive(k.cohortSize), `byActorKind.${kind}.cohortSize`).toBe(true);
          for (const day of retentionDays) {
            if (k[day]) {
              const d = k[day] as Record<string, unknown>;
              expect(isNumber(d.rate), `byActorKind.${kind}.${day}.rate`).toBe(true);
            }
          }
        }
      }
    }
  });

  // ──────────────────────────────────────────────
  // 10. Funnel API data integrity
  // ──────────────────────────────────────────────
  test("funnel API returns valid conversion rates", async ({ request }) => {
    const res = await request.get("/api/admin/funnel?range=7d", {
      headers: { Cookie: cookie },
      timeout: 20_000,
    });
    if (res.status() === 429) { throw new Error("rate limited"); }
    expect(res.status(), "funnel status").toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    validateEnvelope(body, "funnel");

    const data = getData(body);
    // Data may be null when degraded
    if (data == null) return;

    expect(data, "funnel should have stages").toHaveProperty("stages");
    const stages = data.stages as Array<Record<string, unknown>>;
    expect(stages.length, "funnel stages should not be empty").toBeGreaterThan(0);

    for (const stage of stages) {
      expect(stage, "funnel stage").toHaveProperty("eventName");
      expect(stage, "funnel stage").toHaveProperty("eventLabel");

      // Numeric counts
      const countFields = ["users", "registered", "guest", "all"];
      for (const field of countFields) {
        if (field in stage) {
          expect(isFinitePositive(stage[field]),
            `funnel ${stage.eventName}.${field} should be valid number, got ${stage[field]}`).toBe(true);
        }
      }

      // Conversion rates
      const rateFields = ["conversionRate", "conversionRateRegistered", "conversionRateGuest"];
      for (const field of rateFields) {
        if (field in stage) {
          expect(isNumber(stage[field]),
            `funnel ${stage.eventName}.${field} should be a number, got ${typeof stage[field]}`).toBe(true);
          if (isNumber(stage[field])) {
            expect(!Number.isNaN(stage[field]),
              `funnel ${stage.eventName}.${field} should not be NaN`).toBe(true);
          }
        }
      }
    }
  });
});
