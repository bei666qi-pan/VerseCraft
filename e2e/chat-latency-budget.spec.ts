import { expect, test } from "@playwright/test";
import { CHAT_LATENCY_BUDGET } from "../src/lib/perf/waitingConfig";
import { probeChatSse, type ChatSseProbeMetrics } from "../src/lib/perf/chatSseProbe";
import { VERSECRAFT_STATUS_PREFIX } from "../src/lib/turnEngine/sse";

const E2E_AI_LIVE = process.env.E2E_AI_LIVE === "1";
const ASSERT_BUDGET = process.env.VC_ASSERT_CHAT_LATENCY_BUDGET === "1";
const EXPECT_KEYS_MISSING = process.env.E2E_EXPECT_KEYS_MISSING === "1";
const MOCK_AI = process.env.AI_PROVIDER === "mock";

function liveGatewayEnvPresent(): boolean {
  const base = (process.env.AI_GATEWAY_BASE_URL ?? "").trim();
  const key = (process.env.AI_GATEWAY_API_KEY ?? "").trim();
  const main = (process.env.AI_MODEL_MAIN ?? "").trim();
  return Boolean(base && key && main);
}

async function collectChatLatencyMetrics(options: {
  content?: string;
  sessionIdPrefix?: string;
  timeoutMs?: number;
} = {}): Promise<ChatSseProbeMetrics> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:666";
  const sessionId = `${options.sessionIdPrefix ?? "latency"}-${Date.now()}`;
  const content = options.content ?? "我贴着墙根听走廊尽头的动静。";
  return probeChatSse({
    baseUrl: baseURL,
    timeoutMs: options.timeoutMs ?? 120_000,
    headers: {
      accept: "text/event-stream",
      "x-versecraft-request-id": sessionId,
      "x-forwarded-for": `127.0.1.${Math.floor(Math.random() * 200) + 20}`,
    },
    body: {
      latestUserInput: content,
      messages: [{ role: "user", content }],
      playerContext: "{}",
      sessionId,
    },
  });
}

test.describe.configure({ mode: "serial" });

test.describe("/api/chat latency budget - degraded SSE", () => {
  test("keys_missing stays 200 + SSE with fast status and parseable final", async () => {
    test.setTimeout(120_000);
    test.skip(!EXPECT_KEYS_MISSING, "Only runs when E2E_EXPECT_KEYS_MISSING=1.");
    await collectChatLatencyMetrics({ sessionIdPrefix: "latency-warmup", timeoutMs: 120_000 }).catch(() => undefined);
    const metrics = await collectChatLatencyMetrics({ sessionIdPrefix: "latency-degraded", timeoutMs: 120_000 });

    expect(metrics.status).toBe(200);
    expect(metrics.contentType.toLowerCase()).toContain("text/event-stream");
    expect(metrics.aiStatus.toLowerCase()).toBe("keys_missing");
    expect(metrics.firstStatusMs).not.toBeNull();
    expect(metrics.firstStatusMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.degradedFirstStatusMaxMs);
    expect(metrics.statusFrameCount).toBeGreaterThanOrEqual(CHAT_LATENCY_BUDGET.minStatusFramesPerTurn);
    expect(metrics.finalFrameReceived).toBe(true);
    expect(metrics.finalMs).not.toBeNull();
    expect(metrics.finalMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.degradedFinalFrameMaxMs);
    expect(metrics.finalJsonParseSuccess).toBe(true);
    expect(metrics.rawText).not.toContain(`${VERSECRAFT_STATUS_PREFIX}{bad`);
  });
});

test.describe("/api/chat latency budget - mock provider", () => {
  test("mock stream preserves SSE contract, narrative, options, and budget metrics", async () => {
    test.setTimeout(120_000);
    test.skip(!MOCK_AI, "Requires AI_PROVIDER=mock.");
    await collectChatLatencyMetrics({
      content: "我贴着墙根听走廊尽头的动静。",
      sessionIdPrefix: "latency-mock-warmup",
      timeoutMs: 120_000,
    }).catch(() => undefined);
    const metrics = await collectChatLatencyMetrics({
      content: "我贴着墙根听走廊尽头的动静。",
      sessionIdPrefix: "latency-mock",
      timeoutMs: 120_000,
    });

    expect(metrics.status).toBe(200);
    expect(metrics.contentType.toLowerCase()).toContain("text/event-stream");
    expect(metrics.firstStatusMs).not.toBeNull();
    expect(metrics.firstVisibleTextMs).not.toBeNull();
    expect(metrics.finalFrameReceived).toBe(true);
    expect(metrics.finalJsonParseSuccess).toBe(true);
    expect(metrics.narrativeChars).toBeGreaterThanOrEqual(180);
    expect(metrics.optionsCount).toBe(4);
    expect(metrics.optionsQualityPass).toBe(true);
    expect(metrics.longGapCount).toBe(0);
    expect(metrics.firstStatusMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.firstStatusShownP95Ms);
    expect(metrics.firstVisibleTextMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms);
    expect(metrics.finalMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms);
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
        firstStatusShownMs: metrics.firstStatusMs,
        firstVisibleTextMs: metrics.firstVisibleTextMs,
        finalFrameReceivedMs: metrics.finalMs,
        longGapCount: metrics.longGapCount,
        statusFrameCount: metrics.statusFrameCount,
      })
    );

    expect(metrics.status).toBeLessThan(600);
    expect(metrics.contentType.toLowerCase()).toContain("text/event-stream");
    expect(metrics.firstStatusMs).not.toBeNull();
    expect(metrics.firstVisibleTextMs).not.toBeNull();
    expect(metrics.finalFrameReceived).toBe(true);
    expect(metrics.finalJsonParseSuccess).toBe(true);

    if (ASSERT_BUDGET) {
      expect(metrics.firstStatusMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.firstStatusShownP95Ms);
      expect(metrics.firstVisibleTextMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.firstVisibleTextP95Ms);
      expect(metrics.finalMs!).toBeLessThanOrEqual(CHAT_LATENCY_BUDGET.normalTurnFinalP95Ms);
    }
  });
});
