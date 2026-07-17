/**
 * 人工评估导出框架
 *
 * 支持 A/B 对比评估、Likert 量表评分、结果导入与分析。
 * 用于在模型迭代、Prompt 调优时进行人工质量评估。
 *
 * 用法：
 *   node_modules/.bin/tsx benchmarks/human-eval/exporter.ts --mode=ab --output=./eval-data/
 *   node_modules/.bin/tsx benchmarks/human-eval/exporter.ts --mode=likert --rubric=narrative_quality_v2
 */

import fs from "node:fs";
import path from "node:path";

// === 类型定义 ===

interface EvalSample {
  id: string;
  scenario: string;
  userInput: string;
  narrative: string;
  dmJson: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface ABPair {
  id: string;
  scenarioId: string;
  scenario: string;
  userInput: string;
  variantA: {
    model: string;
    narrative: string;
    dmJson: Record<string, unknown>;
  };
  variantB: {
    model: string;
    narrative: string;
    dmJson: Record<string, unknown>;
  };
}

interface LikertQuestion {
  dimension: string;
  question: string;
  scale: { min: number; max: number; labels: Record<number, string> };
  description?: string;
}

interface HumanEvalResult {
  evaluatorId: string;
  timestamp: string;
  evalType: "ab" | "likert";
  data: ABResult[] | LikertResult[];
}

interface ABResult {
  pairId: string;
  preference: "A" | "B" | "tie";
  confidence: number; // 1-5
  reasoning?: string;
}

interface LikertResult {
  sampleId: string;
  scores: Record<string, number>; // dimension -> score
  comments?: string;
}

// === A/B 对比导出 ===

/**
 * 生成 A/B 对比数据
 */
export function generateABPairs(
  samplesA: EvalSample[],
  samplesB: EvalSample[],
  modelA: string,
  modelB: string,
): ABPair[] {
  if (samplesA.length !== samplesB.length) {
    throw new Error(`样本数量不匹配: A=${samplesA.length}, B=${samplesB.length}`);
  }

  return samplesA.map((sampleA, idx) => {
    const sampleB = samplesB[idx]!;
    if (sampleA.id !== sampleB.id) {
      throw new Error(`样本 ID 不匹配: A=${sampleA.id}, B=${sampleB.id}`);
    }
    if (sampleA.scenario !== sampleB.scenario || sampleA.userInput !== sampleB.userInput) {
      throw new Error(`样本场景/输入不匹配: ${sampleA.id}`);
    }

    return {
      id: `ab_${sampleA.id}`,
      scenarioId: sampleA.id,
      scenario: sampleA.scenario,
      userInput: sampleA.userInput,
      variantA: {
        model: modelA,
        narrative: sampleA.narrative,
        dmJson: sampleA.dmJson,
      },
      variantB: {
        model: modelB,
        narrative: sampleB.narrative,
        dmJson: sampleB.dmJson,
      },
    };
  });
}

/**
 * 导出 A/B 对比数据为 JSON
 */
export function exportABComparison(
  pairs: ABPair[],
  outputPath: string,
): void {
  const data = {
    metadata: {
      type: "ab_comparison",
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      totalPairs: pairs.length,
    },
    pairs,
  };

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`✅ A/B 对比数据已导出: ${outputPath} (${pairs.length} 对)`);
}

/**
 * 生成 A/B 评估表格（Markdown 格式）
 */
export function generateABWorksheet(pairs: ABPair[], outputPath: string): void {
  let md = `# A/B 对比评估表格\n\n`;
  md += `**评估日期**: ${new Date().toISOString().split("T")[0]}\n`;
  md += `**评估人**: _______________\n`;
  md += `**总对数**: ${pairs.length}\n\n`;
  md += `---\n\n`;
  md += `## 评估说明\n\n`;
  md += `每对包含两个模型对同一场景的响应。请根据以下标准选择偏好：\n`;
  md += `- **叙事质量**：沉浸感、细节丰富度、语言流畅度\n`;
  md += `- **逻辑一致性**：与游戏状态、规则的一致性\n`;
  md += `- **玩家体验**：选项合理性、代入感\n\n`;
  md += `对每对选择：A 更好 / B 更好 / 平局，并给出置信度（1-5）。\n\n`;
  md += `---\n\n`;

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]!;
    md += `## 第 ${i + 1} 对 (${pair.scenarioId})\n\n`;
    md += `**场景**: ${pair.scenario}\n\n`;
    md += `**玩家输入**: ${pair.userInput}\n\n`;

    md += `### 版本 A (${pair.variantA.model})\n\n`;
    md += `${pair.variantA.narrative}\n\n`;

    md += `### 版本 B (${pair.variantB.model})\n\n`;
    md += `${pair.variantB.narrative}\n\n`;

    md += `**评估**:\n\n`;
    md += `- [ ] A 更好\n`;
    md += `- [ ] B 更好\n`;
    md += `- [ ] 平局\n\n`;
    md += `**置信度** (1-5): _____\n\n`;
    md += `**理由**: _______________________________________________\n\n`;
    md += `---\n\n`;
  }

  fs.writeFileSync(outputPath, md, "utf8");
  console.log(`✅ A/B 评估表格已生成: ${outputPath}`);
}

// === Likert 量表导出 ===

/**
 * 生成 Likert 量表问题集
 */
export function generateLikertQuestions(rubricId: string): LikertQuestion[] {
  // 预定义的 Likert 量表（可根据 rubric 动态生成）
  const questionSets: Record<string, LikertQuestion[]> = {
    narrative_quality: [
      {
        dimension: "沉浸感",
        question: "叙事是否具有沉浸感，让读者身临其境？",
        scale: {
          min: 1,
          max: 7,
          labels: {
            1: "完全无沉浸感",
            2: "沉浸感很差",
            3: "沉浸感较差",
            4: "一般",
            5: "沉浸感较好",
            6: "沉浸感很好",
            7: "完全沉浸",
          },
        },
        description: "评估叙事的感官细节、氛围营造、情感共鸣",
      },
      {
        dimension: "逻辑一致性",
        question: "叙事是否与游戏状态、规则保持一致？",
        scale: {
          min: 1,
          max: 7,
          labels: {
            1: "完全矛盾",
            2: "多处矛盾",
            3: "有矛盾",
            4: "基本一致",
            5: "一致性较好",
            6: "一致性很好",
            7: "完全一致",
          },
        },
        description: "评估叙事与结构化字段（道具、位置、任务等）的对齐",
      },
      {
        dimension: "语言质量",
        question: "叙事的语言是否流畅、自然、符合角色设定？",
        scale: {
          min: 1,
          max: 7,
          labels: {
            1: "语言粗糙",
            2: "语言较差",
            3: "语言一般",
            4: "语言流畅",
            5: "语言很好",
            6: "语言优秀",
            7: "语言精湛",
          },
        },
        description: "评估用词、句式、节奏、风格一致性",
      },
      {
        dimension: "玩家代入感",
        question: "叙事是否让玩家感到自己是故事的主角？",
        scale: {
          min: 1,
          max: 7,
          labels: {
            1: "完全无代入感",
            2: "代入感很差",
            3: "代入感较差",
            4: "一般",
            5: "代入感较好",
            6: "代入感很好",
            7: "完全代入",
          },
        },
        description: "评估第二人称使用、玩家选择的尊重、角色动机的合理性",
      },
    ],
    game_mechanics: [
      {
        dimension: "机制透明度",
        question: "游戏机制的变化（消耗、获得、状态改变）是否在叙事中自然交代？",
        scale: {
          min: 1,
          max: 7,
          labels: {
            1: "完全未交代",
            2: "交代很差",
            3: "交代较差",
            4: "基本交代",
            5: "交代较好",
            6: "交代很好",
            7: "完全自然交代",
          },
        },
      },
      {
        dimension: "NPC 行为合理性",
        question: "NPC 的行为、对话是否符合其设定和当前情境？",
        scale: {
          min: 1,
          max: 7,
          labels: {
            1: "完全不合理",
            2: "很不合理",
            3: "不太合理",
            4: "基本合理",
            5: "比较合理",
            6: "很合理",
            7: "完全合理",
          },
        },
      },
    ],
    playability: [
      { dimension: "行动回报", question: "玩家的行动是否得到具体、可信且与输入相关的结果？", scale: { min: 1, max: 7, labels: { 1: "行动被完全忽略", 2: "几乎无关", 3: "回报很弱", 4: "基本回应", 5: "结果明确", 6: "结果有趣", 7: "结果令人惊喜且合理" } } },
      { dimension: "选择意义", question: "这一回合是否让你感到不同做法会带来不同后果？", scale: { min: 1, max: 7, labels: { 1: "完全线性", 2: "几乎无选择感", 3: "差异很弱", 4: "基本有差异", 5: "差异清楚", 6: "策略感强", 7: "高度有意义" } } },
      { dimension: "张力与节奏", question: "危险、发现、缓和与回报的节奏是否让人保持投入？", scale: { min: 1, max: 7, labels: { 1: "极度乏味", 2: "明显拖沓", 3: "偏平", 4: "一般", 5: "有吸引力", 6: "张弛良好", 7: "非常抓人" } } },
      { dimension: "新鲜度", question: "内容是否避免重复套路，并提供了新的信息、局面或表达？", scale: { min: 1, max: 7, labels: { 1: "高度重复", 2: "很套路", 3: "偏重复", 4: "一般", 5: "有新意", 6: "新鲜", 7: "非常独特" } } },
      { dimension: "清晰度", question: "你是否清楚发生了什么、状态为何变化以及下一步能做什么？", scale: { min: 1, max: 7, labels: { 1: "完全看不懂", 2: "非常混乱", 3: "有明显疑惑", 4: "基本清楚", 5: "清楚", 6: "很清楚", 7: "清晰且自然" } } },
      { dimension: "继续游玩意愿", question: "看完这一回合后，你有多想继续输入下一步行动？", scale: { min: 1, max: 7, labels: { 1: "立刻退出", 2: "基本不想", 3: "意愿较低", 4: "一般", 5: "愿意继续", 6: "很想继续", 7: "迫不及待" } } },
    ],
  };

  return questionSets[rubricId] ?? questionSets["narrative_quality"]!;
}

/**
 * 生成 Likert 评估表单
 */
export function generateLikertSheet(
  rubricId: string,
  samples: EvalSample[],
  outputPath: string,
): void {
  const questions = generateLikertQuestions(rubricId);

  let md = `# Likert 量表评估表单\n\n`;
  md += `**评估量表**: ${rubricId}\n`;
  md += `**评估日期**: ${new Date().toISOString().split("T")[0]}\n`;
  md += `**评估人**: _______________\n`;
  md += `**样本数**: ${samples.length}\n\n`;
  md += `---\n\n`;
  md += `## 评估说明\n\n`;
  md += `对每个样本，根据以下维度进行 1-7 分评分：\n\n`;

  for (const q of questions) {
    md += `### ${q.dimension}\n\n`;
    md += `**问题**: ${q.question}\n\n`;
    md += `**评分标准**:\n`;
    for (let i = q.scale.min; i <= q.scale.max; i++) {
      md += `- ${i}: ${q.scale.labels[i]}\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `## 评估样本\n\n`;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    md += `### 样本 ${i + 1} (${sample.id})\n\n`;
    md += `**场景**: ${sample.scenario}\n\n`;
    md += `**玩家输入**: ${sample.userInput}\n\n`;
    md += `**叙事**:\n\n`;
    md += `${sample.narrative}\n\n`;

    md += `**评分**:\n\n`;
    md += `| 维度 | 分数 (1-7) |\n`;
    md += `|------|----------|\n`;
    for (const q of questions) {
      md += `| ${q.dimension} | _____ |\n`;
    }
    md += `\n`;
    md += `**评论**: _______________________________________________\n\n`;
    md += `---\n\n`;
  }

  fs.writeFileSync(outputPath, md, "utf8");
  console.log(`✅ Likert 评估表单已生成: ${outputPath}`);
}

// === 结果导入 ===

/**
 * 导入人工评估结果（JSON 格式）
 */
export function importHumanEvalResults(inputPath: string): HumanEvalResult {
  const content = fs.readFileSync(inputPath, "utf8");
  const result = JSON.parse(content) as HumanEvalResult;

  // 验证结构
  if (!result.evaluatorId || !result.timestamp || !result.evalType || !Array.isArray(result.data)) {
    throw new Error(`无效的评估结果格式: ${inputPath}`);
  }

  console.log(`✅ 导入评估结果: ${inputPath} (${result.data.length} 条记录)`);
  return result;
}

/**
 * 汇总多个评估人的结果
 */
export function aggregateHumanResults(results: HumanEvalResult[]): {
  abSummary?: { totalPairs: number; preferences: { A: number; B: number; tie: number } };
  likertSummary?: { totalSamples: number; dimensionAverages: Record<string, number> };
} {
  const abResults = results.filter((r) => r.evalType === "ab");
  const likertResults = results.filter((r) => r.evalType === "likert");

  const summary: {
    abSummary?: { totalPairs: number; preferences: { A: number; B: number; tie: number } };
    likertSummary?: { totalSamples: number; dimensionAverages: Record<string, number> };
  } = {};

  if (abResults.length > 0) {
    const allABPairs = abResults.flatMap((r) => r.data as ABResult[]);
    const preferences = { A: 0, B: 0, tie: 0 };
    for (const pair of allABPairs) {
      preferences[pair.preference]++;
    }
    summary.abSummary = {
      totalPairs: allABPairs.length,
      preferences,
    };
  }

  if (likertResults.length > 0) {
    const allLikertResults = likertResults.flatMap((r) => r.data as LikertResult[]);
    const dimensionScores: Record<string, number[]> = {};

    for (const result of allLikertResults) {
      for (const [dimension, score] of Object.entries(result.scores)) {
        if (!dimensionScores[dimension]) {
          dimensionScores[dimension] = [];
        }
        dimensionScores[dimension]!.push(score);
      }
    }

    const dimensionAverages: Record<string, number> = {};
    for (const [dimension, scores] of Object.entries(dimensionScores)) {
      dimensionAverages[dimension] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    summary.likertSummary = {
      totalSamples: allLikertResults.length,
      dimensionAverages,
    };
  }

  return summary;
}

// === 主入口 ===

function main(): void {
  const args = process.argv.slice(2);
  const modeArg = args.find((a) => a.startsWith("--mode="));
  const outputArg = args.find((a) => a.startsWith("--output="));
  const rubricArg = args.find((a) => a.startsWith("--rubric="));
  const inputArg = args.find((a) => a.startsWith("--input="));
  const inputAArg = args.find((a) => a.startsWith("--input-a="));
  const inputBArg = args.find((a) => a.startsWith("--input-b="));
  const changedOnly = args.includes("--changed-only");
  const storyOnly = args.includes("--story-only");

  const mode = modeArg ? modeArg.split("=")[1] : "ab";
  const outputDir = outputArg ? outputArg.split("=")[1] : "./benchmarks/human-eval/output/";
  const rubricId = rubricArg ? rubricArg.split("=")[1] : "narrative_quality";
  const inputPath = inputArg ? inputArg.slice("--input=".length) : null;
  const inputAPath = inputAArg ? inputAArg.slice("--input-a=".length) : null;
  const inputBPath = inputBArg ? inputBArg.slice("--input-b=".length) : null;

  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === "ab") {
    console.log("📝 生成 A/B 对比评估数据...");
    let samplePairs: ABPair[] = [
      {
        id: "ab_demo_001",
        scenarioId: "demo_001",
        scenario: "B1 走廊探索",
        userInput: "我小心翼翼地走向走廊深处",
        variantA: {
          model: "model-v1",
          narrative: "走廊里的灯闪了两下。我贴墙走向深处，听见暗处有细碎的刮擦声。空气里有潮湿纸张的味道。",
          dmJson: { is_action_legal: true, sanity_damage: 0 },
        },
        variantB: {
          model: "model-v2",
          narrative: "我屏住呼吸，一步步向前。头顶的灯管发出嗡嗡的电流声，忽明忽暗。走廊尽头似乎有什么东西在动。",
          dmJson: { is_action_legal: true, sanity_damage: 0 },
        },
      },
    ];
    if (inputAPath || inputBPath) {
      if (!inputAPath || !inputBPath) throw new Error("A/B 真实 trace 必须同时提供 --input-a 与 --input-b");
      const loadTrace = (tracePath: string): EvalSample[] => {
        const trace = JSON.parse(fs.readFileSync(tracePath, "utf8")) as { scenarioId?: string; runId?: string; steps?: Array<Record<string, unknown>> };
        return (trace.steps ?? []).map((step, index) => ({
          id: `${trace.scenarioId ?? "unknown"}-${String(step.stepIndex ?? index)}`,
          scenario: trace.scenarioId ?? "unknown",
          userInput: String(step.playerAction ?? ""),
          narrative: String(step.narrative ?? ""),
          dmJson: step.dmJson && typeof step.dmJson === "object" ? step.dmJson as Record<string, unknown> : {},
          metadata: { stepIndex: step.stepIndex ?? index, source: "anonymized_trace" },
        }));
      };
      const samplesA = loadTrace(inputAPath);
      const samplesB = loadTrace(inputBPath);
      samplePairs = generateABPairs(samplesA, samplesB, "匿名版本 A", "匿名版本 B");
      if (changedOnly) {
        samplePairs = samplePairs.filter((pair) => pair.variantA.narrative.trim() !== pair.variantB.narrative.trim());
      }
    }

    const jsonPath = path.join(outputDir, "ab-comparison.json");
    const worksheetPath = path.join(outputDir, "ab-worksheet.md");

    exportABComparison(samplePairs, jsonPath);
    generateABWorksheet(samplePairs, worksheetPath);
  } else if (mode === "likert") {
    console.log(`📝 生成 Likert 量表评估表单 (${rubricId})...`);
    let samples: EvalSample[] = [
      {
        id: "demo_001",
        scenario: "B1 走廊探索",
        userInput: "我小心翼翼地走向走廊深处",
        narrative: "走廊里的灯闪了两下。我贴墙走向深处，听见暗处有细碎的刮擦声。空气里有潮湿纸张的味道。",
        dmJson: { is_action_legal: true, sanity_damage: 0 },
      },
    ];
    if (inputPath) {
      const trace = JSON.parse(fs.readFileSync(inputPath, "utf8")) as { scenarioId?: string; runId?: string; steps?: Array<Record<string, unknown>> };
      samples = (trace.steps ?? []).map((step, index) => ({
        id: `${trace.runId ?? "trace"}-${String(step.stepIndex ?? index)}`,
        scenario: trace.scenarioId ?? "unknown",
        userInput: String(step.playerAction ?? ""),
        narrative: String(step.narrative ?? ""),
        dmJson: step.dmJson && typeof step.dmJson === "object" ? step.dmJson as Record<string, unknown> : {},
        metadata: { stepIndex: step.stepIndex ?? index, source: "anonymized_trace" },
      })).filter((sample) => {
        if (!storyOnly) return true;
        const meta = sample.dmJson.security_meta;
        return !(meta && typeof meta === "object" && !Array.isArray(meta) && (meta as Record<string, unknown>).deterministic_service_fast_lane === true);
      });
    }

    const sheetPath = path.join(outputDir, `likert-sheet-${rubricId}.md`);
    generateLikertSheet(rubricId, samples, sheetPath);
  } else {
    console.error(`❌ 未知模式: ${mode}。支持: ab, likert`);
    process.exit(1);
  }

  console.log("\n✅ 完成！请查看输出目录:", outputDir);
}

main();
