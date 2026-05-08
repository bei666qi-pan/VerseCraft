import {
  applyNpcConsistencyPostGeneration as applyNpcConsistencyPostGenerationCore,
} from "@/lib/npcConsistency/validator";
import {
  validateNarrative as validateNarrativeCore,
  type NarrativeValidationIssue,
  type NarrativeValidationIssueCode,
  type NarrativeValidationReport,
  type NarrativeValidationTelemetry,
  type ValidateNarrativeArgs,
} from "@/lib/turnEngine/validateNarrative";
import type { SceneActorGateResult } from "@/lib/playRealtime/sceneActorGate";
import { getVerseCraftRolloutFlags } from "@/lib/rollout/versecraftRolloutFlags";
import { recordSceneActorGateValidatorOutcome } from "@/lib/observability/versecraftRolloutMetrics";
import {
  buildFallbackModelOutput,
  MODEL_OUTPUT_FALLBACK_NARRATIVE,
  ModelOutputZodSchema,
  type ModelOutputSchema,
} from "./schema";
import { writeNarrativeRunBestEffort } from "./narrativeRunRepository";
import { writeStoryEventBestEffort } from "./storyEventRepository";
import type { DialogueContext } from "./types";

export type {
  NarrativeValidationIssue,
  NarrativeValidationIssueCode,
  NarrativeValidationReport,
  NarrativeValidationTelemetry,
  ValidateNarrativeArgs,
};

export function validateNarrative(args: ValidateNarrativeArgs): NarrativeValidationReport {
  return validateNarrativeCore(args);
}

export type ApplyNpcConsistencyPostGenerationInput = Parameters<
  typeof applyNpcConsistencyPostGenerationCore
>[0];
export type ApplyNpcConsistencyPostGenerationResult = ReturnType<
  typeof applyNpcConsistencyPostGenerationCore
>;

export function applyNpcConsistencyPostGeneration(
  input: ApplyNpcConsistencyPostGenerationInput
): ApplyNpcConsistencyPostGenerationResult {
  return applyNpcConsistencyPostGenerationCore(input);
}

export type NarrativeCheckIssue = {
  code: string;
  severity: "info" | "warn" | "block";
  message: string;
  path?: string;
};

export type NarrativeCheckResult = {
  ok: boolean;
  parsed: ModelOutputSchema | null;
  issues: NarrativeCheckIssue[];
  safeOutput: ModelOutputSchema | null;
  degradeReason?: string;
};

export type NarrativeCheckLogger = (input: {
  context: DialogueContext;
  result: NarrativeCheckResult;
}) => Promise<unknown> | unknown;

export function checkModelOutput(args: {
  output: unknown;
  context: DialogueContext;
  sceneActorGate?: SceneActorGateResult | null;
  logger?: NarrativeCheckLogger | null;
  logFailures?: boolean;
}): NarrativeCheckResult {
  const issues: NarrativeCheckIssue[] = detectDangerousFields(args.output);
  const parsedResult = ModelOutputZodSchema.safeParse(args.output);

  if (!parsedResult.success) {
    for (const issue of parsedResult.error.issues) {
      issues.push({
        code: "schema_invalid",
        severity: "block",
        message: issue.message,
        path: issue.path.join(".") || undefined,
      });
    }
    const result = buildCheckResult({
      parsed: null,
      issues,
      safeOutput: buildFallbackModelOutput(),
    });
    recordCheckFailure(args, result);
    return result;
  }

  const parsed = parsedResult.data;
  issues.push(...checkWorldNpcRevealLayer(parsed, args.context));
  issues.push(...checkNarrativeStateAlignmentLayer(parsed, args.context));
  const sceneActorGateIssues = getVerseCraftRolloutFlags().enableSceneActorGateValidatorV1
    ? checkSceneActorGateStructuredPermissions(parsed, args.context, args.sceneActorGate)
    : [];
  issues.push(...sceneActorGateIssues);

  const safeOutput = buildSafeOutput(parsed, issues, args.context);
  const sceneActorGateValidatorTriggered = sceneActorGateIssues.length > 0;
  recordSceneActorGateValidatorOutcome({
    validatorTriggered: sceneActorGateValidatorTriggered,
    rewriteTriggered: sceneActorGateValidatorTriggered && safeOutput !== parsed,
  });
  const result = buildCheckResult({ parsed, issues, safeOutput });
  recordCheckFailure(args, result);
  return result;
}

function buildCheckResult(args: {
  parsed: ModelOutputSchema | null;
  issues: NarrativeCheckIssue[];
  safeOutput: ModelOutputSchema | null;
}): NarrativeCheckResult {
  const block = args.issues.find((issue) => issue.severity === "block");
  return {
    ok: !block,
    parsed: args.parsed,
    issues: args.issues,
    safeOutput: args.safeOutput,
    ...(block ? { degradeReason: block.code } : {}),
  };
}

function recordCheckFailure(
  args: {
    context: DialogueContext;
    logger?: NarrativeCheckLogger | null;
    logFailures?: boolean;
  },
  result: NarrativeCheckResult
): void {
  if (result.issues.length === 0 || args.logFailures === false) return;
  const logger = args.logger ?? defaultNarrativeCheckLogger;
  if (!logger) return;
  void Promise.resolve(logger({ context: args.context, result })).catch(() => undefined);
}

async function defaultNarrativeCheckLogger(input: {
  context: DialogueContext;
  result: NarrativeCheckResult;
}): Promise<void> {
  const block = input.result.issues.find((issue) => issue.severity === "block");
  const turnIndex = inferNextTurnIndex(input.context);
  const summary = block
    ? `模型输出校验失败：${block.code}`
    : "模型输出存在叙事一致性风险，已记录。";
  await Promise.all([
    writeNarrativeRunBestEffort({
      requestId: input.context.requestId,
      sessionId: input.context.sessionId,
      userId: input.context.userId,
      turnIndex,
      validatorIssueCount: input.result.issues.length,
      degradeReason: input.result.degradeReason ?? null,
      meta: {
        modelOutputCheck: {
          ok: input.result.ok,
          issues: input.result.issues,
        },
      },
    }),
    writeStoryEventBestEffort({
      requestId: input.context.requestId,
      sessionId: input.context.sessionId,
      userId: input.context.userId,
      turnIndex,
      worldId: input.context.world.worldId,
      chapterId: input.context.chapter.chapterId,
      sceneId: input.context.chapter.sceneId,
      actorType: "system",
      eventType: "consistency_degrade",
      summary,
      payload: {
        ok: input.result.ok,
        degradeReason: input.result.degradeReason ?? null,
        issues: input.result.issues,
      },
      committed: false,
    }),
  ]);
}

function checkWorldNpcRevealLayer(
  output: ModelOutputSchema,
  context: DialogueContext
): NarrativeCheckIssue[] {
  const issues: NarrativeCheckIssue[] = [];

  if (!context.activeNpc && containsNpcInnerMonologue(output.narrative)) {
    issues.push({
      code: "npc_inner_monologue_without_active_npc",
      severity: "block",
      message: "activeNpc 不存在时，模型不能输出明确 NPC 内心独白。",
      path: "narrative",
    });
  }
  output.eventCandidates.forEach((candidate, index) => {
    if (!context.activeNpc && (candidate.actorType === "npc" || candidate.type === "npc_reply")) {
      issues.push({
        code: "npc_event_without_active_npc",
        severity: "block",
        message: "activeNpc 不存在时，模型不能提交 NPC 回复事件。",
        path: `eventCandidates.${index}`,
      });
    }
  });

  for (const leak of findForbiddenFactLeaks(output, context)) {
    issues.push(leak);
  }

  const unlockedFactIds = new Set([
    ...context.player.knownFactIds,
    ...context.player.discoveredClueIds,
  ]);
  output.revealAttempts.forEach((factId, index) => {
    if (!unlockedFactIds.has(factId)) {
      issues.push({
        code: "reveal_attempt_locked_fact",
        severity: "block",
        message: `模型尝试揭示未解锁事实：${factId}`,
        path: `revealAttempts.${index}`,
      });
    }
  });

  for (const entityIssue of findUnauthorizedEntityReferences(output, context)) {
    issues.push(entityIssue);
  }

  output.eventCandidates.forEach((candidate, index) => {
    if (candidate.actorType === "npc") {
      for (const eventId of collectPayloadIds(candidate.payload, [
        "eventId",
        "relatedEventId",
        "knowsEventId",
        "relatedEventIds",
        "knowsEventIds",
      ])) {
        if (!context.recentEvents.some((event) => String(event.id) === eventId)) {
          issues.push({
            code: "npc_knows_unoccurred_event",
            severity: "block",
            message: `NPC 事件引用了未发生或不可确认的事件：${eventId}`,
            path: `eventCandidates.${index}.payload`,
          });
        }
      }
    }

    const ruleKey = stringProp(candidate.payload, "ruleFactKey") ?? stringProp(candidate.payload, "ruleId");
    if (ruleKey && !isKnownWorldRule(ruleKey, context)) {
      issues.push({
        code: "unknown_world_rule_reference",
        severity: "block",
        message: `模型引用了未进入上下文的世界规则：${ruleKey}`,
        path: `eventCandidates.${index}.payload`,
      });
    }
  });

  return issues;
}

function checkNarrativeStateAlignmentLayer(
  output: ModelOutputSchema,
  context: DialogueContext
): NarrativeCheckIssue[] {
  const issues: NarrativeCheckIssue[] = [];

  if (narrativeClaimsAcquisition(output.narrative) && !hasAcquisitionRecord(output)) {
    issues.push({
      code: "narrative_acquisition_without_state_record",
      severity: "warn",
      message: "narrative 声称获得物品或线索，但结构化变更没有对应记录。",
      path: "narrative",
    });
  }

  const nextLocation = output.stateChanges.playerLocation;
  if (nextLocation && nextLocation !== context.player.locationId && !narrativeHasMigrationCue(output.narrative)) {
    issues.push({
      code: "location_change_without_migration_narrative",
      severity: "warn",
      message: "stateChanges 改变了地点，但 narrative 缺少可感知的迁移过程。",
      path: "stateChanges.playerLocation",
    });
  }

  output.eventCandidates.forEach((candidate, index) => {
    if (candidate.type !== "fact_unlock") return;
    const factId = stringProp(candidate.payload, "factId") ?? stringProp(candidate.payload, "factKey");
    const minRevealTier = numberProp(candidate.payload, "minRevealTier");
    if (factId && context.world.forbiddenFactIds.includes(factId)) {
      issues.push({
        code: "fact_unlock_forbidden_fact",
        severity: "block",
        message: `fact_unlock 试图解锁当前认知边界禁止的事实：${factId}`,
        path: `eventCandidates.${index}`,
      });
    }
    if (minRevealTier != null && minRevealTier > context.world.revealTier) {
      issues.push({
        code: "fact_unlock_reveal_tier_breach",
        severity: "block",
        message: `fact_unlock 需要 revealTier ${minRevealTier}，当前仅为 ${context.world.revealTier}。`,
        path: `eventCandidates.${index}.payload.minRevealTier`,
      });
    }
  });

  (output.stateChanges.relationshipUpdates ?? []).forEach((update, index) => {
    const npcId = stringProp(update, "npcId") ?? stringProp(update, "actorId");
    if (!npcId || !isAllowedEntityId(npcId, context)) {
      issues.push({
        code: "relationship_update_unknown_npc",
        severity: "block",
        message: `relationshipUpdates 引用了不存在或未进入上下文的 NPC：${npcId ?? "missing"}`,
        path: `stateChanges.relationshipUpdates.${index}`,
      });
    }
  });

  (output.stateChanges.taskUpdates ?? []).forEach((update, index) => {
    const taskId = stringProp(update, "taskId") ?? stringProp(update, "id");
    if (!taskId) {
      issues.push({
        code: "task_update_missing_task_id",
        severity: "block",
        message: "taskUpdates 缺少 taskId。",
        path: `stateChanges.taskUpdates.${index}`,
      });
      return;
    }
    if (!isAllowedEntityId(taskId, context) && !isLegalNewTask(taskId, update, output)) {
      issues.push({
        code: "task_update_unknown_task",
        severity: "block",
        message: `taskUpdates 引用了未登记任务，且不是合法新任务：${taskId}`,
        path: `stateChanges.taskUpdates.${index}`,
      });
    }
  });

  return issues;
}

function checkSceneActorGateStructuredPermissions(
  output: ModelOutputSchema,
  context: DialogueContext,
  sceneActorGate: SceneActorGateResult | null | undefined
): NarrativeCheckIssue[] {
  if (!sceneActorGate) return [];

  const issues: NarrativeCheckIssue[] = [];
  const canSpeakNpcIds = new Set(
    sceneActorGate.canSpeakNpcIds.map((id) => normalizeSceneNpcId(id)).filter((id): id is string => Boolean(id))
  );
  const npcCurrentLocationMap = buildNpcCurrentLocationMap(context, sceneActorGate);
  const knownLocationIds = new Set(Object.values(npcCurrentLocationMap).filter(Boolean));
  if (sceneActorGate.currentLocation) knownLocationIds.add(sceneActorGate.currentLocation);

  (output.stateChanges.relationshipUpdates ?? []).forEach((update, index) => {
    const npcId = normalizeSceneNpcId(stringProp(update, "npcId") ?? stringProp(update, "actorId"));
    if (!npcId || !canSpeakNpcIds.has(npcId)) {
      issues.push({
        code: "scene_actor_gate_relationship_unauthorized",
        severity: "block",
        message: `SceneActorGate 未授权该 NPC 关系变更：${npcId ?? "missing"}`,
        path: `stateChanges.relationshipUpdates.${index}`,
      });
    }
  });

  (output.stateChanges.npcLocationUpdates ?? []).forEach((update, index) => {
    const npcId = normalizeSceneNpcId(
      stringProp(update, "npcId") ?? stringProp(update, "id") ?? stringProp(update, "actorId")
    );
    if (!npcId || !npcCurrentLocationMap[npcId]) {
      issues.push({
        code: "scene_actor_gate_npc_location_unknown",
        severity: "block",
        message: `SceneActorGate 无法确认该 NPC 的当前位置，禁止写入位置变更：${npcId ?? "missing"}`,
        path: `stateChanges.npcLocationUpdates.${index}`,
      });
      return;
    }

    const targetLocation =
      stringProp(update, "toLocation") ??
      stringProp(update, "to_location") ??
      stringProp(update, "location") ??
      stringProp(update, "currentLocation");
    if (!targetLocation || !knownLocationIds.has(targetLocation)) {
      issues.push({
        code: "scene_actor_gate_npc_location_unknown_target",
        severity: "block",
        message: `SceneActorGate 无法确认目标位置，禁止凭空移动 NPC：${targetLocation ?? "missing"}`,
        path: `stateChanges.npcLocationUpdates.${index}`,
      });
    }
  });

  output.eventCandidates.forEach((candidate, index) => {
    if (candidate.actorType !== "npc") return;
    const actorId = normalizeSceneNpcId(candidate.actorId);
    if (!actorId || !canSpeakNpcIds.has(actorId)) {
      issues.push({
        code: "scene_actor_gate_npc_event_unauthorized",
        severity: "block",
        message: `SceneActorGate 未授权该 NPC 事件：${actorId ?? "missing"}`,
        path: `eventCandidates.${index}.actorId`,
      });
    }
  });

  return issues;
}

function buildSafeOutput(
  parsed: ModelOutputSchema,
  issues: NarrativeCheckIssue[],
  context: DialogueContext
): ModelOutputSchema {
  if (!issues.some((issue) => issue.severity === "block")) return parsed;
  const safeNarrative = scrubUnsafeNarrative(parsed.narrative, context);
  return buildFallbackModelOutput(safeNarrative);
}

function detectDangerousFields(value: unknown): NarrativeCheckIssue[] {
  const issues: NarrativeCheckIssue[] = [];
  const dangerous = new Set([
    "snapshot",
    "runSnapshot",
    "runSnapshotV2",
    "clientState",
    "gameState",
    "saveSlots",
    "useGameStore",
    "zustandState",
    "fullState",
    "overwriteSnapshot",
    "replaceSnapshot",
    "statePatch",
    "stateDelta",
  ]);
  const visit = (node: unknown, path: string, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}.${index}`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (dangerous.has(key)) {
        issues.push({
          code: "dangerous_field_present",
          severity: "block",
          message: `模型输出包含禁止字段：${key}`,
          path: childPath,
        });
      }
      visit(child, childPath, depth + 1);
    }
  };
  visit(value, "", 0);
  return issues;
}

function findForbiddenFactLeaks(
  output: ModelOutputSchema,
  context: DialogueContext
): NarrativeCheckIssue[] {
  const issues: NarrativeCheckIssue[] = [];
  const forbiddenTokens = buildForbiddenFactTokens(context);
  if (forbiddenTokens.length === 0) return issues;
  const textFields = collectOutputTextFields(output);
  for (const field of textFields) {
    const matched = forbiddenTokens.find((token) => field.text.includes(token));
    if (!matched) continue;
    issues.push({
      code: "forbidden_fact_leak",
      severity: "block",
      message: `模型输出泄露了当前上下文禁止的事实：${matched}`,
      path: field.path,
    });
  }
  return issues;
}

function findUnauthorizedEntityReferences(
  output: ModelOutputSchema,
  context: DialogueContext
): NarrativeCheckIssue[] {
  const issues: NarrativeCheckIssue[] = [];
  const checkText = (text: string, path: string, allowPlayerActionText = false) => {
    if (allowPlayerActionText) return;
    for (const id of extractEntityIds(text)) {
      if (!isAllowedEntityId(id, context)) {
        issues.push({
          code: "unauthorized_entity_reference",
          severity: "block",
          message: `模型引用了未登记或未进入上下文的实体 ID：${id}`,
          path,
        });
      }
    }
  };
  checkText(output.narrative, "narrative");
  output.decisionOptions.forEach((option, index) => checkText(option, `decisionOptions.${index}`));
  output.consistencyNotes.forEach((note, index) => checkText(note, `consistencyNotes.${index}`));

  const nextLocation = output.stateChanges.playerLocation;
  if (nextLocation && !isAllowedEntityId(nextLocation, context)) {
    issues.push({
      code: "unknown_location_change",
      severity: "block",
      message: `stateChanges.playerLocation 指向未登记地点：${nextLocation}`,
      path: "stateChanges.playerLocation",
    });
  }

  output.eventCandidates.forEach((candidate, index) => {
    const allowPlayerActionText = candidate.type === "player_action" && candidate.actorType === "player";
    checkText(candidate.summary, `eventCandidates.${index}.summary`, allowPlayerActionText);
    if (candidate.actorId && candidate.actorId !== "player" && !isAllowedEntityId(candidate.actorId, context)) {
      issues.push({
        code: "unauthorized_actor_reference",
        severity: "block",
        message: `事件 actorId 未进入上下文：${candidate.actorId}`,
        path: `eventCandidates.${index}.actorId`,
      });
    }
    for (const [payloadPath, payloadText] of collectPayloadText(candidate.payload)) {
      checkText(payloadText, `eventCandidates.${index}.payload.${payloadPath}`, allowPlayerActionText);
    }
  });

  return issues;
}

function scrubUnsafeNarrative(narrative: string, context: DialogueContext): string {
  const forbiddenTokens = buildForbiddenFactTokens(context);
  const sentences = narrative
    .split(/(?<=[。！？!?])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const safeSentences = sentences.filter((sentence) => {
    if (forbiddenTokens.some((token) => sentence.includes(token))) return false;
    return extractEntityIds(sentence).every((id) => isAllowedEntityId(id, context));
  });
  const safe = safeSentences.join("");
  return safe.length >= 8 ? safe : MODEL_OUTPUT_FALLBACK_NARRATIVE;
}

function buildForbiddenFactTokens(context: DialogueContext): string[] {
  const tokens = new Set(context.world.forbiddenFactIds);
  for (const fact of context.world.loreFacts) {
    if (context.world.forbiddenFactIds.includes(fact.factKey) && fact.canonicalText.trim()) {
      tokens.add(fact.canonicalText.trim());
    }
  }
  return [...tokens].filter((token) => token.length >= 3);
}

function collectOutputTextFields(output: ModelOutputSchema): Array<{ path: string; text: string }> {
  const fields: Array<{ path: string; text: string }> = [
    { path: "narrative", text: output.narrative },
  ];
  output.decisionOptions.forEach((text, index) => fields.push({ path: `decisionOptions.${index}`, text }));
  output.revealAttempts.forEach((text, index) => fields.push({ path: `revealAttempts.${index}`, text }));
  output.consistencyNotes.forEach((text, index) => fields.push({ path: `consistencyNotes.${index}`, text }));
  output.eventCandidates.forEach((candidate, index) => {
    fields.push({ path: `eventCandidates.${index}.summary`, text: candidate.summary });
    for (const [payloadPath, payloadText] of collectPayloadText(candidate.payload)) {
      fields.push({ path: `eventCandidates.${index}.payload.${payloadPath}`, text: payloadText });
    }
  });
  return fields;
}

function collectPayloadText(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix || "$", value]];
  if (typeof value === "number" || typeof value === "boolean") return [[prefix || "$", String(value)]];
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPayloadText(item, prefix ? `${prefix}.${index}` : String(index)));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectPayloadText(child, prefix ? `${prefix}.${key}` : key)
  );
}

function collectPayloadIds(payload: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" || typeof value === "number") out.push(String(value));
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" || typeof item === "number") out.push(String(item));
      }
    }
  }
  return out;
}

function containsNpcInnerMonologue(text: string): boolean {
  return /(内心独白|心里想|心想|暗想|真正想法|不敢说出口|脑中闪过|心底里|inner monologue|secretly thought)/i.test(text);
}

function narrativeClaimsAcquisition(text: string): boolean {
  return /(获得|得到|拿到|捡起|拾起|收进|放入背包|装进背包|found|picked up|obtained|acquired)/i.test(text);
}

function narrativeHasMigrationCue(text: string): boolean {
  return /(走|来到|进入|穿过|离开|移动|返回|抵达|上楼|下楼|推开|沿着|转入|step|move|enter|leave|walk|return|arrive)/i.test(text);
}

function hasAcquisitionRecord(output: ModelOutputSchema): boolean {
  if ((output.stateChanges.clueUpdates ?? []).length > 0) return true;
  return output.eventCandidates.some((candidate) => {
    if (candidate.type === "clue_found" || candidate.type === "fact_unlock" || candidate.type === "state_change") {
      return collectPayloadIds(candidate.payload, [
        "itemId",
        "itemIds",
        "awardedItemId",
        "awardedItemIds",
        "clueId",
        "factId",
      ]).length > 0;
    }
    return false;
  });
}

function isKnownWorldRule(ruleKey: string, context: DialogueContext): boolean {
  if (context.world.loreFacts.some((fact) => fact.factKey === ruleKey)) return true;
  return context.world.hardRules.some((rule) => rule.includes(ruleKey));
}

function isAllowedEntityId(id: string, context: DialogueContext): boolean {
  if (id === "player" || id === context.player.locationId || id === context.chapter.sceneId) return true;
  if (context.activeNpc?.npcId === id) return true;
  if (context.world.allowedEntityIds.includes(id)) return true;
  if (context.player.knownFactIds.includes(id) || context.player.discoveredClueIds.includes(id)) return true;
  if (context.world.loreFacts.some((fact) => fact.factKey === id)) return true;
  return false;
}

function extractEntityIds(text: string): string[] {
  const matches = text.match(
    /\b(?:N-\d{3,6}|I-[A-Za-z0-9-]+|W-[A-Za-z0-9-]+|A-[A-Za-z0-9_-]+|T-[A-Za-z0-9_-]+|C-[A-Za-z0-9_-]+|B\d_[A-Za-z0-9_]+|F\d_[A-Za-z0-9_]+|task:[A-Za-z0-9:_-]+|clue:[A-Za-z0-9:_-]+|fact:[A-Za-z0-9:_-]+|world:[A-Za-z0-9:_-]+)\b/g
  );
  return [...new Set(matches ?? [])];
}

function normalizeSceneNpcId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^N-(\d{3,6})$/i);
  return match ? `N-${match[1]}` : null;
}

function buildNpcCurrentLocationMap(
  context: DialogueContext,
  sceneActorGate: SceneActorGateResult
): Record<string, string> {
  const out: Record<string, string> = {};
  const gateMap = (sceneActorGate as unknown as { npcCurrentLocationMap?: unknown }).npcCurrentLocationMap;
  if (gateMap && typeof gateMap === "object" && !Array.isArray(gateMap)) {
    for (const [rawNpcId, rawLocation] of Object.entries(gateMap as Record<string, unknown>)) {
      const npcId = normalizeSceneNpcId(rawNpcId);
      if (npcId && typeof rawLocation === "string" && rawLocation.trim()) out[npcId] = rawLocation.trim();
    }
  }

  for (const match of context.rawCompatibility.playerContext.matchAll(/\b(N-\d{3,6})@([A-Za-z0-9_-]+)\b/gi)) {
    const npcId = normalizeSceneNpcId(match[1]);
    const location = match[2]?.trim();
    if (npcId && location) out[npcId] = location;
  }

  return out;
}

function stringProp(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberProp(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isLegalNewTask(
  taskId: string,
  update: Record<string, unknown>,
  output: ModelOutputSchema
): boolean {
  const status = stringProp(update, "status") ?? stringProp(update, "kind");
  const hasTitle = Boolean(stringProp(update, "title") ?? stringProp(update, "summary"));
  const hasStartEvent = output.eventCandidates.some((candidate) => {
    if (candidate.type !== "task_started") return false;
    const payloadTaskId = stringProp(candidate.payload, "taskId") ?? stringProp(candidate.payload, "id");
    return payloadTaskId === taskId;
  });
  return /^task:[A-Za-z0-9:_-]+$/.test(taskId) && hasTitle && hasStartEvent && /^(new|active|started)$/i.test(status ?? "");
}

function inferNextTurnIndex(context: DialogueContext): number {
  const last = context.recentEvents.reduce((max, event) => Math.max(max, event.turnIndex), 0);
  return last + 1;
}
