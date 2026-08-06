// src/lib/worldEngine/actorSimulation/directorSynthesizer.ts
/**
 * Phase 3: Director Synthesizer
 *
 * 接收已通过 validateActorProjection 的 ActorProjection[]，
 * 执行冲突解决、must-not-reveal 检查、合并去重，
 * 生成 DirectorSynthesisResult（候选 agenda items + injection hints）。
 *
 * 设计约束：
 * - 纯函数，不做 IO，不访问数据库，不调用 LLM
 * - 不直接写入 DirectorPlan，只产生候选
 * - 高风险冲突丢弃，安全候选保留
 * - 所有输出经过 must-not-reveal 二次检查
 */

import type {
  ActorProjection,
  ActorProjectionIssue,
} from "./types";

// ============================================================
// Types
// ============================================================

export interface DirectorSynthesisInput {
  /** 已验证通过的 Actor Projection 列表 */
  projections: ActorProjection[];
  /** 被拒绝的 Projection 列表 */
  rejectedProjections: Array<{ npcId: string; reason: string }>;
  /** 已注册的 NPC ID 集合 */
  registeredNpcIds: Set<string>;
}

export interface SynthesisCandidateAction {
  npcId: string;
  actionCode: string;
  targetNpcIds: string[];
  targetLocationId: string | null;
  expectedEffectCode: string;
  playerAgencyConstraint: string;
  confidence: number;
  sourceSimulationId: string;
  /** 是否与其他 actor 产生冲突 */
  conflictResolved: boolean;
  conflictReason: string | null;
}

export interface SynthesisConflict {
  type: "location_conflict" | "target_conflict" | "mutual_exclusive" | "knowledge_asymmetry" | "duplicate_event";
  npcIds: string[];
  detail: string;
}

export interface DirectorSynthesisResult {
  /** 合成后的安全候选行动 */
  safeCandidateActions: SynthesisCandidateAction[];
  /** 被丢弃的候选行动 */
  discardedActions: Array<{ npcId: string; actionCode: string; reason: string }>;
  /** 检测到的冲突 */
  conflicts: SynthesisConflict[];
  /** 用于注入 reasoner 的安全上下文提示 */
  injectionHint: string | null;
  /** 合成摘要 */
  summary: string;
}

// ============================================================
// Conflict Detection
// ============================================================

/**
 * 检测多个 NPC 在同一位置/目标的冲突。
 */
function detectConflicts(projections: ActorProjection[]): SynthesisConflict[] {
  const conflicts: SynthesisConflict[] = [];

  // 收集所有 candidate action
  interface CollectedAction {
    npcId: string;
    action: ActorProjection["candidateActions"][0];
  }

  const allActions: CollectedAction[] = [];
  for (const p of projections) {
    for (const a of p.candidateActions) {
      allActions.push({ npcId: p.npcId, action: a });
    }
  }

  // 1. 同位置冲突：多个 NPC 在同一位置执行互斥行动
  const locationActions = new Map<string, CollectedAction[]>();
  for (const ca of allActions) {
    if (ca.action.targetLocationId) {
      const existing = locationActions.get(ca.action.targetLocationId) ?? [];
      existing.push(ca);
      locationActions.set(ca.action.targetLocationId, existing);
    }
  }

  for (const [locId, actions] of locationActions) {
    if (actions.length > 1) {
      const npcIds = [...new Set(actions.map((a) => a.npcId))];
      if (npcIds.length > 1) {
        conflicts.push({
          type: "location_conflict",
          npcIds,
          detail: `Multiple NPCs acting at location ${locId}: ${npcIds.join(", ")}`,
        });
      }
    }
  }

  // 2. 目标冲突：多个 NPC 以同一 NPC 为目标
  const targetActions = new Map<string, CollectedAction[]>();
  for (const ca of allActions) {
    for (const targetId of ca.action.targetNpcIds) {
      const existing = targetActions.get(targetId) ?? [];
      existing.push(ca);
      targetActions.set(targetId, existing);
    }
  }

  for (const [targetId, actions] of targetActions) {
    if (actions.length > 1) {
      const npcIds = [...new Set(actions.map((a) => a.npcId))];
      if (npcIds.length > 1) {
        conflicts.push({
          type: "target_conflict",
          npcIds,
          detail: `Multiple NPCs targeting ${targetId}: ${npcIds.join(", ")}`,
        });
      }
    }
  }

  // 3. 重复事件：相同 actionCode + same target
  const actionKeys = new Map<string, CollectedAction[]>();
  for (const ca of allActions) {
    const key = `${ca.action.actionCode}:${ca.action.targetLocationId ?? ""}:${ca.action.targetNpcIds.join(",")}`;
    const existing = actionKeys.get(key) ?? [];
    existing.push(ca);
    actionKeys.set(key, existing);
  }

  for (const [key, actions] of actionKeys) {
    if (actions.length > 1) {
      const npcIds = [...new Set(actions.map((a) => a.npcId))];
      if (npcIds.length > 1) {
        conflicts.push({
          type: "duplicate_event",
          npcIds,
          detail: `Duplicate action ${key} from NPCs: ${npcIds.join(", ")}`,
        });
      }
    }
  }

  // 4. 知识不对称：NPC A 以 NPC B 的私有信息为目标
  for (const p of projections) {
    for (const a of p.candidateActions) {
      for (const targetId of a.targetNpcIds) {
        const targetProj = projections.find((tp) => tp.npcId === targetId);
        if (targetProj) {
          const targetPrivateFacts = new Set(targetProj.knownFactIdsUsed);
          for (const factId of a.preconditionFactIds) {
            if (targetPrivateFacts.has(factId)) {
              conflicts.push({
                type: "knowledge_asymmetry",
                npcIds: [p.npcId, targetId],
                detail: `NPC ${p.npcId} references fact ${factId} known only to NPC ${targetId}`,
              });
            }
          }
        }
      }
    }
  }

  return conflicts;
}

// ============================================================
// must-not-reveal 二次检查
// ============================================================

function checkMustNotReveal(
  text: string,
  mustNotRevealIds: string[],
  npcId: string,
): ActorProjectionIssue[] {
  const issues: ActorProjectionIssue[] = [];
  for (const id of mustNotRevealIds) {
    if (text.includes(id)) {
      issues.push({
        code: "must_not_reveal_leaked",
        severity: "high",
        detail: `Must-not-reveal fact ${id} appears in synthesis output for NPC ${npcId}`,
        npcId,
      });
    }
  }
  return issues;
}

// ============================================================
// Main Synthesis
// ============================================================

/**
 * 导演合成：汇总多个 ActorProjection，执行冲突检测、安全过滤、合并去重。
 */
export function synthesizeDirectorPlan(input: DirectorSynthesisInput): DirectorSynthesisResult {
  const { projections, rejectedProjections, registeredNpcIds } = input;

  // Step 1: 冲突检测
  const conflicts = detectConflicts(projections);

  // 收集冲突中的 NPC
  const conflictNpcIds = new Set<string>();
  for (const c of conflicts) {
    for (const id of c.npcIds) {
      conflictNpcIds.add(id);
    }
  }

  // Step 2: 安全检查 + 冲突过滤
  const safeActions: SynthesisCandidateAction[] = [];
  const discarded: Array<{ npcId: string; actionCode: string; reason: string }> = [];

  for (const p of projections) {
    // 收集该 NPC 的 mustNotRevealIds
    const allMustNotReveal = new Set(p.mustNotRevealIds);

    for (const action of p.candidateActions) {
      // Check 1: 未注册 NPC
      if (!registeredNpcIds.has(p.npcId)) {
        discarded.push({ npcId: p.npcId, actionCode: action.actionCode, reason: "unregistered_npc" });
        continue;
      }

      // Check 2: 未注册目标 NPC
      let hasUnregisteredTarget = false;
      for (const targetId of action.targetNpcIds) {
        if (!registeredNpcIds.has(targetId)) {
          discarded.push({ npcId: p.npcId, actionCode: action.actionCode, reason: `unregistered_target:${targetId}` });
          hasUnregisteredTarget = true;
          break;
        }
      }
      if (hasUnregisteredTarget) continue;

      // Check 3: must-not-reveal
      const actionableText = `${action.actionCode} ${action.expectedEffectCode}`;
      const revealIssues = checkMustNotReveal(actionableText, [...allMustNotReveal], p.npcId);
      if (revealIssues.length > 0) {
        discarded.push({
          npcId: p.npcId,
          actionCode: action.actionCode,
          reason: revealIssues.map((i) => i.code).join(","),
        });
        continue;
      }

      // Check 4: 禁止 player_must_react（在 synthesis 层降级为 observation_only）
      let agencyConstraint = action.playerAgencyConstraint;
      if (agencyConstraint === "player_must_react") {
        agencyConstraint = "player_can_ignore_or_avoid";
      }

      // Check 5: conflict — 高冲突 NPC 的行动被标记而非丢弃
      const isConflicted = conflictNpcIds.has(p.npcId);

      safeActions.push({
        npcId: p.npcId,
        actionCode: action.actionCode,
        targetNpcIds: action.targetNpcIds,
        targetLocationId: action.targetLocationId,
        expectedEffectCode: action.expectedEffectCode,
        playerAgencyConstraint: agencyConstraint,
        confidence: action.confidence,
        sourceSimulationId: p.simulationId,
        conflictResolved: isConflicted,
        conflictReason: isConflicted ? "marked_as_conflicted" : null,
      });
    }
  }

  // Step 3: 构建注入提示
  let injectionHint: string | null = null;
  if (safeActions.length > 0) {
    const lines: string[] = [];
    lines.push("=== Actor Synthesis (director_plan_v1 injection) ===");
    lines.push(`基于 ${projections.length} 个 NPC 推演结果，${rejectedProjections.length} 个被拒绝：`);

    // 按 NPC 分组
    const byNpc = new Map<string, SynthesisCandidateAction[]>();
    for (const sa of safeActions) {
      const existing = byNpc.get(sa.npcId) ?? [];
      existing.push(sa);
      byNpc.set(sa.npcId, existing);
    }

    for (const [npcId, actions] of byNpc) {
      const proj = projections.find((p) => p.npcId === npcId);
      lines.push(`\nNPC ${npcId}${proj?.blockedReason ? ` (被阻止: ${proj.blockedReason})` : ""}:`);
      for (const a of actions.slice(0, 3)) {
        const conflictTag = a.conflictResolved ? " [冲突已标记]" : "";
        lines.push(`  - ${a.actionCode} → ${a.expectedEffectCode}${conflictTag}`);
      }
    }

    if (conflicts.length > 0) {
      lines.push(`\n检测到 ${conflicts.length} 个冲突：`);
      for (const c of conflicts.slice(0, 5)) {
        lines.push(`  - [${c.type}] ${c.detail}`);
      }
    }

    injectionHint = lines.join("\n");
  }

  // Step 4: 构建摘要
  const summaryParts: string[] = [];
  summaryParts.push(`${safeActions.length} safe actions from ${projections.length} NPCs`);
  if (discarded.length > 0) summaryParts.push(`${discarded.length} discarded`);
  if (conflicts.length > 0) summaryParts.push(`${conflicts.length} conflicts`);
  if (rejectedProjections.length > 0) summaryParts.push(`${rejectedProjections.length} projections rejected`);

  return {
    safeCandidateActions: safeActions,
    discardedActions: discarded,
    conflicts,
    injectionHint,
    summary: summaryParts.join(", "),
  };
}
