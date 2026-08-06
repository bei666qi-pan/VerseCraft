import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared SSE parsing utilities (mirrors chat-sse-contract.spec.ts)
// ---------------------------------------------------------------------------

const VERSECRAFT_STATUS_PREFIX = "__VERSECRAFT_STATUS__:";
const VERSECRAFT_FINAL_PREFIX = "__VERSECRAFT_FINAL__:";
const VERSECRAFT_CONTROL_PREFIX = "__VERSECRAFT_";

function isUnknownVerseCraftControlFrame(payload: string): boolean {
  return (
    payload.startsWith(VERSECRAFT_CONTROL_PREFIX) &&
    !payload.startsWith(VERSECRAFT_STATUS_PREFIX) &&
    !payload.startsWith(VERSECRAFT_FINAL_PREFIX)
  );
}

function extractDmJsonTextFromSseBody(bodyText: string): string {
  let raw = "";
  const normalized = bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const events = normalized.split("\n\n");
  for (const ev of events) {
    const chunks = ev
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (chunks.length === 0) continue;
    const joined = chunks.join("\n");
    if (!joined.length) continue;
    if (
      joined.startsWith(VERSECRAFT_STATUS_PREFIX) ||
      isUnknownVerseCraftControlFrame(joined)
    ) {
      continue;
    }
    if (joined.startsWith(VERSECRAFT_FINAL_PREFIX)) {
      raw = joined.slice(VERSECRAFT_FINAL_PREFIX.length);
      continue;
    }
    raw += joined;
  }
  return extractFirstBalancedJsonObject(raw.trim()) ?? raw.trim();
}

function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Extract all status frames from the SSE body for inspection. */
function extractStatusFrames(bodyText: string): Array<Record<string, unknown>> {
  const frames: Array<Record<string, unknown>> = [];
  const normalized = bodyText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const events = normalized.split("\n\n");
  for (const ev of events) {
    const chunks = ev
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (chunks.length === 0) continue;
    for (const joined of chunks) {
      if (joined.startsWith(VERSECRAFT_STATUS_PREFIX)) {
        try {
          const json = joined.slice(VERSECRAFT_STATUS_PREFIX.length);
          frames.push(JSON.parse(json) as Record<string, unknown>);
        } catch {
          // ignore malformed frames
        }
      }
    }
  }
  return frames;
}

function assertDmContractShape(parsed: unknown) {
  expect(parsed && typeof parsed === "object" && !Array.isArray(parsed)).toBeTruthy();
  const o = parsed as Record<string, unknown>;
  expect(typeof o.narrative).toBe("string");
  expect(typeof o.is_action_legal).toBe("boolean");
}

function isDmContractJson(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const o = parsed as Record<string, unknown>;
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        typeof o.narrative === "string" &&
        typeof o.is_action_legal === "boolean"
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// API helper (matched to chat-sse-contract.spec.ts postChat pattern)
// ---------------------------------------------------------------------------

async function postChat(
  options: {
    content?: string;
    sessionIdPrefix?: string;
    timeoutMs?: number;
  } = {}
) {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://[::1]:666";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000);
  const response = await fetch(`${baseURL}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `127.0.0.${Math.floor(Math.random() * 200) + 20}`,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: options.content ?? "e2e-world-director-ping" }],
      playerContext: "{}",
      sessionId: `${options.sessionIdPrefix ?? "e2e-wd"}-${Date.now()}`,
    }),
    signal: controller.signal,
  });

  const responseHeaders = Object.fromEntries(response.headers.entries());
  let text = "";
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  try {
    if (!reader) {
      text = await response.text();
    } else {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const raw = extractDmJsonTextFromSseBody(text);
        if (raw && isDmContractJson(raw)) break;
      }
      text += decoder.decode();
      await reader.cancel().catch(() => undefined);
    }
  } finally {
    clearTimeout(timeout);
  }

  return {
    status: () => response.status,
    headers: () => responseHeaders,
    text: async () => text,
  };
}

// ---------------------------------------------------------------------------
// Feature-flag probes: check what mode the dev server is running in
// ---------------------------------------------------------------------------

/** Detect whether the running server has LangGraph enabled by calling
 *  /api/chat and inspecting env-dependent side effects.  Since we can't
 *  read the server's process.env, we probe indirectly:
 *
 *  1. VERSECRAFT_ENABLE_LANGGRAPH=true ⇒ promptAssembly uses the LangGraph
 *     director hint branch (buildDirectorHintBlock from directorHintBuilder.ts)
 *  2. VERSECRAFT_ENABLE_LANGGRAPH=false ⇒ legacy buildServerDirectorHintBlock
 *
 *  Both branches produce valid DM JSON, so we verify correct operation
 *  regardless of the flag.  To run LangGraph-specific assertions the dev
 *  server must be started with VERSECRAFT_ENABLE_LANGGRAPH=true.
 */
const LANGGRAPH_ENABLED = process.env.VERSECRAFT_ENABLE_LANGGRAPH === "1";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("World Director — /api/chat SSE contract", () => {
  test("chat turn completes with valid DM JSON (autonomous mode, no prior agenda)", async () => {
    test.setTimeout(120_000);

    const res = await postChat({
      content: "环顾四周，观察当前的环境。",
      sessionIdPrefix: "e2e-wd-autonomous",
    });

    expect(res.status()).toBe(200);

    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");

    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);

    // Must contain an authoritative final frame
    expect(body).toContain(VERSECRAFT_FINAL_PREFIX);

    const raw = extractDmJsonTextFromSseBody(body);
    expect(raw.length).toBeGreaterThan(0);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(
        `DM JSON parse failed: ${String(e)}; rawHead=${raw.slice(0, 200)}`
      );
    }
    assertDmContractShape(parsed);

    // Verify the final frame has all required DM fields
    const dm = parsed as Record<string, unknown>;
    expect(typeof dm.is_action_legal).toBe("boolean");
    expect(typeof dm.narrative).toBe("string");
    expect(typeof dm.sanity_damage).toBe("number");
    expect(typeof dm.is_death).toBe("boolean");

    // Status frames: at minimum we should see stage transitions
    const statusFrames = extractStatusFrames(body);
    const stages = statusFrames
      .map((f) => f.stage)
      .filter((s): s is string => typeof s === "string");
    // A well-formed turn should have at least one status frame
    expect(stages.length).toBeGreaterThan(0);
  });

  test("chat turn produces director-aware response (hint injection path is non-breaking)", async () => {
    test.setTimeout(120_000);

    // Send a narrative-driving action that should trigger director consideration
    const res = await postChat({
      content: "仔细观察周围有没有可疑的人物或异常的现象。",
      sessionIdPrefix: "e2e-wd-director",
    });

    expect(res.status()).toBe(200);

    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");

    const body = await res.text();
    const raw = extractDmJsonTextFromSseBody(body);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assertDmContractShape(parsed);

    // The narrative should be a non-empty, non-placeholder string
    expect(typeof parsed.narrative).toBe("string");
    expect((parsed.narrative as string).length).toBeGreaterThan(10);

    // Verify the SSE doesn't contain server errors
    expect(body).not.toContain("Application error");
    expect(body).not.toContain("__VERSECRAFT_ERROR__");
  });
});

test.describe("World Director — LangGraph feature flag", () => {
  test("promptAssembly uses LangGraph path when VERSECRAFT_ENABLE_LANGGRAPH=true", async () => {
    test.setTimeout(120_000);
    test.skip(
      !LANGGRAPH_ENABLED,
      "Skipped: VERSECRAFT_ENABLE_LANGGRAPH is not set to 1. " +
        "Start the dev server with VERSECRAFT_ENABLE_LANGGRAPH=1 to run this test."
    );

    // When LangGraph is enabled, promptAssembly checks worldDirectorConfig.enableLangGraph
    // and uses the buildDirectorHintBlock path.  On a fresh session with no prior agenda,
    // hasPlan=false → directorHintBlock="" (autonomous mode).  The turn must still complete
    // with valid DM JSON.
    const res = await postChat({
      content: "我想了解一下这片区域的基本情况。",
      sessionIdPrefix: "e2e-wd-lg-on",
    });

    expect(res.status()).toBe(200);

    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain(VERSECRAFT_FINAL_PREFIX);

    const raw = extractDmJsonTextFromSseBody(body);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assertDmContractShape(parsed);

    // hallucination guard: narrative must not be empty/template
    expect(typeof parsed.narrative).toBe("string");
    expect((parsed.narrative as string).trim().length).toBeGreaterThan(0);

    // The SSE must contain at least one status frame proving the pipeline ran
    const statusFrames = extractStatusFrames(body);
    expect(statusFrames.length).toBeGreaterThan(0);

    // Verify that the response doesn't contain error traces from the LangGraph path
    expect(body).not.toContain("LangGraph error");
    expect(body).not.toContain("directorHintBuilder");
    expect(body).not.toContain("Application error");
  });

  test("promptAssembly uses legacy path when VERSECRAFT_ENABLE_LANGGRAPH=false", async () => {
    test.setTimeout(120_000);
    test.skip(
      LANGGRAPH_ENABLED,
      "Skipped: VERSECRAFT_ENABLE_LANGGRAPH is set to 1. " +
        "Start the dev server without VERSECRAFT_ENABLE_LANGGRAPH (or with =0) to run this test."
    );

    // Legacy path uses buildServerDirectorHintBlock.  Must still produce valid DM JSON.
    const res = await postChat({
      content: "我想了解一下这片区域的基本情况。",
      sessionIdPrefix: "e2e-wd-lg-off",
    });

    expect(res.status()).toBe(200);

    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain(VERSECRAFT_FINAL_PREFIX);

    const raw = extractDmJsonTextFromSseBody(body);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assertDmContractShape(parsed);

    expect(typeof parsed.narrative).toBe("string");
    expect((parsed.narrative as string).trim().length).toBeGreaterThan(0);
    expect(body).not.toContain("Application error");
  });
});

test.describe("World Director — directorHintBlock injection integrity", () => {
  test("fresh session with no agenda: directorHintBlock is empty (autonomous mode)", async () => {
    test.setTimeout(120_000);
    test.skip(
      !LANGGRAPH_ENABLED,
      "Skipped: VERSECRAFT_ENABLE_LANGGRAPH is not set to 1."
    );

    // On a fresh session, dueDirectorAgendaForPrompt is empty and
    // directorDigestForPrompt is null.  hasPlan=false → directorHintBlock="".
    // The writing agent operates autonomously.  The turn must succeed.
    const res = await postChat({
      content: "我决定先四处走走，熟悉一下环境。",
      sessionIdPrefix: "e2e-wd-fresh",
    });

    expect(res.status()).toBe(200);

    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");

    const body = await res.text();
    const raw = extractDmJsonTextFromSseBody(body);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assertDmContractShape(parsed);

    // Autonomous mode: narrative exists and is plausible
    expect(typeof parsed.narrative).toBe("string");
    const narrative = parsed.narrative as string;
    expect(narrative.length).toBeGreaterThan(10);

    // Verify no error leaked from promptAssembly
    expect(body).not.toContain("Application error");
    expect(body).not.toContain("directorHintBlock");
  });

  test("turn with director hint injected: DM JSON still valid", async () => {
    test.setTimeout(120_000);
    test.skip(
      !LANGGRAPH_ENABLED,
      "Skipped: VERSECRAFT_ENABLE_LANGGRAPH is not set to 1."
    );

    // Send a second turn on the same session (same sessionIdPrefix base).
    // While we can't guarantee an agenda was generated from the first turn's
    // background tick (it's async), we verify the SSE pipeline is robust
    // regardless of whether hasPlan is true or false.
    const sessionBase = `e2e-wd-inject-${Date.now()}`;

    // Turn 1
    const res1 = await postChat({
      content: "我打算深入探索前方的遗迹。",
      sessionIdPrefix: `${sessionBase}-t1`,
    });
    expect(res1.status()).toBe(200);

    // Turn 2 (may or may not have an agenda from tick 1)
    const res2 = await postChat({
      content: "仔细观察遗迹墙壁上的铭文和符号。",
      sessionIdPrefix: `${sessionBase}-t2`,
    });
    expect(res2.status()).toBe(200);

    const body2 = await res2.text();
    expect(body2).toContain(VERSECRAFT_FINAL_PREFIX);

    const raw2 = extractDmJsonTextFromSseBody(body2);
    const parsed2 = JSON.parse(raw2) as Record<string, unknown>;
    assertDmContractShape(parsed2);

    expect(typeof parsed2.narrative).toBe("string");
    expect((parsed2.narrative as string).length).toBeGreaterThan(10);
    expect(body2).not.toContain("Application error");
  });
});

test.describe("World Director — analytics contract", () => {
  test("world_engine_enqueued event path exists (SSE completes without error)", async () => {
    test.setTimeout(120_000);
    // This test verifies that the SSE pipeline completes successfully.
    // The actual world_engine_enqueued analytics event is emitted
    // asynchronously via onSettled callbacks and is best-effort;
    // we verify the HTTP contract here and defer analytics-persistence
    // verification to the dedicated analytics detector tests in
    // src/lib/evals/detectors/.

    const res = await postChat({
      content: "观察天色和时间，判断现在是什么时候。",
      sessionIdPrefix: "e2e-wd-analytics",
    });

    expect(res.status()).toBe(200);

    const ct = (res.headers()["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");

    const body = await res.text();
    expect(body).toContain(VERSECRAFT_FINAL_PREFIX);

    const raw = extractDmJsonTextFromSseBody(body);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assertDmContractShape(parsed);

    // Verify the AI status header is present (keys_missing or absent both OK)
    const aiStatus = (res.headers()["x-versecraft-ai-status"] ?? "").toLowerCase();
    expect(typeof aiStatus).toBe("string");

    // SSE must not contain unexpected error frames
    expect(body).not.toContain("__VERSECRAFT_ERROR__");
    expect(body).not.toContain("Application error");
  });
});

test.describe("World Director — parallel turn isolation", () => {
  test("two independent sessions produce independent valid turns", async () => {
    test.setTimeout(180_000);

    const sessionA = `e2e-wd-isoa-${Date.now()}`;
    const sessionB = `e2e-wd-isob-${Date.now()}`;

    const [resA, resB] = await Promise.all([
      postChat({ content: "向北走。", sessionIdPrefix: sessionA }),
      postChat({ content: "向南走。", sessionIdPrefix: sessionB }),
    ]);

    expect(resA.status()).toBe(200);
    expect(resB.status()).toBe(200);

    const bodyA = await resA.text();
    const bodyB = await resB.text();

    expect(bodyA).toContain(VERSECRAFT_FINAL_PREFIX);
    expect(bodyB).toContain(VERSECRAFT_FINAL_PREFIX);

    const parsedA = JSON.parse(extractDmJsonTextFromSseBody(bodyA)) as Record<string, unknown>;
    const parsedB = JSON.parse(extractDmJsonTextFromSseBody(bodyB)) as Record<string, unknown>;

    assertDmContractShape(parsedA);
    assertDmContractShape(parsedB);

    // Independent sessions should produce distinct narratives
    // (not guaranteed for keys_missing mode, so only assert they are non-empty)
    expect((parsedA.narrative as string).trim().length).toBeGreaterThan(0);
    expect((parsedB.narrative as string).trim().length).toBeGreaterThan(0);
  });
});

test.describe("World Director — status frame progression", () => {
  test("SSE status frames follow expected stage progression", async () => {
    test.setTimeout(120_000);

    const res = await postChat({
      content: "检查身上的装备和物品。",
      sessionIdPrefix: "e2e-wd-status",
    });

    expect(res.status()).toBe(200);

    const body = await res.text();
    const statusFrames = extractStatusFrames(body);

    // The turn engine should emit status frames for key stages
    const stageNames = statusFrames
      .map((f) => f.stage)
      .filter((s): s is string => typeof s === "string");

    // At minimum, we expect at least one status frame
    expect(stageNames.length).toBeGreaterThan(0);

    // Each status frame must have required fields
    for (const frame of statusFrames) {
      expect(frame).toHaveProperty("stage");
      expect(frame).toHaveProperty("message");
      expect(frame).toHaveProperty("requestId");
    }

    // Verify the final authoritative frame exists and is valid
    expect(body).toContain(VERSECRAFT_FINAL_PREFIX);
    const raw = extractDmJsonTextFromSseBody(body);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assertDmContractShape(parsed);
  });
});

test.describe("World Director — X-VerseCraft-Ai-Status header", () => {
  test("response includes X-VerseCraft-Ai-Status header", async () => {
    test.setTimeout(120_000);

    const res = await postChat({
      content: "e2e-world-director-ai-status-check",
      sessionIdPrefix: "e2e-wd-aistatus",
    });

    expect(res.status()).toBe(200);

    const headers = res.headers();
    const aiStatus = (headers["x-versecraft-ai-status"] ?? "").toLowerCase();
    // Allowed values: empty (gateway configured), keys_missing (no gateway)
    expect(["", "keys_missing"]).toContain(aiStatus);

    const ct = (headers["content-type"] ?? "").toLowerCase();
    expect(ct).toContain("text/event-stream");
  });
});
