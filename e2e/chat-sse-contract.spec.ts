import { test, expect } from "@playwright/test";

const E2E_USER = process.env.E2E_USER;
const E2E_PASS = process.env.E2E_PASS;

/** Mirror client accumulation: CRLF-safe, multi-event, __VERSECRAFT_FINAL__ override. */
function extractDmJsonTextFromSseBody(bodyText: string): string {
  let raw = "";
  const normalized = bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const events = normalized.split("\n\n");
  for (const ev of events) {
    for (const line of ev.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const chunk = line.slice(5).trimStart();
      if (!chunk.length) continue;
      if (chunk.startsWith("__VERSECRAFT_FINAL__:")) {
        raw = chunk.slice("__VERSECRAFT_FINAL__:".length);
      } else {
        raw += chunk;
      }
    }
  }
  return raw.trim();
}

function assertDmContractShape(parsed: unknown) {
  expect(parsed && typeof parsed === "object" && !Array.isArray(parsed)).toBeTruthy();
  const o = parsed as Record<string, unknown>;
  expect(typeof o.narrative).toBe("string");
  expect(typeof o.is_action_legal).toBe("boolean");
}

/**
 * Contract: /api/chat returns SSE; full body must yield parseable DM JSON (narrative + is_action_legal).
 * Covers no-key 500 degradation and normal 200 stream completion.
 */
test.describe("/api/chat SSE contract", () => {
  test("responds with event-stream, non-empty body, and DM-shaped JSON", async ({ request }) => {
    const res = await request.post("/api/chat", {
      data: {
        messages: [{ role: "user", content: "e2e-sse-contract-ping" }],
        playerContext: "{}",
        sessionId: `e2e-${Date.now()}`,
      },
      headers: { "content-type": "application/json" },
      timeout: 120_000,
    });

    const status = res.status();
    expect(status, await res.text()).toBeLessThan(600);
    const ct = res.headers()["content-type"] ?? "";
    expect(ct).toContain("text/event-stream");

    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);

    const raw = extractDmJsonTextFromSseBody(text);
    expect(raw.length).toBeGreaterThan(0);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`DM JSON parse failed (status=${status}): ${String(e)}; rawHead=${raw.slice(0, 200)}`);
    }
    assertDmContractShape(parsed);
  });

  test("logged-in browser context still yields DM-shaped SSE", async ({ page }) => {
    if (!E2E_USER || !E2E_PASS) {
      test.skip();
      return;
    }

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.getByRole("button", { name: /建立档案|系统接入/ }).click();
    await page.waitForTimeout(500);
    await page.getByPlaceholder("账号").fill(E2E_USER);
    await page.getByPlaceholder("密码").fill(E2E_PASS);
    await page.getByRole("button", { name: /登录|正在连接/ }).click();
    await page.waitForTimeout(3000);

    const res = await page.request.post("/api/chat", {
      data: {
        messages: [{ role: "user", content: "e2e-sse-contract-auth-ping" }],
        playerContext: "{}",
        sessionId: `e2e-auth-${Date.now()}`,
      },
      headers: { "content-type": "application/json" },
      timeout: 120_000,
    });

    const status = res.status();
    expect(status, await res.text()).toBeLessThan(600);
    expect((res.headers()["content-type"] ?? "").toLowerCase()).toContain("text/event-stream");

    const text = await res.text();
    const raw = extractDmJsonTextFromSseBody(text);
    const parsed = JSON.parse(raw);
    assertDmContractShape(parsed);
  });
});
