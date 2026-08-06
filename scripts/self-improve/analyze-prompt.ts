#!/usr/bin/env tsx
/**
 * Prompt Analysis Tool
 *
 * Analyzes the current stable system prompt for:
 * - Token usage estimation
 * - Rule redundancy (same concept repeated)
 * - Positive vs negative instruction ratio
 * - Category breakdown
 *
 * Generates an optimized compact variant.
 *
 * Usage:
 *   pnpm tsx scripts/self-improve/analyze-prompt.ts
 *   pnpm tsx scripts/self-improve/analyze-prompt.ts --optimize (generate optimized version)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Prompt loading ──────────────────────────────────────

async function loadStablePrompt(): Promise<string> {
  // Use dynamic import to load the actual prompt function
  const mod = await import("../../src/lib/playRealtime/playerChatSystemPrompt.js");
  const lines = mod.buildStablePlayerDmSystemLines();
  return (lines as readonly string[]).join("\n");
}

function estimateTokens(text: string): number {
  // Rough estimate: CJK ~1 char/token, English ~4 chars/token, mixed ~2 chars/token
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const otherCount = text.length - cjkCount;
  return Math.ceil(cjkCount * 1.0 + otherCount * 0.25);
}

// ── Analysis ────────────────────────────────────────────

interface PromptAnalysis {
  totalChars: number;
  totalTokens: number;
  totalLines: number;
  sectionCount: number;
  positiveRules: number;    // "应/必须/请"
  negativeRules: number;    // "禁止/不得/勿/不允许"
  redundancyScore: number;  // 0-1, higher = more redundant
  categoryBreakdown: Record<string, { chars: number; tokens: number }>;
  suggestions: string[];
}

function analyze(prompt: string): PromptAnalysis {
  const lines = prompt.split("\n").filter((l) => l.trim().length > 0);
  const totalChars = prompt.length;
  const totalTokens = estimateTokens(prompt);

  // Count sections
  const sectionHeaders = lines.filter((l) =>
    l.startsWith("【") && !l.startsWith("【最高优先级") && !l.startsWith("【JSON】")
  );

  // Count positive vs negative rules
  const positivePatterns = /(必须|应|请|优先|只能|须用|需|宜|默认)/g;
  const negativePatterns = /(禁止|不得|勿|不允许|不可|不[能得]|严禁|不要)/g;
  const positiveRules = (prompt.match(positivePatterns) || []).length;
  const negativeRules = (prompt.match(negativePatterns) || []).length;

  // Category breakdown
  const categories: Record<string, { start: number; end: number }> = {};
  let currentCat = "preamble";
  categories[currentCat] = { start: 0, end: 0 };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headerMatch = line.match(/【(.+?)】/);
    if (headerMatch && !line.startsWith("【最高优先级") && !line.startsWith("【JSON】")) {
      categories[currentCat].end = i;
      currentCat = headerMatch[1].slice(0, 40);
      categories[currentCat] = { start: i, end: i };
    }
  }
  categories[currentCat].end = lines.length;

  const categoryBreakdown: Record<string, { chars: number; tokens: number }> = {};
  for (const [cat, { start, end }] of Object.entries(categories)) {
    const text = lines.slice(start, end + 1).join("\n");
    categoryBreakdown[cat] = {
      chars: text.length,
      tokens: estimateTokens(text),
    };
  }

  // Redundancy detection: find repeated concepts
  const concepts = [
    { name: "NPC不知道应默认不知", patterns: [/默认不知|按.*不知.*处理|不确定.*不知|信息不确定/, /不得顺势|不可替对方确认|不得写成确定/] },
    { name: "禁止透露元游戏信息", patterns: [/检定|骰子|roll|数值机制|元游戏/, /系统标签|系统标记/] },
    { name: "叙事必须第一人称", patterns: [/第一人称/, /不得.*第二人称/, /主语必须是.*我/] },
    { name: "运行时事实优先级", patterns: [/运行时.*优先|retrieval.*高于|packet.*为准/, /以.*注入为准|以.*packet.*为准/] },
    { name: "NPC规范名册", patterns: [/N-\d{3}/] },
  ];

  let redundancyScore = 0;
  const suggestions: string[] = [];

  for (const concept of concepts) {
    const hits = concept.patterns.filter((p) => p.test(prompt)).length;
    if (hits >= 3) {
      redundancyScore += 0.2;
      suggestions.push(`"${concept.name}" appears ${hits} times — consider consolidating`);
    }
  }

  // Positive/negative ratio
  if (negativeRules > positiveRules * 1.5) {
    suggestions.push(`Negative rules (${negativeRules}) significantly outnumber positive (${positiveRules}) — convert to affirmative framing`);
  }

  // Token budget check
  if (totalTokens > 2500) {
    suggestions.push(`Prompt is ${totalTokens} tokens — consider compact variant for non-REVEAL lanes`);
  }

  return {
    totalChars,
    totalTokens,
    totalLines: lines.length,
    sectionCount: sectionHeaders.length,
    positiveRules,
    negativeRules,
    redundancyScore: Math.min(1, redundancyScore),
    categoryBreakdown,
    suggestions,
  };
}

// ── Optimize ────────────────────────────────────────────

function generateOptimizedCompact(analysis: PromptAnalysis, prompt: string): string {
  // Extract the most critical rules into a compact format
  const criticalSections = [
    "【最高优先级·平台身份】",
    "【稳定不可变规则】",
    "【当前对白视角·认知边界（强制·简）】",
    "【NPC 一致性·硬边界（阶段5·强制）】",
    "【JSON】",
    "【POV·第一人称硬约束（强制·阶段2）】",
  ];

  const lines = prompt.split("\n");
  const compactLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this line starts a critical section
    const isCriticalHeader = criticalSections.some((s) => trimmed.startsWith(s));
    if (isCriticalHeader) {
      inSection = true;
      compactLines.push(line);
      continue;
    }

    // Check if this starts a non-critical section
    const isOtherHeader = trimmed.startsWith("【") && !isCriticalHeader;
    if (isOtherHeader) {
      inSection = false;
      continue;
    }

    if (inSection) {
      compactLines.push(line);
    }
  }

  // Add compression notes
  compactLines.push("");
  compactLines.push(`【紧凑提示】以上为核心规则。完整版 ${analysis.totalTokens} tokens → 紧凑版 ~${estimateTokens(compactLines.join("\n"))} tokens。`);

  return compactLines.join("\n");
}

// ── Main ────────────────────────────────────────────────

async function main() {
  const optimize = process.argv.includes("--optimize");

  console.log("Loading stable prompt...");
  let prompt: string;
  try {
    prompt = await loadStablePrompt();
  } catch {
    console.error("Failed to load prompt. Using hardcoded backup.");
    prompt = "// Unable to load dynamic prompt";
  }

  const analysis = analyze(prompt);

  console.log("\n" + "=".repeat(60));
  console.log("PROMPT ANALYSIS");
  console.log("=".repeat(60));
  console.log(`Total: ${analysis.totalChars} chars / ~${analysis.totalTokens} tokens / ${analysis.totalLines} lines`);
  console.log(`Sections: ${analysis.sectionCount}`);
  console.log(`Positive rules: ${analysis.positiveRules} | Negative: ${analysis.negativeRules}`);
  console.log(`Redundancy score: ${(analysis.redundancyScore * 100).toFixed(0)}%`);

  console.log("\nCategory Breakdown:");
  const sortedCats = Object.entries(analysis.categoryBreakdown)
    .sort((a, b) => b[1].tokens - a[1].tokens);
  for (const [cat, { tokens }] of sortedCats) {
    const bar = "█".repeat(Math.round(tokens / 50));
    console.log(`  ${cat.padEnd(40)} ${tokens.toString().padStart(4)} tokens ${bar}`);
  }

  console.log("\nSuggestions:");
  for (const s of analysis.suggestions) {
    console.log(`  • ${s}`);
  }

  if (optimize) {
    console.log("\n" + "=".repeat(60));
    console.log("OPTIMIZED COMPACT VARIANT");
    console.log("=".repeat(60));
    const optimized = generateOptimizedCompact(analysis, prompt);
    console.log(optimized);

    // Save to file
    const outPath = resolve(__dirname, "../../studio/reports/optimized-prompt.txt");
    writeFileSync(outPath, optimized, "utf-8");
    console.log(`\nSaved to ${outPath}`);
  }

  // Summary for Langfuse
  console.log("\n📊 Key metrics for Langfuse scoring:");
  console.log(`  prompt.tokens: ${analysis.totalTokens}`);
  console.log(`  prompt.sections: ${analysis.sectionCount}`);
  console.log(`  prompt.redundancy: ${(analysis.redundancyScore * 100).toFixed(0)}%`);
  console.log(`  prompt.neg_ratio: ${(analysis.negativeRules / (analysis.positiveRules + analysis.negativeRules) * 100).toFixed(0)}%`);
}

main().catch(console.error);
