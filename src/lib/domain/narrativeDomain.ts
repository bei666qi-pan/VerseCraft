/**
 * 叙事域统一模型（兼容式）：不替代现有 GameTaskV2 / Item / ResolvedDmTurn，
 * 而是提供可审计的语义层类型与适配入口，供快照、合并与 UI 渐进接入。
 */

/** 与 GameTaskStatus 字符串一致；本文件不 import taskV2，避免与 clueMerge→taskV2 形成环 */
export type TaskStatusSurface = "active" | "completed" | "failed" | "hidden" | "available";

/** DM 线索分类：不足格升为「正式目标」的叙事信息落此 */
export type ClueKind =
  | "rumor"
  | "hypothesis"
  | "unverified"
  | "place_anomaly"
  | "npc_anomaly"
  | "trace"
  | "dead_end";

/**
 * 线索验证状态（状态机骨架）
 * - unknown：刚记下
 * - pending_verify：玩家/NPC 正在验证
 * - verified：与剧情或物证对齐
 * - invalidated：被推翻/误导
 */
export type ClueVerifyState = "unknown" | "pending_verify" | "verified" | "invalidated";

export type NarrativeEntitySource = "dm" | "player_inferred" | "system";

export type ClueVisibility = "shown" | "hidden";

/** 叙事谱系/审计（阶段 6：可选，旧档无） */
export type NarrativeProvenanceChannel =
  | "dm_clue_updates"
  | "dm_change_set"
  | "dm_new_task"
  | "dm_task_patch"
  | "system_repair";

export interface NarrativeTraceV1 {
  channel: NarrativeProvenanceChannel;
  /** 短审计串（请求片段、修复动作等），最多由合并逻辑裁剪 */
  audit?: string[];
}

/** 手记/线索簿中的单条线索（持久化在 RunSnapshotV2.journal） */
export interface ClueEntry {
  id: string;
  title: string;
  detail: string;
  kind: ClueKind;
  /** 验证状态（与 kind 正交） */
  status: ClueVerifyState;
  source: NarrativeEntitySource;
  visibility: ClueVisibility;
  /** 1 低 … 3 高，供 UI 排序与摘要裁剪 */
  importance: 1 | 2 | 3;
  relatedNpcIds: string[];
  relatedLocationIds: string[];
  /** 与背包/仓库物品 id 弱关联，避免线索与物割裂 */
  relatedItemIds: string[];
  /** 可选：绑定的正式目标 task id */
  relatedObjectiveId: string | null;
  /** 人类可读：如何获得（如 dm_turn / codex_sidebar） */
  acquisitionSource: string;
  triggerSource: string | null;
  createdAt: string;
  updatedAt: string;
  /** 成熟后可指向将升格的目标 id（由 DM/变更集写入，供提示与校验） */
  maturesToObjectiveId?: string | null;
  /** 来源与修复轨迹 */
  trace?: NarrativeTraceV1;
}

export const JOURNAL_STATE_VERSION = 1 as const;

/** 存档内手记状态（嵌在 RunSnapshotV2，旧档缺省为空） */
export interface JournalState {
  version: typeof JOURNAL_STATE_VERSION;
  clues: ClueEntry[];
}

export function createEmptyJournalState(): JournalState {
  return { version: JOURNAL_STATE_VERSION, clues: [] };
}

/** 背包+仓库只读视图（领域层，不拷贝运行时函数） */
export interface InventoryState {
  inventoryItemIds: string[];
  warehouseItemIds: string[];
}

/** 正式目标语义类（产品层）；存储仍用 GameTaskV2 + 可选 goalKind */
export type ObjectiveKind = "main" | "promise" | "commission";

/**
 * 领域层「目标」视图：由 GameTaskV2 适配而来，不单独落库重复全文。
 * id 与任务 id 一致，保证与 task_updates / new_tasks 对齐。
 */
export interface DomainObjectiveView {
  id: string;
  kind: ObjectiveKind;
  title: string;
  narrativeSummary: string;
  status: TaskStatusSurface;
  relatedNpcIds: string[];
  relatedLocationIds: string[];
  relatedItemIds: string[];
  issuerId: string;
  issuerName: string;
}

/** 目标进度（与任务 status 一致时的派生结构，供 UI/分析） */
export interface ObjectiveProgress {
  objectiveId: string;
  status: TaskStatusSurface;
  lastUpdatedAt: string | null;
}

/**
 * 单回合「奖励包」视图：对应 DM 已解析字段子集，便于结算对齐审计。
 * 不替代服务端 ResolvedDmTurn，仅作类型别名与文档锚点。
 */
export interface NarrativeRewardBundle {
  currencyDelta: number;
  consumedItemNames: string[];
  awardedInventoryIds: string[];
  awardedWarehouseIds: string[];
}

/**
 * 世界增量补丁名：与 ResolvedDmTurn 字段一一对应（扩展字段用可选）。
 * 用于中间层把「同一回合写回」归并为一次 WorldUpdate。
 */
export type WorldUpdateKey =
  | "codex_updates"
  | "relationship_updates"
  | "new_tasks"
  | "task_updates"
  | "clue_updates"
  | "awarded_items"
  | "awarded_warehouse_items"
  | "consumed_items"
  | "currency_change"
  | "player_location"
  | "npc_location_updates"
  | "main_threat_updates"
  | "weapon_updates"
  | "weapon_bag_updates";

export type WorldUpdate = Partial<Record<WorldUpdateKey, unknown>>;

const NARRATIVE_CHANNELS = new Set<NarrativeProvenanceChannel>([
  "dm_clue_updates",
  "dm_change_set",
  "dm_new_task",
  "dm_task_patch",
  "system_repair",
]);

function uniqAuditStrings(arr: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = String(s ?? "")
      .trim()
      .slice(0, 120);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** 从 DM/存档行解析叙事谱系（无效则 undefined） */
export function normalizeNarrativeTrace(raw: unknown): NarrativeTraceV1 | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const ch = o.channel;
  if (typeof ch !== "string" || !NARRATIVE_CHANNELS.has(ch as NarrativeProvenanceChannel)) return undefined;
  const auditRaw = Array.isArray(o.audit) ? o.audit : [];
  const audit = uniqAuditStrings(
    auditRaw.filter((x): x is string => typeof x === "string"),
    8
  );
  return {
    channel: ch as NarrativeProvenanceChannel,
    ...(audit.length > 0 ? { audit } : {}),
  };
}

/** 合并线索/任务上的 trace（审计串累加，通道优先较新一方） */
export function mergeNarrativeTrace(
  prev: NarrativeTraceV1 | undefined,
  next: NarrativeTraceV1 | undefined,
  preferNext: boolean
): NarrativeTraceV1 | undefined {
  if (!prev && !next) return undefined;
  if (!prev) return next;
  if (!next) return prev;
  const audit = uniqAuditStrings([...(prev.audit ?? []), ...(next.audit ?? [])], 12);
  return {
    channel: preferNext ? next.channel : prev.channel,
    ...(audit.length > 0 ? { audit } : {}),
  };
}
