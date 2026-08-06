#!/usr/bin/env tsx
/**
 * LLM Judge — evaluates game generations for quality and hallucination.
 *
 * Fetches generation input/output from Langfuse, sends to an LLM judge,
 * parses structured evaluation, and uploads scores back to Langfuse.
 *
 * Evaluates on 5 dimensions:
 *   playability        — narrative engagement, options quality, agency
 *   npc_consistency    — NPC knowledge boundaries, persona consistency
 *   fact_grounding     — factual accuracy vs. retrieved lore
 *   narrative_quality  — prose style, pacing, tension
 *   hallucination      — unsupported claims, contradictions
 *
 * Usage:
 *   pnpm tsx scripts/self-improve/llm-judge.ts --trace-id <id>
 *   pnpm tsx scripts/self-improve/llm-judge.ts --observation-id <id>
 *   pnpm tsx scripts/self-improve/llm-judge.ts --trace-id <id> --mock (no LLM, heuristic only)
 *
 * Requires: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL
 * Optional: LLM_JUDGE_MODEL (default: deepseek-v4-flash)
 */

import { parseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Env loading ─────────────────────────────────────────

function loadEnvLocal() {
  const __filename = fileURLToPath(import.meta.url);
  const rootDir = resolve(dirname(__filename), "../../");
  const envPath = resolve(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  const shellKeys = new Set(Object.keys(process.env));
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (shellKeys.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// ── Types ───────────────────────────────────────────────

interface GenerationData {
  id: string;
  name: string;
  model: string;
  input: string;
  output: string;
  traceId: string;
  startTime: string;
  usageDetails?: Record<string, number>;
}

interface JudgeDimension {
  name: string;
  score: number;       // 0-1
  verdict: "PASS" | "FAIL" | "WARN";
  evidence: string;
  suggestion?: string;
}

interface JudgeResult {
  dimensions: JudgeDimension[];
  overallScore: number;
  summary: string;
  rawResponse: string;
  judgeModel: string;
  latencyMs: number;
}

// ── Langfuse API helpers ────────────────────────────────

async function fetchLangfuseObservation(observationId: string): Promise<GenerationData> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY!;
  const secretKey = process.env.LANGFUSE_SECRET_KEY!;
  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  const res = await fetch(`${baseUrl}/api/public/observations/${observationId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Langfuse API error: ${res.status}`);
  const data = await res.json() as any;

  return {
    id: data.id,
    name: data.name ?? "unknown",
    model: data.model ?? "unknown",
    input: typeof data.input === "string" ? data.input : JSON.stringify(data.input ?? {}),
    output: typeof data.output === "string" ? data.output : JSON.stringify(data.output ?? {}),
    traceId: data.traceId ?? "",
    startTime: data.startTime ?? new Date().toISOString(),
    usageDetails: data.usageDetails ?? {},
  };
}

async function fetchLatestGenerationByTrace(traceId: string): Promise<GenerationData> {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY!;
  const secretKey = process.env.LANGFUSE_SECRET_KEY!;
  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");

  const res = await fetch(
    `${baseUrl}/api/public/observations?traceId=${traceId}&type=GENERATION&limit=5`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) throw new Error(`Langfuse API error: ${res.status}`);
  const data = await res.json() as any;
  const gens = (data.data ?? []).filter((o: any) => o.type === "GENERATION");

  if (gens.length === 0) throw new Error(`No generations found for trace ${traceId}`);

  // Prefer writer generation (has input+output)
  const writer = gens.find((g: any) => g.name?.includes("writer"));
  const gen = writer ?? gens[0];

  return {
    id: gen.id,
    name: gen.name ?? "unknown",
    model: gen.model ?? "unknown",
    input: typeof gen.input === "string" ? gen.input : JSON.stringify(gen.input ?? {}),
    output: typeof gen.output === "string" ? gen.output : JSON.stringify(gen.output ?? {}),
    traceId: traceId,
    startTime: gen.startTime ?? new Date().toISOString(),
    usageDetails: gen.usageDetails ?? {},
  };
}

// ── Heuristic Judge (fast, no LLM) ──────────────────────

function heuristicJudge(gen: GenerationData): JudgeResult {
  const dims: JudgeDimension[] = [];
  const output = gen.output;
  const input = gen.input;

  // 1. Playability: check for options and narrative length
  const hasOptions = output.includes('"options"') || output.includes('"decision_options"');
  const narrativeLen = output.length;
  const playabilityScore = (hasOptions ? 0.5 : 0) + (narrativeLen > 200 ? 0.3 : 0) + (narrativeLen > 500 ? 0.2 : 0);
  dims.push({
    name: "playability",
    score: Math.min(1, playabilityScore),
    verdict: playabilityScore >= 0.5 ? "PASS" : "FAIL",
    evidence: `options=${hasOptions}, narrative_len=${narrativeLen}`,
  });

  // 2. NPC consistency: check for epistemic leakage patterns
  const npcPatterns = [
    /全知/g, /上帝视角/g, /幕后真相/g, /其实你是/g,
    /你真正的身份/g, /这个世界/g, /循环的本质/g,
  ];
  const npcHits = npcPatterns.filter((p) => p.test(output)).length;
  const npcScore = npcHits === 0 ? 1 : npcHits <= 1 ? 0.5 : 0;
  dims.push({
    name: "npc_consistency",
    score: npcScore,
    verdict: npcScore >= 0.5 ? "PASS" : "FAIL",
    evidence: `knowledge_leak_patterns=${npcHits}`,
  });

  // 3. Fact grounding: check for unsupported claim markers
  const factRedFlags = [
    /据我所知/g, /传说中/g, /据说/g, /有人说/g,
    /好像/g, /或许/g, /大概是/g,
  ];
  const factHits = factRedFlags.filter((p) => p.test(output)).length;
  const factScore = factHits <= 2 ? 1 : factHits <= 5 ? 0.6 : 0.3;
  dims.push({
    name: "fact_grounding",
    score: factScore,
    verdict: factScore >= 0.6 ? "PASS" : "WARN",
    evidence: `unsupported_claim_markers=${factHits}`,
  });

  // 4. Narrative quality: prose, pacing, tension
  const qualityIndicators = [
    output.includes("。"), output.includes("……"), output.includes("——"),
    output.includes("\n"), output.includes("「"), output.includes("」"),
  ];
  const qualityScore = qualityIndicators.filter(Boolean).length / qualityIndicators.length;
  dims.push({
    name: "narrative_quality",
    score: qualityScore,
    verdict: qualityScore >= 0.5 ? "PASS" : "WARN",
    evidence: `prose_markers=${qualityIndicators.filter(Boolean).length}/${qualityIndicators.length}`,
  });

  // 5. Hallucination: contradictions, fabrications
  const halluPatterns = [
    /你记得/g, /你曾经/g, /你以前/g, // player memory fabrication
    /第[四五六七八九十]层/g, /13楼/g, /地下[三四五]/g, // location fabrication
    /从未见过/g, /不存在/g, /不可能/g, // absolute claims
    /所有人/g, /从来/g, /永远/g, // over-generalization
  ];
  const halluHits = halluPatterns.filter((p) => p.test(output)).length;
  const halluScore = halluHits === 0 ? 1 : halluHits <= 1 ? 0.7 : halluHits <= 3 ? 0.4 : 0.1;
  dims.push({
    name: "hallucination",
    score: halluScore,
    verdict: halluScore >= 0.7 ? "PASS" : halluScore >= 0.4 ? "WARN" : "FAIL",
    evidence: `hallucination_markers=${halluHits}`,
  });

  const overallScore = dims.reduce((sum, d) => sum + d.score, 0) / dims.length;
  return {
    dimensions: dims,
    overallScore: Math.round(overallScore * 100) / 100,
    summary: `Heuristic judge: ${dims.filter((d) => d.verdict === "FAIL").length} FAIL, ${dims.filter((d) => d.verdict === "WARN").length} WARN, ${dims.filter((d) => d.verdict === "PASS").length} PASS`,
    rawResponse: "heuristic",
    judgeModel: "heuristic",
    latencyMs: 0,
  };
}

// ── LLM Judge ───────────────────────────────────────────

async function llmJudge(gen: GenerationData): Promise<JudgeResult> {
  const startedAt = Date.now();
  const model = process.env.LLM_JUDGE_MODEL ?? "deepseek-v4-flash";
  const apiBase = process.env.AI_GATEWAY_URL ?? "http://127.0.0.1:4319/v1";

  // Extract just the narrative for evaluation (skip JSON envelope)
  let narrative = "";
  try {
    const parsed = JSON.parse(gen.output);
    narrative = parsed.narrative ?? gen.output.slice(0, 3000);
  } catch {
    narrative = gen.output.slice(0, 3000);
  }

  const prompt = `你是一个叙事质量评审专家。请评估以下游戏叙事生成的质量。

【游戏背景】VerseCraft 是一个 AI 驱动的中文互动叙事恐怖游戏，场景设在「序章·暗月」中的废弃公寓楼。

【玩家输入】${gen.input.slice(0, 500)}

【DM 生成叙事】
${narrative.slice(0, 2000)}

请对以下 5 个维度打分（0-1，保留两位小数），并给出简短证据：

1. playability（可玩性）：叙事是否有推进感和选择空间？
2. npc_consistency（NPC 一致性）：NPC 的言行是否符合其认知边界？
3. fact_grounding（事实落地）：叙事中的主张是否有可追溯的来源？
4. narrative_quality（叙事质量）：文笔、节奏、氛围是否到位？
5. hallucination（幻觉检测）：是否有无依据的编造或矛盾？

请严格以 JSON 格式输出，不要输出任何其他内容：
{
  "dimensions": [
    {"name": "playability", "score": 0.XX, "verdict": "PASS|WARN|FAIL", "evidence": "简短证据"},
    {"name": "npc_consistency", "score": 0.XX, "verdict": "PASS|WARN|FAIL", "evidence": "简短证据"},
    {"name": "fact_grounding", "score": 0.XX, "verdict": "PASS|WARN|FAIL", "evidence": "简短证据"},
    {"name": "narrative_quality", "score": 0.XX, "verdict": "PASS|WARN|FAIL", "evidence": "简短证据"},
    {"name": "hallucination", "score": 0.XX, "verdict": "PASS|WARN|FAIL", "evidence": "简短证据"}
  ],
  "summary": "一句话总结"
}`;

  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_GATEWAY_KEY ?? "sk-local"}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      throw new Error(`LLM API error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content);
    const dimensions: JudgeDimension[] = (parsed.dimensions ?? []).map((d: any) => ({
      name: d.name ?? "unknown",
      score: Math.max(0, Math.min(1, Number(d.score) || 0)),
      verdict: ["PASS", "WARN", "FAIL"].includes(d.verdict) ? d.verdict : "WARN",
      evidence: d.evidence ?? "",
    }));

    const overallScore = dimensions.length > 0
      ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length * 100) / 100
      : 0;

    return {
      dimensions,
      overallScore,
      summary: parsed.summary ?? "",
      rawResponse: content,
      judgeModel: model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    // LLM unavailable — fall back to heuristic
    console.warn(`[llm-judge] LLM judge failed (${err instanceof Error ? err.message : String(err)}), falling back to heuristic`);
    const heuristic = heuristicJudge(gen);
    heuristic.judgeModel = `heuristic (llm-fallback)`;
    heuristic.latencyMs = Date.now() - startedAt;
    return heuristic;
  }
}

// ── Score Upload ────────────────────────────────────────

async function uploadJudgeScores(traceId: string, result: JudgeResult): Promise<void> {
  const { execSync } = await import("node:child_process");
  const scores = result.dimensions.map((d) => ({
    name: `judge.${d.name}`,
    value: d.score,
    dataType: "NUMERIC" as const,
    source: "EVAL" as const,
    comment: `[${d.verdict}] ${d.evidence}`,
  }));

  // Also upload overall score
  scores.push({
    name: "judge.overall",
    value: result.overallScore,
    dataType: "NUMERIC" as const,
    source: "EVAL" as const,
    comment: `${result.summary} (model: ${result.judgeModel})`,
  });

  const scoresJson = JSON.stringify(scores);
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "upload-scores.ts");
  execSync(
    `pnpm tsx '${scriptPath}' --trace-id '${traceId}' --scores '${scoresJson}'`,
    { stdio: "pipe", timeout: 20_000 },
  );
  console.log(`[llm-judge] ${scores.length} scores uploaded to trace ${traceId.slice(0, 12)}`);
}

// ── Main ────────────────────────────────────────────────

async function main() {
  loadEnvLocal();

  const { values } = parseArgs({
    options: {
      "trace-id": { type: "string" },
      "observation-id": { type: "string" },
      mock: { type: "boolean", default: false },
    },
  });

  const traceId = values["trace-id"];
  const observationId = values["observation-id"];
  const mockMode = values.mock;

  if (!traceId && !observationId) {
    console.error("Usage: llm-judge.ts --trace-id <id> | --observation-id <id> [--mock]");
    process.exit(1);
  }

  // Fetch generation data
  let gen: GenerationData;
  if (observationId) {
    console.log(`[llm-judge] Fetching observation ${observationId}...`);
    gen = await fetchLangfuseObservation(observationId);
  } else {
    console.log(`[llm-judge] Fetching latest generation for trace ${traceId!.slice(0, 12)}...`);
    gen = await fetchLatestGenerationByTrace(traceId!);
  }

  console.log(`[llm-judge] Generation: ${gen.name} (model: ${gen.model})`);
  console.log(`[llm-judge] Input: ${gen.input.length} chars, Output: ${gen.output.length} chars`);

  // Run judge
  const targetTraceId = gen.traceId || traceId!;
  let result: JudgeResult;

  if (mockMode) {
    console.log(`[llm-judge] Running heuristic judge (--mock)...`);
    result = heuristicJudge(gen);
  } else {
    console.log(`[llm-judge] Running LLM judge...`);
    result = await llmJudge(gen);
  }

  // Print results
  console.log(`\n${"=".repeat(60)}`);
  console.log(`JUDGE RESULTS (model: ${result.judgeModel}, ${result.latencyMs}ms)`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Overall: ${result.overallScore}`);
  for (const d of result.dimensions) {
    const bar = "█".repeat(Math.round(d.score * 20));
    console.log(`  ${d.name.padEnd(20)} [${d.verdict.padEnd(4)}] ${d.score.toFixed(2)} ${bar}`);
    console.log(`    ${d.evidence}`);
  }
  console.log(`Summary: ${result.summary}`);

  // Upload to Langfuse
  await uploadJudgeScores(targetTraceId, result);
}

main().catch((err) => {
  console.error("[llm-judge] fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
