/**
 * buildTurnDeltaDigest：从已 resolve 的 DM JSON 聚合“本回合变化”摘要数据。
 *
 * 纯函数，不依赖 React / store。输出用于 TurnDeltaDigest 组件。
 * 仅消费结构化 delta 字段，不解析 narrative 文本。
 */
import type { ResolvedDmTurn } from "@/features/play/turnCommit/resolveDmTurn";

/** 道具变化：增减各一条描述 */
export type ItemChange = {
  kind: "acquired" | "consumed" | "warehouse_acquired";
  /** 用户可见名称（暂用 id 回退） */
  label: string;
};

/** 非数组变化 */
export type ScalarChange = {
  kind: "sanity" | "time" | "currency";
  /** 数值变化量（正=增加，负=减少） */
  delta: number;
  /** 可选：变化原因简述 */
  reason?: string;
};

/** 任务变化 */
export type TaskChange = {
  kind: "new" | "status";
  label: string;
};

/** 关系变化 */
export type RelationChange = {
  kind: "relation";
  /** NPC 名称（如果有）或 id */
  label: string;
};

/** 图鉴解锁 */
export type CodexChange = {
  kind: "codex";
  label: string;
};

/** 伏笔回调感知 */
export type ForeshadowPayoff = {
  kind: "foreshadow_payoff";
  /** 伏笔源文本摘要（玩家已知信息） */
  seedText: string;
  /** 播种时的简短标注 */
  source: string;
};

export type DeltaItem =
  | ScalarChange
  | ItemChange
  | TaskChange
  | RelationChange
  | CodexChange
  | ForeshadowPayoff;

export type TurnDeltaDigest = {
  /** 所有变化项（按大致感知权重排序） */
  items: DeltaItem[];
  /** 是否有任何变化（快捷判定） */
  hasChanges: boolean;
};

function resolveItemLabel(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const o = raw as Record<string, unknown>;
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  if (typeof o.id === "string" && o.id.trim()) return o.id.trim();
  return String(raw);
}

/** 规范化图鉴更新 → 名称 */
function resolveCodexLabel(raw: unknown): string {
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const o = raw as Record<string, unknown>;
  if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
  if (typeof o.id === "string" && o.id.trim()) return o.id.trim();
  return "";
}

/**
 * 从 ResolvedDmTurn 构建回合变化摘要。
 * 不做穷举展示：优先展示“玩家最可能关心的变化”，同维度过多时截断（maxPerDim）。
 */
export function buildTurnDeltaDigest(
  dm: Pick<
    ResolvedDmTurn,
    | "sanity_damage"
    | "consumes_time"
    | "currency_change"
    | "consumed_items"
    | "awarded_items"
    | "awarded_warehouse_items"
    | "codex_updates"
    | "relationship_updates"
    | "new_tasks"
    | "task_updates"
    | "foreshadow_ops"
  >,
  maxPerDim: number = 3,
): TurnDeltaDigest {
  const items: DeltaItem[] = [];

  // 1. 理智变化
  const sd = typeof dm.sanity_damage === "number" && Number.isFinite(dm.sanity_damage) ? dm.sanity_damage : 0;
  if (sd !== 0) {
    items.push({ kind: "sanity", delta: -sd });
  }

  // 2. 时间消耗
  if (dm.consumes_time !== false) {
    items.push({ kind: "time", delta: -1 });
  }

  // 3. 货币变化
  const cc = typeof dm.currency_change === "number" && Number.isFinite(dm.currency_change) ? dm.currency_change : 0;
  if (cc !== 0) {
    items.push({ kind: "currency", delta: cc });
  }

  // 4. 道具获得（行囊）
  if (Array.isArray(dm.awarded_items) && dm.awarded_items.length > 0) {
    for (const raw of dm.awarded_items) {
      if (items.filter(i => i.kind === "acquired" || i.kind === "warehouse_acquired").length >= maxPerDim) break;
      const label = resolveItemLabel(raw);
      if (label) items.push({ kind: "acquired", label });
    }
  }

  // 5. 道具消耗
  if (Array.isArray(dm.consumed_items) && dm.consumed_items.length > 0) {
    const consumed = dm.consumed_items as string[];
    for (const label of consumed) {
      if (items.filter(i => i.kind === "consumed").length >= maxPerDim) break;
      if (label) items.push({ kind: "consumed", label });
    }
  }

  // 6. 仓库获得
  if (Array.isArray(dm.awarded_warehouse_items) && dm.awarded_warehouse_items.length > 0) {
    for (const raw of dm.awarded_warehouse_items) {
      if (items.filter(i => i.kind === "warehouse_acquired").length >= maxPerDim) break;
      const label = resolveItemLabel(raw);
      if (label) items.push({ kind: "warehouse_acquired", label });
    }
  }

  // 7. 任务新增
  if (Array.isArray(dm.new_tasks) && dm.new_tasks.length > 0) {
    for (const raw of dm.new_tasks) {
      if (items.filter(i => i.kind === "new").length >= maxPerDim) break;
      const o = raw as Record<string, unknown> | undefined;
      const label = typeof o?.title === "string" && o.title.trim() ? o.title.trim() : "";
      if (label) items.push({ kind: "new", label });
    }
  }

  // 8. 任务状态变化
  if (Array.isArray(dm.task_updates) && dm.task_updates.length > 0) {
    for (const raw of dm.task_updates) {
      if (items.filter(i => i.kind === "status").length >= maxPerDim) break;
      const o = raw as Record<string, unknown> | undefined;
      const status = typeof o?.status === "string" ? o.status : "";
      const title = typeof o?.title === "string" && o.title.trim() ? o.title.trim() : "";
      if (title && (status === "completed" || status === "failed")) {
        items.push({ kind: "status", label: `${title}（${status === "completed" ? "完成" : "失败"}）` });
      }
    }
  }

  // 9. 关系变化
  if (Array.isArray(dm.relationship_updates) && dm.relationship_updates.length > 0) {
    for (const raw of dm.relationship_updates) {
      if (items.filter(i => i.kind === "relation").length >= maxPerDim) break;
      const label = resolveItemLabel(raw);
      if (label) items.push({ kind: "relation", label });
    }
  }

  // 10. 图鉴解锁
  if (Array.isArray(dm.codex_updates) && dm.codex_updates.length > 0) {
    for (const raw of dm.codex_updates) {
      if (items.filter(i => i.kind === "codex").length >= maxPerDim) break;
      const label = resolveCodexLabel(raw);
      if (label) items.push({ kind: "codex", label });
    }
  }

  // 11. 伏笔回调（foreshadow payoff）—— 由阶段 2 外部消费方判断是否 paid_off
  // 这里只标记 foreshadow_ops 中有 payoff 的记录，但具体判断移出外部
  // 因为这个纯函数不依赖 store/DB，仅根据传入的 ops 判断
  if (Array.isArray(dm.foreshadow_ops) && dm.foreshadow_ops.length > 0) {
    for (const raw of dm.foreshadow_ops) {
      const o = raw as Record<string, unknown>;
      if (o.op === "payoff") {
        const seedText = typeof o.text === "string" ? o.text : "";
        const source = typeof o.source === "string" ? o.source : "";
        if (seedText) {
          items.push({ kind: "foreshadow_payoff", seedText, source });
        }
      }
    }
  }

  return { items, hasChanges: items.length > 0 };
}
