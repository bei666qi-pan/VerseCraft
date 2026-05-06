import { encodeSseEventPayload } from "@/lib/turnEngine/sse";
import type { MockAiDelayConfig, MockStreamScenario } from "@/lib/ai/mock/types";

function delay(ms: number): Promise<void> {
  const safe = Math.max(0, Math.trunc(ms));
  return safe > 0 ? new Promise((resolve) => setTimeout(resolve, safe)) : Promise.resolve();
}

function readEnvDelay(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? NaN);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(30_000, Math.trunc(raw)));
}

export function resolveMockDelayConfig(scenario: string): MockAiDelayConfig {
  const scenarioFirstDelay = scenario === "slow_first_token" ? 7_000 : 30;
  const scenarioChunkDelay = scenario === "long_chunk_gap" ? 6_000 : 15;
  return {
    firstTokenDelayMs: readEnvDelay("VC_MOCK_FIRST_TOKEN_DELAY_MS", scenarioFirstDelay),
    chunkDelayMs: readEnvDelay("VC_MOCK_CHUNK_DELAY_MS", scenarioChunkDelay),
    finalDelayMs: readEnvDelay("VC_MOCK_FINAL_DELAY_MS", 20),
  };
}

function openAiDeltaPayload(text: string): string {
  return JSON.stringify({
    id: "mock-chatcmpl-versecraft",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-main",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  });
}

function openAiUsagePayload(scenario: MockStreamScenario): string {
  return JSON.stringify({
    id: "mock-chatcmpl-versecraft",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-main",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: {
      prompt_tokens: scenario.usage.promptTokens,
      completion_tokens: scenario.usage.completionTokens,
      total_tokens: scenario.usage.totalTokens,
      prompt_tokens_details: { cached_tokens: scenario.usage.cachedPromptTokens ?? 0 },
    },
  });
}

export function createMockOpenAiStreamResponse(scenario: MockStreamScenario): Response {
  const delayConfig = resolveMockDelayConfig(scenario.scenario);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await delay(delayConfig.firstTokenDelayMs);
        for (let i = 0; i < scenario.chunks.length; i += 1) {
          const chunk = scenario.chunks[i] ?? "";
          if (chunk.length > 0) {
            controller.enqueue(encoder.encode(encodeSseEventPayload(openAiDeltaPayload(chunk))));
          }
          if (i < scenario.chunks.length - 1) {
            await delay(delayConfig.chunkDelayMs);
          }
        }
        await delay(delayConfig.finalDelayMs);
        if (scenario.includeDone) {
          controller.enqueue(encoder.encode(encodeSseEventPayload(openAiUsagePayload(scenario))));
          controller.enqueue(encoder.encode(encodeSseEventPayload("[DONE]")));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-VerseCraft-Mock-AI": scenario.scenario,
    },
  });
}
