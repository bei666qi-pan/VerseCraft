#!/usr/bin/env tsx
/**
 * Gold Set 自动收集与标注脚本
 *
 * 从 playthrough trace 目录导入轨迹，执行 pairwise 标注，
 * 输出 gold set JSON 文件。
 *
 * 用法：
 *   pnpm dlx tsx scripts/collect-gold-set.ts
 *   pnpm dlx tsx scripts/collect-gold-set.ts --trace-dir .runtime-data/playthrough/batch-1
 *   pnpm dlx tsx scripts/collect-gold-set.ts --min-personas 3 --output benchmarks/human-eval/gold-set.json
 */

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

// 加载 .env.local
for (const name of [".env", ".env.local"]) {
  const envPath = resolve(process.cwd(), name);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false, quiet: true });
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (flag: string, def: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? (args[idx + 1] ?? def) : def;
  };

  const traceDirsStr = getArg("--trace-dir", ".runtime-data/playthrough");
  const traceDirs = traceDirsStr.split(",").map((d) => d.trim());
  const minPersonas = parseInt(getArg("--min-personas", "2"), 10);
  const outputPath = getArg("--output", "benchmarks/human-eval/gold-set.json");

  console.log("📂 Gold Set 收集与标注");
  console.log(`   Trace 目录: ${traceDirs.join(", ")}`);
  console.log(`   最少 Persona: ${minPersonas}`);
  console.log(`   输出: ${outputPath}`);

  // 收集所有 trace JSON 文件
  const { annotateTraceDirectory } = await import("../benchmarks/human-eval/pairwiseAnnotator");

  for (const traceDir of traceDirs) {
    if (!existsSync(traceDir)) {
      console.warn(`⚠️ 跳过不存在的目录: ${traceDir}`);
      continue;
    }

    // 检查是否有子目录（batch 输出是目录结构）
    const entries = readdirSync(traceDir, { withFileTypes: true });
    const subDirs = entries.filter((e) => e.isDirectory()).map((e) => resolve(traceDir, e.name));
    const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".json"));

    if (subDirs.length > 0) {
      for (const subDir of subDirs) {
        await annotateTraceDirectory(subDir, { minPersonas, outputPath });
      }
    } else if (jsonFiles.length > 0) {
      await annotateTraceDirectory(traceDir, { minPersonas, outputPath });
    } else {
      console.warn(`⚠️ 空目录: ${traceDir}`);
    }
  }

  // 打印统计
  const { loadGoldSet } = await import("../benchmarks/human-eval/goldSetManager");
  const goldSet = loadGoldSet(outputPath);
  console.log(`\n📊 Gold Set 统计:`);
  console.log(`   总条目: ${goldSet.metadata.totalEntries}`);
  console.log(`   争议条目: ${goldSet.metadata.disputedEntries}`);
  console.log(`   标注者: ${goldSet.metadata.annotators.join(", ") || "无"}`);
  console.log(`   平均一致性: ${goldSet.metadata.averageAgreement.toFixed(3)}`);
  console.log(`   共识分布: A=${goldSet.metadata.consensusDistribution.A} B=${goldSet.metadata.consensusDistribution.B} tie=${goldSet.metadata.consensusDistribution.tie}`);
}

main().catch((err) => {
  console.error("❌ 收集失败:", err);
  process.exitCode = 1;
});
