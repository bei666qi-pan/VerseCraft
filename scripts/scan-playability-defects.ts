#!/usr/bin/env tsx
/**
 * Playability 缺陷全量扫描
 *
 * 加载所有 48 条 live trace，运行 5 个跨回合检测器，产出分类缺陷报告。
 *
 * 用法:
 *   pnpm dlx tsx scripts/scan-playability-defects.ts
 *   pnpm dlx tsx scripts/scan-playability-defects.ts --json-out .runtime-data/eval/playability-defects/report.json
 */

import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  scanAllTraces,
  TRACE_DETECTORS,
  type Defect,
} from "../src/lib/evals/detectors/playabilityDefects";

interface Trace {
  runId: string;
  scenarioId: string;
  persona: string;
  steps: Array<Record<string, unknown>>;
  terminatedReason: string;
}

function loadTraces(): Trace[] {
  const traceDir = ".runtime-data/playthrough";
  const batchDirs = readdirSync(traceDir).filter((d) => d.startsWith("batch-"));
  const traces: Trace[] = [];

  for (const batch of batchDirs) {
    const tracesDir = resolve(traceDir, batch, "traces");
    if (!existsSync(tracesDir)) continue;
    const files = readdirSync(tracesDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(resolve(tracesDir, file), "utf8"));
        if (raw.steps && raw.steps.length >= 5) {
          traces.push({
            runId: raw.runId ?? file,
            scenarioId: raw.scenarioId ?? "unknown",
            persona: raw.persona ?? "unknown",
            steps: raw.steps.map((s: Record<string, unknown>) => ({
              stepIndex: s.stepIndex ?? 0,
              playerAction: s.playerAction ?? "",
              narrative: s.narrative ?? "",
              stateSnapshot: s.stateSnapshot ?? {},
              dmJson: s.dmJson ?? {},
            })),
            terminatedReason: raw.terminatedReason ?? "unknown",
          });
        }
      } catch (err) {
        console.warn(`⚠️ 跳过损坏文件: ${file}`);
      }
    }
  }

  return traces;
}

function main() {
  const args = process.argv.slice(2);
  const jsonOut =
    args.includes("--json-out")
      ? args[args.indexOf("--json-out") + 1] ?? ".runtime-data/eval/playability-defects/report.json"
      : ".runtime-data/eval/playability-defects/report.json";

  console.log("🔍 Playability 缺陷全量扫描");
  console.log("═".repeat(60));

  // 加载
  const traces = loadTraces();
  console.log(`📂 加载 ${traces.length} 条有效 trace`);

  // 扫描
  console.log(`\n🧪 运行 ${TRACE_DETECTORS.length} 个检测器...`);
  const report = scanAllTraces(traces);

  // 输出摘要
  console.log(`\n📊 扫描结果`);
  console.log(`   总缺陷: ${report.totalDefects}`);
  console.log(`   Critical: ${report.bySeverity.critical}`);
  console.log(`   Major: ${report.bySeverity.major}`);
  console.log(`   Minor: ${report.bySeverity.minor}`);

  console.log(`\n📋 按检测器:`);
  for (const detector of TRACE_DETECTORS) {
    const d = report.byDetector[detector.name];
    if (!d) continue;
    const icon =
      d.bySeverity.critical > 0
        ? "🔴"
        : d.bySeverity.major > 0
          ? "🟡"
          : "🟢";
    console.log(
      `   ${icon} ${detector.name}: ${d.totalDefects} (C:${d.bySeverity.critical} M:${d.bySeverity.major} m:${d.bySeverity.minor})`,
    );
  }

  // Top scenarios
  const scenarioCounts: Record<string, number> = {};
  for (const d of report.allDefects) {
    const sid = d.traceId.split("-").slice(0, -2).join("-") || d.traceId;
    scenarioCounts[sid] = (scenarioCounts[sid] ?? 0) + 1;
  }
  const topScenarios = Object.entries(scenarioCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  console.log(`\n🔥 Top 5 缺陷场景:`);
  for (const [scenario, count] of topScenarios) {
    console.log(`   ${scenario}: ${count} 个缺陷`);
  }

  // Critical defects detail
  const criticalDefects = report.allDefects.filter(
    (d) => d.severity === "critical",
  );
  if (criticalDefects.length > 0) {
    console.log(`\n🚨 Critical 缺陷详情 (${criticalDefects.length}):`);
    for (const d of criticalDefects.slice(0, 10)) {
      console.log(`   [${d.detector}] ${d.traceId} step ${d.stepIndex}`);
      console.log(`   ${d.description}`);
      console.log(`   证据: ${d.narrativeEvidence.slice(0, 100)}`);
      console.log(`   dmJson: ${JSON.stringify(d.dmJsonEvidence).slice(0, 120)}`);
      console.log();
    }
  }

  // 写入 JSON
  mkdirSync(resolve(".runtime-data"), { recursive: true });
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        scannedAt: new Date().toISOString(),
        totalTraces: traces.length,
        ...report,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`📄 完整报告: ${jsonOut}`);
}

main();
