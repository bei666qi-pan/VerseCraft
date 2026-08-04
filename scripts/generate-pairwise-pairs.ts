#!/usr/bin/env tsx
/**
 * 真实 Pairwise 对比生成器
 *
 * 从 gold set 中按场景类别分组，同类别内随机配对。
 * 输出待判定的对比对列表，供同一 AI 逐一判定。
 *
 * 设计：同一个 AI 既写代码又做测试，不调用外部 API。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { SCENARIOS } from "../src/lib/evals/playthrough/scenarios";

interface TraceStep {
  stepIndex: number;
  playerAction: string;
  narrative: string;
  dmJson: Record<string, unknown>;
  stateSnapshot: Record<string, unknown>;
}

interface TraceFile {
  runId: string;
  scenarioId: string;
  persona: string;
  steps: TraceStep[];
  terminatedReason: string;
  evidenceStatus: string;
  judgeMode: string;
}

interface PairForJudging {
  pairId: string;
  category: string;
  traceA: {
    runId: string;
    scenarioId: string;
    persona: string;
    /** 前 3 步叙事拼接 */
    narrative: string;
    steps: number;
    terminatedReason: string;
  };
  traceB: {
    runId: string;
    scenarioId: string;
    persona: string;
    narrative: string;
    steps: number;
    terminatedReason: string;
  };
}

function loadTrace(filePath: string): TraceFile {
  return JSON.parse(readFileSync(filePath, "utf8")) as TraceFile;
}

function extractNarrative(trace: TraceFile, maxSteps: number = 3): string {
  return trace.steps
    .slice(0, maxSteps)
    .map((s) => `[Step ${s.stepIndex}] 玩家: ${s.playerAction}\nDM: ${s.narrative}`)
    .join("\n\n");
}

function getCategory(scenarioId: string): string {
  const s = SCENARIOS.find((s: { id: string }) => s.id === scenarioId);
  return s?.category ?? "unknown";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function main() {
  const MAX_PAIRS = 100;

  // 收集所有 valid trace
  const traceDir = ".runtime-data/playthrough";
  const { readdirSync, statSync } = await_import_fs();
  
  // 遍历所有 batch-*/traces/*.json
  const batchDirs = readdirSync(traceDir).filter((d: string) => d.startsWith("batch-"));
  const traces: TraceFile[] = [];

  for (const batch of batchDirs) {
    const tracesDir = resolve(traceDir, batch, "traces");
    if (!existsSync(tracesDir)) continue;
    const files = readdirSync(tracesDir).filter((f: string) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const trace = loadTrace(resolve(tracesDir, file));
        if (trace.steps && trace.steps.length >= 5) {
          traces.push(trace);
        }
      } catch { /* skip */ }
    }
  }

  console.log(`📂 加载 ${traces.length} 条有效 trace`);

  // 按类别分组
  const byCategory = new Map<string, TraceFile[]>();
  for (const t of traces) {
    const cat = getCategory(t.scenarioId);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(t);
  }

  console.log("类别分布:");
  for (const [cat, ts] of byCategory) {
    console.log(`  ${cat}: ${ts.length} traces`);
  }

  // 组内随机配对
  const pairs: PairForJudging[] = [];
  for (const [cat, ts] of byCategory) {
    if (ts.length < 2) continue;
    const shuffled = shuffle(ts);
    for (let i = 0; i < shuffled.length - 1 && pairs.length < MAX_PAIRS; i += 2) {
      const a = shuffled[i]!;
      const b = shuffled[i + 1]!;
      if (a.runId === b.runId) continue; // 跳过同一条
      pairs.push({
        pairId: `pair_${cat}_${pairs.length + 1}`,
        category: cat,
        traceA: {
          runId: a.runId,
          scenarioId: a.scenarioId,
          persona: a.persona,
          narrative: extractNarrative(a),
          steps: a.steps.length,
          terminatedReason: a.terminatedReason,
        },
        traceB: {
          runId: b.runId,
          scenarioId: b.scenarioId,
          persona: b.persona,
          narrative: extractNarrative(b),
          steps: b.steps.length,
          terminatedReason: b.terminatedReason,
        },
      });
    }
  }

  console.log(`\n🔀 生成 ${pairs.length} 对 pairwise 对比`);

  // 写入待判定文件
  const outPath = resolve(".runtime-data", "pairwise-pending.json");
  mkdirSync(resolve(".runtime-data"), { recursive: true });
  writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalPairs: pairs.length,
    pairs,
  }, null, 2), "utf8");

  console.log(`📄 待判定对列表: ${outPath}`);
  console.log(`\n下一步: 由同一 AI 逐对判定，偏好写入 benchmarks/human-eval/pairwise-results.json`);
}

// 直接用同步 fs
import { readdirSync, statSync } from "node:fs";
function await_import_fs() { return { readdirSync, statSync }; }

main();
