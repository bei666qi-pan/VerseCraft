// src/lib/turnEngine/commitTurn.ts
/**
 * Phase-4: explicit turn commit step.
 *
 * Goal: separate "fact commitment" from "narrative generation". The authoritative
 * truth of what happened this turn is the `StateDelta`; the narrative is only
 * the presentation layer. `commitTurn` consumes:
 *
 *   - the candidate DM record (post-render / post-resolver),
 *   - the `StateDelta`,
 *   - the `NarrativeValidationReport`,
 *
 * and returns:
 *
 *   - the committed DM record with any validator overrides applied,
 *   - a structured `TurnCommitSummary` suitable for analytics / telemetry.
 *
 * This module is *pure*. All IO (analytics insert, writer.write, DB write)
 * stays in the caller (`route.ts`). This keeps `commitTurn` unit-testable
 * and makes the audit trail of "what committed" independent from "what was
 * actually flushed to the client".
 */
import type { StateDelta } from "@/lib/turnEngine/types";
import { classifyUnsupportedFactReason, type UnsupportedFactReasonCode } from "@/lib/worldFacts/unsupportedFactDetector";
import { languageText } from "@/lib/i18n/gameDisplay";
import type { GameLanguage } from "@/lib/i18n/language";
import type {
  NarrativeSafetyIssue,
  NarrativeSafetyIssueCode,
  NarrativeSafetyReport,
} from "@/lib/turnEngine/narrativeSafety/types";
import {
  planNarrativeSafetyEnforcement,
  type NarrativeSafetyCommitPolicy,
} from "@/lib/turnEngine/narrativeSafety/runtimeConfig";
import type {
  PacingIssueCode,
  PacingValidationReport,
} from "@/lib/turnEngine/pacing";
import type {
  NarrativeValidationIssueCode,
  NarrativeValidationReport,
} from "@/lib/turnEngine/validateNarrative";
import type { FactCommitGateResult } from "@/lib/worldFacts/factCommitGate";
import type { WorldId } from "@/lib/worlds/types";

export const COMMIT_STATE_CHANGING_FIELDS = [
  "player_location",
  "npc_location_updates",
  "relationship_updates",
  "awarded_items",
  "awarded_warehouse_items",
  "new_tasks",
  "task_updates",
  "codex_updates",
  "dm_change_set",
  "foreshadow_ops",
] as const;

export const COMMIT_STATE_MIRROR_FIELDS = [
  "task_changes",
  "relation_changes",
  "loot_changes",
  "world_state_changes",
] as const;

/** Fields the commit step may overwrite on the DM record beyond state-changing
 *  and mirror fields. These include core DM fields, resource tracking, and
 *  UI/output fields. Keep in sync with the commit-step logic in route.ts. */
export const COMMIT_RECORD_OVERRIDE_FIELDS = [
  "is_action_legal",
  "sanity_damage",
  "narrative",
  "is_death",
  "consumes_time",
  "time_cost",
  "consumed_items",
  "currency_change",
  "main_threat_updates",
  "weapon_updates",
  "weapon_bag_updates",
  "options",
  "decision_options",
] as const;

type CommitStateChangingField = (typeof COMMIT_STATE_CHANGING_FIELDS)[number];

const UNKNOWN_ENTITY_WRITE_FIELDS = new Set<CommitStateChangingField>([
  "codex_updates",
  "relationship_updates",
  "npc_location_updates",
  "awarded_items",
  "awarded_warehouse_items",
  "new_tasks",
  "task_updates",
  "player_location",
  "dm_change_set",
]);

const UNKNOWN_ENTITY_CODES = new Set<NarrativeSafetyIssueCode>([
  "unknown_entity_surface",
  "unregistered_npc_id",
  "npc_mentions_unknown_npc",
  "speaker_not_present",
  "offscreen_npc_direct_speech",
  "npc_status_forbidden_direct_speech",
]);

const UNKNOWN_ENTITY_SAFE_NARRATIVE_ZH = "走廊尽头传来短促的动静，但光线与距离让你暂时无法确认来者身份。";
const UNKNOWN_ENTITY_SAFE_NARRATIVE_EN = "A brief sound echoes from the far end of the corridor, but the dim light and distance keep its source unidentifiable.";
const XINGNI_UNKNOWN_ENTITY_SAFE_NARRATIVE_ZH = "风穿过青石县的檐角，眼前人影隔着雨幕尚难辨认；未经登记的身份仍不能当作事实。";
const XINGNI_UNKNOWN_ENTITY_SAFE_NARRATIVE_EN = "Wind passes beneath Qingshi County's eaves. The figure beyond the rain remains indistinct, and an unregistered identity cannot be treated as fact.";

/** 位置/环境安全叙事变体，避免连续 fallback 时反复出现相同文本 */
const SAFE_NARRATIVE_VARIANTS_ZH = [
  "走廊灯管闪了一下，空气里只有老旧的嗡鸣声。你没有发现明确的威胁。",
  "你停下动作，侧耳倾听——只有水管里的水声和远处隐约的电梯响动。",
  "四周恢复了安静。灰白的墙皮在灯光下显得有些斑驳，一切如常。",
  "走廊深处的阴影里什么都没有。你再次确认——目前没有直接的危险。",
  "你的脚步在空荡的楼道里回响。周围没有任何异常的变化。",
];
const SAFE_NARRATIVE_VARIANTS_EN = [
  "A hallway light flickers; only the old hum of the building fills the air. You detect no clear threat.",
  "You stop and listen — nothing but the sound of water in the pipes and the distant rumble of the elevator.",
  "Silence settles back in. The pale walls look mottled under the lights; everything appears normal.",
  "The shadows at the far end of the corridor hold nothing. You confirm — there is no immediate danger.",
  "Your footsteps echo through the empty hallway. Nothing around you has changed.",
];
const XINGNI_SAFE_NARRATIVE_VARIANTS_ZH = [
  "青石县檐角的雨珠落上石板，稀薄灵气缓缓流转；眼前没有能够确认的新威胁。",
  "他停下动作凝神细察，风声越过青石县长街，附近没有出现已登记之外的异状。",
  "青石县四周重新安静下来，潮湿石路映着天光；未经确认的人与事仍藏在沉默之后。",
  "青石县远处传来短促声响，又很快散入风里。他重新确认局势，眼下没有直接危险。",
  "青石县的灵气在经脉间微微一滞，随后恢复平稳。四周没有发生可被确认的异常变化。",
];
const XINGNI_SAFE_NARRATIVE_VARIANTS_EN = [
  "Rain slips from the eaves of Qingshi County onto the stone road while the thin spiritual qi settles. No new threat can be confirmed.",
  "He pauses and focuses. Wind crosses Qingshi County's long street, and nothing outside the registered situation appears nearby.",
  "Qingshi County grows quiet again, daylight reflected on the damp stones. Unconfirmed people and events remain unresolved.",
  "A brief sound carries from somewhere in Qingshi County, then dissolves into the wind. He reassesses and finds no immediate danger.",
  "The spiritual qi of Qingshi County catches briefly in his meridians before settling. No confirmable change has occurred nearby.",
];
const BLOCKED_CONFLICT_SAFE_NARRATIVE_ZH = "眼前的动静尚不足以形成可提交的战果；你停下动作重新确认局势，武器与世界状态没有变化。";
const BLOCKED_CONFLICT_SAFE_NARRATIVE_EN = "The commotion ahead amounts to nothing actionable; you pause to reassess — your weapons and the world state remain unchanged.";
const XINGNI_BLOCKED_CONFLICT_SAFE_NARRATIVE_ZH = "眼前灵机尚不足以形成可提交的战果；他收住动作重新确认局势，法器、伤势与任务进度都没有变化。";
const XINGNI_BLOCKED_CONFLICT_SAFE_NARRATIVE_EN = "The spiritual disturbance is not enough to establish a committed outcome. He stops to reassess; artifact, injuries, and quest progress remain unchanged.";

function getUnknownEntitySafeNarrative(language: GameLanguage, worldId?: WorldId): string {
  return worldId === "xingni_taichu"
    ? languageText(language, XINGNI_UNKNOWN_ENTITY_SAFE_NARRATIVE_ZH, XINGNI_UNKNOWN_ENTITY_SAFE_NARRATIVE_EN)
    : languageText(language, UNKNOWN_ENTITY_SAFE_NARRATIVE_ZH, UNKNOWN_ENTITY_SAFE_NARRATIVE_EN);
}

function getSafeNarrativeVariant(language: GameLanguage, turnIndex: number, worldId?: WorldId): string {
  const variants = worldId === "xingni_taichu"
    ? language === "en-US" ? XINGNI_SAFE_NARRATIVE_VARIANTS_EN : XINGNI_SAFE_NARRATIVE_VARIANTS_ZH
    : language === "en-US" ? SAFE_NARRATIVE_VARIANTS_EN : SAFE_NARRATIVE_VARIANTS_ZH;
  return variants[turnIndex % variants.length] ?? getUnknownEntitySafeNarrative(language, worldId);
}

const ITEM_ACTION_RE = /(捡起|拾起|获得|拿到|收入背包|加入背包|装备|pick up|obtain|add to inventory|equip)/i;

function getIntentAwareSafetyNarrative(args: {
  language: GameLanguage;
  worldId?: WorldId;
  latestUserInput?: string;
  report?: NarrativeSafetyReport | null;
  turnIndex: number;
}): string {
  const issueCodes = new Set((args.report?.issues ?? []).map((issue) => issue.code));
  const issueDetails = (args.report?.issues ?? []).map((issue) => String(issue.detail ?? ""));
  const input = String(args.latestUserInput ?? "");

  if (issueCodes.has("unsupported_relationship_claim")) {
    return languageText(
      args.language,
      "对方没有确认你提出的亲属或旧识关系；没有可核验线索前，这种关系不能成为事实。",
      "They do not confirm the family or prior-acquaintance claim. Without verifiable evidence, that relationship cannot become fact."
    );
  }
  if (
    issueCodes.has("dm_only_fact_leaked_in_narrative") ||
    issueCodes.has("npc_knows_forbidden_fact") ||
    issueCodes.has("unsupported_root_cause_claim")
  ) {
    return languageText(
      args.language,
      "对方没有给出可核验的答案；你目前掌握的线索还不足以确认这类隐秘信息。",
      "They give no verifiable answer; the evidence you hold is not enough to confirm this kind of root cause or end-state information."
    );
  }
  if (
    ITEM_ACTION_RE.test(input) &&
    issueDetails.some((detail) => detail.includes("kind=item") || detail.includes("item_acquisition_without_fact_or_award"))
  ) {
    return languageText(
      args.language,
      "你没有在现场找到与描述相符的已登记物品，因此没有把任何新物品收入背包或装备；背包与装备状态保持不变。",
      "No registered item matching that description is present, so nothing new enters your inventory or equipment; both remain unchanged."
    );
  }
  if (
    issueCodes.has("unknown_entity_surface") &&
    (args.report?.issues ?? []).some((issue) => String(issue.detail ?? "").includes("kind=npc"))
  ) {
    return languageText(
      args.language,
      args.worldId === "xingni_taichu"
        ? "你无法在青石县眼前确认与描述相符的新人物；对方身份没有被核实，因此不会新增或确认角色。"
        : "你无法在现场确认与描述相符的新人物；对方身份没有被核实，因此不会新增或确认角色。",
      "No new person matching that description can be confirmed here. Their identity is unverified, so no character is added or confirmed."
    );
  }
  return getSafeNarrativeVariant(args.language, args.turnIndex, args.worldId);
}

function getBlockedConflictSafeNarrative(language: GameLanguage, worldId?: WorldId): string {
  return worldId === "xingni_taichu"
    ? languageText(language, XINGNI_BLOCKED_CONFLICT_SAFE_NARRATIVE_ZH, XINGNI_BLOCKED_CONFLICT_SAFE_NARRATIVE_EN)
    : languageText(language, BLOCKED_CONFLICT_SAFE_NARRATIVE_ZH, BLOCKED_CONFLICT_SAFE_NARRATIVE_EN);
}

function hasDescribedUnknownPersonIssue(
  report: NarrativeSafetyReport | null | undefined,
  origin: "narrative" | "options"
): boolean {
  return Boolean(
    report?.issues.some(
      (issue) => {
        if (issue.code !== "unknown_entity_surface" || issue.source !== "entityAudit") return false;
        const detail = String(issue.detail ?? "");
        const describesUnknownPerson =
          detail.includes("context=generic_described_person") ||
          detail.includes("context=player_induced_anaphoric_person") ||
          detail.includes("context=unanchored_anaphoric_person");
        if (!describesUnknownPerson) return false;
        // Older reports did not include an origin. Treat them conservatively as
        // narrative issues so an upgrade never weakens existing safeguards.
        return detail.includes(`origin=${origin}`) || (!detail.includes("origin=") && origin === "narrative");
      }
    )
  );
}

function hasCandidateConflictOutcome(record: Record<string, unknown>): boolean {
  return Boolean(record.conflict_outcome && typeof record.conflict_outcome === "object" && !Array.isArray(record.conflict_outcome));
}

export type TurnCommitFlag =
  | "options_rewrite_applied"
  | "safe_narrative_fallback_applied"
  | "narrative_rewrite_applied"
  | "must_degrade_from_delta"
  | "action_illegal"
  | "fact_commit_gate_blocked"
  | "fact_candidates_rejected"
  | "safety_hard_gate_blocked"
  | "pacing_hard_gate_blocked"
  | "structured_updates_stripped"
  | "post_validator_ok"
  | "post_validator_issues"
;

export type TurnCommitSummary = {
  requestId: string;
  sessionId: string | null;
  turnIndex: number;
  isActionLegal: boolean;
  degraded: boolean;
  optionsRewriteApplied: boolean;
  safeNarrativeFallbackApplied: boolean;
  playerLocation: string | null;
  deltaSummary: {
    consumesTime: boolean;
    timeCost: StateDelta["timeCost"] | null;
    sanityDamage: number;
    hpDelta: number | null;
    originiumDelta: number | null;
    isDeath: boolean;
    npcLocationUpdates: number;
    npcAttitudeUpdates: number;
    taskUpdates: number;
    newTasks: number;
  };
  validatorIssueCounts: Partial<Record<NarrativeValidationIssueCode, number>>;
  safetyIssueCounts: Partial<Record<NarrativeSafetyIssueCode, number>>;
  unsupportedFactReasonCounts: Partial<Record<UnsupportedFactReasonCode, number>>;
  pacingIssueCounts: Partial<Record<PacingIssueCode, number>>;
  blockedCommitFields: string[];
  fallbackApplied: boolean;
  entityAuditSummary: {
    strippedFields: Partial<Record<string, number>>;
    strippedUnknownEntityCount: number;
    highIssueCount: number;
    mediumIssueCount: number;
  };
  narrativeGovernanceTelemetry: {
    styleIssueCount: number;
    styleDriftCount: number;
    mechanicalExpositionCount: number;
    npcKnowledgeIssueCount: number;
    rootCauseLeakCount: number;
    unsupportedFactCount: number;
    unsupportedRelationshipClaimCount: number;
    factCommitRejectedCount: number;
    narrativeGovernanceFinalSafe: boolean;
  };
  commitFlags: readonly TurnCommitFlag[];
};

export type CommitTurnArgs = {
  requestId: string;
  sessionId: string | null;
  turnIndex: number;
  /** Current player action, used only to select a bounded, non-leaking safety response. */
  latestUserInput?: string;
  /** Candidate DM record (already resolved + rendered). Treated as read-only. */
  candidateDmRecord: Record<string, unknown>;
  /** Structured delta for the turn. */
  delta: StateDelta;
  /** Validator report from `validateNarrative`. */
  validatorReport: NarrativeValidationReport;
  /** Optional Narrative Safety Kernel report. Pure metadata + commit gate input. */
  safetyReport?: NarrativeSafetyReport | null;
  /** Optional pacing validator report. Pure metadata + commit gate input. */
  pacingReport?: PacingValidationReport | null;
  /** Runtime safety rollout policy. Defaults to hard mode for backward-compatible enforcement. */
  safetyPolicy?: NarrativeSafetyCommitPolicy | null;
  /** Optional PR-3 fact-source gate result. Pure metadata, no IO. */
  factCommitGateResult?: FactCommitGateResult | null;
  /** Player-facing language for safe fallback narrative text. Defaults to "zh-CN". */
  gameLanguage?: GameLanguage;
  /** World scope for deterministic safety copy. Legacy callers default to Dark Moon wording. */
  worldId?: WorldId;
};

export type CommitTurnResult = {
  /** DM record with validator overrides applied (new object; not a mutation). */
  committedDmRecord: Record<string, unknown>;
  summary: TurnCommitSummary;
};

function applyNarrativeOverride(
  base: Record<string, unknown>,
  narrativeOverride: string,
  options: { preserveStateFields?: boolean } = {}
): Record<string, unknown> {
  // `narrativeOverride` is a JSON string from the guard shell. We parse it
  // once and merge; if parsing fails, we keep the original record — the outer
  // output moderation stage still protects the client.
  try {
    const parsed = JSON.parse(narrativeOverride) as Record<string, unknown>;
    // Preserve identity-bearing fields from the original envelope so resolvers
    // downstream do not lose session anchors (e.g. turn_mode hints).
    const preservedKeys = options.preserveStateFields === false ? [] : [
      "player_location",
      "npc_location_updates",
      "awarded_items",
      "awarded_warehouse_items",
      "relationship_updates",
      "codex_updates",
      "task_updates",
      "new_tasks",
    ];
    const merged: Record<string, unknown> = { ...parsed };
    for (const key of preservedKeys) {
      if (base[key] !== undefined) merged[key] = base[key];
    }
    return merged;
  } catch {
    // Narrow validators may provide a repaired narrative string rather than a
    // full JSON fallback envelope. Preserve every structured field and replace
    // presentation text only.
    return narrativeOverride.trim() ? { ...base, narrative: narrativeOverride } : base;
  }
}

function countSafetyIssues(
  report: NarrativeSafetyReport | null | undefined
): Partial<Record<NarrativeSafetyIssueCode, number>> {
  if (!report) return {};
  return { ...report.telemetry.byCode };
}

function countPacingIssues(
  report: PacingValidationReport | null | undefined
): Partial<Record<PacingIssueCode, number>> {
  if (!report) return {};
  return { ...report.telemetry.byCode };
}

function isCommitStateChangingField(value: string): value is CommitStateChangingField {
  return (COMMIT_STATE_CHANGING_FIELDS as readonly string[]).includes(value);
}

function parseIssueField(issue: NarrativeSafetyIssue): CommitStateChangingField | null {
  const detail = issue.detail ?? "";
  const match = detail.match(/(?:^|\|)field=([a-zA-Z0-9_]+)/);
  if (match?.[1] && isCommitStateChangingField(match[1])) return match[1];
  if (issue.anchor && isCommitStateChangingField(issue.anchor)) return issue.anchor;
  return null;
}

function addBlockedField(blocked: Set<string>, field: string): void {
  blocked.add(field);
}

function stripField(
  record: Record<string, unknown>,
  field: string,
  blocked: Set<string>,
  strippedFields: Partial<Record<string, number>>
): Record<string, unknown> {
  if (!(field in record)) return record;
  const next = { ...record };
  const value = next[field];
  strippedFields[field] =
    (strippedFields[field] ?? 0) + (Array.isArray(value) ? value.length : value === undefined ? 0 : 1);
  delete next[field];
  addBlockedField(blocked, field);
  return next;
}

function recordContainsAnchor(value: unknown, anchors: readonly string[]): boolean {
  if (anchors.length === 0) return false;
  const text = JSON.stringify(value ?? "");
  return anchors.some((anchor) => anchor && text.includes(anchor));
}

function stripArrayRowsByAnchors(
  record: Record<string, unknown>,
  field: CommitStateChangingField,
  anchors: readonly string[],
  blocked: Set<string>,
  strippedFields: Partial<Record<string, number>>
): Record<string, unknown> {
  if (!(field in record)) return record;
  const value = record[field];
  if (!Array.isArray(value)) {
    if (anchors.length === 0 || recordContainsAnchor(value, anchors)) {
      return stripField(record, field, blocked, strippedFields);
    }
    return record;
  }
  if (anchors.length === 0) return stripField(record, field, blocked, strippedFields);
  const filtered = value.filter((row) => !recordContainsAnchor(row, anchors));
  const removed = value.length - filtered.length;
  if (removed <= 0) return record;
  strippedFields[field] = (strippedFields[field] ?? 0) + removed;
  addBlockedField(blocked, field);
  return { ...record, [field]: filtered };
}

function collectUnknownEntityRepairs(report: NarrativeSafetyReport | null | undefined): Map<CommitStateChangingField, string[]> {
  const fields = new Map<CommitStateChangingField, string[]>();
  for (const issue of report?.issues ?? []) {
    if (issue.severity === "low") continue;
    if (!UNKNOWN_ENTITY_CODES.has(issue.code)) continue;
    const parsedField = parseIssueField(issue);
    const targetFields =
      parsedField && UNKNOWN_ENTITY_WRITE_FIELDS.has(parsedField)
        ? [parsedField]
        : (["codex_updates", "relationship_updates", "npc_location_updates"] as const);
    for (const field of targetFields) {
      const anchors = fields.get(field) ?? [];
      if (issue.anchor) anchors.push(issue.anchor);
      fields.set(field, anchors);
    }
  }
  return fields;
}

function applySafetyCommitGate(args: {
  record: Record<string, unknown>;
  safetyReport?: NarrativeSafetyReport | null;
  hardBlockCommit: boolean;
  allowUnknownEntityRepairs: boolean;
}): {
  record: Record<string, unknown>;
  blockedCommitFields: string[];
  strippedFields: Partial<Record<string, number>>;
  strippedUnknownEntityCount: number;
} {
  const blocked = new Set<string>();
  const strippedFields: Partial<Record<string, number>> = {};
  let record = args.record;

  if (args.hardBlockCommit) {
    for (const field of COMMIT_STATE_CHANGING_FIELDS) {
      record = stripField(record, field, blocked, strippedFields);
    }
    for (const issue of args.safetyReport?.issues ?? []) {
      const issueField = parseIssueField(issue);
      if (issueField) addBlockedField(blocked, issueField);
    }
    for (const field of COMMIT_STATE_MIRROR_FIELDS) {
      record = stripField(record, field, blocked, strippedFields);
    }
    addBlockedField(blocked, "accepted_delta");
    addBlockedField(blocked, "accepted_events");
    addBlockedField(blocked, "time_cost");
    addBlockedField(blocked, "sanity_damage");
    addBlockedField(blocked, "consumes_time");
    addBlockedField(blocked, "currency_change");
    addBlockedField(blocked, "consumed_items");
    return {
      record,
      blockedCommitFields: [...blocked],
      strippedFields,
      strippedUnknownEntityCount: Object.values(strippedFields).reduce<number>(
        (sum, count) => sum + (count ?? 0),
        0
      ),
    };
  }

  if (!args.allowUnknownEntityRepairs) {
    return {
      record,
      blockedCommitFields: [],
      strippedFields: {},
      strippedUnknownEntityCount: 0,
    };
  }

  const repairs = collectUnknownEntityRepairs(args.safetyReport);
  for (const [field, anchors] of repairs) {
    record = stripArrayRowsByAnchors(record, field, anchors, blocked, strippedFields);
  }

  return {
    record,
    blockedCommitFields: [...blocked],
    strippedFields,
    strippedUnknownEntityCount: Object.values(strippedFields).reduce<number>(
      (sum, count) => sum + (count ?? 0),
      0
    ),
  };
}

function neutralizeAcceptedDeltaFields(
  record: Record<string, unknown>,
  blocked: readonly string[]
): Record<string, unknown> {
  if (!blocked.includes("accepted_delta")) return record;
  const next: Record<string, unknown> = {
    ...record,
    sanity_damage: 0,
    consumes_time: false,
    consumed_items: [],
    currency_change: 0,
    main_threat_updates: [],
    weapon_updates: [],
    weapon_bag_updates: [],
    is_death: false,
  };
  delete next.time_cost;
  return next;
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolOrFallback(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function mergeSecurityMeta(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const prev = (base.security_meta as Record<string, unknown> | undefined) ?? {};
  return { ...base, security_meta: { ...prev, ...patch } };
}

export function commitTurn(args: CommitTurnArgs): CommitTurnResult {
  const { candidateDmRecord, delta, validatorReport } = args;
  const gameLanguage = args.gameLanguage ?? "zh-CN";

  let committed: Record<string, unknown> = { ...candidateDmRecord };
  const flags = new Set<TurnCommitFlag>();
  const safetyIssueCounts = countSafetyIssues(args.safetyReport);
  const unsupportedFactReasonCounts: Partial<Record<UnsupportedFactReasonCode, number>> = {};
  const validatorFactIssues = validatorReport.issues.filter((issue) => String(issue.detail ?? "").startsWith("world_fact:"));
  const factIssues = validatorFactIssues.length > 0
    ? validatorFactIssues
    : (args.safetyReport?.issues ?? []).filter((issue) => issue.source === "unsupportedFactDetector");
  for (const issue of factIssues) {
    const reason = classifyUnsupportedFactReason(String(issue.detail ?? ""));
    unsupportedFactReasonCounts[reason] = (unsupportedFactReasonCounts[reason] ?? 0) + 1;
  }
  const pacingIssueCounts = countPacingIssues(args.pacingReport);
  const safetyHighIssueCount =
    args.safetyReport?.telemetry.bySeverity.high ??
    args.safetyReport?.issues.filter((issue) => issue.severity === "high").length ??
    0;
  const safetyMediumIssueCount =
    args.safetyReport?.telemetry.bySeverity.medium ??
    args.safetyReport?.issues.filter((issue) => issue.severity === "medium").length ??
    0;
  const safetyEnforcement = planNarrativeSafetyEnforcement({
    safetyReport: args.safetyReport,
    pacingReport: args.pacingReport,
    policy: args.safetyPolicy,
  });
  const hardBlockFromSafety = safetyEnforcement.shouldBlockCommit;
  const hardBlockFromPacing = safetyEnforcement.pacingHardGateTriggered;
  const hardBlockCommit =
    delta.isActionLegal === false ||
    hardBlockFromSafety ||
    hardBlockFromPacing ||
    args.factCommitGateResult?.shouldBlockCommit === true;
  if (hardBlockFromSafety) flags.add("safety_hard_gate_blocked");
  if (hardBlockFromPacing) flags.add("pacing_hard_gate_blocked");
  const hasUnknownPersonInNarrative = hasDescribedUnknownPersonIssue(args.safetyReport, "narrative");
  const hasUnknownPersonOnlyInOptions =
    !hasUnknownPersonInNarrative && hasDescribedUnknownPersonIssue(args.safetyReport, "options");

  const effectiveNarrativeOverride = validatorReport.narrativeOverride ?? null;

  if (effectiveNarrativeOverride) {
    const isFallbackEnvelope = effectiveNarrativeOverride.trim().startsWith("{");
    committed = applyNarrativeOverride(committed, effectiveNarrativeOverride, {
      preserveStateFields: !hardBlockCommit,
    });
    flags.add(isFallbackEnvelope ? "safe_narrative_fallback_applied" : "narrative_rewrite_applied");
  } else if (
    hardBlockFromSafety &&
    safetyEnforcement.entityHardGateTriggered &&
    hasUnknownPersonInNarrative
  ) {
    // Entity hard blocks must not leave an invented, player-visible person in
    // place merely because no asynchronous repair model answered. This stays
    // deterministic and final-hook-only, so it adds no first-token latency.
    // Use turn-index-based variant to avoid repetitive identical fallback text.
    const safeNarrative = getIntentAwareSafetyNarrative({
      language: gameLanguage,
      worldId: args.worldId,
      latestUserInput: args.latestUserInput,
      report: args.safetyReport,
      turnIndex: args.turnIndex,
    });
    committed = {
      ...committed,
      narrative: safeNarrative,
      options: [],
    };
    flags.add("safe_narrative_fallback_applied");
  } else if (hardBlockFromSafety && hasUnknownPersonOnlyInOptions) {
    // A bad generated option must not erase an otherwise valid AI narrative.
    // Drop that option set and let the normal option-regeneration flow create
    // a safe replacement after the turn is committed.
    committed = { ...committed, options: [] };
    flags.add("options_rewrite_applied");
  } else if (hardBlockFromSafety && hasCandidateConflictOutcome(candidateDmRecord)) {
    // A hard safety block strips the candidate combat delta. The visible text
    // must not keep claiming a hit, suppression, or weapon loss that was not
    // committed as authoritative state.
    committed = {
      ...committed,
      narrative: getBlockedConflictSafeNarrative(gameLanguage, args.worldId),
      options: [],
    };
    flags.add("safe_narrative_fallback_applied");
  } else if (hardBlockFromSafety && safetyEnforcement.mode === "hard") {
    // A hard safety decision is authoritative for both state and player-visible
    // prose. Leaving the rejected claim in the narrative while stripping only
    // its delta creates a split-brain turn.
    committed = {
      ...committed,
      narrative: getIntentAwareSafetyNarrative({
        language: gameLanguage,
        worldId: args.worldId,
        latestUserInput: args.latestUserInput,
        report: args.safetyReport,
        turnIndex: args.turnIndex,
      }),
      options: [],
    };
    flags.add("safe_narrative_fallback_applied");
  } else if (validatorReport.optionsOverride) {
    committed = { ...committed, options: [...validatorReport.optionsOverride] };
    flags.add("options_rewrite_applied");
  }



  if (delta.mustDegrade) flags.add("must_degrade_from_delta");
  if (delta.isActionLegal === false) flags.add("action_illegal");
  if (args.factCommitGateResult?.shouldBlockCommit) flags.add("fact_commit_gate_blocked");
  if ((args.factCommitGateResult?.rejectedFacts.length ?? 0) > 0) flags.add("fact_candidates_rejected");
  flags.add(validatorReport.ok ? "post_validator_ok" : "post_validator_issues");

  if (args.factCommitGateResult) {
    const audit =
      committed._narrative_audit && typeof committed._narrative_audit === "object" && !Array.isArray(committed._narrative_audit)
        ? (committed._narrative_audit as Record<string, unknown>)
        : {};
    committed = {
      ...committed,
      _narrative_audit: {
        ...audit,
        allowed_fact_ids: args.factCommitGateResult.allowedFacts.map((fact) => fact.factId),
        rejected_fact_ids: args.factCommitGateResult.rejectedFacts
          .map((row) => row.candidate.factId)
          .filter((factId): factId is string => typeof factId === "string" && factId.trim().length > 0),
        fact_commit_blocked: args.factCommitGateResult.shouldBlockCommit,
      },
    };
  }

  const safetyGate = applySafetyCommitGate({
    record: committed,
    safetyReport: args.safetyReport,
    hardBlockCommit,
    allowUnknownEntityRepairs: safetyEnforcement.enabled && safetyEnforcement.mode !== "shadow",
  });
  committed = neutralizeAcceptedDeltaFields(
    safetyGate.record,
    safetyGate.blockedCommitFields
  );
  if (safetyGate.blockedCommitFields.length > 0) flags.add("structured_updates_stripped");

  const factCommitRejectedCount = args.factCommitGateResult?.rejectedFacts.length ?? 0;
  const narrativeGovernanceFinalSafe =
    flags.has("safe_narrative_fallback_applied") ||
    flags.has("narrative_rewrite_applied") ||
    (validatorReport.telemetry.narrativeGovernanceFinalSafe &&
      args.factCommitGateResult?.shouldBlockCommit !== true &&
      !hardBlockFromSafety &&
      !hardBlockFromPacing);
  const narrativeGovernanceTelemetry = {
    styleIssueCount: validatorReport.telemetry.styleIssueCount,
    styleDriftCount: validatorReport.telemetry.styleDriftCount,
    mechanicalExpositionCount: validatorReport.telemetry.mechanicalExpositionCount,
    npcKnowledgeIssueCount: validatorReport.telemetry.npcKnowledgeIssueCount,
    rootCauseLeakCount: validatorReport.telemetry.rootCauseLeakCount,
    unsupportedFactCount: validatorReport.telemetry.unsupportedFactCount,
    unsupportedRelationshipClaimCount: validatorReport.telemetry.unsupportedRelationshipClaimCount,
    factCommitRejectedCount,
    narrativeGovernanceFinalSafe,
  };

  // Attach a compact commit trace to security_meta for debug correlation.
  committed = mergeSecurityMeta(committed, {
    turn_commit: {
      request_id: args.requestId,
      turn_index: args.turnIndex,
      options_rewrite: flags.has("options_rewrite_applied"),
      safe_fallback: flags.has("safe_narrative_fallback_applied"),
      issues: validatorReport.telemetry.totalIssues,
      safety_issue_counts: safetyIssueCounts,
      unsupported_fact_reason_counts: unsupportedFactReasonCounts,
      pacing_issue_counts: pacingIssueCounts,
      safety_policy: {
        mode: safetyEnforcement.mode,
        enabled: safetyEnforcement.enabled,
        decision: safetyEnforcement.decision,
        entity_hard_gate: safetyEnforcement.entityHardGateTriggered,
        pacing_hard_gate: safetyEnforcement.pacingHardGateTriggered,
      },
      blocked_commit_fields: safetyGate.blockedCommitFields,
      fallback_applied: flags.has("safe_narrative_fallback_applied"),
      entity_audit: {
        stripped_fields: safetyGate.strippedFields,
        stripped_unknown_entity_count: safetyGate.strippedUnknownEntityCount,
        high_issue_count: safetyHighIssueCount,
        medium_issue_count: safetyMediumIssueCount,
      },
      fact_gate_blocked: args.factCommitGateResult?.shouldBlockCommit ?? false,
      fact_rejected: factCommitRejectedCount,
      narrative_governance: narrativeGovernanceTelemetry,
    },
  });

  const playerLocation =
    typeof committed.player_location === "string"
      ? committed.player_location
      : hardBlockCommit
        ? null
        : delta.playerLocation ?? null;
  const isFieldBlocked = (field: string): boolean =>
    safetyGate.blockedCommitFields.includes(field);

  const summary: TurnCommitSummary = {
    requestId: args.requestId,
    sessionId: args.sessionId,
    turnIndex: args.turnIndex,
    isActionLegal: delta.isActionLegal !== false,
    degraded:
      flags.has("must_degrade_from_delta") ||
      flags.has("safe_narrative_fallback_applied") ||
      hardBlockCommit,
    optionsRewriteApplied: flags.has("options_rewrite_applied"),
    safeNarrativeFallbackApplied: flags.has("safe_narrative_fallback_applied"),
    playerLocation,
    deltaSummary: {
      consumesTime: boolOrFallback(committed.consumes_time, delta.consumesTime),
      timeCost: hardBlockCommit ? null : delta.timeCost ?? null,
      sanityDamage: numberOrNull(committed.sanity_damage) ?? delta.sanityDamage,
      hpDelta: hardBlockCommit ? null : typeof delta.hpDelta === "number" ? delta.hpDelta : null,
      originiumDelta: hardBlockCommit ? null : typeof delta.originiumDelta === "number" ? delta.originiumDelta : null,
      isDeath: boolOrFallback(committed.is_death, delta.isDeath),
      npcLocationUpdates:
        hardBlockCommit || isFieldBlocked("npc_location_updates")
          ? arrayCount(committed.npc_location_updates)
          : delta.npcLocationUpdates.length,
      npcAttitudeUpdates: delta.npcAttitudeUpdates.length,
      taskUpdates:
        hardBlockCommit || isFieldBlocked("task_updates")
          ? arrayCount(committed.task_updates)
          : delta.taskUpdates.length,
      newTasks:
        hardBlockCommit || isFieldBlocked("new_tasks")
          ? arrayCount(committed.new_tasks)
          : delta.newTasks.length,
    },
    validatorIssueCounts: {
      ...validatorReport.telemetry.byCode,
      ...(args.factCommitGateResult?.shouldBlockCommit
        ? {
            fact_commit_gate_blocked:
              ((validatorReport.telemetry.byCode.fact_commit_gate_blocked ?? 0) + 1),
          }
        : {}),
    },
    safetyIssueCounts,
    unsupportedFactReasonCounts,
    pacingIssueCounts,
    blockedCommitFields: safetyGate.blockedCommitFields,
    fallbackApplied: flags.has("safe_narrative_fallback_applied"),
    entityAuditSummary: {
      strippedFields: safetyGate.strippedFields,
      strippedUnknownEntityCount: safetyGate.strippedUnknownEntityCount,
      highIssueCount: safetyHighIssueCount,
      mediumIssueCount: safetyMediumIssueCount,
    },
    narrativeGovernanceTelemetry,
    commitFlags: [...flags],
  };

  return { committedDmRecord: committed, summary };
}
