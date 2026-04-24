// src/lib/turnEngine/validateNarrative.ts
/**
 * Phase-4: post-generation narrative validator.
 *
 * Contract:
 *   validateNarrative({ dmRecord, delta, epistemicFilter?, intent?, riskTags? })
 *     => NarrativeValidationReport
 *
 * This is a *pure* function. It MUST NOT mutate the inputs and MUST NOT perform
 * IO. It is the last explicit consistency seam before `commitTurn` and before
 * the final `__VERSECRAFT_FINAL__` envelope is written to the client.
 *
 * What it checks (narrow, code-reviewable rules):
 *
 *   - dm_only_fact_leaked_in_narrative:
 *       Any world-truth fact whose content keywords appear inside the narrative
 *       string. We use overlapping 3-char CJK windows for keyword extraction
 *       (see `extractFactKeywords`) because Chinese proper nouns often overlap
 *       with surface phrases.
 *   - location_conflict_with_delta:
 *       `dm.player_location` disagrees with `delta.playerLocation` when both
 *       are present (and the turn is not a system transition).
 *   - reveal_tier_breach:
 *       `telemetry.revealGatedCount > 0` signals facts the filter had to gate
 *       because the current actor lacks the required reveal rank. Narrative
 *       and options must not silently leak those via residueFacts either.
 *   - offscreen_npc_referenced_in_options:
 *       An option string names an NPC id or display name that is NOT present
 *       in the scene per `actorScopedFacts`/`scenePublicFacts` ownership hints.
 *       Kept conservative: only flags exact id references.
 *   - options_empty_or_degenerate / options_duplicate_only:
 *       Structural guards on the options array. The caller may choose to let
 *       the existing quality gate handle these; we still surface them here so
 *       analytics can distinguish "validator caught it" vs "gate caught it".
 *   - options_conflict_with_scene_affordance:
 *       An option tells the player to do something that directly conflicts
 *       with `delta.isActionLegal === false` or `delta.mustDegrade === true`
 *       (e.g. combat move on a degraded turn).
 *
 * When any issue fires, the validator tries a *narrow* rewrite:
 *   - If options are the problem, propose a `optionsOverride` drawn from the
 *     safe fallback list.
 *   - If the narrative leaks DM-only facts or has a reveal tier breach, the
 *     safest answer is a narrative rewrite via `safeBlockedDmJson`; we expose
 *     that via `narrativeOverride`.
 *
 * The caller (`commitTurn`) is responsible for applying overrides.
 */
import { safeBlockedDmJson } from "@/lib/security/policy";
import type { EpistemicFilterResult } from "@/lib/turnEngine/epistemic/types";
import type { KnowledgeFact } from "@/lib/epistemic/types";
import type {
  NormalizedPlayerIntent,
  StateDelta,
} from "@/lib/turnEngine/types";

export type NarrativeValidationIssueCode =
  | "dm_only_fact_leaked_in_narrative"
  | "location_conflict_with_delta"
  | "reveal_tier_breach"
  | "offscreen_npc_referenced_in_options"
  | "options_empty_or_degenerate"
  | "options_duplicate_only"
  | "options_conflict_with_scene_affordance"
  | "inventory_conflict"
  | "time_feel_drift"
  | "task_mode_mismatch"
  | "npc_consistency_bridge";

export type NarrativeValidationIssue = {
  code: NarrativeValidationIssueCode;
  /** Machine-readable sub-reason to help analytics distinguish instances. */
  detail?: string;
  /** Optional fact id / option index for targeted rewrites. */
  anchor?: string;
  /**
   * Severity hint. Pure information — downstream decides what to do.
   * - "low": safe to log, narrative is still shippable.
   * - "medium": prefer to rewrite narrowly (options override, etc.).
   * - "high": must degrade narrative to safe fallback.
   */
  severity: "low" | "medium" | "high";
};

export type NarrativeValidationTelemetry = {
  totalIssues: number;
  byCode: Partial<Record<NarrativeValidationIssueCode, number>>;
  /** Whether the validator picked a narrow options override. */
  optionsOverrideApplied: boolean;
  /** Whether the validator fell all the way back to a safe narrative. */
  safeNarrativeFallbackApplied: boolean;
};

export type NarrativeValidationReport = {
  ok: boolean;
  issues: NarrativeValidationIssue[];
  /** Non-null when the validator wants the caller to replace options. */
  optionsOverride: string[] | null;
  /**
   * Non-null when the validator wants the caller to replace the entire
   * DM JSON with a safe-blocked shell. Structure matches `safeBlockedDmJson`.
   */
  narrativeOverride: string | null;
  telemetry: NarrativeValidationTelemetry;
};

export type ValidateNarrativeArgs = {
  /**
   * Resolved DM record ("candidate envelope"). Treated as read-only; the
   * validator builds overrides but never mutates the input.
   */
  dmRecord: Record<string, unknown>;
  /** Structured state delta for the current turn. */
  delta: StateDelta;
  /**
   * Classified cognitive view for the current actor. Optional because some
   * turns (e.g. pure system transitions) have no meaningful epistemic frame.
   */
  epistemicFilter?: EpistemicFilterResult | null;
  /** Normalized player intent; used to relax rules on system transitions. */
  intent?: NormalizedPlayerIntent | null;
  /**
   * Scene NPC ids / display names present in the turn. Used to flag offscreen
   * NPC references in options. Caller may leave empty — we then skip the
   * offscreen-option check.
   */
  sceneNpcIds?: readonly string[];
  /** Risk tags from control preflight; used only for telemetry detail. */
  riskTags?: readonly string[];
  /** Safe-narrative message used for high-severity fallback. */
  safeFallbackMessage?: string;
  /**
   * Phase-5: bridged telemetry from `applyNpcConsistencyPostGeneration` so this
   * report becomes the single post-generation source of truth. When > 0 we
   * surface one `npc_consistency_bridge` issue so analytics & commit see a
   * unified picture. The actual rewrites happen inside `applyNpc...` before
   * the validator runs.
   */
  npcConsistencyIssueCount?: number;
};

/**
 * 选项覆盖策略：不再注入既定文案。
 * 当验证器判断模型返回的 options 存在问题时，仅以“清空”形式下发覆盖信号
 * （空数组 → caller 识别“需要重新向大模型请求实时选项”），避免用罐头短句
 * 冒充实时模型输出，继而掩盖大模型链路真实故障。
 * 下游 route 在 Phase-8.5 会在此信号后再调用 `generateOptionsOnlyFallback`。
 */
const CLEAR_OPTIONS_SIGNAL: readonly string[] = [];

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) {
    if (isString(x) && x.trim().length > 0) out.push(x.trim());
  }
  return out;
}

/**
 * Extract overlapping 3-char CJK windows from the fact content.
 *
 * Rationale: Chinese proper nouns / phrase fragments often overlap with
 * surface narrative ("七锚闭环" vs "七锚闭环的根因…"). A single strict
 * 3-8 char match is too greedy *and* misses partial matches; overlapping
 * 3-grams gives a tight but reliable leak signal.
 */
export function extractFactKeywords(content: string): string[] {
  if (!isString(content) || !content.trim()) return [];
  const runs = content.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const out = new Set<string>();
  for (const run of runs) {
    if (run.length < 3) continue;
    for (let i = 0; i + 3 <= run.length && out.size < 64; i += 1) {
      out.add(run.slice(i, i + 3));
    }
  }
  return [...out];
}

function narrativeContainsAnyKeyword(narrative: string, keywords: readonly string[]): string | null {
  if (!isString(narrative) || !narrative.trim()) return null;
  for (const k of keywords) {
    if (k.length >= 3 && narrative.includes(k)) return k;
  }
  return null;
}

/**
 * Detect an NPC id or bracketed display name that cannot be present in the
 * current scene. Conservative: we only flag *exact* id references to avoid
 * false positives from common verbs / pronouns.
 */
function detectOffscreenNpcInOption(option: string, sceneNpcIds: readonly string[]): string | null {
  if (!sceneNpcIds.length) return null;
  const candidates = option.match(/\b(N-\d{3,6})\b/g) ?? [];
  for (const c of candidates) {
    if (!sceneNpcIds.includes(c)) return c;
  }
  return null;
}

function hasOnlyDuplicates(options: readonly string[]): boolean {
  if (options.length <= 1) return false;
  const unique = new Set(options.map((x) => x.replace(/\s+/g, "")));
  return unique.size === 1;
}

function isDegenerateOptions(options: readonly string[]): boolean {
  if (options.length === 0) return true;
  const clean = options.map((x) => x.trim()).filter((x) => x.length > 0);
  if (clean.length === 0) return true;
  if (clean.length === 1 && clean[0].length < 2) return true;
  return false;
}

function optionLooksLikeCombatVerb(opt: string): boolean {
  return /(攻击|袭击|开枪|射击|挥刀|刺杀|砍|扑向|反击|压制|反杀)/.test(opt);
}

/**
 * Narrative uses acquisition verbs ("捡起 / 拾起 / 获得 / 收进 / 收下 / 装进口袋").
 *
 * Conservative pattern: only flag when narrative explicitly says "acquired
 * something" but the structured awards are empty AND there are no new tasks.
 * Avoids false positives on generic verbs like "拿着某物观察".
 */
const INVENTORY_ACQUISITION_PATTERN =
  /(捡起|拾起|收进口袋|放进口袋|装进背包|放入背包|收下了|得到了|获得了)/;

/**
 * Long-duration time cues that would be inconsistent with `consumesTime=false`.
 * We intentionally leave short cues (“片刻/瞬间/一瞬”) alone because the main
 * model tends to use them in free lanes harmlessly.
 */
const LONG_TIME_FEEL_PATTERN =
  /(过去了?(?:好)?几(?:十)?分钟|过去了半小时|过了(?:一|两|几)个小时|一整天过去|天色(?:已)?黑|夜深了)/;

/**
 * Narrative claims a task/quest was completed/closed.
 */
const TASK_COMPLETION_CLAIM_PATTERN =
  /(任务(?:已)?完成|任务(?:已)?结束|线索(?:已)?达成|支线(?:已)?达成|委托(?:已)?完成)/;

function countFactKeywords(facts: readonly KnowledgeFact[]): string[] {
  const out: string[] = [];
  for (const f of facts) {
    const content = (f as { content?: unknown }).content;
    if (!isString(content)) continue;
    for (const k of extractFactKeywords(content)) {
      out.push(k);
    }
  }
  return out;
}

export function validateNarrative(args: ValidateNarrativeArgs): NarrativeValidationReport {
  const issues: NarrativeValidationIssue[] = [];
  const dm = args.dmRecord;
  const narrative = isString(dm.narrative) ? dm.narrative : "";
  const options = asStringArray(dm.options);
  const intentIsSystemTransition = Boolean(args.intent?.isSystemTransition);

  // 1. DM-only fact leak detection.
  if (args.epistemicFilter && narrative) {
    const dmKeywords = countFactKeywords(args.epistemicFilter.dmOnlyFacts);
    const leaked = narrativeContainsAnyKeyword(narrative, dmKeywords);
    if (leaked) {
      issues.push({
        code: "dm_only_fact_leaked_in_narrative",
        detail: `keyword:${leaked}`,
        severity: "high",
      });
    }
  }

  // 2. Location conflict. Skip for system transitions where the narrative is
  //    intentionally meta (settlement, resurrection screens, etc.).
  if (!intentIsSystemTransition) {
    const dmLoc = isString(dm.player_location) ? dm.player_location.trim() : "";
    const deltaLoc = args.delta.playerLocation?.trim() ?? "";
    if (dmLoc && deltaLoc && dmLoc !== deltaLoc) {
      issues.push({
        code: "location_conflict_with_delta",
        detail: `dm=${dmLoc}|delta=${deltaLoc}`,
        severity: "medium",
      });
    }
  }

  // 3. Reveal tier breach (gate count from the filter telemetry).
  if (
    args.epistemicFilter?.telemetry?.revealGatedCount &&
    args.epistemicFilter.telemetry.revealGatedCount > 0
  ) {
    issues.push({
      code: "reveal_tier_breach",
      detail: `gated=${args.epistemicFilter.telemetry.revealGatedCount}`,
      severity: "medium",
    });
  }

  // 4. Offscreen NPC in options.
  if (args.sceneNpcIds && args.sceneNpcIds.length > 0) {
    for (let i = 0; i < options.length; i += 1) {
      const offscreen = detectOffscreenNpcInOption(options[i], args.sceneNpcIds);
      if (offscreen) {
        issues.push({
          code: "offscreen_npc_referenced_in_options",
          detail: `npc=${offscreen}`,
          anchor: `option[${i}]`,
          severity: "medium",
        });
      }
    }
  }

  // 5. Degenerate options.
  if (isDegenerateOptions(options)) {
    issues.push({
      code: "options_empty_or_degenerate",
      detail: `count=${options.length}`,
      severity: "low",
    });
  } else if (hasOnlyDuplicates(options)) {
    issues.push({
      code: "options_duplicate_only",
      detail: `count=${options.length}`,
      severity: "low",
    });
  }

  // 6. Options conflict with scene affordance (e.g. combat verb on illegal/mustDegrade turn).
  if (args.delta.mustDegrade || args.delta.isActionLegal === false) {
    for (let i = 0; i < options.length; i += 1) {
      if (optionLooksLikeCombatVerb(options[i])) {
        issues.push({
          code: "options_conflict_with_scene_affordance",
          detail: "combat_verb_on_degraded_turn",
          anchor: `option[${i}]`,
          severity: "medium",
        });
      }
    }
  }

  // 7. inventory_conflict: narrative claims acquisition, but structured awards
  //    are empty. We do NOT try to be exhaustive here — the goal is to catch
  //    the common class where the model writes "你捡起了那个徽章" but neither
  //    `awarded_items` nor `awarded_warehouse_items` contain anything.
  if (!intentIsSystemTransition && narrative && INVENTORY_ACQUISITION_PATTERN.test(narrative)) {
    const awardedItems = Array.isArray((dm as { awarded_items?: unknown }).awarded_items)
      ? ((dm as { awarded_items: unknown[] }).awarded_items as unknown[])
      : [];
    const awardedWarehouse = Array.isArray(
      (dm as { awarded_warehouse_items?: unknown }).awarded_warehouse_items
    )
      ? ((dm as { awarded_warehouse_items: unknown[] }).awarded_warehouse_items as unknown[])
      : [];
    if (awardedItems.length === 0 && awardedWarehouse.length === 0) {
      issues.push({
        code: "inventory_conflict",
        detail: "narrative_claims_acquisition_without_awarded_items",
        severity: "medium",
      });
    }
  }

  // 8. time_feel_drift: narrative says meaningful time passed but delta says
  //    the turn does not consume time. Only fires for RULE/REVEAL shapes of
  //    turns — system transitions skip.
  if (!intentIsSystemTransition && narrative && LONG_TIME_FEEL_PATTERN.test(narrative)) {
    if (args.delta.consumesTime === false && args.delta.timeCost !== "heavy" && args.delta.timeCost !== "dangerous") {
      issues.push({
        code: "time_feel_drift",
        detail: "narrative_long_duration_without_time_cost",
        severity: "low",
      });
    }
  }

  // 9. task_mode_mismatch: narrative claims task completion without any
  //    structured task update / new task. Low severity (UX annoyance), but
  //    useful for analytics to spot drifting turn-mode agreement.
  if (!intentIsSystemTransition && narrative && TASK_COMPLETION_CLAIM_PATTERN.test(narrative)) {
    const hasTaskSignal =
      args.delta.taskUpdates.length > 0 || args.delta.newTasks.length > 0;
    if (!hasTaskSignal) {
      issues.push({
        code: "task_mode_mismatch",
        detail: "narrative_claims_task_completion_without_delta",
        severity: "low",
      });
    }
  }

  // 10. npc_consistency_bridge: absorb upstream `applyNpcConsistencyPostGeneration`
  //     telemetry so downstream analytics get a single unified view.
  if (args.npcConsistencyIssueCount && args.npcConsistencyIssueCount > 0) {
    issues.push({
      code: "npc_consistency_bridge",
      detail: `upstream_issues=${args.npcConsistencyIssueCount}`,
      severity: "low",
    });
  }

  // ---- Decide overrides ----
  const byCode: Partial<Record<NarrativeValidationIssueCode, number>> = {};
  for (const issue of issues) {
    byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
  }

  const hasHigh = issues.some((x) => x.severity === "high");
  const hasMediumOptionsIssue = issues.some(
    (x) =>
      x.severity === "medium" &&
      (x.code === "offscreen_npc_referenced_in_options" ||
        x.code === "options_conflict_with_scene_affordance")
  );
  const hasOptionsShapeIssue = issues.some(
    (x) => x.code === "options_empty_or_degenerate" || x.code === "options_duplicate_only"
  );

  let optionsOverride: string[] | null = null;
  let narrativeOverride: string | null = null;

  if (hasHigh) {
    const safeMessage =
      args.safeFallbackMessage ?? "这里的信息你此刻还看不真切，先按下心神，换一种方式继续。";
    narrativeOverride = safeBlockedDmJson(safeMessage, {
      action: "degrade",
      stage: "post_model",
      riskLevel: "gray",
      reason: "narrative_validator_high_severity",
    });
  } else if (hasMediumOptionsIssue || hasOptionsShapeIssue) {
    // 不再注入罐头短句；用空数组作为“需要重新生成实时选项”的显式信号。
    // caller（api/chat 的 Phase-8.5）会在看到非空 optionsOverride 为空数组时，
    // 重新调用 `generateOptionsOnlyFallback` 以获得大模型实时输出。
    optionsOverride = [...CLEAR_OPTIONS_SIGNAL];
  }

  const telemetry: NarrativeValidationTelemetry = {
    totalIssues: issues.length,
    byCode,
    optionsOverrideApplied: optionsOverride !== null,
    safeNarrativeFallbackApplied: narrativeOverride !== null,
  };

  return {
    ok: issues.length === 0,
    issues,
    optionsOverride,
    narrativeOverride,
    telemetry,
  };
}
