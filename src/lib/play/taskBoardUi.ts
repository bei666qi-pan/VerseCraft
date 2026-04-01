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

function inferSurfaceSlot(task: GameTask): TaskSurfaceSlot {
  const t = task as GameTaskV2;
  if (t.surfaceSlot) return t.surfaceSlot;
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

export type TaskStageCardViewModel = {
  taskId: string;
  role: TaskStageRole;
  title: string;
  status: GameTask["status"];
  claimMode: GameTask["claimMode"];
  issuerLine: string;
  whyMatters: string;
  ifNotDone: string;
  payoffLine: string;
  riskSense: string;
  /** UI 用：低风险中性、期限/中等不安、高反噬灼热 */
  riskBand: TaskStageRiskBand;
};

function clipStageText(s: string, max: number): string {
  const x = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!x) return "";
  return x.length <= max ? x : `${x.slice(0, max - 1)}…`;
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

function buildWhyMatters(task: GameTask, role: TaskStageRole, codex?: Record<string, CodexEntry> | null): string {
  const urg = clipStageText(sanitizePlayerFacingInline(String((task as { urgencyReason?: string }).urgencyReason ?? ""), codex), 96);
  const hook = clipStageText(sanitizePlayerFacingInline(String((task as { playerHook?: string }).playerHook ?? ""), codex), 96);
  const hint = clipStageText(sanitizePlayerFacingInline(String(task.nextHint ?? ""), codex), 96);
  const desc = clipStageText(sanitizePlayerFacingInline(String(task.desc ?? ""), codex), 96);
  if (urg) return urg;
  if (hook) return hook;
  if (hint) return hint;
  if (desc) return desc;
  if (role === "mainline") return "这是你当前最该推进的剧情轴心。";
  if (role === "commission") return "这是别人托付给你的交换与承诺。";
  return "短时窗口里的一次机会，错过通常不会原样回来。";
}

function buildIfNotDone(task: GameTask, role: TaskStageRole, codex?: Record<string, CodexEntry> | null): string {
  const residue = clipStageText(
    sanitizePlayerFacingInline(String((task as { residueOnFail?: string }).residueOnFail ?? ""), codex),
    100
  );
  if (residue) return residue;
  if (role === "mainline") return "不做：主线推进停滞，后续选择与资源窗口都会变窄。";
  if (role === "commission") return "不做：人情账会结转，信任与要价都会换算法。";
  return "错过：这条捷径/窗口关闭，后续只能走更硬的路线。";
}

function buildPayoffLine(task: GameTask, codex?: Record<string, CodexEntry> | null): string {
  const t = task as GameTaskV2;
  const unlocks = Array.isArray(t.reward?.unlocks) ? t.reward!.unlocks : [];
  const rel = Array.isArray(t.reward?.relationshipChanges) ? t.reward!.relationshipChanges.length : 0;
  const route = typeof t.relatedEscapeProgress === "string" && t.relatedEscapeProgress.trim().length > 0;
  const intel =
    (Array.isArray(t.sourceClueIds) ? t.sourceClueIds.length : 0) +
    (Array.isArray(t.followupSeedCodes) ? t.followupSeedCodes.length : 0);
  const ori = typeof t.reward?.originium === "number" ? t.reward!.originium : 0;

  if (unlocks.length > 0) {
    const labels = unlocks
      .slice(0, 3)
      .map((u) => clipStageText(sanitizePlayerFacingInline(String(u), codex), 36))
      .filter(Boolean);
    if (labels.length > 0)
      return `做成可打开新权限/通道：${labels.join("、")}${unlocks.length > 3 ? "…" : ""}`;
    return "做成会解锁新的行动权限或叙事口子。";
  }
  if (route) return "做成会更靠近「脱困/出路」相关推进，并松动关键条件。";
  if (rel > 0) return `做成会在关系侧留下可购买的下文（${rel} 处关键变动信号）。`;
  if (intel > 0) return "做成会在手记/情报侧出现可验证的新条目，方便下一步下注。";
  if (ori > 0) return `做成可获得资源补给（原石 ${ori} 等），用于后续交换与应急。`;
  return "做成会把故事舞台向前推进一步，让你获得新的可选项。";
}

function riskBandFromTier(tier: ReturnType<typeof stageRiskTier>): TaskStageRiskBand {
  if (tier === "extreme" || tier === "high") return "hot";
  if (tier === "medium") return "uneasy";
  return "calm";
}

function buildRiskSenseLine(
  task: GameTask,
  codex?: Record<string, CodexEntry> | null
): { line: string; band: TaskStageRiskBand } {
  const tier = stageRiskTier(task);
  const band = riskBandFromTier(tier);
  const deadline = isDeadlineTask(task);
  const rn = clipStageText(sanitizePlayerFacingInline(String((task as { riskNote?: string }).riskNote ?? ""), codex), 72);

  let base = "";
  if (tier === "extreme") base = "高风险高回报：容错很薄，反噬会来得很真。";
  else if (tier === "high") base = "风险偏高：选错或拖延会改写关系与后续窗口。";
  else if (tier === "medium") base = deadline ? "有时间窗口：拖着做，代价会换一种方式回来。" : "风向不稳：现在看起来还算稳。";
  else base = deadline ? "期限在走近：未必致命，但会逼你做取舍。" : "当前压迫感不强，但这是舞台不是安全屋。";

  const line = rn ? clipStageText(`${base} ${rn}`, 118) : base;
  return { line, band };
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
  const risk = buildRiskSenseLine(task, codex);
  return {
    taskId: task.id,
    role,
    title: sanitizePlayerFacingInline(String(task.title ?? ""), codex),
    status: task.status,
    claimMode: task.claimMode,
    issuerLine: issuer || "未知托付方",
    whyMatters: buildWhyMatters(task, role, codex),
    ifNotDone: buildIfNotDone(task, role, codex),
    payoffLine: buildPayoffLine(task, codex),
    riskSense: risk.line,
    riskBand: risk.band,
  };
}

export type TaskBoardStageProjection = {
  board: PlayerTaskBoardViewModel;
  cards: {
    mainline: TaskStageCardViewModel | null;
    commissions: TaskStageCardViewModel[];
    opportunity: TaskStageCardViewModel | null;
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
  };
}

export function goalKindLabel(t: GameTask): string {
  const k = inferObjectiveKind(t as GameTaskV2);
  if (k === "main") return "主线";
  if (k === "promise") return "约定";
  return "委托";
}
