import { access, readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  runBrowserPlaythrough,
  sequenceDecisionProvider,
  startLocalBrowserPlaythrough,
} from "./support/browserPlaythrough";

const shouldRunLive = process.env.E2E_AI_LIVE === "1";

test.describe("browser playthrough driver", () => {
  test("starts from intro/create, commits two real turns, and reloads the local save", async ({ page }) => {
    test.skip(!shouldRunLive, "Set E2E_AI_LIVE=1 to run the opt-in real gateway browser playthrough.");
    test.setTimeout(120_000);

    const startupPageErrors: string[] = [];
    page.on("pageerror", (error) => startupPageErrors.push(error.message));

    await startLocalBrowserPlaythrough(page, {
      viewport: { width: 390, height: 844 },
      timeoutMs: 45_000,
    });

    const result = await runBrowserPlaythrough(page, {
      runId: `intro-create-live-${Date.now()}`,
      maxTurns: 2,
      actionTimeoutMs: 45_000,
      decisionProvider: sequenceDecisionProvider([
        {
          action: "先观察大厅的灯光、门牌和出口，不拿取未说明的物品。",
          intent: "explore_visible_scene",
        },
        {
          action: "把刚才看到的异常按顺序复述，并询问附近是否有人。",
          intent: "follow_up_with_visible_context",
        },
      ]),
    });

    expect(result.trace.terminationReason).toBe("max_turns");
    expect(result.trace.turns).toHaveLength(2);
    expect(result.trace.pageErrors).toEqual([]);
    for (const turn of result.trace.turns) {
      expect(turn.responseStatus).toBe(200);
      expect(turn.responseContentType).toContain("text/event-stream");
      expect(typeof turn.finalDmJson?.narrative).toBe("string");
      expect(typeof turn.finalDmJson?.is_action_legal).toBe("boolean");
      expect(turn.observationAfter?.inputEnabled).toBe(true);
      expect(turn.screenshotPath).not.toBeNull();
    }

    await access(result.tracePath);
    const persistedTrace = JSON.parse(await readFile(result.tracePath, "utf8")) as typeof result.trace;
    expect(persistedTrace.turns.map((turn) => turn.decision.action)).toEqual(
      result.trace.turns.map((turn) => turn.decision.action)
    );

    const lastNarrative = String(result.trace.turns.at(-1)?.finalDmJson?.narrative ?? "").trim();
    expect(lastNarrative.length).toBeGreaterThan(12);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    const input = page.getByTestId("manual-action-input");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(input).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByTestId("play-story-document")).toContainText(lastNarrative.slice(0, 12), { timeout: 30_000 });
    await expect(page.getByText("Application error")).toHaveCount(0);
    expect(startupPageErrors).toEqual([]);
  });
});
