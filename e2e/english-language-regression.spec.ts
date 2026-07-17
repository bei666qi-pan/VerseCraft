import { expect, test } from "@playwright/test";
import { probeChatSse } from "../src/lib/perf/chatSseProbe";

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const MOCK_AI = process.env.AI_PROVIDER === "mock";

function playerFacingCopy(finalJson: unknown): string[] {
  if (!finalJson || typeof finalJson !== "object" || Array.isArray(finalJson)) return [];
  const record = finalJson as Record<string, unknown>;
  return [record.narrative, ...(Array.isArray(record.options) ? record.options : [])]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

test.describe("English play-language regression", () => {
  test("language-switch history endpoint returns a complete English replacement batch", async ({ request }) => {
    test.skip(!MOCK_AI, "Requires AI_PROVIDER=mock.");
    const response = await request.post("/api/play/localize", {
      data: {
        language: "en-US",
        sessionId: `english-history-${Date.now()}`,
        entries: [
          { index: 0, content: "我听见门后有脚步声。" },
          { index: 2, content: "我后退半步，盯着走廊尽头。" },
        ],
      },
    });
    expect(response.ok()).toBe(true);
    const payload = (await response.json()) as { entries?: Array<{ index?: unknown; content?: unknown }> };
    expect(payload.entries).toHaveLength(2);
    expect(payload.entries?.map((entry) => entry.index)).toEqual([0, 2]);
    expect(payload.entries?.map((entry) => String(entry.content)).join("\n")).not.toMatch(CJK_RE);
  });

  test("a Chinese upstream turn cannot commit Chinese narrative or choices to an English session", async () => {
    test.skip(!MOCK_AI, "Requires AI_PROVIDER=mock so the upstream emits the intentional Chinese fixture.");
    test.setTimeout(120_000);
    const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:666";
    const sessionId = `english-final-guard-${Date.now()}`;
    const result = await probeChatSse({
      baseUrl,
      timeoutMs: 120_000,
      headers: { "x-versecraft-output-language": "en-US" },
      body: {
        latestUserInput: "[mock_scenario:normal_stream] I listen at the door.",
        messages: [{ role: "user", content: "[mock_scenario:normal_stream] I listen at the door." }],
        playerContext: "{}",
        sessionId,
        language: "en-US",
      },
    });

    expect(result.status).toBe(200);
    expect(result.contentType.toLowerCase()).toContain("text/event-stream");
    expect(result.finalFrameReceived).toBe(true);
    expect(result.finalJsonParseSuccess).toBe(true);
    const copy = playerFacingCopy(result.finalJson);
    expect(copy.length).toBeGreaterThan(0);
    expect(copy.join("\n")).not.toMatch(CJK_RE);
  });
});
