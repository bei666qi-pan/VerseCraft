/**
 * 阶段 4 — 任务「人物驱动层」类型与推断（不依赖 taskV2 运行时，避免循环依赖）。
 *
 * --- 审计摘要（taskV2 现状）---
 * - 已有但未吃满：`spokenDeliveryStyle`、`issuerIntent`、`playerHook`、`urgencyReason`、
 *   `residueOnComplete`/`residueOnFail`、`hiddenMotive`、`promiseBinding`、`narrativeTrace`、
 *   `sourceClueIds`、`relatedNpcIds` —— 多留在戏剧块里，未进入分区权重与「谁在推进我」的排序。
 * - 偏系统、压扁人物：全域按 `guidanceLevel` 排序、`pickPrimaryTask` 主线绝对优先、
 *   `npcProactiveGrant` 冷却 + 地点 gate —— 人物差异易被「可接取列表」同质化。
 * - 开局密度与可见性：多任务并列 active/available + 强引导，追踪串并列标题，
 *   NPC 存在感被「地点/状态」标签稀释。
 * - 主线 / guidance：`inferObjectiveKind` 常把人物线落成 commission，承诺类缺少稳定出口，
 *   人物线在板上易成陪衬。
 * - 主动发放：数值 gate 正确但节奏像「时间表」；需与 `issuerPressureStyle`、叙事层对齐，
 *   由叙事约束块收口语气（见 drama / npcHeart）。
 */

export type TaskNarrativeLayerKind = "soft_lead" | "conversation_promise" | "formal_task";

export type IssuerPersonaMode =
  | "silent_reciprocal"
  | "sweet_patch"
  | "ledger_route"
  | "audited_trade"
  | "scripted_pull"
  | "shelter_refusal"
  | "generic";

export type IssuerPressureStyle = "low" | "mid" | "high" | "crisis_only";
export type IssuerTrustTestMode = "none" | "probe" | "deposit" | "mutual_risk";
export type IssuerDemandStyle = "soft" | "explicit" | "coded" | "transactional";
export type IssuerSoftRevealMode =
  | "whisper"
  | "ledger_shadow"
  | "mirror_fragment"
  | "receipt"
  | "script_tweak"
  | "closed_door";

/** 归一化 0–1 权重/价值 */
export function clampUnit(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.min(1, v));
}

export type TaskDriveProbe = {
  taskNarrativeLayer?: TaskNarrativeLayerKind;
  shouldStayAsSoftLead?: boolean;
  shouldStayAsConversationPromise?: boolean;
  shouldBeFormalTask?: boolean;
  goalKind?: "main" | "promise" | "commission";
  promiseBinding?: { npcId?: string };
  type?: string;
  guidanceLevel?: string;
};

export function inferEffectiveNarrativeLayer(t: TaskDriveProbe): TaskNarrativeLayerKind {
  if (t.taskNarrativeLayer) return t.taskNarrativeLayer;
  if (t.shouldStayAsSoftLead) return "soft_lead";
  if (t.shouldStayAsConversationPromise || t.goalKind === "promise" || (t.promiseBinding?.npcId && t.promiseBinding.npcId.length > 0)) {
    return "conversation_promise";
  }
  if (t.type === "main") return "formal_task";
  if (t.shouldBeFormalTask === false) return "conversation_promise";
  if (t.type === "character" && t.guidanceLevel === "light") return "conversation_promise";
  return "formal_task";
}

/** 任务板 promiseRisk 人物向加权（越高越应进入承诺/风险带） */
export function promiseRiskHumanSignals(t: TaskDriveProbe & {
  futureDebtValue?: number;
  emotionalResidueValue?: number;
  relationshipGateWeight?: number;
}): number {
  let s = 0;
  if (inferEffectiveNarrativeLayer(t) === "conversation_promise") s += 1.15;
  if ((t.futureDebtValue ?? 0) >= 0.35) s += 0.55;
  if ((t.emotionalResidueValue ?? 0) >= 0.35) s += 0.55;
  if ((t.relationshipGateWeight ?? 0) >= 0.45) s += 0.45;
  return s;
}

/** paths 区：压低 soft lead / 人情线的排序优先级（数值越大越靠后） */
export function pathDemotionBias(t: TaskDriveProbe): number {
  const layer = inferEffectiveNarrativeLayer(t);
  if (layer === "soft_lead") return 2.5;
  if (layer === "conversation_promise") return 1;
  return 0;
}

export function normalizeIssuerPersonaMode(v: unknown): IssuerPersonaMode | undefined {
  return v === "silent_reciprocal" ||
    v === "sweet_patch" ||
    v === "ledger_route" ||
    v === "audited_trade" ||
    v === "scripted_pull" ||
    v === "shelter_refusal" ||
    v === "generic"
    ? v
    : undefined;
}

export function normalizeIssuerPressureStyle(v: unknown): IssuerPressureStyle | undefined {
  return v === "low" || v === "mid" || v === "high" || v === "crisis_only" ? v : undefined;
}

export function normalizeIssuerTrustTestMode(v: unknown): IssuerTrustTestMode | undefined {
  return v === "none" || v === "probe" || v === "deposit" || v === "mutual_risk" ? v : undefined;
}

export function normalizeIssuerDemandStyle(v: unknown): IssuerDemandStyle | undefined {
  return v === "soft" || v === "explicit" || v === "coded" || v === "transactional" ? v : undefined;
}

export function normalizeIssuerSoftRevealMode(v: unknown): IssuerSoftRevealMode | undefined {
  return v === "whisper" ||
    v === "ledger_shadow" ||
    v === "mirror_fragment" ||
    v === "receipt" ||
    v === "script_tweak" ||
    v === "closed_door"
    ? v
    : undefined;
}

export function normalizeTaskNarrativeLayer(v: unknown): TaskNarrativeLayerKind | undefined {
  return v === "soft_lead" || v === "conversation_promise" || v === "formal_task" ? v : undefined;
}
