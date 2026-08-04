#!/usr/bin/env tsx
/**
 * 写入真实 Pairwise 标注结果到 Gold Set
 *
 * 由同一 AI（Kimi Code）逐对判定，不依赖外部 API。
 * 每条标注包含：偏好、置信度、推理、timestamp。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { PairwiseAnnotation } from "../benchmarks/human-eval/goldSetTypes";

// ── AI 判定结果 ──────────────────────────────────────────
// 格式: [pairIndex, preference, confidence, reasoning]
// preference: "A" | "B" | "tie"
// confidence: 1-5

const JUDGMENTS: Array<[number, "A"|"B"|"tie", number, string]> = [
  [1, "A", 5, "A(happy-explore)叙事细节丰富、感官描写到位、氛围沉浸；B(happy-trade)三步均重复同一句模板"],
  [2, "A", 4, "A(happy-speedrun)世界观构建细腻、开场氛围出色；B(forge-service-execute)偏机械操作，叙事性弱"],
  [3, "A", 5, "A(happy-long-survival)悬疑气氛浓厚、心理张力强、描写扎实；B(task-codex-location-flow)偏系统日志风格"],
  [4, "B", 4, "B(inventory-hoarding)环境叙事出色、NPC互动自然、纸条线索有悬念；A(forge-service-flow)机械锻造操作"],
  [5, "A", 3, "A(happy-multi-npc-chain)多角色交织、多层谜题、信息密度高；B(collector-hoard)氛围好但略简单，差距不大"],
  [6, "B", 3, "B(happy-codex-discovery)场景探索有层次感；A(happy-npc-interaction)前两步重复，第三步才开始展开"],
  [7, "B", 4, "B(choice-shadow-recon)探索叙事丰富、恐怖元素到位；A(forge-service-quote-only)纯机械操作无叙事"],
  [8, "A", 4, "A(recovery-relationship-repair)文件线索+氛围双佳；B(recovery-contaminated-weapon)第一步重复、第二步报错"],
  [9, "A", 5, "A(recovery-triple-crisis)沉浸感极强、感官细节密集、紧张感层层递进；B(recovery-death-near-miss)前两步重复"],
  [10, "A", 3, "A(recovery-low-hp#1)细节更丰富、氛围更完整；B(recovery-low-hp#2)也不错但叙事略断裂，差距小"],
  [11, "B", 4, "B(recovery-low-sanity)心理恐怖感出色、'墙在呼吸'意象强；A(recovery-cooldown-skill)首步好但后续重复"],
  [12, "A", 3, "A(recovery-task-failure-recovery)紧凑、紧迫感强；B(recovery-weapon-repair)也不错但节奏较慢"],
  [13, "A", 5, "A(refusal-dead-npc-interaction)幽灵主题处理精湛、情感层次丰富；B(refusal-profession-bypass)第二步重复"],
  [14, "A", 3, "A(refusal-illegal-items)拒绝叙事有幽默感、角色生动；B(refusal-cross-floor-teleport)系统化拒绝、干燥"],
  [15, "A", 5, "A(refusal-prompt-injection)氛围细腻、纸条线索悬念足；B(refusal-negative-currency)三步均重复同一模板"],
  [16, "A", 4, "A(refusal-attack-friendly-npc)拒绝叙事自嘲有趣、镜像描写巧妙；B(refusal-numeric-overflow)第一步重复"],
  [17, "A", 5, "A(quest-delivery-missing-item)NPC互动真实、任务逻辑清晰、张力足；B(quest-lifecycle)前两步重复"],
  [18, "B", 5, "B(combat-weapon-degradation)文件探索+环境细节丰富；A(profession-trial-delivery-observe)纯系统输出无叙事"],
  [19, "B", 4, "B(profession-combat-synergy)有实质游戏进展；A(weapon-lifecycle)三步均重复/报错，无有效叙事"],
  [20, "A", 3, "A(combat-survival)纸条线索+照片细节有悬念；B(profession-trial-missing-evidence)偏系统输出，差距不大"],
  [21, "B", 3, "B(profession-progression)NPC对话偷听+氛围好；A(happy-combat-loop)手套掉落意象好但首步重复"],
  [22, "B", 4, "B(abandonment-after-death-near-miss)NPC互动(C-001)真实、有对话张力；A(abandonment-after-low-sanity)前两步重复"],
  [23, "A", 5, "A(abandonment-rulebreaker-rage)破门叙事有力、紧张感强；B(abandonment-confused-30s)三步均重复同一模板"],
];

// ── 写入 ─────────────────────────────────────────────────

function main() {
  const pendingPath = resolve(".runtime-data", "pairwise-pending.json");
  if (!existsSync(pendingPath)) {
    console.error("❌ 找不到 pairwise-pending.json，先运行 generate-pairwise-pairs");
    process.exit(1);
  }

  const pending = JSON.parse(readFileSync(pendingPath, "utf8"));
  const now = new Date().toISOString();

  const annotations: Array<{
    pairId: string;
    preference: string;
    confidence: number;
    reasoning: string;
    annotatorId: string;
    annotatorRole: string;
    timestamp: string;
  }> = [];

  for (const [idx, preference, confidence, reasoning] of JUDGMENTS) {
    const pair = pending.pairs[idx - 1];
    if (!pair) {
      console.warn(`⚠️ Pair ${idx} 不存在，跳过`);
      continue;
    }
    annotations.push({
      pairId: pair.pairId,
      preference,
      confidence,
      reasoning,
      annotatorId: "kimi-code-agent",
      annotatorRole: "统一开发测试AI",
      timestamp: now,
    });
  }

  // 统计
  const stats = { A: 0, B: 0, tie: 0 };
  for (const a of annotations) {
    stats[a.preference as "A"|"B"|"tie"]++;
  }
  const avgConfidence = annotations.reduce((s, a) => s + a.confidence, 0) / annotations.length;

  console.log(`✅ 写入 ${annotations.length} 条真实 pairwise 标注`);
  console.log(`   偏好分布: A=${stats.A} B=${stats.B} tie=${stats.tie}`);
  console.log(`   平均置信度: ${avgConfidence.toFixed(2)}/5`);

  // 写入结果文件
  const resultPath = resolve("benchmarks/human-eval", "pairwise-results.json");
  writeFileSync(
    resultPath,
    JSON.stringify(
      {
        generatedAt: now,
        judgeInfo: {
          annotatorId: "kimi-code-agent",
          annotatorRole: "统一开发测试AI（同一AI既开发又测试）",
          method: "逐对阅读叙事文本，按沉浸感、逻辑一致性、语言质量、游戏体验综合判定",
        },
        totalPairs: annotations.length,
        summary: { preferenceDistribution: stats, averageConfidence: avgConfidence },
        annotations,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`📄 结果已写入: ${resultPath}`);
}

main();
