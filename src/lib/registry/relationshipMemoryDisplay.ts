/**
 * NPC 关系记忆的叙事化呈现（G2）。
 *
 * 背景：图鉴关系印象此前只有 4 档固定模板文案（盟友/恋人/敌人/暂无，见 codexDisplay.ts /
 * codexFormat.ts），完全脱离具体发生过什么。星野"记忆相片"式的做法是把关系具象为几个
 * 具体、可指认的瞬间，而不是一条抽象的好感进度条。
 *
 * 数据来源：memorySpine（见 src/lib/memorySpine/types.ts）里已经存在按 NPC 锚定
 * （anchors.npcIds）、带短摘要（summary）与时间戳（createdAtHour）的记忆条目——
 * 这正是"记忆相片"需要的原始素材，此前只喂给 AI prompt 的记忆回溯系统，从未面向玩家。
 *
 * 安全边界：
 *  - 只读取，不写入、不改变任何数值或叙事权威字段。
 *  - 只挑与"人物羁绊"直接相关的记忆种类（不含世界事件类，避免变成流水账）。
 *  - 防御性拒绝任何"看起来像未清洗内部标识"的文本（形如 N-010 / 1F_XXX），
 *    即使某个记忆写入点将来又不小心带上原始 id，也不会呈现给玩家——
 *    呼应 codexDisplay.ts 里 isLikelyRegistryIdName() 的同类防御思路。
 */

import type { MemorySpineEntry, MemorySpineState } from "@/lib/memorySpine/types";
import { stripDeveloperFacingFragments } from "@/lib/ui/playerFacingText";

/** 只挑与"人物羁绊"直接相关的记忆种类，不含 route_hint/item_provenance/danger_hint 等世界事件类。 */
const RELATIONSHIP_RELEVANT_KINDS: ReadonlySet<MemorySpineEntry["kind"]> = new Set([
  "relationship_shift",
  "npc_attitude",
  "promise",
  "debt",
  "secret_fragment",
]);

/** 形如 N-010 / A-003（注册表 id）或 1F_XXX / B1_XXX / B2_XXX（位置节点 id）的片段。 */
const LOOKS_LIKE_INTERNAL_ID_RE = /\b[A-Za-z]-\d{2,4}\b|\b(?:[1-7]F|B[12])_[A-Za-z]+\b/;

function looksSafeForPlayerDisplay(text: string | null | undefined): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (LOOKS_LIKE_INTERNAL_ID_RE.test(t)) return false;
  return true;
}

export interface NpcMemoryMomentOptions {
  /** 最多返回几条，默认 3，裁剪到 [1,6] */
  maxItems?: number;
  /** 是否允许 resolved/consumed 状态的记忆，默认 true；始终排除 expired */
  includeResolved?: boolean;
}

/**
 * 依"最近优先，同期看重要性"的顺序，挑出与该 NPC 相关、且文本已可安全呈现给玩家的记忆片段。
 * 按 mergeKey 去重（同一话题只保留最新一条），避免同一件事反复出现。
 * 找不到任何合格记忆时返回空数组——调用方应当优雅降级（不展示该区块或展示兜底文案）。
 */
export function selectNpcMemoryMoments(
  memorySpine: MemorySpineState | null | undefined,
  npcId: string,
  opts: NpcMemoryMomentOptions = {}
): MemorySpineEntry[] {
  const id = String(npcId ?? "").trim();
  if (!id || !memorySpine || !Array.isArray(memorySpine.entries)) return [];
  const maxItems = Math.max(1, Math.min(6, opts.maxItems ?? 3));
  const includeResolved = opts.includeResolved ?? true;

  const candidates = memorySpine.entries.filter((e) => {
    if (!e || e.status === "expired") return false;
    if (!includeResolved && e.status !== "active") return false;
    if (!RELATIONSHIP_RELEVANT_KINDS.has(e.kind)) return false;
    const npcIds = e.anchors?.npcIds ?? [];
    if (!npcIds.includes(id)) return false;
    return looksSafeForPlayerDisplay(e.summary);
  });

  const byMergeKey = new Map<string, MemorySpineEntry>();
  for (const e of candidates) {
    const key = e.mergeKey || e.id;
    const existing = byMergeKey.get(key);
    if (!existing || (e.createdAtHour ?? 0) >= (existing.createdAtHour ?? 0)) {
      byMergeKey.set(key, e);
    }
  }

  return Array.from(byMergeKey.values()).sort((a, b) => {
    const hourDiff = (b.createdAtHour ?? 0) - (a.createdAtHour ?? 0);
    if (hourDiff !== 0) return hourDiff;
    return (b.salience ?? 0) - (a.salience ?? 0);
  }).slice(0, maxItems);
}

/** 轻量清洗单条记忆文本：去除开发者语气残留、裁剪长度。不改写内容本身的叙事含义。 */
export function formatNpcMemoryMomentLine(entry: MemorySpineEntry, maxLen = 60): string {
  const cleaned = stripDeveloperFacingFragments(String(entry?.summary ?? "")).trim();
  if (!cleaned) return "";
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen).trim()}…`;
}

/** 便捷组合：选取 + 格式化 + 过滤空值，得到可直接渲染的记忆片段数组。 */
export function buildNpcMemoryMomentLines(
  memorySpine: MemorySpineState | null | undefined,
  npcId: string,
  opts: NpcMemoryMomentOptions = {}
): string[] {
  return selectNpcMemoryMoments(memorySpine, npcId, opts)
    .map((e) => formatNpcMemoryMomentLine(e))
    .filter((line) => line.length > 0);
}
