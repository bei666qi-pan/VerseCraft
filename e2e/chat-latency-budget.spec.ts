import { expect, test } from "@playwright/test";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";

const E2E_AI_LIVE = process.env.E2E_AI_LIVE === "1";
const ASSERT_BUDGET = process.env.VC_ASSERT_CHAT_LATENCY_BUDGET === "1";
const EXPECT_KEYS_MISSING = process.env.CI === "true" || process.env.E2E_EXPECT_KEYS_MISSING === "1";
const STATUS_PREFIX = "__VERSECRAFT_STATUS__:";
const FINAL_PREFIX = "__VERSECRAFT_FINAL__:";
const CONTROL_PREFIX = "__VERSECRAFT_";

type ChatLatencyMetrics = {
  status: number;
  contentType: string;
  aiStatus: string;
  firstStatusShownMs: number | null;
  firstVisibleTextMs: number | null;
  finalFrameReceivedMs: number | null;
  statusFrameCount: number;
  finalFrameReceived: boolean;
  finalJsonParseSuccess: boolean;
  longGapCount: number;
  rawDmJsonText: string;
  bodyText: string;
};

function liveGatewayEnvPresent(): boolean {
  const base = (process.env.AI_GATEWAY_BASE_URL ?? "").trim();
  const key = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
  const main = (process.env.AI_MODEL_MAIN ?? "").trim();
  return Boolean(base && key && main);
}

function extractDataPayload(eventText: string): string {
  return eventText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
}

function extractDmJsonTextFromPayloads(payloads: string[]): string {
  let raw = "";
  for (const payload of payloads) {
    if (!payload) continue;
    if (payload.startsWith(STATUS_PREFIX)) continue;
    if (payload.startsWith(FINAL_PREFIX)) {
      raw = payload.slice(FINAL_PREFIX.length);
      continue;
    }
    if (payload.startsWith(CONTROL_PREFIX)) continue;
    raw += payload;
  }
  return raw.trim();
}

function isContractJson(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof parsed.narrative === "string" &&
        typeof parsed.is_action_legal === "boolean"
    );
  } catch {
    return false;
  }
}

async function collectChatLatencyMetrics(options: {
  content?: string;
  sessionIdPrefix?: string;
  timeoutMs?: number;
} = {}): Promise<ChatLatencyMetrics> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:666";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const startedAt = Date.now();
  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-versecraft-request-id": `${options.sessionIdPrefix ?? "latency"}-${Date.now()}`,
      "x-forwarded-for": `127.0.1.${Math.floor(Math.random() * 200) + 20}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: options.content ?? "我观察走廊尽头的影子。" }],
      playerContext: "{}",
      sessionId: `${options.sessionIdPrefix ?? "latency"}-${Date.now()}`,
    }),
    signal: controller.signal,
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  const payloads: string[] = [];
  let bodyText = "";
  let pending = "";
  let firstStatusShownMs: number | null = null;
  let firstVisibleTextMs: number | null = null;
  let finalFrameReceivedMs: number | null = null;
  let statusFrameCount = 0;
  let finalFrameReceived = false;
  let finalJsonParseSuccess = false;
  let lastVisibleChunkAt: number | null = null;
  let longGapCount = 0;

  try {
    if (reader) {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        bodyText += chunk;
        pending += chunk;
        pending = pending.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

        let eventEnd = pending.indexOf("\n\n");
        while (eventEnd >= 0) {
          const eventText = pending.slice(0, eventEnd);
          pending = pending.slice(eventEnd + 2);
          const payload = extractDataPayload(eventText);
          if (payload) {
            payloads.push(payload);
            const elapsed = Date.now() - startedAt;
            if (payload.startsWith(STATUS_PREFIX)) {
              statusFrameCount += 1;
              if (firstStatusShownMs == null) firstStatusShownMs = elapsed;
            } else if (payload.startsWith(FINAL_PREFIX)) {
              finalFrameReceived = true;
              finalFrameReceivedMs = elapsed;
              finalJsonParseSuccess = isContractJson(payload.slice(FINAL_PREFIX.length));
            } else if (!payload.startsWith(CONTROL_PREFIX)) {
              if (firstVisibleTextMs == null) firstVisibleTextMs = elapsed;
              if (lastVisibleChunkAt != null && elapsed - lastVisibleChunkAt >= CHAT_LATENCY_BUDGET.maxInterChunkGapWarnMs) {
                longGapCount += 1;
              }
              lastVisibleChunkAt = elapsed;
            }
          }
          eventEnd = pending.indexOf("\n\n");
        }
        if (finalFrameReceived && finalJsonParseSuccess) break;
      }
    }
  } finally {
    clearTimeout(timeout);
    await reader?.cancel().catch(() => undefined);
  }

  bodyText += decoder.decode();
  const rawDmJsonText = extractDmJsonTextFromPayloads(payloads);
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    aiStatus: response.headers.get("x-versecraft-ai-status") ?? "",
    firstStatusShownMs,
    firstVisibleTextMs,
    finalFrameReceivedMs,
    statusFrameCount,
    finalFrameReceived,
    finalJsonParseSuccess,
    longGapCount,
    rawDmJsonText,
    bodyText,
  };
}

test.describe.configure({ mode: "serial" });

test.describe("/api/chat latency budget - degraded SSE", () => {
  test("keys_missing stays 200 + SSE with fast status and parseable final", async () => {
    test.setTimeout(120_000);
    test.skip(!EXPECT_KEYS_MISSING, "Only runs in CI/no-gateway degraded mode.");
    await collectChatLatencyMetrics({ sessionIdPrefix: "latency-warmup", timeoutMs: 120_000 }).catch(() => undefined);
    const metrics = await collectChatLatencyMetrics({ sessionIdPrefix: "latency-degraded", timeoutMs: 120_000 });

    expect(metrics.status).toBe(200);
    expect(metrics.contentType.toLowerCase()).toContain("text/event-stream");
    expect(metrics.aiStatus.toLowerCase()).toBe("keys_missing");
    expect(metrics.firstStatusShownMs).not.toBeNull();
    expect(metrics.firstStatusShownMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.degradedFirstStatusMaxMs);
    expect(metrics.statusFrameCount).toBeGreaterThanOrEqual(CHAT_LATENCY_BUDGET.minStatusFramesPerTurn);
    expect(metrics.finalFrameReceived).toBe(true);
    expect(metrics.finalFrameReceivedMs).not.toBeNull();
    expect(metrics.finalFrameReceivedMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.degradedFinalFrameMaxMs);
    expect(metrics.finalJsonParseSuccess).toBe(true);
    expect(metrics.rawDmJsonText).not.toContain(STATUS_PREFIX);
    expect(metrics.rawDmJsonText).toContain("narrative");
  });
});

test.describe("/api/chat latency budget - live gateway", () => {
  test.beforeAll(async () => {
    if (!(E2E_AI_LIVE && liveGatewayEnvPresent())) return;
    await collectChatLatencyMetrics({ sessionIdPrefix: "latency-live-warmup", timeoutMs: 120_000 }).catch(() => undefined);
  });

  test("records first status, first visible text, final frame, and long gaps", async () => {
    test.skip(!(E2E_AI_LIVE && liveGatewayEnvPresent()), "Requires E2E_AI_LIVE=1 and AI_GATEWAY_* env.");
    const metrics = await collectChatLatencyMetrics({
      content: "我贴着墙根听走廊尽头的动静。",
      sessionIdPrefix: "latency-live",
      timeoutMs: 120_000,
    });

    console.log(
      JSON.stringify({
        firstStatusShownMs: metrics.firstStatusShownMs,
        firstVisibleTextMs: metrics.firstVisibleTextMs,
        finalFrameReceivedMs: metrics.finalFrameReceivedMs,
        longGapCount: metrics.longGapCount,
        statusFrameCount: metrics.statusFrameCount,
      })
    );

    expect(metrics.status).toBeLessThan(600);
    expect(metrics.contentType.toLowerCase()).toContain("text/event-stream");
    expect(metrics.firstStatusShownMs).not.toBeNull();
    expect(metrics.firstVisibleTextMs).not.toBeNull();
    expect(metrics.finalFrameReceived).toBe(true);
    expect(metrics.finalJsonParseSuccess).toBe(true);

    if (ASSERT_BUDGET) {
      expect(metrics.firstStatusShownMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.firstStatusShownP95Ms);
      expect(metrics.firstVisibleTextMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms);
      expect(metrics.finalFrameReceivedMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms);
    }
  });
});
