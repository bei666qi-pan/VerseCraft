import { test, expect } from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";

const ADMIN_COOKIE = "admin_shadow_session";
const VERSECRAFT_FINAL_PREFIX = "__VERSECRAFT_FINAL__:";

function buildAdminShadowCookie(adminPassword: string): string {
  const exp = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const nonce = randomUUID().replace(/-/g, "");
  const payload = `${exp}.${nonce}`;
  const signature = createHmac("sha256", adminPassword)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function extractFinalJsonFromSse(bodyText: string): string | null {
  const normalized = bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const events = normalized.split("\n\n");
  for (const ev of events) {
    const chunks = ev
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (chunks.length === 0) continue;
    const joined = chunks.join("\n");
    if (joined.startsWith(VERSECRAFT_FINAL_PREFIX)) {
      return joined.slice(VERSECRAFT_FINAL_PREFIX.length);
    }
  }
  return null;
}

async function sendRealChatRequest(
  baseURL: string,
  content: string,
  sessionId: string,
  timeoutMs = 120_000,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseURL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content }],
        playerContext: "{}",
        sessionId,
      }),
      signal: controller.signal,
    });

    let bodyText = "";
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bodyText += decoder.decode(value, { stream: true });
        if (bodyText.includes(VERSECRAFT_FINAL_PREFIX)) break;
      }
      bodyText += decoder.decode();
      await reader.cancel().catch(() => undefined);
    }
    return bodyText;
  } finally {
    clearTimeout(timeout);
  }
}

function getAdminCookie(): string | null {
  const adminPassword = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!adminPassword) return null;
  return `${ADMIN_COOKIE}=${buildAdminShadowCookie(adminPassword)}`;
}

function hasLiveGateway(): boolean {
  const key = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
  const provider = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  return Boolean(key) && provider !== "mock";
}

test.describe.serial("Analytics AI Live", () => {
  test.setTimeout(120_000);

  let baseURL: string;
  let adminCookie: string | null;

  test.beforeAll(() => {
    baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://[::1]:666";
    adminCookie = getAdminCookie();
  });

  test("1. token cost accuracy after real chat request", async ({ request }) => {
    test.skip(!hasLiveGateway(), "AI gateway not configured or AI_PROVIDER is mock");
    test.skip(!adminCookie, "ADMIN_PASSWORD not configured");

    const sessionId = `e2e-analytics-${Date.now()}`;
    const sseBody = await sendRealChatRequest(baseURL, "查看周围", sessionId);

    // Verify the chat completed with a valid final frame
    const finalJson = extractFinalJsonFromSse(sseBody);
    expect(finalJson, "SSE should contain __VERSECRAFT_FINAL__ frame").not.toBeNull();
    const parsed = JSON.parse(finalJson!);
    expect(typeof parsed.narrative).toBe("string");

    // Allow analytics event flush (async write)
    await new Promise((r) => setTimeout(r, 2000));

    const aiRes = await request.get("/api/admin/ai-experience?range=today", {
      headers: { Cookie: adminCookie },
      timeout: 20_000,
    });
    expect(aiRes.status(), "AI experience endpoint should return 200").toBe(200);

    const envelope = (await aiRes.json()) as Record<string, unknown>;
    expect(envelope.ok, `ai-experience ok: ${JSON.stringify(envelope)}`).toBe(true);

    const data = envelope.data as Record<string, unknown>;
    const sampleSize = Number(data.sampleSize ?? 0);
    expect(sampleSize, "should have at least one chat request").toBeGreaterThan(0);

    const cost = data.cost as Record<string, unknown>;
    const totalTokens = Number(cost.totalTokens ?? 0);
    expect(totalTokens, "tokenCost should be positive").toBeGreaterThan(0);

    // Latency p50/p95/p99 should be positive numbers
    const metrics = data.metrics as Array<Record<string, unknown>>;
    const latencyMetricIds = [
      "ai.total_latency_p50",
      "ai.total_latency_p95",
      "ai.total_latency_p99",
    ];
    for (const metricId of latencyMetricIds) {
      const m = metrics.find((m) => m.metricId === metricId);
      const value = Number(m?.value ?? 0);
      expect(
        value,
        `${metricId} should be a positive number, got ${m?.value}`,
      ).toBeGreaterThan(0);
    }
  });

  test("2. event-health API structure validation", async ({ request }) => {
    test.skip(!hasLiveGateway(), "AI gateway not configured or AI_PROVIDER is mock");
    test.skip(!adminCookie, "ADMIN_PASSWORD not configured");

    const eventRes = await request.get("/api/admin/event-health?range=today", {
      headers: { Cookie: adminCookie },
      timeout: 20_000,
    });
    expect(eventRes.status()).toBe(200);

    const envelope = (await eventRes.json()) as Record<string, unknown>;
    expect(envelope.ok).toBe(true);

    const data = envelope.data as Record<string, unknown>;
    
    // Verify eventCoverage is an array with valid entries
    const eventCoverage = data.eventCoverage as Array<Record<string, unknown>>;
    expect(Array.isArray(eventCoverage), "eventCoverage should be an array").toBe(true);
    expect(eventCoverage.length, "eventCoverage should have entries").toBeGreaterThan(0);
    
    for (const entry of eventCoverage) {
      expect(typeof entry.eventName, `eventName should be string`).toBe("string");
      expect(typeof entry.covered, `covered should be boolean for ${entry.eventName}`).toBe("boolean");
      expect(typeof entry.count, `count should be number for ${entry.eventName}`).toBe("number");
    }

    // Verify eventsByName has valid entries
    const eventsByName = data.eventsByName as Array<Record<string, unknown>>;
    expect(Array.isArray(eventsByName)).toBe(true);
    for (const entry of eventsByName) {
      expect(typeof entry.eventName).toBe("string");
      expect(typeof entry.count).toBe("number");
    }

    // Verify ratios are valid numbers
    const rates = data.rates as Record<string, number>;
    expect(typeof rates).toBe("object");
    for (const [key, val] of Object.entries(rates)) {
      expect(typeof val, `rates.${key} should be number`).toBe("number");
      expect(!Number.isNaN(val), `rates.${key} should not be NaN`).toBe(true);
    }
  });

  test("3. AI experience metrics consistency", async ({ request }) => {
    test.skip(!hasLiveGateway(), "AI gateway not configured or AI_PROVIDER is mock");
    test.skip(!adminCookie, "ADMIN_PASSWORD not configured");

    const aiRes = await request.get("/api/admin/ai-experience?range=today", {
      headers: { Cookie: adminCookie },
      timeout: 20_000,
    });
    expect(aiRes.status()).toBe(200);

    const envelope = (await aiRes.json()) as Record<string, unknown>;
    expect(envelope.ok).toBe(true);

    const data = envelope.data as Record<string, unknown>;

    // successRate between 0 and 1
    const rates = data.rates as Record<string, unknown>;
    const successRate = Number(rates.successRate ?? -1);
    expect(successRate, "successRate should be >= 0").toBeGreaterThanOrEqual(0);
    expect(successRate, "successRate should be <= 1").toBeLessThanOrEqual(1);

    // totalTokenCost > 0
    const cost = data.cost as Record<string, unknown>;
    const totalTokens = Number(cost.totalTokens ?? 0);
    expect(totalTokens, "totalTokenCost should be positive").toBeGreaterThan(0);

    // byRole has entries with tokenCost > 0
    const byRole = cost.byRole as Array<Record<string, unknown>>;
    expect(byRole.length, "byRole should have entries").toBeGreaterThan(0);
    const roleWithTokens = byRole.filter((r) => Number(r.totalTokens ?? 0) > 0);
    expect(roleWithTokens.length, "at least one role should have tokens").toBeGreaterThan(0);

    // Latency p50/p95/p99 should be positive
    const metrics = data.metrics as Array<Record<string, unknown>>;
    const latencyIds = ["ai.total_latency_p50", "ai.total_latency_p95", "ai.total_latency_p99"];
    for (const id of latencyIds) {
      const m = metrics.find((m) => m.metricId === id);
      expect(Number(m?.value ?? 0), `${id} should be positive`).toBeGreaterThan(0);
    }
  });

  test("4. cost estimation sanity check", async ({ request }) => {
    test.skip(!hasLiveGateway(), "AI gateway not configured or AI_PROVIDER is mock");
    test.skip(!adminCookie, "ADMIN_PASSWORD not configured");

    const aiRes = await request.get("/api/admin/ai-experience?range=today", {
      headers: { Cookie: adminCookie },
      timeout: 20_000,
    });
    expect(aiRes.status()).toBe(200);

    const envelope = (await aiRes.json()) as Record<string, unknown>;
    expect(envelope.ok).toBe(true);

    const data = envelope.data as Record<string, unknown>;
    const cost = data.cost as Record<string, unknown>;
    const byRole = cost.byRole as Array<Record<string, unknown>>;

    for (const role of byRole) {
      const estimatedUsd = Number(role.estimatedUsd ?? -1);
      expect(
        estimatedUsd,
        `estimatedUsd for role "${role.role}" should be non-negative`,
      ).toBeGreaterThanOrEqual(0);
    }

    // The main role should have estimated USD cost
    const mainRole = byRole.find(
      (r) =>
        String(r.role ?? "").toLowerCase() === "main",
    );
    if (mainRole) {
      const estimatedUsd = Number(mainRole.estimatedUsd ?? 0);
      expect(
        estimatedUsd,
        "main role should have estimated USD cost > 0",
      ).toBeGreaterThan(0);
    }

    // estimatedTotalUsd should be non-negative
    const estimatedTotalUsd = Number(cost.estimatedTotalUsd ?? -1);
    expect(estimatedTotalUsd, "estimatedTotalUsd should be non-negative").toBeGreaterThanOrEqual(0);
  });
});
