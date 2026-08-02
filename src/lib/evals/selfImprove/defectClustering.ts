/**
 * Self-Improving Agent System — Defect Clustering
 *
 * Clusters Oracle expectation mismatches and Judge violations
 * into root-cause groups with stable defect signatures.
 *
 * Each cluster maps to a single repair task with:
 * - supporting caseIds
 * - Oracle expected/actual
 * - affected files
 * - proposed invariant
 */

import type { DeterministicCaseResult } from "./traceStore";
import type { TriagedDefect, DefectSignature } from "./types";

// ── Cluster definition ───────────────────────────────

export interface DefectCluster {
  /** Stable identifier for this root cause */
  clusterId: string;
  /** Human-readable description */
  description: string;
  /** Severity */
  severity: "critical" | "major" | "minor";
  /** Root cause hypothesis */
  rootCause: string;
  /** Supporting case IDs (the failing scenarios) */
  caseIds: string[];
  /** What Oracle expected vs what happened */
  oracleMismatches: {
    invariantId: string;
    check: string;
    expected: string;
    actual: string;
  }[];
  /** Affected production files (best guess) */
  affectedFiles: string[];
  /** Proposed invariant / business rule that should hold */
  proposedInvariant: string;
  /** Whether this is a clear deterministic defect */
  deterministicEvidence: boolean;
}

// ── Clustering logic ──────────────────────────────────

const CLUSTER_RULES: {
  pattern: (mismatch: { invariantId: string; check: string; expected: string; actual: string; caseId: string }) => boolean;
  cluster: Omit<DefectCluster, "caseIds" | "oracleMismatches">;
}[] = [
  {
    // A: legal-npc-talk-rejected
    pattern: (m) =>
      (m.check === "action_legality" || m.check === "npc_epistemic_boundary") &&
      m.expected === "pass" && m.actual === "fail" &&
      (m.caseId.includes("talk") || m.caseId.includes("npc")),
    cluster: {
      clusterId: "legal-npc-talk-rejected",
      description: "合法 NPC 对话被误拒绝（false positive）",
      severity: "major",
      rootCause: "NPC 对话合法性校验过于严格，或 control preflight 错误地将正常对话标记为非法",
      affectedFiles: [
        "src/lib/security/chatValidation.ts",
        "src/lib/playRealtime/normalizePlayerDmJson.ts",
        "src/app/api/chat/route.ts",
      ],
      proposedInvariant: "在场 NPC 的合法对话应被允许（is_action_legal=true），不在场 NPC 仍应被拒绝",
      deterministicEvidence: true,
    },
  },
  {
    // B: task-completed-before-acceptance
    pattern: (m) =>
      m.check === "task_lifecycle" && m.expected === "fail" && m.actual === "pass",
    cluster: {
      clusterId: "task-completed-before-acceptance",
      description: "未接取任务被允许完成（missing guard）",
      severity: "critical",
      rootCause: "任务完成流程未校验任务是否已被接取（task acceptance check missing）",
      affectedFiles: [
        "src/lib/tasks/completionDetector.ts",
        "src/lib/tasks/questSystem.ts",
        "src/lib/turnEngine/commitTurn.ts",
      ],
      proposedInvariant: "未接取的任务不得完成；已接取且条件满足的任务可以完成；已领奖任务不可重复领奖",
      deterministicEvidence: true,
    },
  },
  {
    // C: profession-exclusive-ability-bypassed
    pattern: (m) =>
      m.check === "profession_boundary" && m.expected === "fail" && m.actual === "pass",
    cluster: {
      clusterId: "profession-exclusive-ability-bypassed",
      description: "跨职业专属技能未被拦截（missing guard）",
      severity: "critical",
      rootCause: "职业能力使用前未校验玩家当前职业是否拥有该技能",
      affectedFiles: [
        "src/lib/profession/engine.ts",
        "src/lib/playRealtime/normalizePlayerDmJson.ts",
        "src/lib/security/chatValidation.ts",
      ],
      proposedInvariant: "非对应职业不得使用专属能力；对应职业可正常使用",
      deterministicEvidence: true,
    },
  },
  {
    // D: empty-input-not-rejected
    pattern: (m) =>
      m.check === "action_legality" && m.expected === "fail" && m.actual === "pass" &&
      m.caseId.includes("empty"),
    cluster: {
      clusterId: "empty-input-not-rejected",
      description: "空输入未被拒绝（missing input validation）",
      severity: "critical",
      rootCause: "服务端未在早期阶段拦截空字符串或纯空白输入，导致无效请求进入 AI 模型",
      affectedFiles: [
        "src/lib/security/chatValidation.ts",
        "src/app/api/chat/route.ts",
      ],
      proposedInvariant: "空输入和纯空白输入应在服务端早期被快速拒绝，不消耗 AI 模型调用",
      deterministicEvidence: true,
    },
  },
];

// ── Main clustering function ──────────────────────────

export function clusterOracleMismatches(
  detResults: DeterministicCaseResult[],
): DefectCluster[] {
  const clusters: DefectCluster[] = [];

  for (const rule of CLUSTER_RULES) {
    const matchingMismatches: {
      invariantId: string; check: string; expected: string; actual: string; caseId: string;
    }[] = [];

    for (const result of detResults) {
      for (const inv of result.invariantResults) {
        const expectedMatch = (inv.expected === "pass") === (inv.actual === "pass");
        if (!expectedMatch) {
          const mismatch = {
            invariantId: inv.invariantId,
            check: inv.check,
            expected: inv.expected,
            actual: inv.actual,
            caseId: result.caseId,
          };
          if (rule.pattern(mismatch)) {
            matchingMismatches.push(mismatch);
          }
        }
      }
    }

    if (matchingMismatches.length > 0) {
      clusters.push({
        ...rule.cluster,
        caseIds: matchingMismatches.map((m) => m.caseId),
        oracleMismatches: matchingMismatches,
      });
    }
  }

  return clusters;
}

// ── Convert clusters to TriagedDefect ─────────────────

export function clustersToTriagedDefects(clusters: DefectCluster[]): TriagedDefect[] {
  return clusters.map((c) => ({
    signature: {
      fingerprint: `${c.clusterId}::${c.severity}`,
      category: c.clusterId,
      ruleId: c.clusterId,
      affectedSystem: c.affectedFiles[0] || "unknown",
      normalizedExpected: c.oracleMismatches.map((m) => m.expected).join("|"),
      normalizedActual: c.oracleMismatches.map((m) => m.actual).join("|"),
    },
    severity: c.severity,
    sourceVerdicts: [],
    oracleReproduced: true,
    autoRepairable: true,
    disposition: "auto_repair",
  }));
}
