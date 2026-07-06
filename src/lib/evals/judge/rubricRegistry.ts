/**
 * Rubric 注册表
 *
 * 管理所有 Judge Rubric 的加载、缓存和访问。
 * 支持从 JSON 文件加载和编程式注册两种方式。
 */

import fs from "node:fs";
import path from "node:path";
import type { JudgeRubric } from "./types";

// === 内置 Rubric ===

import narrativeQualityV2 from "@/../benchmarks/judge/rubrics/narrative_quality_v2.json" with { type: "json" };
import gameMechanicsV2 from "@/../benchmarks/judge/rubrics/game_mechanics_v2.json" with { type: "json" };
import safetyComplianceV2 from "@/../benchmarks/judge/rubrics/safety_compliance_v2.json" with { type: "json" };

/** 所有已注册的 Rubric */
const rubricRegistry = new Map<string, JudgeRubric>();

// 注册内置 Rubric
function registerBuiltins(): void {
  const builtins = [
    narrativeQualityV2 as unknown as JudgeRubric,
    gameMechanicsV2 as unknown as JudgeRubric,
    safetyComplianceV2 as unknown as JudgeRubric,
  ];

  for (const rubric of builtins) {
    registerRubric(rubric);
  }
}

/** 注册一个 Rubric */
export function registerRubric(rubric: JudgeRubric): void {
  // 验证 Rubric 结构
  if (!rubric.id || !rubric.name || !Array.isArray(rubric.dimensions)) {
    throw new Error(`Invalid rubric: missing required fields (id, name, dimensions)`);
  }
  if (rubric.dimensions.length === 0) {
    throw new Error(`Rubric "${rubric.id}" has no dimensions`);
  }
  // 验证权重之和
  const totalWeight = rubric.dimensions.reduce((sum, dim) => sum + (dim.weight ?? 0), 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    console.warn(`Rubric "${rubric.id}" dimension weights sum to ${totalWeight}, expected 1.0`);
  }

  rubricRegistry.set(rubric.id, rubric);
}

/** 获取指定 Rubric */
export function getRubric(id: string): JudgeRubric | undefined {
  return rubricRegistry.get(id);
}

/** 列出所有已注册的 Rubric */
export function listRubrics(): JudgeRubric[] {
  return [...rubricRegistry.values()];
}

/** 获取所有 Rubric ID */
export function listRubricIds(): string[] {
  return [...rubricRegistry.keys()];
}

/** 从 JSON 文件加载并注册 Rubric */
export function loadRubricFromFile(filePath: string): JudgeRubric {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const content = fs.readFileSync(absolutePath, "utf8");
  const rubric = JSON.parse(content) as JudgeRubric;
  registerRubric(rubric);
  return rubric;
}

/** 生成 Rubric 的简要描述（用于 CLI 和报告） */
export function describeRubric(rubric: JudgeRubric): string {
  const dims = rubric.dimensions.map((d) => `${d.name}(${d.weight})`).join("、");
  return [
    `Rubric: ${rubric.name} (${rubric.id}) v${rubric.version}`,
    `描述: ${rubric.description}`,
    `维度: ${dims}`,
    `评分: ${rubric.scale.min}-${rubric.scale.max} 分，通过线 ≥${rubric.passRule.minAverage}`,
    `硬性底线: ${Object.entries(rubric.passRule.hardFailIf ?? {}).map(([k, v]) => `${k}≤${v}直接fail`).join(", ") || "无"}`,
  ].join("\n");
}

// 初始化
registerBuiltins();

// === V1 Rubric 兼容（保留原有的 authenticity judge） ===

import authenticityV1 from "@/../benchmarks/rubrics/versecraft_authenticity_judge_v1.json" with { type: "json" };

// 将 V1 rubric 格式转换为 V2 格式
function convertV1Rubric(): JudgeRubric {
  const v1 = authenticityV1 as unknown as Record<string, unknown>;
  const dims = v1.dimensions as Array<Record<string, unknown>>;
  const scale = v1.scale as Record<string, number>;
  const passRule = v1.pass_rule as Record<string, unknown>;

  return {
    id: "versecraft_authenticity_judge_v1",
    name: String(v1.description ?? "VerseCraft Authenticity Judge V1"),
    version: "1.0.0",
    description: String(v1.description ?? ""),
    scale: {
      min: scale.min as number,
      max: scale.max as number,
      passing: scale.passing as number,
    },
    passRule: {
      minEach: passRule.min_each as number | undefined,
      minAverage: passRule.min_average as number,
      hardFailIf: passRule.hard_fail_if as Record<string, number> | undefined,
    },
    dimensions: dims.map((dim) => ({
      id: String(dim.id),
      name: String(dim.description),
      weight: 1 / dims.length,
      description: String(dim.description),
      anchors: [
        { score: 5, label: "卓越", description: "表现优秀，无缺陷" },
        { score: 4, label: "良好", description: "整体良好" },
        { score: 3, label: "及格", description: "基本达标" },
        { score: 2, label: "较差", description: "有明显问题" },
        { score: 1, label: "不可接受", description: "完全失败" },
      ],
    })),
  };
}

registerRubric(convertV1Rubric());
