import { expect, test } from "@playwright/test";
import { createCodexFileHandoff } from "./support/codexFileHandoff";
import { runBrowserPlaythrough, startLocalBrowserPlaythrough } from "./support/browserPlaythrough";

const shouldRunCodexPlaytest = process.env.E2E_AI_LIVE === "1" && process.env.E2E_CODEX_PLAYTEST === "1";

function positiveIntegerEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function codexModeFromEnv(): "developer" | "blind" {
  return process.env.E2E_CODEX_PLAYTEST_MODE === "blind" ? "blind" : "developer";
}

test.describe("Codex external browser playthrough", () => {
  test("waits for Codex decisions and plays through the real browser", async ({ page }) => {
    test.skip(!shouldRunCodexPlaytest, "Set E2E_AI_LIVE=1 and E2E_CODEX_PLAYTEST=1 to start an external Codex playtest.");

    const maxTurns = positiveIntegerEnv("E2E_CODEX_MAX_TURNS", 20);
    const handoffTimeoutMs = positiveIntegerEnv("E2E_CODEX_HANDOFF_TIMEOUT_MS", 10 * 60_000);
    const mode = codexModeFromEnv();
    test.setTimeout(maxTurns * (handoffTimeoutMs + 60_000) + 120_000);

    const runId = `codex-browser-${Date.now()}`;
    const artifactDir = `${process.cwd()}/.runtime-data/browser-playthrough`;
    const handoff = createCodexFileHandoff({
      runId,
      artifactDir,
      timeoutMs: handoffTimeoutMs,
      mode,
    });
    console.log(`[codex-playthrough] run=${runId} mode=${mode}`);
    console.log(`[codex-playthrough] waiting for decisions at ${handoff.requestPath}`);

    await startLocalBrowserPlaythrough(page, { viewport: { width: 390, height: 844 }, timeoutMs: 60_000 });
    const result = await runBrowserPlaythrough(page, {
      runId,
      artifactDir,
      maxTurns,
      actionTimeoutMs: 60_000,
      decisionProvider: handoff.decisionProvider,
    });

    expect(["max_turns", "decision_stopped", "ending_reached"]).toContain(result.trace.terminationReason);
    expect(result.trace.turns.some((turn) => Boolean(turn.finalDmJson))).toBe(true);
    expect(result.trace.pageErrors).toEqual([]);
  });
});
