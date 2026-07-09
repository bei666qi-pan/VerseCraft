// src/lib/play/taskBoardUi.ts
// 任务板玩家表层投影（1+2+1）：纯函数、可测、无 React

import { inferObjectiveKind } from "@/lib/domain/objectiveAdapters";
import { inferEffectiveNarrativeLayer, pathDemotionBias, promiseRiskHumanSignals } from "@/lib/tasks/taskRoleModel";
import { promiseRiskSortScore } from "@/lib/tasks/taskRevealModel";
import { getTaskVisibilityTier, isVisibleAsClue, isVisibleInPromiseLane, isVisibleOnBoard } from "@/lib/tasks/taskVisibilityPolicy";
import type { GameTaskV2, TaskSurfaceClass, TaskSurfaceSlot } from "@/lib/tasks/taskV2";
import type { CodexEntry, GameTask } from "@/store/useGameStore";
import { resolveTaskIssuerDisplay } from "@/lib/ui/displayNameResolvers";
import { sanitizePlayerFacingInline } from "@/lib/ui/taskPlayerFacingText";

const GUIDANCE_RANK: Record<string, number> = {
  strong: 0,
  standard: 1,
  light: 2,
  none: 3,
};

function isClosedStatus(s: GameTask["status"]): boolean {
  return s === "completed" || s === "failed";
}

function isTrackable(s: GameTask["status"]): boolean {
  return s === "active" || s === "available";
}

function guidanceKey(t: GameTask): number {
  return GUIDANCE_RANK[t.guidanceLevel ?? "none"] ?? 3;
}

/** 当前「头等事」：主线优先，其次进行中，再其次可接。 */
export function pickPrimaryTask(tasks: GameTask[]): GameTask | null {
  const vis = (tasks ?? []).filter((t) => t && t.status !== "hidden");
  const open = vis.filter((t) => !isClosedStatus(t.status));
  const act = open.filter((t) => t.status === "active");
  const pool = act.length > 0 ? act : open.filter((t) => t.status === "available");
  if (pool.length === 0) return null;

  const scored = pool.map((t) => ({ t, kind: inferObjectiveKind(t as GameTaskV2) }));
  const main = scored.find((x) => x.kind === "main");
  if (main) return main.t;

  return [...pool].sort((a, b) => {
    const da = pathDemotionBias(a as GameTaskV2);
    const db = pathDemotionBias(b as GameTaskV2);
    if (da !== db) return da - db;
    const ga = guidanceKey(a);
    const gb = guidanceKey(b);
    if (ga !== gb) return ga - gb;
    const pa = a.type === "main" || a.type === "conspiracy" ? 0 : 1;
    const pb = b.type === "main" || b.type === "conspiracy" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title, "zh-Hans");
  })[0];
}

function isPromiseOrCommission(t: GameTask): boolean {
  const k = inferObjectiveKind(t as GameTaskV2);
  return k === "promise" || k === "commission";
}

function hasRiskSignal(t: GameTask): boolean {
  return Boolean(
    t.highRiskHighReward ||
      (typeof (t as { riskNote?: string }).riskNote === "string" &&
        String((t as { riskNote?: string }).riskNote).trim().length > 0) ||
      (t as { canBackfire?: boolean }).canBackfire ||
      t.dramaticType === "betrayal" ||
      t.dramaticType === "leverage"
  );
}

function isPromiseRiskSlot(t: GameTask): boolean {
  const v = t as GameTaskV2;
  if (isPromiseOrCommission(t) || hasRiskSignal(t)) return true;
  if (inferEffectiveNarrativeLayer(v) === "conversation_promise") return true;
  if (promiseRiskHumanSignals(v) >= 1.05) return true;
  return false;
}

/**
 * V3：统一可见策略后，任务板仅消费「应被玩家知晓的事」。
 * - formal_task：必须已在叙事中接下（可见）才进主任务区
 * - conversation_promise：进入承诺/风险带（不抢主视图）
 * - soft_lead：只当线索，不进主任务区
 */
export function filterTasksForTaskBoardVisibilityV2(tasks: GameTask[], enabled: boolean): GameTask[] {
  if (!enabled) return tasks ?? [];
  return (tasks ?? []).filter((t) => {
    if (!t || t.status === "hidden") return false;
    const tier = getTaskVisibilityTier(t as unknown as GameTaskV2);
    return tier !== "hidden";
  });
}

export type TaskBoardPartition = {
  primary: GameTask | null;
  /** 人物委托（最多 2） */
  accepted: GameTask[];
  /** 机会事件（最多 1） */
  opportunities: GameTask[];
  /** 承诺 / 风险（轻追踪，不抢主视图，默认折叠） */
  promises: GameTask[];
  /** 线索影子（不当作任务腔；默认极少） */
  clues: GameTask[];
  /** 其余可追踪（未列入上列） */
  overflow: GameTask[];
  completed: GameTask[];
  failed: GameTask[];
};

export type PlayerTaskBoardViewModel = {
  mainline: GameTask | null;
  commissions: GameTask[];
  opportunity: GameTask | null;
  backgroundHiddenCount: number;
  promises: GameTask[];
  clues: GameTask[];
  overflow: GameTask[];
  completed: GameTask[];
  failed: GameTask[];
  visibleCount: number;
};

/** 舞台卡角色：与 1+2+1 槽位对应；也用于「更多在办」等次要列表的默认口吻。 */
export type TaskStageRole = "mainline" | "commission" | "opportunity";

function inferSurfaceClass(task: GameTask): TaskSurfaceClass {
  const t = task as GameTaskV2;
  if (t.surfaceClass) return t.surfaceClass;
  const objective = inferObjectiveKind(t);
  const layer = inferEffectiveNarrativeLayer(t);
  if (objective === "main") return "mainline";
  if (layer === "conversation_promise") return "background";
  if (layer === "soft_lead") return "background";
  if (
    (typeof t.expiresAt === "string" && t.expiresAt.trim().length > 0) ||
    t.dramaticType === "investigation" ||
    t.dramaticType === "delivery"
  ) {
    return "opportunity";
  }
  return "commission";
}

/** 纯派生：不再读取任务上的存储字段（已于 2026-07 收敛去重），只从 surfaceClass 推导。 */
function inferSurfaceSlot(task: GameTask): TaskSurfaceSlot {
  const cls = inferSurfaceClass(task);
  if (cls === "mainline") return "mainline";
  if (cls === "commission") return "commission";
  if (cls === "opportunity") return "opportunity";
  return "hidden";
}

/** 将槽位映射为舞台卡角色；hidden/background 等回落为委托口吻，避免 UI 再分支。 */
export function inferTaskStageRole(task: GameTask): TaskStageRole {
  const s = inferSurfaceSlot(task);
  if (s === "mainline") return "mainline";
  if (s === "opportunity") return "opportunity";
  return "commission";
}

function rewardActionabilityScore(task: GameTask): number {
  const t = task as GameTaskV2;
  const unlocks = Array.isArray(t.reward?.unlocks) ? t.reward.unlocks.length : 0;
  const route = typeof t.relatedEscapeProgress === "string" && t.relatedEscapeProgress.trim().length > 0 ? 1 : 0;
  const rel = Array.isArray(t.reward?.relationshipChanges) ? t.reward.relationshipChanges.length : 0;
  const intel =
    (Array.isArray(t.sourceClueIds) ? t.sourceClueIds.length : 0) +
    (Array.isArray(t.followupSeedCodes) ? t.followupSeedCodes.length : 0);
  // 奖励优先级：权限 > 路线推进 > 关系变化 > 情报
  return unlocks * 40 + route * 30 + rel * 20 + intel * 10;
}

function slotPriority(task: GameTask): number {
  const t = task as GameTaskV2;
  const explicit = typeof t.surfacePriority === "number" ? t.surfacePriority : 0;
  const base = task.status === "active" ? 22 : task.status === "available" ? 12 : 0;
  const risk = hasRiskSignal(task) ? 9 : 0;
  const guidance = 6 - guidanceKey(task);
  const reward = rewardActionabilityScore(task);
  return explicit + base + risk + guidance + reward;
}

export type TaskBoardPressureTier = "low" | "medium" | "high" | "critical";

export type TaskBoardPressureSummary = {
  tier: TaskBoardPressureTier;
  /** 单行可扫读摘要（避免 dashboard 化） */
  line: string;
  /** 数字信号：用于 UI 角标/小徽标 */
  signals: {
    openCount: number;
    primaryExists: boolean;
    promisePressure: number;
    riskCount: number;
    deadlineCount: number;
  };
};

function safeDateMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function isDeadlineTask(t: GameTask): boolean {
  if (!t || (t.status !== "active" && t.status !== "available")) return false;
  return typeof t.expiresAt === "string" && t.expiresAt.trim().length > 0 && safeDateMs(t.expiresAt) != null;
}

/**
 * 任务板危险态势（UI-only）：只基于现有 taskV2 字段推导，不引入新系统。
 * 目标：让玩家知道“楼在逼近”，而不是堆待办。
 */
export function computeTaskBoardPressureSummary(tasks: GameTask[], partition?: Pick<TaskBoardPartition, "primary" | "promises">): TaskBoardPressureSummary {
  const open = (tasks ?? []).filter((t) => t && (t.status === "active" || t.status === "available"));
  const primaryExists = Boolean(partition?.primary);

  const promises = (partition?.promises ?? []).length;
  const promisePressure = promises + open.filter((t) => inferEffectiveNarrativeLayer(t as GameTaskV2) === "conversation_promise").length;
  const riskCount = open.filter((t) => hasRiskSignal(t) || isPromiseRiskSlot(t)).length;
  const deadlineCount = open.filter((t) => isDeadlineTask(t)).length;

  const tierScore =
    (primaryExists ? 1 : 0) +
    Math.min(6, Math.trunc(riskCount)) * 1.2 +
    Math.min(6, Math.trunc(promisePressure)) * 0.9 +
    Math.min(6, Math.trunc(deadlineCount)) * 0.8;

  const tier: TaskBoardPressureTier =
    tierScore >= 10 ? "critical" : tierScore >= 7 ? "high" : tierScore >= 4 ? "medium" : "low";

  const parts: string[] = [];
  if (primaryExists) parts.push("主线在前");
  if (deadlineCount > 0) parts.push(`期限 ${deadlineCount}`);
  if (riskCount > 0) parts.push(`高风险 ${riskCount}`);
  if (promisePressure > 0) parts.push(`牵连 ${Math.min(99, promisePressure)}`);
  if (parts.length === 0) parts.push("暂时平静，但别当作安全");

  return {
    tier,
    line: parts.slice(0, 3).join(" · "),
    signals: {
      openCount: open.length,
      primaryExists,
      promisePressure,
      riskCount,
      deadlineCount,
    },
  };
}

/**
 * 将可见任务分层；低价值「已完成/失败」单独归档，默认不占主视野。
 */
export function partitionTasksForBoard(tasks: GameTask[], maxPaths = 4): TaskBoardPartition {
  const vis = (tasks ?? []).filter((t) => t && t.status !== "hidden");
  const completed = vis.filter((t) => t.status === "completed");
  const failed = vis.filter((t) => t.status === "failed");
  const open = vis.filter((t) => isTrackable(t.status));

  // 正式任务仅从 board_visible 中挑选主线 + 委托 + 机会事件
  const boardOpen = open.filter((t) => isVisibleOnBoard(t as unknown as GameTaskV2));
  // 显式 commission / opportunity 槽不进主线池，避免 id 以 main_ 开头却仍占「唯一主线」
  const mainlinePool = boardOpen.filter((t) => {
    const slot = inferSurfaceSlot(t);
    if (slot === "commission" || slot === "opportunity") return false;
    return slot === "mainline" || inferObjectiveKind(t as GameTaskV2) === "main";
  });
  const primary = [...mainlinePool]
    .sort((a, b) => slotPriority(b) - slotPriority(a) || a.title.localeCompare(b.title, "zh-Hans"))[0] ?? null;
  const primaryId = primary?.id ?? null;

  const restBoard = boardOpen.filter((t) => t.id !== primaryId);
  const commissionPool = restBoard.filter((t) => inferSurfaceSlot(t) === "commission");
  const accepted = [...commissionPool]
    .sort((a, b) => slotPriority(b) - slotPriority(a) || a.title.localeCompare(b.title, "zh-Hans"))
    .slice(0, Math.max(0, Math.min(2, maxPaths)));

  const acceptedIds = new Set(accepted.map((p) => p.id));
  const opportunityPool = restBoard.filter((t) => !acceptedIds.has(t.id) && inferSurfaceSlot(t) === "opportunity");
  const opportunities = [...opportunityPool]
    .sort((a, b) => slotPriority(b) - slotPriority(a) || a.title.localeCompare(b.title, "zh-Hans"))
    .slice(0, 1);

  // 承诺/风险：仅轻追踪，不进入 1+2+1 主槽
  const promiseCandidates = open.filter((t) => {
    if (t.id === primaryId || acceptedIds.has(t.id) || opportunities.some((o) => o.id === t.id)) return false;
    return isVisibleInPromiseLane(t as unknown as GameTaskV2);
  });
  const promises = [...promiseCandidates]
    .sort((a, b) => promiseRiskSortScore(b as GameTaskV2) - promiseRiskSortScore(a as GameTaskV2) || a.title.localeCompare(b.title, "zh-Hans"))
    .slice(0, 3);

  const clueCandidates = open.filter((t) => isVisibleAsClue(t as unknown as GameTaskV2));
  const clues = [...clueCandidates]
    .sort((a, b) => guidanceKey(a) - guidanceKey(b) || a.title.localeCompare(b.title, "zh-Hans"))
    .slice(0, 2);

  const used = new Set<string>([
    ...(primaryId ? [primaryId] : []),
    ...accepted.map((p) => p.id),
    ...opportunities.map((p) => p.id),
    ...promises.map((p) => p.id),
    ...clues.map((p) => p.id),
  ]);
  const overflow = open.filter((t) => !used.has(t.id));
  return { primary, accepted, opportunities, promises, clues, overflow, completed, failed };
}

export function projectTaskBoardViewModel(tasks: GameTask[], v3VisibilityEnabled: boolean): PlayerTaskBoardViewModel {
  const forBoard = filterTasksForTaskBoardVisibilityV2(tasks ?? [], v3VisibilityEnabled);
  const partition = partitionTasksForBoard(forBoard, 2);
  const hiddenBackground = (tasks ?? []).filter((t) => {
    if (!t || t.status === "hidden") return true;
    const tier = getTaskVisibilityTier(t as unknown as GameTaskV2);
    if (tier === "hidden") return true;
    return inferSurfaceClass(t) === "background" && !isVisibleInPromiseLane(t as unknown as GameTaskV2);
  }).length;
  return {
    mainline: partition.primary,
    commissions: partition.accepted.slice(0, 2),
    opportunity: partition.opportunities[0] ?? null,
    backgroundHiddenCount: hiddenBackground,
    promises: partition.promises,
    clues: partition.clues,
    overflow: partition.overflow,
    completed: partition.completed,
    failed: partition.failed,
    visibleCount: forBoard.length,
  };
}

/** 单张舞台卡：组件只渲染这些行，避免在 React 里拼业务句。 */
export type TaskStageRiskBand = "calm" | "uneasy" | "hot";

/** UI 用：这件事游戏愿意替玩家指路到什么程度（strong=指引明确，light=靠自己摸索） */
export type TaskStageGuidanceLevel = "strong" | "standard" | "light" | "none";

export type TaskRewardChipKind = "originium" | "unlock" | "item" | "relationship" | "intel";
export type TaskRewardChip = { kind: TaskRewardChipKind; label: string };

export type TaskStageCardViewModel = {
  taskId: string;
  role: TaskStageRole;
  title: string;
  status: GameTask["status"];
  claimMode: GameTask["claimMode"];
  issuerLine: string;
  /** 玩家现在具体能做/能说的一句话——本卡最具行动力的一行，优先取自任务的 nextHint。 */
  nextStep: string;
  /** 单行氛围/理由文案，取代此前 whyMatters + ifNotDone 两段说明文字（2026-07 四次修订收敛）。 */
  flavorLine: string;
  /** 结构化奖励标签（图标+短词），取代此前整句"做成能得到"文案，交给 UI 渲染图标而不是拼句子。 */
  rewardChips: TaskRewardChip[];
  /** 风险短标签；calm 时为 null，UI 不再为"暂时很平静"强制渲染一整块风险框。 */
  riskTag: string | null;
  /** UI 用：低风险中性、期限/中等不安、高反噬灼热 */
  riskBand: TaskStageRiskBand;
  guidanceLevel: TaskStageGuidanceLevel;
  /** 期限倒计时的可读标签，如"今日截止""剩 2h""过期"；无时限时为 null。 */
  deadlineLabel: string | null;
  /** requiredItemIds 完成计数文案，如"0/2"；无条件时为 null。 */
  progressLabel: string | null;
};

function clipStageText(s: string, max: number): string {
  const x = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!x) return "";
  return x.length <= max ? x : `${x.slice(0, max - 1)}…`;
}

/**
 * 按任务 id 稳定取一条候选文案（同一任务每次渲染取到同一条，不同任务大概率取到不同条）。
 * 仅用于"没有具体戏剧字段时"的兜底文案——目的是让缺省文案不再是一整个板子上完全相同的
 * 一句话（那是"AI 味"/机械感的直接来源之一），而不是引入真正的随机性。
 */
function pickStableVariant(seed: string, variants: readonly string[]): string {
  if (variants.length === 0) return "";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return variants[hash % variants.length];
}

function stageRiskTier(t: GameTask): "low" | "medium" | "high" | "extreme" {
  if (t.highRiskHighReward) return "extreme";
  const rn = (t as { riskNote?: string }).riskNote;
  if (typeof rn === "string" && rn.trim().length > 6) return "high";
  if ((t as { canBackfire?: boolean }).canBackfire || t.dramaticType === "betrayal" || t.dramaticType === "leverage") return "high";
  if (hasRiskSignal(t)) return "high";
  if (isDeadlineTask(t)) return "medium";
  return "low";
}

const FLAVOR_LINE_FALLBACK: Record<TaskStageRole, readonly string[]> = {
  mainline: [
    "这条线不推进，你还是困在这层楼的规则里。",
    "眼下能往前挪一步的，就是这个。",
    "不趟这条线，你连下一步该问谁都不知道。",
  ],
  commission: [
    "答应了就是答应了，对方在等一个交代。",
    "这笔人情已经欠下，迟早要还。",
    "对方开了口，你的回应会被记在心里。",
  ],
  opportunity: [
    "这扇窗口不会一直开着。",
    "现在顺手能拿到，过这阵就难说了。",
    "错过这次，下次未必还有这么巧的时机。",
  ],
};

/** 单行氛围/理由文案：解释"为何要紧"，优先取作者写的戏剧字段，没有才落到按角色变体的兜底。 */
function buildFlavorLine(task: GameTask, role: TaskStageRole, codex?: Record<string, CodexEntry> | null): string {
  const urg = clipStageText(sanitizePlayerFacingInline(String((task as { urgencyReason?: string }).urgencyReason ?? ""), codex), 88);
  const hook = clipStageText(sanitizePlayerFacingInline(String((task as { playerHook?: string }).playerHook ?? ""), codex), 88);
  const desc = clipStageText(sanitizePlayerFacingInline(String(task.desc ?? ""), codex), 88);
  if (urg) return urg;
  if (hook) return hook;
  if (desc) return desc;
  return pickStableVariant(task.id, FLAVOR_LINE_FALLBACK[role]);
}

const NEXT_STEP_FALLBACK: Record<TaskStageRole, readonly string[]> = {
  mainline: [
    "找当事人把话挑明，别绕圈子。",
    "先去现场确认一遍，再决定怎么开口。",
    "把手上的线索摊开问一句，看对方怎么接。",
  ],
  commission: [
    "去见委托人，把你已经掌握的说清楚。",
    "先把对方交代的事往前推一步，再回去交差。",
    "找对的人，问出你还缺的那一句话。",
  ],
  opportunity: [
    "现在就去看一眼，别等它自己关上。",
    "抓紧时间探一探，机会不等人。",
    "先去确认这条路还开着，再决定要不要走。",
  ],
};

/**
 * 「下一步」行：任务里最具体、最有行动力的一句（作者写在 nextHint 里的原话），
 * 此前只是 buildFlavorLine 的最低优先级兜底——一旦任务写了 urgencyReason/playerHook，
 * nextHint 就被整句吞掉，UI 上永远看不到。现在单独开一行，任何任务都优先展示它。
 */
function buildNextStep(task: GameTask, role: TaskStageRole, codex?: Record<string, CodexEntry> | null): string {
  const hint = clipStageText(sanitizePlayerFacingInline(String(task.nextHint ?? ""), codex), 72);
  if (hint) return hint;
  return pickStableVariant(task.id, NEXT_STEP_FALLBACK[role]);
}

/**
 * 结构化奖励标签（供 UI 渲染图标+短标签），取代此前"做成能得到"整句自然语言描述——
 * 扫读一排短标签比读一句话更快，也是本轮收敛文字冗余的核心改动之一。
 * 最多给 3 个标签，优先级：权限/出路 > 道具 > 关系 > 情报，全都没有时兜底"阶段性线索"。
 */
function buildRewardChips(task: GameTask, codex?: Record<string, CodexEntry> | null): TaskRewardChip[] {
  const t = task as GameTaskV2;
  const chips: TaskRewardChip[] = [];
  const ori = typeof t.reward?.originium === "number" ? t.reward!.originium : 0;
  if (ori > 0) chips.push({ kind: "originium", label: `+${ori}` });

  const unlocks = Array.isArray(t.reward?.unlocks) ? t.reward!.unlocks : [];
  if (unlocks.length > 0) {
    const first = clipStageText(sanitizePlayerFacingInline(String(unlocks[0]), codex), 18);
    chips.push({ kind: "unlock", label: unlocks.length > 1 ? `${first}等${unlocks.length}项` : first });
  } else if (typeof t.relatedEscapeProgress === "string" && t.relatedEscapeProgress.trim().length > 0) {
    chips.push({ kind: "unlock", label: "推进出路" });
  }

  const itemCount =
    (Array.isArray(t.reward?.items) ? t.reward!.items.length : 0) +
    (Array.isArray(t.reward?.warehouseItems) ? t.reward!.warehouseItems.length : 0);
  if (itemCount > 0) chips.push({ kind: "item", label: `道具×${itemCount}` });

  const relCount = Array.isArray(t.reward?.relationshipChanges) ? t.reward!.relationshipChanges.length : 0;
  if (relCount > 0 && chips.length < 3) chips.push({ kind: "relationship", label: "关系变化" });

  if (chips.length === 0) {
    const intel =
      (Array.isArray(t.sourceClueIds) ? t.sourceClueIds.length : 0) +
      (Array.isArray(t.followupSeedCodes) ? t.followupSeedCodes.length : 0);
    chips.push({ kind: "intel", label: intel > 0 ? "新情报" : "阶段性线索" });
  }
  return chips.slice(0, 3);
}

function riskBandFromTier(tier: ReturnType<typeof stageRiskTier>): TaskStageRiskBand {
  if (tier === "extreme" || tier === "high") return "hot";
  if (tier === "medium") return "uneasy";
  return "calm";
}

/**
 * 风险短标签：只在真正有风险感（非 calm）时才给一句极短提示，calm 时返回 null——
 * UI 不再为"暂时很平静"渲染一整块风险框，这是此前任务面板显得拥挤的主要来源之一。
 */
function buildRiskTag(task: GameTask): string | null {
  const tier = stageRiskTier(task);
  if (tier === "extreme") return "高风险高回报";
  if (tier === "high") return "有风险";
  if (tier === "medium" && isDeadlineTask(task)) return "有时限";
  return null;
}

/**
 * 单任务 → 舞台卡 view model（纯函数）。
 * UI 只负责排版与点击，不在这里写复杂分支。
 */
export function buildTaskStageCardViewModel(
  task: GameTask,
  role: TaskStageRole,
  codex?: Record<string, CodexEntry> | null
): TaskStageCardViewModel {
  const issuer = resolveTaskIssuerDisplay(task.issuerId, task.issuerName, codex ?? undefined);
  const riskBand = riskBandFromTier(stageRiskTier(task));
  const guidanceLevel: TaskStageGuidanceLevel =
    task.guidanceLevel === "strong" || task.guidanceLevel === "standard" || task.guidanceLevel === "light"
      ? task.guidanceLevel
      : "none";

  // 期限倒计时
  let deadlineLabel: string | null = null;
  if (task.status === "active" || task.status === "available") {
    const expiresAt = (task as { expiresAt?: string }).expiresAt;
    if (typeof expiresAt === "string" && expiresAt.trim()) {
      const ms = safeDateMs(expiresAt);
      if (ms != null) {
        const diffH = Math.round((ms - Date.now()) / 3600000);
        if (diffH <= 0) deadlineLabel = "已超时";
        else if (diffH <= 1) deadlineLabel = "剩 <1h";
        else if (diffH <= 24) deadlineLabel = `剩 ${diffH}h`;
        else deadlineLabel = `剩 ${Math.round(diffH / 24)}d`;
      } else {
        // expiresAt 可能是 "day:N,hour:M" 格式
        const dayMatch = expiresAt.match(/day[:\s]*(\d+)/i);
        const hourMatch = expiresAt.match(/hour[:\s]*(\d+)/i);
        if (dayMatch || hourMatch) {
          deadlineLabel = `${dayMatch ? `D${dayMatch[1]}` : ""}${hourMatch ? ` ${hourMatch[1]}:00` : ""}`;
        }
      }
    }
  }

  // requiredItemIds 进度
  let progressLabel: string | null = null;
  const req = (task as { requiredItemIds?: string[] }).requiredItemIds;
  if (Array.isArray(req) && req.length > 0) {
    progressLabel = `0/${req.length}`;
  }

  return {
    taskId: task.id,
    role,
    title: sanitizePlayerFacingInline(String(task.title ?? ""), codex),
    status: task.status,
    claimMode: task.claimMode,
    issuerLine: issuer || "未知托付方",
    nextStep: buildNextStep(task, role, codex),
    flavorLine: buildFlavorLine(task, role, codex),
    rewardChips: buildRewardChips(task, codex),
    riskTag: buildRiskTag(task),
    riskBand,
    guidanceLevel,
    deadlineLabel,
    progressLabel,
  };
}

export type TaskCompactRowViewModel = {
  taskId: string;
  title: string;
  /** 单行摘要：来源 · 钩子/压力/下一步之一，不做整张卡的重排版 */
  oneLiner: string;
  tone: TaskStageRiskBand;
};

function buildTaskCompactOneLiner(task: GameTask, codex?: Record<string, CodexEntry> | null): string {
  const hook = clipStageText(sanitizePlayerFacingInline(String((task as { playerHook?: string }).playerHook ?? ""), codex), 56);
  const urg = clipStageText(sanitizePlayerFacingInline(String((task as { urgencyReason?: string }).urgencyReason ?? ""), codex), 56);
  const hint = clipStageText(sanitizePlayerFacingInline(String(task.nextHint ?? ""), codex), 56);
  return hook || urg || hint || "轻追踪中，暂无新动向。";
}

/**
 * 「牵连 / 线索影子」等轻追踪条目 → 单行 view model。
 * 这两类任务的产品定位本就是"不抢主视图"（见 taskVisibilityPolicy 的 promise_only/clue_only），
 * 但先前 UI 仍用整张舞台卡（角色徽章+状态徽章+四行 dt/dd+风险框）渲染，视觉体量与"轻追踪"
 * 的定位矛盾，也是任务面板显得拥挤的主因之一。改为单行摘要以后，信息仍完整可查（点开仍是
 * 同一条任务），但默认状态下不再抢占版面。
 */
export function buildTaskCompactRowViewModel(
  task: GameTask,
  codex?: Record<string, CodexEntry> | null
): TaskCompactRowViewModel {
  const issuer = resolveTaskIssuerDisplay(task.issuerId, task.issuerName, codex ?? undefined);
  const tone = riskBandFromTier(stageRiskTier(task));
  return {
    taskId: task.id,
    title: sanitizePlayerFacingInline(String(task.title ?? ""), codex),
    oneLiner: `${issuer || "未知来源"} · ${buildTaskCompactOneLiner(task, codex)}`,
    tone,
  };
}

export type TaskBoardStageProjection = {
  board: PlayerTaskBoardViewModel;
  cards: {
    mainline: TaskStageCardViewModel | null;
    commissions: TaskStageCardViewModel[];
    opportunity: TaskStageCardViewModel | null;
  };
  /** 轻追踪单行条目：牵连（承诺/风险）与线索影子，默认折叠展示 */
  secondary: {
    promises: TaskCompactRowViewModel[];
    clues: TaskCompactRowViewModel[];
  };
};

/** 1+2+1 投影 + 舞台卡文案一次算清，供任务面板消费。 */
export function projectTaskBoardStageProjection(
  tasks: GameTask[],
  v3VisibilityEnabled: boolean,
  codex?: Record<string, CodexEntry> | null
): TaskBoardStageProjection {
  const board = projectTaskBoardViewModel(tasks ?? [], v3VisibilityEnabled);
  return {
    board,
    cards: {
      mainline: board.mainline ? buildTaskStageCardViewModel(board.mainline, "mainline", codex) : null,
      commissions: board.commissions.map((t) => buildTaskStageCardViewModel(t, "commission", codex)),
      opportunity: board.opportunity ? buildTaskStageCardViewModel(board.opportunity, "opportunity", codex) : null,
    },
    secondary: {
      promises: board.promises.map((t) => buildTaskCompactRowViewModel(t, codex)),
      clues: board.clues.map((t) => buildTaskCompactRowViewModel(t, codex)),
    },
  };
}

export function goalKindLabel(t: GameTask): string {
  const k = inferObjectiveKind(t as GameTaskV2);
  if (k === "main") return "主线";
  if (k === "promise") return "约定";
  return "委托";
}
