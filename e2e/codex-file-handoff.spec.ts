import { expect, test } from "@playwright/test";
import {
  createCodexFileHandoff,
  readCodexHandoffRequest,
  submitCodexHandoffDecision,
} from "./support/codexFileHandoff";
import { runBrowserPlaythrough, startLocalBrowserPlaythrough } from "./support/browserPlaythrough";

const shouldRunSmoke = process.env.E2E_CODEX_HANDOFF_SMOKE === "1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateExternalCodex(requestPath: string, actions: readonly string[]): Promise<void> {
  const seenTickets = new Set<string>();
  let actionIndex = 0;
  const deadline = Date.now() + 30_000;

  while (actionIndex < actions.length && Date.now() < deadline) {
    try {
      const request = await readCodexHandoffRequest(requestPath);
      if (!seenTickets.has(request.ticket)) {
        seenTickets.add(request.ticket);
        await submitCodexHandoffDecision(requestPath, {
          action: actions[actionIndex]!,
          intent: "automated_handoff_smoke",
        });
        actionIndex += 1;
      }
    } catch {
      // The browser has not yet written its next atomic request.
    }
    await sleep(25);
  }

  if (actionIndex !== actions.length) throw new Error(`handoff sidecar supplied ${actionIndex}/${actions.length} decisions`);
}

test.describe("Codex file handoff browser smoke", () => {
  test("submits browser actions only after matching handoff decisions arrive", async ({ page }) => {
    test.skip(!shouldRunSmoke, "Set E2E_CODEX_HANDOFF_SMOKE=1 with AI_PROVIDER=mock to run the file-handoff browser smoke.");
    test.setTimeout(90_000);

    const runId = `codex-handoff-smoke-${Date.now()}`;
    const artifactDir = `${process.cwd()}/.runtime-data/browser-playthrough`;
    const handoff = createCodexFileHandoff({
      runId,
      artifactDir,
      timeoutMs: 15_000,
      pollIntervalMs: 25,
    });
    const sidecar = simulateExternalCodex(handoff.requestPath, [
      "先查看身边最明显的异常。",
      "根据刚才的发现继续调查，不做无依据的猜测。",
    ]);

    await startLocalBrowserPlaythrough(page, { viewport: { width: 390, height: 844 }, timeoutMs: 45_000 });
    const result = await runBrowserPlaythrough(page, {
      runId,
      artifactDir,
      maxTurns: 2,
      actionTimeoutMs: 45_000,
      decisionProvider: handoff.decisionProvider,
    });
    await sidecar;

    expect(result.trace.terminationReason).toBe("max_turns");
    expect(result.trace.turns.map((turn) => turn.decision.action)).toEqual([
      "先查看身边最明显的异常。",
      "根据刚才的发现继续调查，不做无依据的猜测。",
    ]);
    expect(result.trace.turns.every((turn) => turn.responseStatus === 200)).toBe(true);
  });
});
