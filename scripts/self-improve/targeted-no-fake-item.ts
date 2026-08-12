#!/usr/bin/env tsx
/**
 * no_fake_item 定向 Live Replay（用户任务第九节）。
 *
 * 矩阵（输入可驱动的部分）：
 *   1. boundary-nonexistent-item          原始案例（pool 内置）
 *   2. ...-synonym                        同义表达变体（门禁卡/电梯）
 *   3. ...-talisman                       不同不存在物品名（护身符）
 *   4. keepalive-normal-explore           合法探索对照（pool 内置）
 * 混合合法/非法奖励、名称-only 幻影、warehouse 幻影由 guard 单测覆盖（live 不可输入驱动）。
 *
 * 每个案例经 maxRounds=3 执行 ≥3 次。需要 managed dev server 已在 LIVEPLAY_BASE_URL 就绪。
 */
import { runSelfImprovement } from "../../src/lib/evals/selfImprove/orchestrator";
import type { SelfImproveScenario } from "../../src/lib/evals/selfImprove/types";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const IDS = [
  "boundary-nonexistent-item",
  "boundary-nonexistent-item-synonym",
  "boundary-nonexistent-item-talisman",
  "keepalive-normal-explore",
];

const EXTRA_SCENARIOS: SelfImproveScenario[] = [
  {
    caseId: "boundary-nonexistent-item-synonym",
    name: "使用不存在的物品（同义变体：门禁卡）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "inventory", "negative", "no_fake_item_variant"],
    difficulty: "intermediate",
    description: "同义表达：玩家使用从未获得的门禁卡，应被拒绝且不得产生物品",
    playerInput: "我掏出那张从未得到的门禁卡，试着去刷电梯旁边的面板。",
    expectedBehavior: "行动被拒绝，最终状态无物品、无扣费，narrative 不得声称获得或使用成功",
    expectedInvariants: [
      { id: "no_fake_item", check: "resource_conservation", expected: "pass", severity: "critical" },
    ],
    seed: 20011,
    requiresLive: false,
  },
  {
    caseId: "boundary-nonexistent-item-talisman",
    name: "使用不存在的物品（不同物品名：护身符）",
    category: "boundary",
    source: "synth",
    holdout: false,
    tags: ["boundary", "inventory", "negative", "no_fake_item_variant"],
    difficulty: "intermediate",
    description: "不同假物品名：玩家使用从未拥有的护身符，应被拒绝且不得产生物品",
    playerInput: "我拿出从未拥有过的护身符，把它按在面前的门板上。",
    expectedBehavior: "行动被拒绝，最终状态无物品、无扣费，narrative 不得声称获得或使用成功",
    expectedInvariants: [
      { id: "no_fake_item", check: "resource_conservation", expected: "pass", severity: "critical" },
    ],
    seed: 20012,
    requiresLive: false,
  },
];

async function main(): Promise<void> {
  process.env.SI_LIVE_MODE = "1";
  const report = await runSelfImprovement({
    profile: "smoke",
    scenarioIds: IDS,
    maxRounds: 3,
    dryRun: false,
    extraScenarios: EXTRA_SCENARIOS,
  });
  const outDir = resolve(process.cwd(), ".runtime-data/self-improve/current/targeted-no-fake-item");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "replay-report.json"), JSON.stringify(report, null, 2), "utf-8");
  console.log(`[targeted] status=${report.status} stop=${report.stopReason}`);
  for (const rd of report.roundDetails) {
    console.log(`[targeted] round ${rd.round}: defects=${rd.defectsFound} recommendations=${rd.recommendationsGenerated} evaluatorRepairs=0`);
    for (const rc of rd.rootCauses) console.log(`  - ${rc}`);
  }
  process.exit(report.status === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(3);
});
