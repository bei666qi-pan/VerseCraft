export type MemorySpineKind =
  | "promise"
  | "debt"
  | "relationship_shift"
  | "secret_fragment"
  | "route_hint"
  | "danger_hint"
  | "item_provenance"
  | "task_residue"
  | "death_mark"
  | "npc_attitude"
  | "escape_condition"
  | "hook";

export type MemorySpineScope = "run_private" | "npc_local" | "location_local" | "session_world";

export type MemorySpineStatus = "active" | "resolved" | "consumed" | "expired";

export type MemorySpineSource =
  | "task_update"
  | "relationship_update"
  | "location_change"
  | "codex_update"
  | "threat_update"
  | "death"
  | "resolved_turn"
  | "system_hook";

export type MemorySpineAnchors = {
  locationIds?: string[];
  npcIds?: string[];
  taskIds?: string[];
  itemIds?: string[];
  floorIds?: string[];
  worldFlags?: string[];
};

export type MemorySpineEntry = {
  id: string;
  kind: MemorySpineKind;
  scope: MemorySpineScope;

  /** 极短提要：给 prompt/系统看的“记忆脊柱”，不是日志。建议 ≤ 60 中文字符。 */
  summary: string;

  /** 重要性（0..1） */
  salience: number;
  /** 可信度（0..1）。结构化字段通常更高，narrative 补充更低。 */
  confidence: number;

  status: MemorySpineStatus;

  createdAtHour: number;
  lastTouchedAtHour: number;

  /** 过期时间窗口；0 表示立即失活（但仍可用于调试/统计，prune 会清掉）。 */
  ttlHours: number;

  /** mergeKey 相同则合并，避免爆量。 */
  mergeKey: string;

  anchors: MemorySpineAnchors;
  recallTags: string[];

  source: MemorySpineSource;

  /** 是否允许投影到 world knowledge / facts（默认保守）。 */
  promoteToLore: boolean;
};

export type MemorySpineState = {
  v: 1;
  entries: MemorySpineEntry[];
};

export function createEmptyMemorySpine(): MemorySpineState {
  return { v: 1, entries: [] };
}

