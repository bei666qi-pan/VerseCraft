/**
 * 开发者闭环游玩测试（Live AI 模式）
 *
 * 使用真实 DeepSeek AI gateway 进行完整游玩流程测试。
 * 基于已验证的 browserPlaythrough 驱动。
 *
 * 运行：
 *   E2E_AI_LIVE=1 npx playwright test e2e/live-playthrough-closed-loop.spec.ts --reporter=list
 */
import { _access, _readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import {
  runBrowserPlaythrough,
  sequenceDecisionProvider,
  startLocalBrowserPlaythrough,
} from "./support/browserPlaythrough";

const shouldRunLive = process.env.E2E_AI_LIVE === "1";

// Curated action sequence designed to explore the game world progressively
const CURATED_ACTIONS = [
  { action: "我环顾四周，仔细观察周围的环境和细节。", intent: "explore_visible_scene" },
  { action: "我小心地在走廊里走动，查看每个房门的状态。", intent: "explore_corridor" },
  { action: "我检查地面上是否有脚印或拖拽痕迹。", intent: "investigate_tracks" },
  { action: "我试着推开最近的一扇门，看能不能进去。", intent: "interact_door" },
  { action: "我停下来仔细听周围的动静——有没有呼吸声、脚步声或者别的什么。", intent: "listen" },
  { action: "我检查墙壁上是否有标记、涂鸦或告示。", intent: "inspect_walls" },
  { action: "我走到最近的光源处，确认周围的环境。", intent: "approach_light" },
  { action: "我试着回忆昏迷前的最后记忆，想弄清楚自己怎么到这里的。", intent: "recall_memory" },
  { action: "我继续往前探索，注意观察每个转角的情况。", intent: "explore_forward" },
  { action: "我检查身上还有哪些随身物品可以使用。", intent: "check_inventory" },
  { action: "我压低声音试探性地喊了一声——有人在吗？", intent: "call_out" },
  { action: "我寻找楼梯或通道，看看能不能去其他楼层。", intent: "find_stairs" },
  { action: "我停下来整理目前为止收集到的线索和发现。", intent: "review_clues" },
  { action: "我继续沿着走廊往前走，不放过任何细节。", intent: "continue_explore" },
  { action: "我寻找可以当作武器或工具的物件。", intent: "find_weapon" },
  // Extended actions for longer playthrough
  { action: "我仔细观察头顶灯管的闪烁规律，看是不是某种信号。", intent: "study_light" },
  { action: "我检查铁门上的痕迹——有没有被撬过的迹象。", intent: "inspect_door" },
  { action: "我蹲下来查看地面的裂缝，试着判断形成原因。", intent: "examine_cracks" },
  { action: "我继续沿着有光的方向走，保持警惕。", intent: "follow_light" },
  { action: "我试着推开下一扇门，看看里面是什么。", intent: "open_door" },
  { action: "我停下来回顾一下和麟泽的对话，他说的每句话有没有隐藏信息。", intent: "review_dialogue" },
  { action: "我查看墙上的楼层平面图，规划接下来的路线。", intent: "study_map" },
  { action: "我继续往前，注意脚下不要发出太大声音。", intent: "stealth_move" },
  { action: "我检查走廊两侧的房门——哪些开着，哪些锁着。", intent: "check_doors" },
  { action: "我把找到的线索串联起来，试着推理这个公寓的真相。", intent: "deduce" },
  { action: "我继续深入探索，不放过任何一个角落。", intent: "deep_explore" },
  { action: "我试着和刚才遇到的NPC再次沟通，了解更多情况。", intent: "talk_npc" },
  { action: "我寻找逃出这个楼层的线索——楼梯、电梯或紧急出口。", intent: "find_exit" },
  { action: "我检查是否有其他幸存者的痕迹——留言、记号或物品。", intent: "find_survivors" },
  { action: "我根据线索往更深处前进，准备面对可能的危险。", intent: "advance" },
];

test.describe("live closed-loop playthrough", () => {
  test("full playthrough: intro → create → play → play to ending or softlock", async ({
    page,
  }) => {
    test.skip(!shouldRunLive, "Set E2E_AI_LIVE=1 to run live playthrough.");
    test.setTimeout(900_000); // 15 minutes max

    const startupPageErrors: string[] = [];
    page.on("pageerror", (error) => startupPageErrors.push(error.message));

    // ── Phase 1-2: Start from intro, create character ──
    await startLocalBrowserPlaythrough(page, {
      viewport: { width: 390, height: 844 },
      timeoutMs: 90_000,
    });

    // ── Phase 3: Run the playthrough with curated actions ──
    const result = await runBrowserPlaythrough(page, {
      runId: `live-closed-loop-${Date.now()}`,
      maxTurns: 40,
      actionTimeoutMs: 90_000,
      decisionProvider: sequenceDecisionProvider(CURATED_ACTIONS),
    });

    // ── Phase 4: Verify results ──
    console.log(`\n=== Live Playthrough Result ===`);
    console.log(`Termination: ${result.trace.terminationReason}`);
    console.log(`Total turns: ${result.trace.turns.length}`);
    console.log(`Page errors: ${startupPageErrors.length}`);

    expect(result.trace.turns.length).toBeGreaterThan(0);
    expect(startupPageErrors).toEqual([]);

    // Verify SSE contract
    for (const turn of result.trace.turns) {
      if (turn.responseStatus) expect(turn.responseStatus).toBe(200);
      if (turn.responseContentType) expect(turn.responseContentType).toContain("text/event-stream");
      if (turn.finalDmJson) {
        expect(typeof turn.finalDmJson.narrative).toBe("string");
        expect(typeof turn.finalDmJson.is_action_legal).toBe("boolean");
      }
    }

    // Print turn summary
    for (const turn of result.trace.turns) {
      const narrative = String(turn.finalDmJson?.narrative ?? "").slice(0, 60);
      const isDeath = turn.finalDmJson?.is_death;
      console.log(`  T${turn.turnIndex}: death=${isDeath} "${narrative}..."`);
    }

    // Persistence: reload and verify
    const lastNarrative = String(result.trace.turns.at(-1)?.finalDmJson?.narrative ?? "").trim();
    if (lastNarrative.length > 12) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      const input = page.getByTestId("manual-action-input");
      await expect(input).toBeVisible({ timeout: 30_000 });
      await expect(input).toBeEnabled({ timeout: 30_000 });
      await expect(page.getByTestId("play-story-document")).toContainText(
        lastNarrative.slice(0, 12),
        { timeout: 30_000 }
      );
      console.log(`  ✅ Persistence OK after reload`);
    }

    // Ending check
    if (result.trace.terminationReason === "ending_reached") {
      console.log(`\n✅ ENDING REACHED!`);
    }

    await expect(page.getByText("Application error")).toHaveCount(0);
  });
});
