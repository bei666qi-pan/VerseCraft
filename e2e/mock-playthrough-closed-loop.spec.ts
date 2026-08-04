/**
 * 开发者闭环游玩测试（Mock 模式）
 *
 * 无需真实 AI key，使用 mock provider 进行完整游玩流程测试：
 * intro → create → play → 多回合游玩 → 终局或软锁检测
 *
 * 运行：
 *   AI_PROVIDER=mock npx playwright test e2e/mock-playthrough-closed-loop.spec.ts --reporter=list
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

const ARTIFACT_DIR = join(process.cwd(), ".runtime-data", "mock-playthrough");
const MAX_TURNS = 12; // Balanced: covers option cycling + persistence check
const ACTION_TIMEOUT_MS = 45_000;

interface TurnRecord {
  turnIndex: number;
  action: string;
  responseStatus: number;
  responseContentType: string;
  finalDmJson: Record<string, unknown> | null;
  narrativePreview: string;
  optionsAfter: string[];
  inputEnabledAfter: boolean;
  screenshotPath: string;
  error?: string;
  softlockFlags?: string[];
}

interface PlaythroughReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  totalTurns: number;
  terminationReason: string;
  turns: TurnRecord[];
  pageErrors: string[];
  issues: Array<{
    severity: "high" | "medium" | "low";
    type: string;
    turnIndex: number;
    description: string;
    evidence: string;
  }>;
}

// Simple decision provider: cycles through predefined actions
const ACTION_POOL = [
  "我环顾四周，仔细观察走廊的环境和光线变化。",
  "我贴着墙慢慢往前走，注意听周围的动静。",
  "我检查门缝和墙角，寻找任何异常痕迹。",
  "我停下来，试着回忆之前在这一层看到的线索。",
  "我拿出钥匙试探旁边的门锁，看能不能打开。",
  "我压低声音朝走廊深处询问，试探是否有回应。",
  "我蹲下来用手电照地面，寻找脚印或拖拽痕迹。",
  "我检查墙上的公告栏和消防栓，看看有没有新发现。",
  "我退到楼梯口确认退路，再决定下一步方向。",
  "我在原地静立片刻，仔细辨认空气中是否有异味。",
];

// Decision provider: alternates between typing and clicking options
function decideAction(turnIndex: number, availableOptions: string[]): { action: string; useOption: boolean; optionIndex: number } {
  // Every 3rd turn, try to pick an option if available
  if (turnIndex % 3 === 2 && availableOptions.length > 0) {
    const idx = turnIndex % availableOptions.length;
    return { action: availableOptions[idx], useOption: true, optionIndex: idx };
  }
  return { action: ACTION_POOL[turnIndex % ACTION_POOL.length], useOption: false, optionIndex: -1 };
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

test.describe("mock closed-loop playthrough", () => {
  test("full playthrough: intro → create → play → multi-turn → detect ending/softlock", async ({
    page,
  }) => {
    test.setTimeout(600_000); // 10 minutes max

    const runId = `mock-closed-loop-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const runDir = join(ARTIFACT_DIR, runId);
    await ensureDir(runDir);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const report: PlaythroughReport = {
      runId,
      startedAt: new Date().toISOString(),
      finishedAt: "",
      totalTurns: 0,
      terminationReason: "unknown",
      turns: [],
      pageErrors: [],
      issues: [],
    };

    // ── Phase 1: Intro ──
    await page.goto("/intro", { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for intro page to be ready
    const startButton = page.getByTestId("intro-start-create");
    await expect(startButton).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: join(runDir, "phase-1-intro.png"), fullPage: true });

    // Click to start
    await startButton.click();

    // ── Phase 2: Create Character ──
    await expect(page).toHaveURL(/\/create/, { timeout: 15_000 });

    // Quick create
    const quickCreateBtn = page.getByTestId("quick-create-character");
    await expect(quickCreateBtn).toBeVisible({ timeout: 10_000 });
    await quickCreateBtn.click();

    const submitBtn = page.getByTestId("create-submit-button");
    await expect(submitBtn).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: join(runDir, "phase-2-create.png"), fullPage: true });
    await submitBtn.click();

    // ── Phase 3: Play Page ──
    await expect(page).toHaveURL(/\/play/, { timeout: 30_000 });

    // Wait for the input to be enabled (opening narrative loaded)
    const input = page.getByTestId("manual-action-input");
    await expect(input).toBeVisible({ timeout: 30_000 });
    await expect(input).toBeEnabled({ timeout: 45_000 });

    await page.screenshot({ path: join(runDir, "phase-3-play-start.png"), fullPage: true });

    // ── Phase 4: Multi-turn Gameplay ──

    let endingDetected = false;
    let softlockCount = 0;

    for (let turnIndex = 0; turnIndex < MAX_TURNS && !endingDetected; turnIndex++) {

      const turnRecord: TurnRecord = {
        turnIndex,
        action: "",
        responseStatus: 0,
        responseContentType: "",
        finalDmJson: null,
        narrativePreview: "",
        optionsAfter: [],
        inputEnabledAfter: false,
        screenshotPath: "",
      };

      // Always expand options first to see what's available
      const optionsBefore: string[] = [];
      try {
        const toggleBtn = page.getByTestId("options-toggle-button");
        const isExpanded = await toggleBtn.getAttribute("aria-pressed");
        if (isExpanded !== "true") {
          await toggleBtn.click();
          await page.waitForTimeout(300);
        }
        const allOptionItems = page.getByTestId("mobile-option-item");
        const count = await allOptionItems.count();
        for (let i = 0; i < count; i++) {
          const text = await allOptionItems.nth(i).textContent();
          if (text && text.trim()) optionsBefore.push(text.trim());
        }
      } catch {
        // Options toggle may not exist
      }

      // Decide action
      const decision = decideAction(turnIndex, optionsBefore);
      turnRecord.action = decision.action;

      // Submit action — DOM-based: wait for input re-enabled after turn completes
      try {
        // Record narrative before (for delta detection)
        const narrativeBefore = await page.getByTestId("play-story-document").innerText().catch(() => "");

        if (decision.useOption && optionsBefore.length > 0) {
          // Click the option directly
          const optionBtn = page.getByTestId("mobile-option-item").nth(decision.optionIndex);
          await optionBtn.click();
        } else {
          // Type the action manually
          await input.fill(decision.action);
          await page.getByTestId("send-action-button").click();
        }

        // Wait for input to clear and re-enable (signals turn processed)
        await page.waitForFunction(
          () => {
            const node = document.querySelector<HTMLInputElement>('[data-testid="manual-action-input"]');
            return Boolean(node && !node.disabled && node.value === "");
          },
          { timeout: ACTION_TIMEOUT_MS }
        );

        // Read narrative from DOM (new content appeared)
        const narrativeAfter = await page.getByTestId("play-story-document").innerText().catch(() => "");
        turnRecord.narrativePreview = narrativeAfter.slice(narrativeBefore.length).slice(0, 300);

        // Detect death/ending from narrative content
        if (narrativeAfter.includes("你死了") || narrativeAfter.includes("终局") || narrativeAfter.includes("结局")) {
          endingDetected = true;
          report.terminationReason = "ending_detected_in_narrative";
        }

        turnRecord.responseStatus = 200; // assumed OK since input re-enabled
        turnRecord.responseContentType = "text/event-stream (inferred from DOM)";

      } catch (e) {
        turnRecord.error = String(e);
      }

      // Wait for UI to stabilize
      await page.waitForTimeout(500);

      // Re-fetch input state
      const inputAfter = page.getByTestId("manual-action-input");
      try {
        turnRecord.inputEnabledAfter = await inputAfter.isEnabled({ timeout: 5000 });
      } catch {
        turnRecord.inputEnabledAfter = false;
      }

      // Observe options after — expand if collapsed
      const optionsAfter: string[] = [];
      try {
        // Try to expand options via toggle button
        const toggleBtn = page.getByTestId("options-toggle-button");
        const isExpanded = await toggleBtn.getAttribute("aria-pressed");
        if (isExpanded !== "true") {
          await toggleBtn.click();
          await page.waitForTimeout(300);
        }
        // Now find option items (they exist even when collapsed, just hidden)
        const allOptionItems = page.getByTestId("mobile-option-item");
        const count = await allOptionItems.count();
        for (let i = 0; i < count; i++) {
          const text = await allOptionItems.nth(i).textContent();
          if (text && text.trim()) optionsAfter.push(text.trim());
        }
      } catch {
        // Options toggle may not exist or be disabled
      }
      turnRecord.optionsAfter = optionsAfter;

      // Check for softlock conditions
      const softlockFlags: string[] = [];

      if (!turnRecord.inputEnabledAfter && optionsAfter.length === 0) {
        softlockFlags.push("no_input_and_no_options");
        softlockCount++;
      } else {
        softlockCount = 0;
      }

      if (turnRecord.error) {
        softlockFlags.push(`error:${turnRecord.error.slice(0, 80)}`);
      }

      if (turnRecord.responseStatus !== 200) {
        softlockFlags.push(`non_200_status:${turnRecord.responseStatus}`);
      }

      turnRecord.softlockFlags = softlockFlags;

      // Screenshot
      const screenshotPath = join(runDir, `turn-${String(turnIndex).padStart(3, "0")}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      turnRecord.screenshotPath = screenshotPath;

      report.turns.push(turnRecord);

      // Record issues
      if (softlockFlags.length > 0) {
        report.issues.push({
          severity: softlockCount >= 3 ? "high" : "medium",
          type: "softlock",
          turnIndex,
          description: `Softlock flags: ${softlockFlags.join(", ")}`,
          evidence: screenshotPath,
        });
      }

      if (turnRecord.finalDmJson && !turnRecord.finalDmJson.narrative) {
        report.issues.push({
          severity: "high",
          type: "missing_narrative",
          turnIndex,
          description: "Final DM JSON missing narrative field",
          evidence: JSON.stringify(turnRecord.finalDmJson).slice(0, 500),
        });
      }

      // Check if options are missing (potential softlock)
      if (turnRecord.optionsAfter.length === 0 && turnRecord.inputEnabledAfter) {
        report.issues.push({
          severity: "medium",
          type: "missing_options",
          turnIndex,
          description: "No action options available (player must type manually)",
          evidence: screenshotPath,
        });
      }

      // Softlock threshold: 3 consecutive turns with no progress
      if (softlockCount >= 3) {
        report.terminationReason = "softlock_detected";
        break;
      }

    }

    if (!endingDetected && report.terminationReason === "unknown") {
      report.terminationReason = "max_turns_reached";
    }

    // ── Phase 5: Persistence Check (Page Reload) ──
    const lastNarrative = report.turns.at(-1)?.narrativePreview?.slice(0, 50) ?? "";
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });

    // After reload, the game should rehydrate from IndexedDB
    const inputAfterReload = page.getByTestId("manual-action-input");
    await expect(inputAfterReload).toBeVisible({ timeout: 30_000 });
    await expect(inputAfterReload).toBeEnabled({ timeout: 30_000 });

    // Narrative should still be present
    if (lastNarrative.length > 5) {
      await expect(page.getByTestId("play-story-document")).toContainText(
        lastNarrative.slice(0, 8),
        { timeout: 15_000 }
      );
    }

    // No application error after reload
    await expect(page.getByText("Application error")).toHaveCount(0);
    await page.screenshot({ path: join(runDir, "phase-5-persistence-reload.png"), fullPage: true });

    // ── Phase 6: Final Screenshot & Report ──
    await page.screenshot({ path: join(runDir, "phase-6-final.png"), fullPage: true });

    report.finishedAt = new Date().toISOString();
    report.totalTurns = report.turns.length;
    report.pageErrors = pageErrors;

    // Write report
    const reportPath = join(runDir, "report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

    // Write summary
    const summaryPath = join(runDir, "summary.txt");
    const summary = [
      `=== Mock Playthrough Summary ===`,
      `Run ID: ${runId}`,
      `Started: ${report.startedAt}`,
      `Finished: ${report.finishedAt}`,
      `Termination: ${report.terminationReason}`,
      `Total Turns: ${report.totalTurns}`,
      `Page Errors: ${pageErrors.length}`,
      `Issues Found: ${report.issues.length}`,
      ``,
      ...report.issues.map(
        (i, idx) =>
          `[${idx + 1}] [${i.severity}] Turn ${i.turnIndex}: ${i.type} - ${i.description}`
      ),
      ``,
      `Artifacts: ${runDir}`,
    ].join("\n");
    await writeFile(summaryPath, summary, "utf-8");

    // Basic assertions — DOM-based verification
    expect(pageErrors).toEqual([]);
    expect(report.totalTurns).toBeGreaterThan(0);

    // At least the first turn should have visible narrative content
    const turnsWithNarrative = report.turns.filter((t) => t.narrativePreview.length > 10);
    expect(turnsWithNarrative.length).toBeGreaterThan(0);

    // No application error banner
    await expect(page.getByText("Application error")).toHaveCount(0);

  });
});
