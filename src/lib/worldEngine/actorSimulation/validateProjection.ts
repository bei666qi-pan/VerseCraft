// src/lib/worldEngine/actorSimulation/validateProjection.ts
/**
 * Phase 3: Actor Projection Validator
 *
 * 纯函数 validator，检查 Actor 推演候选输出的合法性。
 * 不做 IO，不访问数据库，不读写文件，不调用 LLM。
 *
 * 检查项：
 * - NPC 是否注册
 * - 事实来源是否合法
 * - 是否泄露禁止信息
 * - 位置是否可达
 * - 谣言是否被写成确定事实
 * - 是否强制玩家行动/失败
 */

import type {
  ActorProjection,
  ActorProjectionIssue,

} from "./types";

// ============================================================
// Public API
// ============================================================

export interface ValidateProjectionArgs {
  projection: ActorProjection;
  /** 注册的 NPC ID 集合 */
  registeredNpcIds: Set<string>;
  /** 该 NPC 被允许的已知事实 ID */
  allowedKnownFactIds: Set<string>;
  /** 该 NPC 禁止的事实 ID */
  forbiddenFactIds: Set<string>;
  /** 注册的位置 ID 集合 */
  registeredLocationIds?: Set<string>;
  registeredActionCodes?: Set<string>;
}

export interface ValidateProjectionResult {
  accepted: boolean;
  issues: ActorProjectionIssue[];
  /** 高严重度问题数 */
  highSeverityCount: number;
}

/**
 * 验证单个 Actor Projection。
 * 返回 accepted=false 表示该投影应被丢弃。
 */
export function validateActorProjection(args: ValidateProjectionArgs): ValidateProjectionResult {
  const {
    projection,
    registeredNpcIds,
    allowedKnownFactIds,
    forbiddenFactIds,
    registeredLocationIds = new Set(),
    registeredActionCodes = new Set(),
  } = args;

  const issues: ActorProjectionIssue[] = [];

  // 1. NPC 注册检查
  if (!registeredNpcIds.has(projection.npcId)) {
    issues.push({
      code: "unregistered_npc",
      severity: "high",
      detail: `NPC ${projection.npcId} is not registered`,
      npcId: projection.npcId,
    });
  }

  // 2. 使用的 known fact 必须在允许列表中
  for (const factId of projection.knownFactIdsUsed) {
    if (!allowedKnownFactIds.has(factId)) {
      issues.push({
        code: "forbidden_fact_used",
        severity: "high",
        detail: `Fact ${factId} is not in NPC's allowed knowledge`,
        npcId: projection.npcId,
      });
    }
  }

  // 3. mustNotReveal 中的事实不得出现在任何输出中
  const forbiddenSet = new Set(projection.mustNotRevealIds);
  for (const factId of forbiddenFactIds) {
    forbiddenSet.add(factId);
  }

  const allOutputText = [
    projection.intent,
    ...projection.candidateActions.map((a) => a.actionCode),
    ...projection.candidateActions.map((a) => a.expectedEffectCode),
  ].join(" ");

  for (const factId of forbiddenSet) {
    if (allOutputText.includes(factId)) {
      issues.push({
        code: "must_not_reveal_leaked",
        severity: "high",
        detail: `Forbidden fact ${factId} appears in projection output`,
        npcId: projection.npcId,
      });
    }
  }

  // 4. 检查 dmOnly 事实泄露（通过 fact source ID 前缀判断）
  for (const factId of projection.knownFactIdsUsed) {
    if (factId.startsWith("dm_") || factId.startsWith("dmOnly_")) {
      issues.push({
        code: "dm_only_fact_in_projection",
        severity: "high",
        detail: `DM-only fact ${factId} referenced in projection`,
        npcId: projection.npcId,
      });
    }
  }

  // 5. 位置可达性检查
  for (const action of projection.candidateActions) {
    if (registeredActionCodes.size > 0 && !registeredActionCodes.has(action.actionCode)) {
      issues.push({
        code: "unregistered_action",
        severity: "high",
        detail: `Action ${action.actionCode} is not registered for this world`,
        npcId: projection.npcId,
      });
    }
    if (action.targetLocationId && !registeredLocationIds.has(action.targetLocationId)) {
      issues.push({
        code: "location_impossible",
        severity: "medium",
        detail: `Target location ${action.targetLocationId} is not registered`,
        npcId: projection.npcId,
      });
    }
  }

  // 6. 谣言/假设必须保留不确定性
  const rumorPatterns = /rumor|hypothesis|false_belief|推测|怀疑|可能|据说|传闻/i;
  const deterministicPatterns = /确定|一定|肯定|必然|毫无疑问|已经发生/;
  for (const action of projection.candidateActions) {
    const actionText = `${action.actionCode} ${action.expectedEffectCode}`;
    if (rumorPatterns.test(actionText) && deterministicPatterns.test(actionText)) {
      issues.push({
        code: "rumor_as_fact",
        severity: "medium",
        detail: "Rumor/hypothesis phrased as definitive fact",
        npcId: projection.npcId,
      });
    }
  }

  // 7. 不得强制玩家行动
  for (const action of projection.candidateActions) {
    if (action.playerAgencyConstraint === "player_must_react") {
      issues.push({
        code: "forced_player_action",
        severity: "high",
        detail: `Action ${action.actionCode} forces player reaction`,
        npcId: projection.npcId,
      });
    }
  }

  // 8. 检查是否有强制性失败效果
  const failurePatterns = /player_defeat|player_death|unavoidable_failure|强制失败|必定死亡/;
  for (const action of projection.candidateActions) {
    if (failurePatterns.test(action.expectedEffectCode)) {
      issues.push({
        code: "forced_player_failure",
        severity: "high",
        detail: `Action ${action.actionCode} implies forced player failure`,
        npcId: projection.npcId,
      });
    }
  }

  // 9. 缺少事实来源检查
  if (projection.knownFactIdsUsed.length === 0 && projection.candidateActions.length > 0) {
    issues.push({
      code: "missing_source",
      severity: "high",
      detail: "Projection has actions but no fact sources cited",
      npcId: projection.npcId,
    });
  }

  // 10. 揭示层级越界检查
  const highTierFacts = projection.knownFactIdsUsed.filter(
    (id) => id.includes("tier_3") || id.includes("root_truth")
  );
  if (highTierFacts.length > 0) {
    issues.push({
      code: "reveal_tier_breach",
      severity: "high",
      detail: `High-tier facts referenced: ${highTierFacts.join(", ")}`,
      npcId: projection.npcId,
    });
  }

  const highSeverityCount = issues.filter((i) => i.severity === "high").length;

  return {
    accepted: highSeverityCount === 0,
    issues,
    highSeverityCount,
  };
}
