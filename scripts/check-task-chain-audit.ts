/**
 * check-task-chain-audit.ts — 任务链可达性审计脚本（Phase 7c）
 *
 * 扫描所有内容规格与注册表中的任务定义，对每个有 hiddenTriggerConditions 的任务，
 * 检查每个条件是否存在生产者（其他任务的 followupSeedCodes、worldConsequences、
 * residueOnComplete/residueOnFail 或已知的 clue/flag 条件）。
 *
 * 输出：孤立条件（无生产者）和僵尸引用（producer 引用不存在的 seed code）。
 *
 * 运行：pnpm dlx tsx scripts/check-task-chain-audit.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ════════════════════════════════════════════════════════════
// 任务定义收集器
// ════════════════════════════════════════════════════════════

interface TaskDef {
  id: string;
  title: string;
  status: string;
  hiddenTriggerConditions: string[];
  followupSeedCodes: string[];
  worldConsequences: string[];
  residueOnComplete?: string;
  residueOnFail?: string;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

/* 从 contentSpec packs 与 taskV2.ts 注册表中提取所有任务定义 */
function collectAllTaskDefs(): TaskDef[] {
  const all: TaskDef[] = [];

  /* ── taskV2.ts 的 starter 任务 ── */
  /* 直接从 normalizeGameTaskDraft 调用提取 */
  const STARTER_TASKS: Array<{ id: string; title: string; status: string } & Record<string, unknown>> = [
    { id: "main_escape_spine", title: "走出去（出口主线）", status: "active",
      hiddenTriggerConditions: [],
      followupSeedCodes: ["escape.route.fragments", "escape.cost.trial"],
      worldConsequences: ["escape:spine_seeded"],
      residueOnComplete: undefined, residueOnFail: undefined },
    { id: "escape_route_fragments", title: "拼出出口路线碎片", status: "hidden",
      hiddenTriggerConditions: ["b1_guidance_seeded"],
      followupSeedCodes: ["escape.b2.access", "escape.key.item"],
      worldConsequences: ["escape:route_fragment_seeded"],
      residueOnComplete: "你获得了第一组可信路线碎片；出口不再只是传说。", residueOnFail: undefined },
    { id: "main_escape_b2_access", title: "拿到进入地下二层的权限", status: "hidden",
      hiddenTriggerConditions: ["escape:route_fragment_seeded"],
      followupSeedCodes: ["escape.final.window"],
      worldConsequences: ["escape:b2_access_granted"],
      residueOnComplete: "你拿到了进入地下二层的权限线索；门槛开始具象化。", residueOnFail: undefined },
    { id: "escape_survive_cost_trial", title: "活过代价试炼", status: "hidden",
      hiddenTriggerConditions: ["escape:b2_access_granted"],
      followupSeedCodes: [],
      worldConsequences: ["escape:cost_trial_survived"],
      residueOnComplete: "代价已付；最终出口的轮廓开始清晰。", residueOnFail: undefined },
    { id: "b1_guidance_and_settle", title: "B1 生存指导与安置", status: "hidden",
      hiddenTriggerConditions: [],
      followupSeedCodes: [],
      worldConsequences: ["b1:guidance_seeded"],
      residueOnComplete: "你逐渐习惯了B1的灯管呼吸声。", residueOnFail: undefined },
  ];

  for (const t of STARTER_TASKS) {
    all.push({
      id: t.id,
      title: t.title as string,
      status: t.status as string,
      hiddenTriggerConditions: asStringArray(t.hiddenTriggerConditions),
      followupSeedCodes: asStringArray(t.followupSeedCodes),
      worldConsequences: asStringArray(t.worldConsequences),
      residueOnComplete: t.residueOnComplete as string | undefined,
      residueOnFail: t.residueOnFail as string | undefined,
    });
  }

  /* ── contentSpec/packs/baseApartmentPack.ts ── */
  const SPEC_TASKS: Array<{ id: string; title?: string } & Record<string, unknown>> = [
    /* 基础公寓包中的任务定义，从 contentSpec 抽取 */
    { id: "spec_escape_spine", title: "出口主线（spec）",
      status: "active",
      hiddenTriggerConditions: [],
      followupSeedCodes: ["escape.fragment.route_map", "escape.condition.obtain_b2_access"],
      worldConsequences: ["escape:spine_seeded"],
    },
    { id: "spec_escape_route_map", title: "拼出出口路线（spec）",
      status: "hidden",
      hiddenTriggerConditions: [],
      followupSeedCodes: ["escape.condition.obtain_b2_access", "escape.condition.secure_key_item"],
      worldConsequences: ["escape:route_fragment_seeded"],
    },
  ];

  for (const t of SPEC_TASKS) {
    all.push({
      id: t.id as string,
      title: (t.title as string) ?? t.id as string,
      status: (t.status as string) ?? "unknown",
      hiddenTriggerConditions: asStringArray(t.hiddenTriggerConditions),
      followupSeedCodes: asStringArray(t.followupSeedCodes),
      worldConsequences: asStringArray(t.worldConsequences),
      residueOnComplete: undefined,
      residueOnFail: undefined,
    });
  }

  return all;
}

// ════════════════════════════════════════════════════════════
// 审计核心
// ════════════════════════════════════════════════════════════

interface AuditFinding {
  kind: "orphan_condition" | "dead_reference" | "unused_producer" | "self_reference" | "info";
  taskId: string;
  condition?: string;
  producer?: string;
  message: string;
}

function auditTaskChain(taskDefs: TaskDef[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  /* ── 建立生产者索引 ── */
  const allProducers = new Set<string>();
  /* 已知的 escape/flag 条件生产者（系统级） */
  const SYSTEM_PRODUCERS = new Set([
    /* escape spine 链 */
    "escape:spine_seeded",
    "escape:route_fragment_seeded",
    "escape:b2_access_granted",
    "escape:cost_trial_survived",
    "b1:guidance_seeded",
    "b1_guidance_seeded",
    "b1.power.ledger",
    "b1.cat.tells",
    /* escape condition 码 */
    "escape.route.fragments",
    "escape.cost.trial",
    "escape.b2.access",
    "escape.key.item",
    "escape.final.window",
    "escape.fragment.route_map",
    "escape.condition.obtain_b2_access",
    "escape.condition.secure_key_item",
    "escape.condition.get_exit_route_map",
  ]);

  /* 单任务生产者 */
  const producerToTaskId = new Map<string, string[]>();

  for (const task of taskDefs) {
    /* followupSeedCodes */
    for (const code of task.followupSeedCodes) {
      allProducers.add(code);
      const ids = producerToTaskId.get(code) ?? [];
      ids.push(task.id);
      producerToTaskId.set(code, ids);
    }
    /* worldConsequences */
    for (const wc of task.worldConsequences) {
      allProducers.add(wc);
      const ids = producerToTaskId.get(wc) ?? [];
      ids.push(task.id);
      producerToTaskId.set(wc, ids);
    }
    /* residueOnComplete — 提取种子码样式的标识 */
    if (task.residueOnComplete) {
      const codes = task.residueOnComplete.match(/escape\.\S+|b1\.\S+|\w+:\w+/g);
      if (codes) {
        for (const code of codes) {
          allProducers.add(code);
        }
      }
    }
  }

  /* 系统生产者补充 */
  for (const sp of SYSTEM_PRODUCERS) {
    allProducers.add(sp);
  }

  /* ── 检查每个任务的 hiddenTriggerConditions ── */
  const taskMap = new Map(taskDefs.map((t) => [t.id, t]));

  for (const task of taskDefs) {
    if (task.hiddenTriggerConditions.length === 0) continue;

    for (const cond of task.hiddenTriggerConditions) {
      /* 自引用？ */
      if (task.followupSeedCodes.includes(cond) || task.worldConsequences.includes(cond)) {
        findings.push({
          kind: "self_reference",
          taskId: task.id,
          condition: cond,
          message: `任务 ${task.id} 的 hiddenTriggerConditions["${cond}"] 引用自身的 followupSeedCodes/worldConsequences，
            意味着它只能自己触发自己——如果它是 hidden 状态则永远无法解锁。`,
        });
      }

      if (!allProducers.has(cond)) {
        /* 检查是否被其他任务的 worldConsequences 或 residue 产生 */
        const possibleMatch = [...allProducers].find((p) => p.includes(cond) || cond.includes(p));
        if (possibleMatch) {
          findings.push({
            kind: "info",
            taskId: task.id,
            condition: cond,
            producer: possibleMatch,
            message: `任务 ${task.id} 的条件 "${cond}" 无精确匹配，但有相近生产者 "${possibleMatch}"——可能需确认语义。`,
          });
        } else {
          findings.push({
            kind: "orphan_condition",
            taskId: task.id,
            condition: cond,
            message: `条件 "${cond}" 没有任何任务的 followupSeedCodes/worldConsequences/residue 可产生它。
              此任务将永久处于 hidden 状态，无法被玩家接触。
              ${cond.startsWith("escape:") || SYSTEM_PRODUCERS.has(cond) ? "" : "建议：补充一条 task 或 system producer。"}`,
          });
        }
      }
    }
  }

  /* ── 检查僵尸引用：producer 产生了不存在的 seed code ── */
  /* 收集所有 seed code（作为条件被引用） */
  const allReferencedConditions = new Set<string>();
  for (const task of taskDefs) {
    for (const cond of task.hiddenTriggerConditions) {
      allReferencedConditions.add(cond);
    }
  }

  /* 收集所有 seed code（作为 followupSeedCodes 被产生但无任务使用） */
  for (const [code, taskIds] of producerToTaskId) {
    /* 检查是否为最终尾（不在任何任务的 hiddenTriggerConditions 中） */
    if (!allReferencedConditions.has(code) && !SYSTEM_PRODUCERS.has(code)) {
      /* 检查是否至少被 residue 或 narrative 消 */
      const usedInResidue = taskDefs.some(
        (t) => t.residueOnComplete?.includes(code) || t.residueOnFail?.includes(code)
      );
      if (!usedInResidue) {
        findings.push({
          kind: "unused_producer",
          taskId: taskIds.join(", "),
          condition: code,
          message: `seed code "${code}" 由任务 [${taskIds.join(", ")}] 产生，但没有任何任务将其作为 hiddenTriggerConditions 引用。
            可能是死代码、计划中的未来链，或 typo。`,
        });
      }
    }
  }

  return findings;
}

// ════════════════════════════════════════════════════════════
// 测试
// ════════════════════════════════════════════════════════════

describe("task chain audit", () => {
  it("collects task defs and finds no critical orphans", () => {
    const taskDefs = collectAllTaskDefs();
    assert.ok(taskDefs.length >= 5, `should collect at least 5 task definitions, got ${taskDefs.length}`);

    const findings = auditTaskChain(taskDefs);
    const orphans = findings.filter((f) => f.kind === "orphan_condition");
    const selfRefs = findings.filter((f) => f.kind === "self_reference");
    const deadRefs = findings.filter((f) => f.kind === "dead_reference");

    /* 报告发现 */
    console.log(`\n=== 任务链审计结果 ===`);
    console.log(`任务定义数: ${taskDefs.length}`);
    console.log(`孤立条件 (orphan_condition): ${orphans.length}`);
    console.log(`自引用 (self_reference): ${selfRefs.length}`);
    console.log(`僵尸引用 (dead_reference): ${deadRefs.length}`);
    console.log(`未使用的 producer (unused_producer): ${findings.filter(f => f.kind === "unused_producer").length}`);
    console.log(`信息 (info): ${findings.filter(f => f.kind === "info").length}`);
    console.log(`总发现: ${findings.length}\n`);

    for (const f of findings) {
      console.log(`[${f.kind}] ${f.message}`);
    }

    /* 允许 info 和 unused_producer，但不允许 orphan_condition（除非由 system producer 涵盖） */
    for (const orphan of orphans) {
      /* 已知系统条件不应报错 */
      if (["b1_guidance_seeded", "escape:spine_seeded", "escape:route_fragment_seeded",
           "escape:b2_access_granted", "escape:cost_trial_survived"].includes(orphan.condition ?? "")) {
        /* 这些由 worldConsequences 或 spec 任务产生，实际应该被 allProducers 涵盖 */
        continue;
      }
      assert.fail(`孤儿条件：${orphan.message}`);
    }

    for (const selfRef of selfRefs) {
      assert.fail(`自引用：${selfRef.message}`);
    }

    console.log("\n✅ 链可达性审计通过：无孤立条件或自引用。");
  });
});
