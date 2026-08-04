import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { Page, Request, Response } from "@playwright/test";

const DEFAULT_ACTION_TIMEOUT_MS = 35_000;
const DEFAULT_ARTIFACT_DIR = join(process.cwd(), ".runtime-data", "browser-playthrough");
const FINAL_FRAME_PREFIX = "__VERSECRAFT_FINAL__:";

export interface BrowserPlaythroughObservation {
  turnIndex: number;
  url: string;
  narrative: string;
  options: string[];
  inputEnabled: boolean;
}

export interface BrowserPlaythroughDecision {
  action: string;
  intent: string;
  stop?: boolean;
}

export interface BrowserPlaythroughDecisionProvider {
  decide(observation: BrowserPlaythroughObservation): Promise<BrowserPlaythroughDecision> | BrowserPlaythroughDecision;
}

export interface BrowserPlaythroughTurnEvidence {
  turnIndex: number;
  decision: BrowserPlaythroughDecision;
  observationBefore: BrowserPlaythroughObservation;
  observationAfter?: BrowserPlaythroughObservation;
  responseStatus?: number;
  responseContentType?: string;
  finalDmJson?: Record<string, unknown>;
  screenshotPath?: string;
  error?: string;
}

export type BrowserPlaythroughTerminationReason =
  | "max_turns"
  | "decision_stopped"
  | "ending_reached"
  | "turn_failed";

export interface BrowserPlaythroughTrace {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  terminationReason: BrowserPlaythroughTerminationReason;
  pageErrors: string[];
  turns: BrowserPlaythroughTurnEvidence[];
  error?: string;
}

export interface StartLocalBrowserPlaythroughOptions {
  viewport?: { width: number; height: number };
  timeoutMs?: number;
}

export interface RunBrowserPlaythroughOptions {
  decisionProvider: BrowserPlaythroughDecisionProvider;
  maxTurns: number;
  runId?: string;
  artifactDir?: string;
  actionTimeoutMs?: number;
}

export interface BrowserPlaythroughRunResult {
  trace: BrowserPlaythroughTrace;
  tracePath: string;
}

function safeRunId(runId: string): string {
  return runId.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
}

function createRunId(): string {
  return `browser-playthrough-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function finalFrameFromSse(body: string): Record<string, unknown> {
  const line = body
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(`data: ${FINAL_FRAME_PREFIX}`));
  if (!line) throw new Error("missing authoritative __VERSECRAFT_FINAL__ SSE frame");

  const json = line.slice(`data: ${FINAL_FRAME_PREFIX}`.length);
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("authoritative final SSE frame was not an object");
  }
  return parsed as Record<string, unknown>;
}

async function extractVisibleOptions(page: Page): Promise<string[]> {
  return page.getByTestId("mobile-option-item").evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const style = window.getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean)
  );
}

/**
 * Builds an observation from information a player can see in the /play UI.
 * Deliberately does not read Zustand, IndexedDB, request payloads, or prompt data.
 */
export async function observeBrowserPlaythrough(page: Page, turnIndex: number): Promise<BrowserPlaythroughObservation> {
  const input = page.getByTestId("manual-action-input");
  const story = page.getByTestId("play-story-document");
  const [narrative, options, inputEnabled] = await Promise.all([
    story.innerText(),
    extractVisibleOptions(page),
    input.isEnabled(),
  ]);

  return {
    turnIndex,
    url: page.url(),
    narrative: narrative.slice(-12_000),
    options,
    inputEnabled,
  };
}

/** Starts a fresh local save through the visible world selector and character form. */
export async function startLocalBrowserPlaythrough(
  page: Page,
  options: StartLocalBrowserPlaythroughOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
  const activeChatRequests = new Set<Request>();
  const trackChatRequest = (request: Request) => {
    if (new URL(request.url()).pathname === "/api/chat") activeChatRequests.add(request);
  };
  const clearChatRequest = (request: Request) => activeChatRequests.delete(request);
  page.on("request", trackChatRequest);
  page.on("requestfinished", clearChatRequest);
  page.on("requestfailed", clearChatRequest);

  try {
  if (options.viewport) await page.setViewportSize(options.viewport);

  const introResponse = await page.goto("/intro", { waitUntil: "domcontentloaded", timeout: timeoutMs });
  if (!introResponse || introResponse.status() >= 500) {
    throw new Error(`intro page unavailable: HTTP ${introResponse?.status() ?? "no_response"}`);
  }

  const startButton = page.getByTestId("intro-start-create");
  await startButton.waitFor({ state: "visible", timeout: timeoutMs });
  await startButton.click();
  await page.waitForURL(/\/create(?:$|[?#/])/, { timeout: timeoutMs });

  const quickCreate = page.getByTestId("quick-create-character");
  await quickCreate.waitFor({ state: "visible", timeout: timeoutMs });
  await quickCreate.click();
  const submit = page.getByTestId("create-submit-button");
  await submit.click();
  await page.waitForURL(/\/play(?:$|[?#/])/, { timeout: timeoutMs });

  const input = page.getByTestId("manual-action-input");
  await input.waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(
    () => {
      const node = document.querySelector<HTMLInputElement>('[data-testid="manual-action-input"]');
      return Boolean(node && !node.disabled);
    },
    { timeout: timeoutMs }
  );
  const idleDeadline = Date.now() + timeoutMs;
  let quietSince = Date.now();
  while (Date.now() < idleDeadline) {
    if (activeChatRequests.size === 0) {
      if (Date.now() - quietSince >= 400) break;
    } else {
      quietSince = Date.now();
    }
    await page.waitForTimeout(50);
  }
  if (activeChatRequests.size > 0 || Date.now() - quietSince < 400) {
    throw new Error("opening /api/chat requests did not settle before browser playthrough started");
  }
  } finally {
    page.off("request", trackChatRequest);
    page.off("requestfinished", clearChatRequest);
    page.off("requestfailed", clearChatRequest);
  }
}

async function waitForChatResponse(page: Page, action: string, timeoutMs: number): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      if (new URL(response.url()).pathname !== "/api/chat" || response.request().method() !== "POST") return false;
      const body = response.request().postData() ?? "";
      try {
        const payload = JSON.parse(body) as {
          messages?: Array<{ role?: unknown; content?: unknown }>;
        };
        const lastUserMessage = [...(payload.messages ?? [])].reverse().find((message) => message.role === "user");
        return lastUserMessage?.content === action;
      } catch {
        return false;
      }
    },
    { timeout: timeoutMs }
  );
}

async function submitVisibleAction(
  page: Page,
  action: string,
  timeoutMs: number
): Promise<{ status: number; contentType: string; finalDmJson: Record<string, unknown> }> {
  const input = page.getByTestId("manual-action-input");
  await input.fill(action);
  const responsePromise = waitForChatResponse(page, action, timeoutMs);
  await page.getByTestId("send-action-button").click();
  const response = await responsePromise;
  const body = await response.text();
  const contentType = response.headers()["content-type"] ?? "";

  if (response.status() !== 200) {
    throw new Error(`unexpected /api/chat HTTP ${response.status()}: ${body.slice(0, 800)}`);
  }
  if (!contentType.includes("text/event-stream")) {
    throw new Error(`unexpected /api/chat content type: ${contentType || "missing"}`);
  }

  let finalDmJson: Record<string, unknown>;
  try {
    finalDmJson = finalFrameFromSse(body);
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}; SSE body: ${body.slice(0, 800)}`);
  }
  if (typeof finalDmJson.narrative !== "string" || !finalDmJson.narrative.trim()) {
    throw new Error("authoritative final SSE frame has no narrative");
  }

  await page.waitForFunction(
    () => {
      const node = document.querySelector<HTMLInputElement>('[data-testid="manual-action-input"]');
      return Boolean(node && !node.disabled && node.value === "");
    },
    { timeout: timeoutMs }
  );

  if ((await page.locator("body").innerText()).includes("Application error")) {
    throw new Error("page displayed Application error after turn commit");
  }

  return { status: response.status(), contentType, finalDmJson };
}

async function persistTrace(tracePath: string, trace: BrowserPlaythroughTrace): Promise<void> {
  await mkdir(dirname(tracePath), { recursive: true });
  await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
}

function isEndingVisible(page: Page): Promise<boolean> {
  return page
    .locator('[data-testid="ending-final-choice-panel"], [data-testid="ending-final-narrative-sheet"]')
    .count()
    .then((count) => count > 0);
}

/**
 * Runs a finite browser campaign and writes evidence after every completed turn.
 * It intentionally accepts externally supplied decisions so a Codex-directed
 * campaign can use this driver without coupling a player model into Playwright.
 */
export async function runBrowserPlaythrough(
  page: Page,
  options: RunBrowserPlaythroughOptions
): Promise<BrowserPlaythroughRunResult> {
  if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1) {
    throw new Error("maxTurns must be a positive integer");
  }

  const runId = safeRunId(options.runId ?? createRunId());
  const artifactDir = options.artifactDir ?? DEFAULT_ARTIFACT_DIR;
  const tracePath = join(artifactDir, `${runId}.json`);
  const timeoutMs = options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
  const pageErrors: string[] = [];
  const capturePageError = (error: Error) => pageErrors.push(error.message);
  page.on("pageerror", capturePageError);

  const trace: BrowserPlaythroughTrace = {
    runId,
    startedAt: new Date().toISOString(),
    terminationReason: "max_turns",
    pageErrors,
    turns: [],
  };

  try {
    for (let turnIndex = 0; turnIndex < options.maxTurns; turnIndex += 1) {
      const observationBefore = await observeBrowserPlaythrough(page, turnIndex);
      const decision = await options.decisionProvider.decide(observationBefore);
      const evidence: BrowserPlaythroughTurnEvidence = { turnIndex, decision, observationBefore };
      trace.turns.push(evidence);

      if (decision.stop) {
        trace.terminationReason = "decision_stopped";
        break;
      }
      if (!decision.action.trim()) {
        throw new Error(`decision provider returned an empty action for turn ${turnIndex}`);
      }

      try {
        const response = await submitVisibleAction(page, decision.action, timeoutMs);
        evidence.responseStatus = response.status;
        evidence.responseContentType = response.contentType;
        evidence.finalDmJson = response.finalDmJson;
        evidence.observationAfter = await observeBrowserPlaythrough(page, turnIndex + 1);
        const screenshotPath = join(artifactDir, `${runId}-turn-${turnIndex + 1}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        evidence.screenshotPath = relative(process.cwd(), screenshotPath);
        await persistTrace(tracePath, trace);
      } catch (error) {
        evidence.error = error instanceof Error ? error.message : String(error);
        const screenshotPath = join(artifactDir, `${runId}-turn-${turnIndex + 1}-failed.png`);
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
          evidence.screenshotPath = relative(process.cwd(), screenshotPath);
        } catch (screenshotError) {
          evidence.error += `; failure screenshot unavailable: ${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}`;
        }
        trace.terminationReason = "turn_failed";
        throw error;
      }

      if (await isEndingVisible(page)) {
        trace.terminationReason = "ending_reached";
        break;
      }
    }

    if (pageErrors.length > 0) {
      throw new Error(`page errors during playthrough: ${pageErrors.join(" | ")}`);
    }
    return { trace, tracePath };
  } catch (error) {
    trace.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    trace.finishedAt = new Date().toISOString();
    await persistTrace(tracePath, trace);
    page.off("pageerror", capturePageError);
  }
}

export function sequenceDecisionProvider(actions: readonly BrowserPlaythroughDecision[]): BrowserPlaythroughDecisionProvider {
  let next = 0;
  return {
    decide: () => {
      const decision = actions[next];
      next += 1;
      return decision ?? { action: "", intent: "sequence_exhausted", stop: true };
    },
  };
}
