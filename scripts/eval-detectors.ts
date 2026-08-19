/**
 * Eval: 缺口检测器统一评测脚本
 *
 * 运行所有 12 项缺口检测器（或按 category 过滤），
 * 产出 JSON 报告 + harness history 行。
 *
 * 命令：pnpm eval:detectors:mock
 * 选项：--category cognitive_reveal | submission_structure | cross_cutting
 *       --detector gap-1-reveal-tier-driven (单检测器)
 *       --json-out <path> (自定义输出路径)
 *       --assert (门禁模式，非零退出)
 */

import { createDefaultRegistry } from "@/lib/evals/detectors";
import { listDetectorsByCategory, type DetectorCategory, type DetectorResult } from "@/lib/evals/detectors";
import {
  parseEvalCli,
  buildEvalOutput,
  appendHistory,
  writeJson,
} from "@/lib/evals/harness/utils";
import { resolveExperimentProvenance } from "@/lib/evals/harness";

function parseFilter(raw: string[]): { category?: DetectorCategory; detectorId?: string } {
  const args = raw.slice();
  const catIdx = args.indexOf("--category");
  const cat = catIdx >= 0 ? args[catIdx + 1] : undefined;
  const detIdx = args.indexOf("--detector");
  const detectorId = detIdx >= 0 ? args[detIdx + 1] : undefined;
  if (cat && !["cognitive_reveal", "submission_structure", "cross_cutting"].includes(cat)) {
    console.error(`未知 category: ${cat}`);
    process.exit(1);
  }
  return { category: cat as DetectorCategory | undefined, detectorId };
}

async function runDetectors(): Promise<void> {
  const cli = parseEvalCli(process.argv.slice(2));
  const filter = parseFilter(process.argv.slice(2));
  const registry = createDefaultRegistry();

  let detectors = [...registry.values()];
  if (filter.category) detectors = listDetectorsByCategory(filter.category, registry);
  if (filter.detectorId) {
    const d = registry.get(filter.detectorId as any);
    if (!d) { console.error(`未知 detector: ${filter.detectorId}`); process.exit(1); }
    detectors = [d];
  }

  console.log(`\n📊 VerseCraft 缺口检测器 — 运行 ${detectors.length} 项\n`);

  const results: (DetectorResult & { label: string })[] = [];
  let totalPass = 0;

  for (const d of detectors) {
    const start = performance.now();
    try {
      const r = await d.run(undefined, cli.mode);
      r.latencyMs = Math.round(performance.now() - start);
      results.push({ ...r, label: d.meta.label });
      if (r.pass) totalPass++;

      console.log(`  ${r.pass ? "✅" : "❌"} ${d.meta.label}`);
      console.log(`      score=${r.score.toFixed(2)} issues=${r.issues.length} ${r.latencyMs}ms`);
      for (const iss of r.issues)
        if (iss.severity === "critical" || iss.severity === "warning")
          console.log(`      ⚠ ${iss.severity}: ${iss.message}`);
    } catch (err) {
      console.error(`  💥 ${d.meta.label}: ${err}`);
      results.push({
        detectorId: d.meta.id, label: d.meta.label,
        score: 0, pass: false, issues: [{ severity: "critical", message: String(err), code: "crash" }], latencyMs: Math.round(performance.now() - start),
      });
    }
  }

  const overallScore = detectors.length > 0 ? totalPass / detectors.length : 0;
  const gate = overallScore >= 0.75 ? "pass" : "fail";

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`总分: ${(overallScore * 100).toFixed(1)}% (${totalPass}/${detectors.length})`);
  console.log(`门禁: ${gate === "pass" ? "✅ PASS" : "❌ FAIL"}`);

  const output = buildEvalOutput({
    mode: cli.mode,
    suite: "detectors",
    summary: {
      total: detectors.length,
      pass: totalPass,
      passRate: overallScore,
      gate,
      mode: cli.mode,
      suite: "detectors",
      timestamp: new Date().toISOString(),
    },
    results,
  });

  const jsonPath = cli.jsonOut ?? ".runtime-data/eval/detectors/report.json";
  writeJson(jsonPath, output);
  if (cli.jsonOnly) { console.log(JSON.stringify(output)); return; }

  const provenance = resolveExperimentProvenance();
  appendHistory({
    suite: "detectors",
    mode: cli.mode,
    total: detectors.length,
    pass: totalPass,
    passRate: overallScore,
    gate,
    timestamp: new Date().toISOString(),
    gitSha: provenance.commit,
    provenance,
  });

  console.log(`\n📝 报告: ${jsonPath}`);
  console.log(`📜 history: benchmarks/history/detectors.jsonl`);

  if (cli.assert && gate === "fail") process.exit(1);
}

runDetectors().catch((err) => { console.error(err); process.exit(1); });
