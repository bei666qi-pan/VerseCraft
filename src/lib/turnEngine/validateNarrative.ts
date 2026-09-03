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
 * When any issue fires, the validator stays non-blocking for player-visible
 * prose. It may clear invalid options so the caller can regenerate them, but
 * narrative governance issues are reported through telemetry and structured
 * commit gates rather than replacing the story text.
 *
 * The caller (`commitTurn`) is responsible for applying overrides.
 *
 * NOTE: Narrative length validation (under_min, far_under_min, over_max,
 * too_few_info_beats) is NOT in this module. It lives in
 * `src/lib/turnEngine/narrativeLength.ts` (`assessNarrativeLength`) and is
 * called from `route.ts` post-generation. That validator is purely code-driven:
 * it counts chars via `countCompactChars` and compares against the server-side
 * resolved `NarrativeBudget` — it does NOT depend on the model having seen
 * `narrativeBudgetBlock` guidance in the prompt. The prompt budget block
 * (`narrative_budget_packet` JSON injected into dynamic suffix) is advisory
 * guidance to the model; the real enforcement is in `narrativeLength.ts`.
 *
 * For telemetry, `narrativeLengthTelemetry.ts` wraps the assessment into
 * analytics-friendly fields (`narrativeUnderMin`, `narrativeOverMax`, etc.).
 *
 * Under-minimum recovery is deterministic; it never re-requests the model.
 */
import { resolveActionsFromNarrative, getBackfillTelemetrySummary, type ActionBackfillResult } from "@/lib/turnEngine/actionResolver";
import { getVerseCraftStyleProfile, type VerseCraftStyleProfile } from "@/lib/narrativeStyle/styleBible";
import {
  validateNarrativeStyle,
  type NarrativeStyleIssueCode,
  type NarrativeStyleValidationReport,
} from "@/lib/narrativeStyle/styleValidator";
import type { NpcKnowledgePacket } from "@/lib/npcKnowledge/npcKnowledgeResolver";
import {
  validateNpcKnowledgeInNarrative,
  type NpcKnowledgeValidationIssueCode,
  type NpcKnowledgeValidationReport,
} from "@/lib/npcKnowledge/npcKnowledgeValidator";
import {
  detectUnsupportedFacts,
  type UnsupportedFactIssueCode,
  type UnsupportedFactDetectorReport,
} from "@/lib/worldFacts/unsupportedFactDetector";
import { findRegisteredItemById } from "@/lib/registry/itemLookup";
import { softenPendingCandidateFacts } from "@/lib/worldFacts/candidateNarrativeGuard";
import { normalizeNarrativeAuditPayload, type NarrativeAuditPayload } from "@/lib/worldFacts/narrativeAudit";
import {
  validateItemUseNarrative,
  type ItemUseValidationReport,
} from "@/lib/turnEngine/validators/itemUseValidator";
import { listWorldFacts } from "@/lib/worldFacts/worldFactRegistry";
import type { EpistemicFilterResult } from "@/lib/turnEngine/epistemic/types";
import type { KnowledgeFact } from "@/lib/epistemic/types";
import type {
  NormalizedPlayerIntent,
  StateDelta,
} from "@/lib/turnEngine/types";
import { NPCS } from "@/lib/registry/npcs";
import { NPC_ALIAS_FLAT_SET } from "@/lib/registry/npcAliases";
import { extractChineseNames, isHighConfidenceUnregisteredPersonName } from "@/lib/narrative/extractChineseNames";
import { NAME_STOPWORDS } from "@/lib/narrative/nameStopwords";

/** 已注册的真名集合（含 alias）：从 NPCS + NPC_ALIASES 派生 */
const NPC_NAME_SET: ReadonlySet<string> = new Set([
  ...NPCS.map((n) => n.name),
  ...NPC_ALIAS_FLAT_SET,
]);

/** alias 子集（仅 NPC_ALIASES 中列出的） */
const NPC_ALIAS_SET: ReadonlySet<string> = NPC_ALIAS_FLAT_SET;

/**
 * v4 全链路人名白名单：从 narrative 中抽取未注册人名。
 * 与 route.ts final guard 二次扫描保持同一份算法。
 */
export function validateNarrativePersonNames(args: {
  narrative: string;
  sceneNpcIds?: readonly string[];
}): NarrativeValidationIssue[] {
  const issues: NarrativeValidationIssue[] = [];
  if (!args.narrative) return issues;
  const extracted = extractChineseNames(args.narrative, {
    registeredNames: NPC_NAME_SET,
    aliases: NPC_ALIAS_SET,
  });
  // 只检查 candidate=true 且未注册的项
  const unregistered = extracted.filter((e) => e.candidate && !e.registered);
  if (unregistered.length > 0) {
    // 只对 2 字以上且非 stopword 的 token 报
    const reportable = unregistered.filter(
      (e) => e.token.length >= 2 && !NAME_STOPWORDS.has(e.token) && isHighConfidenceUnregisteredPersonName(e),
    );
    // 去重：用 .slice(0, 2) 规范化（避免 3-char "陈昆从" 重复报 2 次）
    const seen = new Set<string>();
    for (const u of reportable) {
      const canonical = u.token.slice(0, 2);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      issues.push({
        code: "narrative_unregistered_person_name",
        severity: "high",
        detail: `narrative 中出现未注册人名 token: ${u.token}（前后文：${u.contextBefore}|${u.contextAfter}）`,
      });
    }
  }
  // 检查 alias 误用：alias 不应被当成独立人名引用（保留位；当前所有 alias 已在 NPC_NAME_SET 内，不会触发）
  return issues;
}

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
  | "npc_consistency_bridge"
  | "style_drift"
  | "mechanical_exposition"
  | "narrative_style_bridge"
  | "npc_knows_forbidden_fact"
  | "npc_mentions_unknown_npc"
  | "npc_relationship_fabrication"
  | "floor_knowledge_overreach"
  | "root_cause_leak"
  | "rumor_stated_as_fact"
  | "unsupported_new_fact"
  | "unsupported_relationship_claim"
  | "unsupported_root_cause_claim"
  | "unsupported_location_claim"
  | "unsupported_event_stage_claim"
  | "fact_id_not_allowed"
  | "used_fact_id_missing_from_registry"
  | "fact_commit_gate_blocked"
  | "narrative_unregistered_person_name"
  | "narrative_alias_misuse"
  | "item_not_in_inventory"
  | "item_effect_type_mismatch"
  | "item_consumed_not_in_structured"
  | "social_event_must_not_reveal_leaked";

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
  narrativeStyleIssueCount?: number;
  narrativeStyleByCode?: Partial<Record<NarrativeStyleIssueCode, number>>;
  narrativeStyleProfileId?: string;
  npcKnowledgeByCode?: Partial<Record<NpcKnowledgeValidationIssueCode, number>>;
  unsupportedFactIssueCount?: number;
  unsupportedFactByCode?: Partial<Record<UnsupportedFactIssueCode, number>>;
  styleIssueCount: number;
  styleDriftCount: number;
  mechanicalExpositionCount: number;
  npcKnowledgeIssueCount: number;
  rootCauseLeakCount: number;
  unsupportedFactCount: number;
  unsupportedRelationshipClaimCount: number;
  factCommitRejectedCount: number;
  narrativeGovernanceFinalSafe: boolean;
  /** Whether the validator picked a narrow options override. */
  optionsOverrideApplied: boolean;
  /** Whether the validator fell all the way back to a safe narrative. */
  safeNarrativeFallbackApplied: boolean;
  /** Bounded narrative-action signal for audit only; it never commits state. */
  actionBackfill?: ReturnType<typeof getBackfillTelemetrySummary>;
};

export type NarrativeValidationReport = {
  ok: boolean;
  issues: NarrativeValidationIssue[];
  /** Non-null when the validator wants the caller to replace options. */
  optionsOverride: string[] | null;
  /**
   * Non-null when the validator wants the caller to replace the entire
   * DM JSON with a non-story retry shell.
   */
  narrativeOverride: string | null;
  /**
   * Retained for report compatibility. Always null: narrative is never an
   * authoritative item source.
   */
  awardedItemsOverride: unknown[] | null;
  telemetry: NarrativeValidationTelemetry;
};

export type ValidateNarrativeArgs = {
  /**
   * Resolved DM record ("candidate envelope"). Treated as read-only; the
   * validator builds overrides but never mutates the input.
   */
  dmRecord: Record<string, unknown>;
  /** Current player action, used only to bind contextual entity ids for deterministic fact checks. */
  latestUserInput?: string;
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
  /**
   * Phase-5: bridged telemetry from `applyNpcConsistencyPostGeneration` so this
   * report becomes the single post-generation source of truth. When > 0 we
   * surface one `npc_consistency_bridge` issue so analytics & commit see a
   * unified picture. The actual rewrites happen inside `applyNpc...` before
   * the validator runs.
   */
  npcConsistencyIssueCount?: number;
  /** Feature-flagged from route.ts; default false preserves legacy callers/tests. */
  narrativeStyleValidationEnabled?: boolean;
  styleValidationReport?: NarrativeStyleValidationReport | null;
  styleProfile?: VerseCraftStyleProfile | null;
  narrativeStyleFocus?: string | null;
  /** Phase-2.6: 近 3 回合 register 分布（用于 register_repetition 检测）。 */
  recentRegisters?: readonly string[] | null;
  npcKnowledgeValidationEnabled?: boolean;
  npcKnowledgeValidationReport?: NpcKnowledgeValidationReport | null;
  npcKnowledgePacket?: NpcKnowledgePacket | null;
  speakerNpcId?: string | null;
  npcKnowledgeMaxRevealRank?: number;
  unsupportedFactDetectionEnabled?: boolean;
  unsupportedFactReport?: UnsupportedFactDetectorReport | null;
  allowedFactIds?: readonly string[];
  scenePublicFactIds?: readonly string[];
  actorScopedFactIds?: readonly string[];
  sessionCommittedFactIds?: readonly string[];
  factDetectionMaxRevealRank?: number;
  /** Current client inventory ids, used only for conservative possession checks. */
  inventoryItemIds?: readonly string[];
  /** Social event must_not_reveal terms — narrative/options must not leak these. */
  socialEventMustNotRevealTerms?: readonly string[];
};

/**
 * 选项覆盖策略：不再注入既定文案。
 * 当验证器判断模型返回的 options 存在问题时，仅以“清空”形式下发覆盖信号
 * （空数组 → caller 识别“需要重新向大模型请求实时选项”），避免用罐头短句
 * 冒充实时模型输出，继而掩盖大模型链路真实故障。
 * 下游 PlayerTurnWorkflow 在唯一 Finalizer 前使用确定性选项补全处理该信号。
 */
const CLEAR_OPTIONS_SIGNAL: readonly string[] = [];

const HIGH_SIGNAL_FACT_KEYWORD_RE =
  /(根因|真相|七锚|闭环|纠错|根源|公寓.*因|异变.*因|N-\d{3,6}|C-[A-Za-z0-9_-]+|T-[A-Za-z0-9_-]+)/;

const LOW_SIGNAL_FACT_KEYWORD_PARTS = [
  "走廊",
  "楼梯",
  "电梯",
  "门缝",
  "位置",
  "动静",
  "声音",
  "脚步",
  "墙根",
  "空气",
  "深处",
  "退路",
  "灯管",
  "手机",
  "锁孔",
  "刮痕",
  "刮擦",
  "纸箱",
  "公告",
  "宿舍",
  "可以",
  "继续",
  "确认",
  "试探",
  "靠近",
  "身后",
  "利用",
  "口袋",
  "小物",
  "东西",
  "出来",
  "记录",
  "方向",
  "最近",
  "防火",
  "挂锁",
];

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

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function emptyNarrativeAudit(): NarrativeAuditPayload {
  return {
    used_fact_ids: [],
    candidate_new_facts: [],
    mentioned_entity_ids: [],
  };
}

function extractNarrativeAudit(dm: Record<string, unknown>): NarrativeAuditPayload {
  const audit = asObject(dm._narrative_audit);
  return normalizeNarrativeAuditPayload(
    {
      used_fact_ids: audit?.used_fact_ids ?? dm.used_fact_ids,
      candidate_new_facts: audit?.candidate_new_facts ?? dm.candidate_new_facts,
      mentioned_entity_ids: audit?.mentioned_entity_ids ?? dm.mentioned_entity_ids,
      speaker_npc_id: audit?.speaker_npc_id ?? dm.speaker_npc_id,
    },
    { preserveEmptyArrays: true }
  ) ?? emptyNarrativeAudit();
}

function mapUnsupportedSeverity(code: UnsupportedFactIssueCode): "low" | "medium" | "high" {
  if (code === "unsupported_root_cause_claim") return "high";
  if (
    code === "unsupported_relationship_claim" ||
    code === "unsupported_location_claim" ||
    code === "unsupported_event_stage_claim" ||
    code === "fact_id_not_allowed" ||
    code === "used_fact_id_missing_from_registry"
  ) {
    return "medium";
  }
  return "low";
}

/**
 * Extract overlapping 3-char CJK windows from the fact content.
 *
 * Rationale: Chinese proper nouns / phrase fragments often overlap with
 * surface narrative ("七锚闭环" vs "七锚闭环的根因…"). A single strict
 * 3-8 char match is too greedy *and* misses partial matches; overlapping
 * 3-grams gives a tight but reliable leak signal.
 */
export function extractFactKeywords(
  content: string,
  onLowSignal?: () => void
): string[] {
  if (!isString(content) || !content.trim()) return [];
  const highSignalContent = HIGH_SIGNAL_FACT_KEYWORD_RE.test(content);
  // DM-only leak fallback is intentionally reserved for high-signal secrets.
  // Generic private lore often shares mundane scene words with safe prose, and
  // those should stay in lower-risk governance paths instead of clearing a turn.
  if (!highSignalContent) {
    onLowSignal?.();
    return [];
  }
  const runs = content.match(/[\u4e00-\u9fa5]+/g) ?? [];
  const out = new Set<string>();
  for (const run of runs) {
    if (run.length < 3) continue;
    for (let i = 0; i + 3 <= run.length && out.size < 64; i += 1) {
      const keyword = run.slice(i, i + 3);
      const lowSignal = LOW_SIGNAL_FACT_KEYWORD_PARTS.some(
        (part) => keyword.includes(part) || part.includes(keyword)
      );
      if (!highSignalContent && lowSignal) continue;
      out.add(keyword);
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
  /(捡起|拾起|收进口袋|放进口袋|装进背包|放入背包|收下了|得到了|获得了|塞进(?:了)?(?:口袋|兜里|裤兜|包里|背包)|揣进(?:了)?(?:口袋|兜里|怀里)|握紧(?:了)?(?:钥匙|纸条|照片|徽章|卡片|信件|信)|抽出(?:了)?(?:信封|纸条|信件|钥匙|照片|文件|笔记本)|拿起(?:了)?(?:钥匙|纸条|照片|信封|信件|徽章|卡片)|取下(?:了)?(?:钥匙|纸条|照片|徽章|卡片|信件|笔记本)|翻出(?:了)?(?:钥匙|纸条|照片|信封|徽章|卡片)|摸出(?:了)?(?:钥匙|纸条|照片|徽章|卡片))/;
const POSSESSION_ITEM_SURFACE_PATTERN =
  "(便签|纸条|钥匙|徽章|卡片|药|绷带|武器|刀|枪|证件|硬币|手机|信|笔记本|粉笔)";
const SUBJECTLESS_FIRST_PERSON_POSSESSION_PATTERN = new RegExp(
  `(?:^|(?<=[。！？]))\\s*(?:我)?(?:下意识|反手|伸手)?(?:摸|探|翻)(?:了摸|向|进)?(?:自己的)?(?:口袋|背包|衣兜|裤兜|兜)(?:里|中|内)?.{0,16}?${POSSESSION_ITEM_SURFACE_PATTERN}`,
);
const FIRST_PERSON_POSSESSION_PATTERNS: readonly RegExp[] = [
  new RegExp(
    `我(?:下意识|反手)?(?:(?:摸(?:了摸|向)?|伸手(?:摸向|探进)?|翻找)?(?:自己的)?(?:口袋|背包|衣兜|裤兜|兜)(?:里|中的|中|内)?|(?:从)?(?:自己的)?(?:口袋|背包|衣兜|裤兜|兜)(?:里|中|内)?(?:摸出|掏出|翻出|取出)(?:了)?).{0,16}?${POSSESSION_ITEM_SURFACE_PATTERN}`,
  ),
  new RegExp(
    `(?:我的|自己的|随身的)(?:口袋|背包)(?:里|中|内)(?:有|装着|放着|塞着|躺着|藏着)\\s*(?:一(?:把|枚|张|部|卷|瓶|支|件|封|本))?\\s*${POSSESSION_ITEM_SURFACE_PATTERN}`,
  ),
  // Writer prose is first-person. A subjectless possession at the very start
  // therefore still describes the player, while anchoring here avoids treating
  // a later-described NPC bag or ordinary scene container as player inventory.
  new RegExp(
    `^\\s*(?:口袋|背包)(?:里|中|内)(?:有|装着|放着|塞着|躺着|藏着)\\s*(?:一(?:把|枚|张|部|卷|瓶|支|件|封|本))?\\s*${POSSESSION_ITEM_SURFACE_PATTERN}`,
  ),
  // In first-person Writer prose, a new sentence can omit "我" in a compact
  // action such as `反手摸兜，指尖碰到那截红粉笔`. Keep the sentence-boundary
  // anchor so an NPC clause later in the paragraph is not treated as player
  // inventory.
  SUBJECTLESS_FIRST_PERSON_POSSESSION_PATTERN,
];

function findFirstPersonPossession(narrative: string): RegExpMatchArray | null {
  for (const pattern of FIRST_PERSON_POSSESSION_PATTERNS) {
    const match = narrative.match(pattern);
    if (!match?.[1]) continue;
    if (pattern === SUBJECTLESS_FIRST_PERSON_POSSESSION_PATTERN && match.index && !match[0].trimStart().startsWith("我")) {
      const before = narrative.slice(0, match.index);
      const previousBoundary = Math.max(
        before.lastIndexOf("。", before.length - 2),
        before.lastIndexOf("！", before.length - 2),
        before.lastIndexOf("？", before.length - 2),
      );
      const previousSentence = before.slice(previousBoundary + 1);
      if (!/我/.test(previousSentence)) continue;
    }
    return match;
  }
  return null;
}

const BUILTIN_ITEM_SURFACES: Readonly<Record<string, readonly string[]>> = {
  item_phone: ["手机"],
  item_bandage: ["绷带"],
};

function inventorySurfaceNames(ids: readonly string[]): string[] {
  return ids.flatMap((id) => {
    const registered = findRegisteredItemById(id);
    return [...(BUILTIN_ITEM_SURFACES[id] ?? []), ...(registered?.name ? [registered.name] : [])];
  });
}

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

function countFactKeywords(
  facts: readonly KnowledgeFact[],
  onLowSignal?: () => void
): string[] {
  const out: string[] = [];
  for (const f of facts) {
    const content = (f as { content?: unknown }).content;
    if (!isString(content)) continue;
    for (const k of extractFactKeywords(content, onLowSignal)) {
      out.push(k);
    }
  }
  return out;
}

function mapStyleIssueCode(code: NarrativeStyleIssueCode): NarrativeValidationIssueCode {
  if (code === "mechanical_exposition" || code === "forbidden_phrase_hit") {
    return "mechanical_exposition";
  }
  if (code === "style_drift") return "style_drift";
  return "narrative_style_bridge";
}

export function validateNarrative(args: ValidateNarrativeArgs): NarrativeValidationReport {
  const issues: NarrativeValidationIssue[] = [];
  const dm = args.dmRecord;
  const narrative = isString(dm.narrative) ? dm.narrative : "";
  const options = asStringArray(dm.options);
  const intentIsSystemTransition = Boolean(args.intent?.isSystemTransition);
  const narrativeAudit = extractNarrativeAudit(dm);
  let possessionNarrativeOverride: string | null = null;
  const candidateSoftening = softenPendingCandidateFacts({ narrative, candidates: narrativeAudit.candidate_new_facts });

  // 1. DM-only fact leak detection.
  if (args.epistemicFilter && narrative) {
    let dmOnlyFactsLowSignalPresent = false;
    const dmKeywords = countFactKeywords(
      args.epistemicFilter.dmOnlyFacts,
      () => { dmOnlyFactsLowSignalPresent = true; }
    );
    const leaked = narrativeContainsAnyKeyword(narrative, dmKeywords);
    if (leaked) {
      issues.push({
        code: "dm_only_fact_leaked_in_narrative",
        detail: `keyword:${leaked}`,
        severity: "high",
      });
    }
    // Telemetry: record when DM-only facts exist but are low-signal (not intercepted)
    if (dmOnlyFactsLowSignalPresent && !leaked) {
      issues.push({
        code: "dm_only_fact_leaked_in_narrative",
        detail: "low_signal:dm_only_facts_present_but_below_high_signal_threshold",
        severity: "low",
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

  // Existing-possession claims are a separate failure mode from acquisition:
  // `我摸了摸口袋里那张便签` silently conjures an item without an award verb.
  // Restrict to first-person bag/pocket grammar to avoid flagging scene props
  // or items held by NPCs.
  if (!intentIsSystemTransition && narrative) {
    const possession = findFirstPersonPossession(narrative);
    if (possession?.[1]) {
      const claimedSurface = possession[1];
      const knownSurfaces = inventorySurfaceNames(args.inventoryItemIds ?? []);
      const alreadyOwned = knownSurfaces.some((name) => name.includes(claimedSurface) || claimedSurface.includes(name));
      const hasAward = [dm.awarded_items, dm.awarded_warehouse_items].some((value) => Array.isArray(value) && value.length > 0);
      if (!alreadyOwned && !hasAward) {
        issues.push({ code: "inventory_conflict", detail: "narrative_claims_unowned_first_person_possession", severity: "medium" });
        const rewriteBase = candidateSoftening.rewritten ? candidateSoftening.narrative : narrative;
        possessionNarrativeOverride = rewriteBase.replace(
          possession[0],
          "我下意识摸了摸口袋，那里没有能派上用场的东西",
        );
      }
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

  // 9.4. social_event_must_not_reveal_leaked: social events carry
  //      must_not_reveal terms that MUST NOT appear in player-visible
  //      narrative or options. This is a deterministic post-hoc check
  //      that complements the social-world insertion-time validator.
  if (args.socialEventMustNotRevealTerms && args.socialEventMustNotRevealTerms.length > 0) {
    const terms = args.socialEventMustNotRevealTerms;
    // Check narrative.
    if (narrative) {
      for (const term of terms) {
        if (term.length >= 2 && narrative.includes(term)) {
          issues.push({
            code: "social_event_must_not_reveal_leaked",
            detail: `narrative_leaked_term:${term}`,
            anchor: term,
            severity: "high",
          });
          break; // one hit is enough to trigger the gate; report the first
        }
      }
    }
    // Check options.
    if (options.length > 0) {
      for (const opt of options) {
        for (const term of terms) {
          if (term.length >= 2 && opt.includes(term)) {
            issues.push({
              code: "social_event_must_not_reveal_leaked",
              detail: `option_leaked_term:${term}`,
              anchor: term,
              severity: "high",
            });
            break;
          }
        }
      }
    }
  }

  // 9.5. item_use_validator: check that narrative-described item use is
  //       consistent with inventory, effect type, and consumed_items.
  if (!intentIsSystemTransition && narrative && (args.inventoryItemIds ?? []).length > 0) {
    const itemUseReport: ItemUseValidationReport = validateItemUseNarrative(
      narrative,
      args.inventoryItemIds ?? [],
      dm,
    );
    if (!itemUseReport.ok) {
      for (const iuIssue of itemUseReport.issues) {
        issues.push({
          code: iuIssue.code,
          detail: `item_use:${iuIssue.detail}`,
          anchor: iuIssue.itemId,
          severity: iuIssue.severity,
        });
      }
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

  const styleReport =
    Object.prototype.hasOwnProperty.call(args, "styleValidationReport")
      ? args.styleValidationReport ?? null
      : args.narrativeStyleValidationEnabled && narrative
        ? validateNarrativeStyle({
            narrative,
            styleProfile: args.styleProfile ?? getVerseCraftStyleProfile(),
            focus: args.narrativeStyleFocus ?? args.intent?.kind ?? null,
            turnMode: isString(dm.turn_mode) ? dm.turn_mode : null,
            recentRegisters: args.recentRegisters,
          })
        : null;
  if (styleReport && !styleReport.ok) {
    for (const issue of styleReport.issues) {
      const mappedCode = mapStyleIssueCode(issue.code);
      issues.push({
        code: mappedCode,
        detail: `style:${issue.code}${issue.detail ? `:${issue.detail}` : ""}`,
        anchor: issue.anchor,
        severity:
          issue.code === "mechanical_exposition" ||
          issue.code === "forbidden_phrase_hit" ||
          issue.code === "dialogue_over_explains" ||
          issue.code === "hook_missing"
            ? "medium"
            : "low",
      });
    }
  }

  const npcKnowledgeValidationEnabled = args.npcKnowledgeValidationEnabled !== false;
  const npcKnowledgeReport =
    Object.prototype.hasOwnProperty.call(args, "npcKnowledgeValidationReport")
      ? args.npcKnowledgeValidationReport ?? null
      : npcKnowledgeValidationEnabled && args.npcKnowledgePacket && narrative
        ? validateNpcKnowledgeInNarrative({
            narrative,
            speakerNpcId: args.speakerNpcId ?? args.npcKnowledgePacket.speakerNpcId,
            npcKnowledgePacket: args.npcKnowledgePacket,
            presentNpcIds: args.sceneNpcIds ?? [],
            maxRevealRank: args.npcKnowledgeMaxRevealRank ?? 0,
          })
        : null;
  if (npcKnowledgeReport && !npcKnowledgeReport.ok) {
    for (const issue of npcKnowledgeReport.issues) {
      issues.push({
        code: issue.code,
        detail: `npc_knowledge:${issue.detail ?? issue.code}`,
        anchor: issue.anchor,
        severity: issue.severity,
      });
    }
  }

  const maxRevealRankForFacts = args.factDetectionMaxRevealRank ?? args.npcKnowledgeMaxRevealRank ?? 0;
  const allowedFactIds = [
    ...new Set([
      ...(args.allowedFactIds ?? []),
      ...(args.scenePublicFactIds ?? []),
      ...(args.actorScopedFactIds ?? []),
      ...(args.npcKnowledgePacket?.can_know_fact_ids ?? []),
      ...(args.npcKnowledgePacket?.can_hint_fact_ids ?? []),
      ...listWorldFacts(maxRevealRankForFacts).map((fact) => fact.factId),
      ...(args.sessionCommittedFactIds ?? []),
    ]),
  ];
  const unsupportedFactDetectionEnabled = args.unsupportedFactDetectionEnabled !== false;
  const unsupportedFactReport =
    Object.prototype.hasOwnProperty.call(args, "unsupportedFactReport")
      ? args.unsupportedFactReport ?? null
      : unsupportedFactDetectionEnabled &&
          (narrative || narrativeAudit.used_fact_ids.length > 0 || narrativeAudit.candidate_new_facts.length > 0)
        ? detectUnsupportedFacts({
            narrative,
            playerInput: args.latestUserInput,
            usedFactIds: narrativeAudit.used_fact_ids,
            candidateNewFacts: narrativeAudit.candidate_new_facts,
            allowedFactIds,
            npcKnowledgePacket: args.npcKnowledgePacket ?? null,
            scenePublicFactIds: args.scenePublicFactIds ?? [],
            actorScopedFactIds: args.actorScopedFactIds ?? [],
            sessionCommittedFactIds: args.sessionCommittedFactIds ?? [],
            maxRevealRank: maxRevealRankForFacts,
            stateDelta: args.delta,
            dmRecord: dm,
          })
        : null;
  if (unsupportedFactReport && unsupportedFactReport.unsupportedCandidates.length > 0) {
    for (const candidate of unsupportedFactReport.unsupportedCandidates) {
      issues.push({
        code: candidate.code,
        detail: `world_fact:${candidate.factId ?? candidate.text}`,
        anchor: candidate.factId,
        severity: candidate.severity ?? mapUnsupportedSeverity(candidate.code),
      });
    }
  }

  // v4 全链路人名白名单：检测 narrative 中残留未注册人名。
  //
  // 此 validator 不依赖 prompt 引导模型使用已注册人名——它通过 extractChineseNames
  // 直接扫描 narrative 文本与 NPC_NAME_SET 比对，完全由代码驱动。原"NPC规范名册"类
  // prompt 规则已在 v6 压缩中移除/collapse，本 validator 现为主力执法点。
  if (narrative) {
    const nameIssues = validateNarrativePersonNames({
      narrative,
      sceneNpcIds: args.sceneNpcIds,
    });
    issues.push(...nameIssues);
  }

  // NOTE: unsupported_new_fact 检测有两条路径：
  //   a) _narrative_audit.used_fact_ids / candidate_new_facts — 依赖模型输出此元数据
  //      （compact prompt 第 190 行仍保留 "须写 _narrative_audit.used_fact_ids" 约束，
  //       但 full stable prompt 不包含此指令；若模型未输出 _narrative_audit，此路径
  //       静默跳过，不会误报。）
  //   b) detectUnsupportedFacts 对 narrative 文本的正则扫描（根因/关系/地点/事件阶段/
  //      道具获取/NPC深层身份/任务完成/强断言）——完全不依赖 prompt，代码驱动。
  // 原"强事实审计"类 prompt 规则已压缩为单行；路径 (b) 是主力的代码级兜底执法。

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
    narrativeOverride = null;
  } else if (hasMediumOptionsIssue || hasOptionsShapeIssue) {
    // 不再注入罐头短句；用空数组作为“需要重新生成实时选项”的显式信号。
    // caller（api/chat 的 Phase-8.5）会在看到非空 optionsOverride 为空数组时，
    // 交由 PlayerTurnWorkflow 的确定性选项补全处理，不再触发额外模型调用。
    optionsOverride = [...CLEAR_OPTIONS_SIGNAL];
  }
  if (!hasHigh && possessionNarrativeOverride && possessionNarrativeOverride !== narrative) {
    narrativeOverride = possessionNarrativeOverride;
  } else if (!hasHigh && candidateSoftening.rewritten) {
    narrativeOverride = candidateSoftening.narrative;
  }

  // Narrative actions are diagnostic hints only. State remains authoritative
  // only when it arrives through the structured candidate delta and commit gates.
  const backfillResult: ActionBackfillResult | null =
    narrative && !intentIsSystemTransition
      ? (() => {
          try {
            const dmAwarded = Array.isArray((dm as { awarded_items?: unknown }).awarded_items)
              ? (dm as { awarded_items: unknown[] }).awarded_items
              : [];
            const dmConsumed = Array.isArray((dm as { consumed_items?: unknown }).consumed_items)
              ? (dm as { consumed_items: unknown[] }).consumed_items
              : [];
            // currency_change 在 wire 协议中是 number（原石 delta），与 resolveDmTurn 对齐。
            // 兼容旧版对象形式 { originium?: number }，但写入时必须保持 number 形式。
            const dmCurrencyRaw = (dm as { currency_change?: unknown }).currency_change;
            const originiumChange: number | null =
              typeof dmCurrencyRaw === "number" && Number.isFinite(dmCurrencyRaw)
                ? (dmCurrencyRaw as number)
                : dmCurrencyRaw && typeof dmCurrencyRaw === "object" && !Array.isArray(dmCurrencyRaw) && typeof (dmCurrencyRaw as { originium?: unknown }).originium === "number"
                  ? ((dmCurrencyRaw as { originium: number }).originium)
                  : null;
            const hasTaskUpdates = args.delta.taskUpdates.length > 0 || args.delta.newTasks.length > 0;

            const br = resolveActionsFromNarrative({
              narrative,
              existingAwardedItems: dmAwarded as unknown[],
              existingConsumedItems: dmConsumed as unknown[],
              existingOriginiumChange: originiumChange,
              hasTaskUpdates,
            });

            return br;
          } catch {
            return null;
          }
        })()
      : null;

  const telemetry: NarrativeValidationTelemetry = {
    totalIssues: issues.length,
    byCode,
    ...(styleReport
      ? {
          narrativeStyleIssueCount: styleReport.telemetry.totalIssues,
          narrativeStyleByCode: styleReport.telemetry.byCode,
          narrativeStyleProfileId: styleReport.telemetry.styleProfileId,
        }
      : {}),
    ...(npcKnowledgeReport
      ? {
          npcKnowledgeIssueCount: npcKnowledgeReport.telemetry.totalIssues,
          npcKnowledgeByCode: npcKnowledgeReport.telemetry.byCode,
        }
      : {}),
    ...(unsupportedFactReport
      ? {
          unsupportedFactIssueCount: unsupportedFactReport.telemetry.totalCandidates,
          unsupportedFactByCode: unsupportedFactReport.telemetry.byCode,
        }
      : {}),
    styleIssueCount: styleReport?.telemetry.totalIssues ?? 0,
    styleDriftCount: styleReport?.telemetry.byCode.style_drift ?? byCode.style_drift ?? 0,
    mechanicalExpositionCount: byCode.mechanical_exposition ?? 0,
    npcKnowledgeIssueCount: npcKnowledgeReport?.telemetry.totalIssues ?? 0,
    rootCauseLeakCount:
      (byCode.root_cause_leak ?? 0) + (byCode.unsupported_root_cause_claim ?? 0),
    unsupportedFactCount: unsupportedFactReport?.telemetry.totalCandidates ?? 0,
    unsupportedRelationshipClaimCount:
      unsupportedFactReport?.telemetry.byCode.unsupported_relationship_claim ?? 0,
    factCommitRejectedCount: 0,
    narrativeGovernanceFinalSafe: !issues.some((issue) => issue.severity === "high"),
    optionsOverrideApplied: optionsOverride !== null,
    safeNarrativeFallbackApplied: narrativeOverride !== null,
    ...(backfillResult?.didBackfill
      ? { actionBackfill: getBackfillTelemetrySummary(backfillResult) }
      : {}),
  };

  return {
    ok: issues.length === 0,
    issues,
    optionsOverride,
    narrativeOverride,
    awardedItemsOverride: null,
    telemetry,
  };
}
