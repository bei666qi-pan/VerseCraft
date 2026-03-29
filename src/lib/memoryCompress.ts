/**
 * 会话记忆压缩：分层 + 认知权限（阶段 2）。
 * 保留 CompressedMemory 三字段兼容；扩展 EpistemicCompressedMemory 与 DB 嵌入块。
 */

import { compressSessionMemory } from "@/lib/ai/logicalTasks";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import type {
  ActorScopedMemorySnapshotRow,
  NpcEpistemicSnapshotMin,
  NpcPrivateMemoryIndex,
  RevealTierSensitiveFactRef,
} from "@/lib/epistemic/types";
import { createRequestId } from "@/lib/security/helpers";

/** 嵌在 playerStatus jsonb 内，无需新迁移列 */
export const SESSION_MEMORY_EPISTEMIC_EMBED_KEY = "__vc_epistemic_v1";

/** 旧接口：仍用于类型兼容与最小视图 */
export interface CompressedMemory {
  plot_summary: string;
  player_status: Record<string, unknown>;
  npc_relationships: Record<string, unknown>;
}

export type LegacyCompressedMemory = CompressedMemory;

export interface EpistemicCompressedMemory extends CompressedMemory {
  /** 在场者合理可见的叙事摘要（NPC 对白可引用上限） */
  public_plot_summary?: string;
  /** 玩家视角已确认的信息（不等同于已告诉 NPC） */
  player_known_summary?: string;
  player_hidden_flags?: string[];
  /** 当前场景公共物理/秩序状态 */
  scene_public_state?: string;
  /** 系统层真相：仅 DM 编排，禁止写入 NPC 台词 */
  dm_only_truth_summary?: string;
  npc_epistemic_snapshots?: NpcEpistemicSnapshotMin[];
  recent_public_events?: string[];
  recent_private_events_by_actor?: Record<string, string[]>;
  unresolved_rumors?: string[];
  emotional_residue_markers?: Array<{ actorId?: string; note: string }>;
  /** 服务端维护：最近残响演出（用于 anti-repeat），勿写秘密正文 */
  epistemic_residue_recent_uses?: EpistemicResidueRecentEntry[];
  /** 按 NPC 的短叙事提示（不含他者私域命题正文） */
  actor_scoped_memory_snapshots?: ActorScopedMemorySnapshotRow[];
  /** 审计：各 NPC 私有记忆键前缀索引（非正文） */
  npc_private_memory_index?: NpcPrivateMemoryIndex;
  /** 与揭露档位绑定的事实 id（压缩层引用） */
  reveal_tier_sensitive_facts?: RevealTierSensitiveFactRef[];
}

export type EpistemicResidueRecentEntry = {
  npcId: string;
  mode: string;
  iso: string;
};

/** DB / route 读出的蛇形行（与 Drizzle 映射字段对应） */
export type SessionMemoryRow = {
  plot_summary: string;
  player_status: Record<string, unknown>;
  npc_relationships: Record<string, unknown>;
};

/**
 * DM 动态段用的会话记忆视图：`player_status` 已剥 `__vc_epistemic_v1`，分层字段单独列出。
 */
export type SessionMemoryForDm =
  | {
      plot_summary: string;
      player_status: Record<string, unknown>;
      npc_relationships: Record<string, unknown>;
      public_plot_summary?: string;
      player_known_summary?: string;
      player_hidden_flags?: string[];
      scene_public_state?: string;
      dm_only_truth_summary?: string;
      npc_epistemic_snapshots?: NpcEpistemicSnapshotMin[];
      recent_public_events?: string[];
      recent_private_events_by_actor?: Record<string, string[]>;
      unresolved_rumors?: string[];
      emotional_residue_markers?: Array<{ actorId?: string; note: string }>;
      epistemic_residue_recent_uses?: EpistemicResidueRecentEntry[];
      actor_scoped_memory_snapshots?: ActorScopedMemorySnapshotRow[];
      npc_private_memory_index?: NpcPrivateMemoryIndex;
      reveal_tier_sensitive_facts?: RevealTierSensitiveFactRef[];
    }
  | null;

export interface ChatMessage {
  role: string;
  content: string;
}

const RESERVED_FACT_ID_PREFIXES = ["world:", "system:", "canon:", "dm:"];

const COMPRESSION_PROMPT = `你是游戏剧情整理员。根据「旧分层记忆」与「最新约 5 轮对话」，输出**分层状态 JSON**（只输出 JSON，无 markdown）。
核心原则：不确定归属时，写入 unresolved_rumors 或 recent_public_events 的传闻位，**不要**写进某 NPC 的 knownFactIds；系统真相只进 dm_only_truth_summary。

必填（兼容旧客户端）：
- plot_summary: 字符串，**全剧编排用摘要**（偏 DM 视角，可含未公开伏笔；NPC 对白原则上不得直接引用此字段内容）。
- player_status: 对象，仅玩家状态：位置、关键道具、理智等（不要塞 NPC 私密所知）。
- npc_relationships: 对象，key 为 NPC ID 或稳定称呼，value 为态度/信任等**数值或短标签**（禁止把「只有玩家知道的秘密」写进 value 文本）。

强烈建议填写（新分层）：
- public_plot_summary: 约 120–200 字，**公共可观察**剧情（在场者从环境/公开对话能推断的上限）。
- player_known_summary: 玩家已知但**未必已告诉任何人**的信息摘要。
- player_hidden_flags: 字符串数组，玩家侧未公开标记（如 "未告诉任何人七锚细节"）。
- scene_public_state: 当前场景公开状态（灯、门、人群等）。
- dm_only_truth_summary: 系统层真相/伏笔（**绝不**进入 npc_epistemic_snapshots.knownFactIds）。
- npc_epistemic_snapshots: 数组，项为 { "npcId": "N-xxx", "knownFactIds": ["fact_1"], "playerPerceptionLevel": "stranger|familiar|named|recognized_loop", "emotionalResidueNotes": "短句体感，无具体秘密命题" }。knownFactIds 只放**该 NPC 有叙事依据已获知**的 id；不确定则留空数组。
- recent_public_events: 公开发生事件短句数组。
- recent_private_events_by_actor: 对象，key 为 "player" 或 NPC id，value 为字符串数组（仅当对话明确发生）。
- unresolved_rumors: 未证实传闻短句数组。
- emotional_residue_markers: [ { "actorId": "N-xxx?", "note": "不安/熟悉感等" } ]（禁止写具体秘密内容）。
- epistemic_residue_recent_uses: [ { "npcId": "N-xxx", "mode": "faint_familiarity", "iso": "ISO时间" } ]（若旧记忆已有则原样保留；服务端用于防重复演出，勿编造具体秘密）。

可选（阶段 4+ 细粒度）：
- actor_scoped_memory_snapshots: [ { "npcId": "N-xxx", "scopedNarrativeHint": "该 NPC 视角可引用的上限短句（不得含系统独占真相）" } ]
- npc_private_memory_index: { "N-xxx": ["mem_key_prefix_1", "…"] }（仅键/前缀，禁止正文）
- reveal_tier_sensitive_facts: [ { "id": "fact_id", "minRevealRank": 0 } ]（与 runtime reveal 档位对齐的引用）

禁止：把 dm_only_truth_summary 中的命题复制进 npc_epistemic_snapshots 或 public_plot_summary。`;

function formatChatsForCompression(chats: ChatMessage[]): string {
  return chats
    .map((m) => `${m.role === "user" ? "用户" : "DM"}：${m.content}`)
    .join("\n\n");
}

export function stripEpistemicEmbedFromPlayerStatus(ps: Record<string, unknown>): Record<string, unknown> {
  if (!ps || typeof ps !== "object") return {};
  const { [SESSION_MEMORY_EPISTEMIC_EMBED_KEY]: _drop, ...rest } = ps;
  return { ...rest };
}

function stripMetaKeysFromRecord(rec: Record<string, unknown>, isMeta: (k: string) => boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (isMeta(k)) continue;
    out[k] = v;
  }
  return out;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function asStringRecordArray(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: Record<string, string[]> = {};
  for (const [k, raw] of Object.entries(o)) {
    out[k] = asStringArray(raw);
  }
  return out;
}

function parseSnapshots(raw: unknown): NpcEpistemicSnapshotMin[] {
  if (!Array.isArray(raw)) return [];
  const levels = new Set(["stranger", "familiar", "named", "recognized_loop"]);
  const out: NpcEpistemicSnapshotMin[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    if (!npcId) continue;
    const lvlRaw = typeof o.playerPerceptionLevel === "string" ? o.playerPerceptionLevel.trim() : "stranger";
    const playerPerceptionLevel = levels.has(lvlRaw) ? (lvlRaw as NpcEpistemicSnapshotMin["playerPerceptionLevel"]) : "stranger";
    out.push({
      npcId,
      knownFactIds: asStringArray(o.knownFactIds),
      playerPerceptionLevel,
      emotionalResidueNotes:
        typeof o.emotionalResidueNotes === "string" ? o.emotionalResidueNotes.trim().slice(0, 200) : "",
    });
  }
  return out.slice(0, 24);
}

function parseEmotionalMarkers(raw: unknown): EpistemicCompressedMemory["emotional_residue_markers"] {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ actorId?: string; note: string }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const note = typeof o.note === "string" ? o.note.trim().slice(0, 160) : "";
    if (!note) continue;
    const actorId = typeof o.actorId === "string" ? o.actorId.trim() : undefined;
    out.push({ ...(actorId ? { actorId } : {}), note });
  }
  return out.slice(0, 24);
}

function parseResidueRecentUses(raw: unknown): EpistemicResidueRecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: EpistemicResidueRecentEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim().slice(0, 32) : "";
    const mode = typeof o.mode === "string" ? o.mode.trim().slice(0, 48) : "";
    const iso = typeof o.iso === "string" ? o.iso.trim().slice(0, 36) : "";
    if (!npcId || !mode || !iso) continue;
    out.push({ npcId, mode, iso });
  }
  return out.slice(0, 24);
}

function parseActorScopedSnapshots(raw: unknown): ActorScopedMemorySnapshotRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ActorScopedMemorySnapshotRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const npcId = typeof o.npcId === "string" ? o.npcId.trim() : "";
    if (!npcId) continue;
    const hint = typeof o.scopedNarrativeHint === "string" ? o.scopedNarrativeHint.trim().slice(0, 280) : "";
    out.push({ npcId, ...(hint ? { scopedNarrativeHint: hint } : {}) });
  }
  return out.slice(0, 24);
}

function parseNpcPrivateMemoryIndex(raw: unknown): NpcPrivateMemoryIndex {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: NpcPrivateMemoryIndex = {};
  for (const [k, v] of Object.entries(o)) {
    const id = k.trim().slice(0, 32);
    if (!id) continue;
    out[id] = asStringArray(v)
      .map((s) => s.slice(0, 64))
      .slice(0, 24);
  }
  return out;
}

function parseRevealTierSensitiveFacts(raw: unknown): RevealTierSensitiveFactRef[] {
  if (!Array.isArray(raw)) return [];
  const out: RevealTierSensitiveFactRef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim().slice(0, 96) : "";
    if (!id) continue;
    const mr = o.minRevealRank;
    const minRevealRank =
      typeof mr === "number" && Number.isFinite(mr) ? Math.max(0, Math.min(12, Math.floor(mr))) : 0;
    out.push({ id, minRevealRank });
  }
  return out.slice(0, 48);
}

export function parseCompressionResponseToEpistemic(content: string): EpistemicCompressedMemory | null {
  const trimmed = content.trim().replace(/^```json\s*|\s*```$/g, "");
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const plot_summary = typeof parsed.plot_summary === "string" ? parsed.plot_summary : "";
    const player_status =
      parsed.player_status && typeof parsed.player_status === "object" && !Array.isArray(parsed.player_status)
        ? (parsed.player_status as Record<string, unknown>)
        : {};
    const npc_relationships =
      parsed.npc_relationships && typeof parsed.npc_relationships === "object" && !Array.isArray(parsed.npc_relationships)
        ? (parsed.npc_relationships as Record<string, unknown>)
        : {};

    const ep: EpistemicCompressedMemory = {
      plot_summary,
      player_status,
      npc_relationships,
      public_plot_summary: typeof parsed.public_plot_summary === "string" ? parsed.public_plot_summary : undefined,
      player_known_summary: typeof parsed.player_known_summary === "string" ? parsed.player_known_summary : undefined,
      player_hidden_flags: asStringArray(parsed.player_hidden_flags),
      scene_public_state: typeof parsed.scene_public_state === "string" ? parsed.scene_public_state : undefined,
      dm_only_truth_summary: typeof parsed.dm_only_truth_summary === "string" ? parsed.dm_only_truth_summary : undefined,
      npc_epistemic_snapshots: parseSnapshots(parsed.npc_epistemic_snapshots),
      recent_public_events: asStringArray(parsed.recent_public_events),
      recent_private_events_by_actor: asStringRecordArray(parsed.recent_private_events_by_actor),
      unresolved_rumors: asStringArray(parsed.unresolved_rumors),
      emotional_residue_markers: parseEmotionalMarkers(parsed.emotional_residue_markers),
      epistemic_residue_recent_uses: parseResidueRecentUses(parsed.epistemic_residue_recent_uses),
      actor_scoped_memory_snapshots: parseActorScopedSnapshots(parsed.actor_scoped_memory_snapshots),
      npc_private_memory_index: parseNpcPrivateMemoryIndex(parsed.npc_private_memory_index),
      reveal_tier_sensitive_facts: parseRevealTierSensitiveFacts(parsed.reveal_tier_sensitive_facts),
    };
    return sanitizeEpistemicCompressedMemory(ep);
  } catch {
    return null;
  }
}

/** @deprecated 使用 parseCompressionResponseToEpistemic；保留兼容 */
export function parseCompressionResponse(content: string): CompressedMemory | null {
  const ep = parseCompressionResponseToEpistemic(content);
  return ep ? toLegacyCompressedMemory(ep) : null;
}

/**
 * 压缩失败或解析失败时：不扩大 NPC 已知集合；可选清空快照中的高风险 id。
 */
export function safeFallbackEpistemicMemory(prev: EpistemicCompressedMemory | CompressedMemory | null): EpistemicCompressedMemory | null {
  if (!prev) return null;
  const base = prev as EpistemicCompressedMemory;
  const ep: EpistemicCompressedMemory = {
    ...base,
    npc_epistemic_snapshots: (base.npc_epistemic_snapshots ?? []).map((s) => ({
      ...s,
      knownFactIds: s.knownFactIds.filter((id) => !RESERVED_FACT_ID_PREFIXES.some((p) => id.toLowerCase().startsWith(p))),
    })),
  };
  return sanitizeEpistemicCompressedMemory(ep);
}

export function sanitizeEpistemicCompressedMemory(ep: EpistemicCompressedMemory): EpistemicCompressedMemory {
  const snapshots = (ep.npc_epistemic_snapshots ?? []).map((s) => {
    const isXinlan = s.npcId === XINLAN_NPC_ID;
    let knownFactIds = s.knownFactIds.filter((id) => {
      const low = id.toLowerCase();
      if (RESERVED_FACT_ID_PREFIXES.some((p) => low.startsWith(p))) return false;
      return true;
    });
    if (!isXinlan) {
      knownFactIds = knownFactIds.filter((id) => !id.toLowerCase().includes("player_secret"));
    }
    let playerPerceptionLevel = s.playerPerceptionLevel;
    if (!isXinlan && playerPerceptionLevel === "recognized_loop") {
      playerPerceptionLevel = "named";
    }
    return {
      ...s,
      knownFactIds: [...new Set(knownFactIds)].slice(0, 48),
      playerPerceptionLevel,
      emotionalResidueNotes: s.emotionalResidueNotes.slice(0, 200),
    };
  });
  const residueUses = (ep.epistemic_residue_recent_uses ?? []).slice(0, 16);
  const actorScoped = parseActorScopedSnapshots(ep.actor_scoped_memory_snapshots);
  const npcIdx = parseNpcPrivateMemoryIndex(ep.npc_private_memory_index);
  const revealRefs = parseRevealTierSensitiveFacts(ep.reveal_tier_sensitive_facts);
  return {
    ...ep,
    npc_epistemic_snapshots: snapshots,
    epistemic_residue_recent_uses: residueUses,
    actor_scoped_memory_snapshots: actorScoped.length ? actorScoped : undefined,
    npc_private_memory_index: Object.keys(npcIdx).length ? npcIdx : undefined,
    reveal_tier_sensitive_facts: revealRefs.length ? revealRefs : undefined,
  };
}

export function toLegacyCompressedMemory(ep: EpistemicCompressedMemory): LegacyCompressedMemory {
  let plot_summary = ep.plot_summary?.trim() ?? "";
  if (!plot_summary) {
    const pub = ep.public_plot_summary?.trim() ?? "";
    const pk = ep.player_known_summary?.trim() ?? "";
    plot_summary = [pub, pk].filter(Boolean).join(" ").slice(0, 420);
  }
  return {
    plot_summary,
    player_status: stripEpistemicEmbedFromPlayerStatus(ep.player_status),
    npc_relationships: stripMetaKeysFromRecord(ep.npc_relationships, (k) => k.startsWith("__vc_")),
  };
}

export type SessionMemoryEpistemicEmbedV1 = Pick<
  EpistemicCompressedMemory,
  | "public_plot_summary"
  | "player_known_summary"
  | "player_hidden_flags"
  | "scene_public_state"
  | "dm_only_truth_summary"
  | "npc_epistemic_snapshots"
  | "recent_public_events"
  | "recent_private_events_by_actor"
  | "unresolved_rumors"
  | "emotional_residue_markers"
  | "epistemic_residue_recent_uses"
  | "actor_scoped_memory_snapshots"
  | "npc_private_memory_index"
  | "reveal_tier_sensitive_facts"
>;

export function extractEpistemicEmbedPayload(ep: EpistemicCompressedMemory): SessionMemoryEpistemicEmbedV1 {
  return {
    public_plot_summary: ep.public_plot_summary,
    player_known_summary: ep.player_known_summary,
    player_hidden_flags: ep.player_hidden_flags,
    scene_public_state: ep.scene_public_state,
    dm_only_truth_summary: ep.dm_only_truth_summary,
    npc_epistemic_snapshots: ep.npc_epistemic_snapshots,
    recent_public_events: ep.recent_public_events,
    recent_private_events_by_actor: ep.recent_private_events_by_actor,
    unresolved_rumors: ep.unresolved_rumors,
    emotional_residue_markers: ep.emotional_residue_markers,
    epistemic_residue_recent_uses: ep.epistemic_residue_recent_uses,
    actor_scoped_memory_snapshots: ep.actor_scoped_memory_snapshots,
    npc_private_memory_index: ep.npc_private_memory_index,
    reveal_tier_sensitive_facts: ep.reveal_tier_sensitive_facts,
  };
}

export function mergePlayerStatusWithEpistemicEmbed(
  playerStatus: Record<string, unknown>,
  embed: SessionMemoryEpistemicEmbedV1
): Record<string, unknown> {
  const base = stripEpistemicEmbedFromPlayerStatus(playerStatus);
  return {
    ...base,
    [SESSION_MEMORY_EPISTEMIC_EMBED_KEY]: embed,
  };
}

export function sessionMemoryToDbRow(ep: EpistemicCompressedMemory): {
  plotSummary: string;
  playerStatus: Record<string, unknown>;
  npcRelationships: Record<string, unknown>;
} {
  const sanitized = sanitizeEpistemicCompressedMemory(ep);
  const legacy = toLegacyCompressedMemory(sanitized);
  const embed = extractEpistemicEmbedPayload(sanitized);
  return {
    plotSummary: legacy.plot_summary,
    playerStatus: mergePlayerStatusWithEpistemicEmbed(legacy.player_status, embed),
    npcRelationships: legacy.npc_relationships,
  };
}

function embedToEpistemicFields(embed: unknown): Partial<EpistemicCompressedMemory> {
  if (!embed || typeof embed !== "object" || Array.isArray(embed)) return {};
  const e = embed as Record<string, unknown>;
  return {
    public_plot_summary: typeof e.public_plot_summary === "string" ? e.public_plot_summary : undefined,
    player_known_summary: typeof e.player_known_summary === "string" ? e.player_known_summary : undefined,
    player_hidden_flags: asStringArray(e.player_hidden_flags),
    scene_public_state: typeof e.scene_public_state === "string" ? e.scene_public_state : undefined,
    dm_only_truth_summary: typeof e.dm_only_truth_summary === "string" ? e.dm_only_truth_summary : undefined,
    npc_epistemic_snapshots: parseSnapshots(e.npc_epistemic_snapshots),
    recent_public_events: asStringArray(e.recent_public_events),
    recent_private_events_by_actor: asStringRecordArray(e.recent_private_events_by_actor),
    unresolved_rumors: asStringArray(e.unresolved_rumors),
    emotional_residue_markers: parseEmotionalMarkers(e.emotional_residue_markers),
    epistemic_residue_recent_uses: parseResidueRecentUses(e.epistemic_residue_recent_uses),
    actor_scoped_memory_snapshots: parseActorScopedSnapshots(e.actor_scoped_memory_snapshots),
    npc_private_memory_index: parseNpcPrivateMemoryIndex(e.npc_private_memory_index),
    reveal_tier_sensitive_facts: parseRevealTierSensitiveFacts(e.reveal_tier_sensitive_facts),
  };
}

export function hydrateEpistemicFromSessionRow(row: {
  plotSummary: string | null;
  playerStatus: unknown;
  npcRelationships: unknown;
}): EpistemicCompressedMemory | null {
  const ps =
    row.playerStatus && typeof row.playerStatus === "object" && !Array.isArray(row.playerStatus)
      ? (row.playerStatus as Record<string, unknown>)
      : {};
  const hasEmbed = SESSION_MEMORY_EPISTEMIC_EMBED_KEY in ps;
  const plotOk = Boolean(row.plotSummary && String(row.plotSummary).trim());
  if (!plotOk && !hasEmbed) return null;

  const embedRaw = ps[SESSION_MEMORY_EPISTEMIC_EMBED_KEY];
  const cleanPs = stripEpistemicEmbedFromPlayerStatus(ps);
  const nr =
    row.npcRelationships && typeof row.npcRelationships === "object" && !Array.isArray(row.npcRelationships)
      ? (row.npcRelationships as Record<string, unknown>)
      : {};
  const layered = embedToEpistemicFields(embedRaw);
  const ep: EpistemicCompressedMemory = {
    plot_summary: plotOk ? String(row.plotSummary) : "",
    player_status: cleanPs,
    npc_relationships: nr,
    ...layered,
  };
  return sanitizeEpistemicCompressedMemory(ep);
}

/** 是否值得加载会话记忆（有摘要或有认知嵌入块） */
export function sessionMemoryRowLooksPresent(row: SessionMemoryRow | null): boolean {
  if (!row) return false;
  if (String(row.plot_summary ?? "").trim()) return true;
  const ps = row.player_status;
  return Boolean(ps && typeof ps === "object" && !Array.isArray(ps) && SESSION_MEMORY_EPISTEMIC_EMBED_KEY in ps);
}

/** 将 DB 行转为 DM prompt 用分层视图（不向外暴露嵌入 JSON 坨） */
export function coerceRowToMemoryForDm(row: SessionMemoryRow | null): SessionMemoryForDm {
  if (!row || !sessionMemoryRowLooksPresent(row)) return null;
  const ep = coerceToEpistemicMemory(row);
  if (!ep) return null;
  const stripped = stripEpistemicEmbedFromPlayerStatus(ep.player_status);
  const has =
    Boolean(ep.plot_summary?.trim()) ||
    Boolean(ep.public_plot_summary?.trim()) ||
    Boolean(ep.scene_public_state?.trim()) ||
    Boolean(ep.dm_only_truth_summary?.trim()) ||
    Boolean(ep.player_known_summary?.trim()) ||
    (ep.npc_epistemic_snapshots?.length ?? 0) > 0 ||
    (ep.recent_public_events?.length ?? 0) > 0 ||
    (ep.unresolved_rumors?.length ?? 0) > 0 ||
    (ep.epistemic_residue_recent_uses?.length ?? 0) > 0 ||
    (ep.actor_scoped_memory_snapshots?.length ?? 0) > 0 ||
    (ep.reveal_tier_sensitive_facts?.length ?? 0) > 0 ||
    (ep.npc_private_memory_index && Object.keys(ep.npc_private_memory_index).length > 0) ||
    Object.keys(stripped).length > 0 ||
    Object.keys(ep.npc_relationships).length > 0;
  if (!has) return null;
  return {
    plot_summary: ep.plot_summary,
    player_status: stripped,
    npc_relationships: ep.npc_relationships,
    public_plot_summary: ep.public_plot_summary,
    player_known_summary: ep.player_known_summary,
    player_hidden_flags: ep.player_hidden_flags,
    scene_public_state: ep.scene_public_state,
    dm_only_truth_summary: ep.dm_only_truth_summary,
    npc_epistemic_snapshots: ep.npc_epistemic_snapshots,
    recent_public_events: ep.recent_public_events,
    recent_private_events_by_actor: ep.recent_private_events_by_actor,
    unresolved_rumors: ep.unresolved_rumors,
    emotional_residue_markers: ep.emotional_residue_markers,
    epistemic_residue_recent_uses: ep.epistemic_residue_recent_uses,
    actor_scoped_memory_snapshots: ep.actor_scoped_memory_snapshots,
    npc_private_memory_index: ep.npc_private_memory_index,
    reveal_tier_sensitive_facts: ep.reveal_tier_sensitive_facts,
  };
}

function normalizeOldSummaryToEpistemic(
  old: EpistemicCompressedMemory | CompressedMemory | null
): EpistemicCompressedMemory | null {
  if (!old) return null;
  const hydrated = hydrateEpistemicFromSessionRow({
    plotSummary: old.plot_summary,
    playerStatus: old.player_status,
    npcRelationships: old.npc_relationships,
  });
  if (hydrated) return hydrated;
  return sanitizeEpistemicCompressedMemory({
    plot_summary: old.plot_summary ?? "",
    player_status: stripEpistemicEmbedFromPlayerStatus(old.player_status),
    npc_relationships: old.npc_relationships,
  });
}

function formatPreviousMemoryForCompress(old: EpistemicCompressedMemory | CompressedMemory | null): string {
  if (!old) return "（无）";
  const ep = old as EpistemicCompressedMemory;
  const parts: string[] = [];
  parts.push(`【旧 plot_summary（DM编排用，勿当NPC已知）】\n${ep.plot_summary || "（无）"}`);
  if (ep.public_plot_summary?.trim()) parts.push(`【旧 public_plot_summary】\n${ep.public_plot_summary}`);
  if (ep.player_known_summary?.trim()) parts.push(`【旧 player_known_summary】\n${ep.player_known_summary}`);
  if (ep.dm_only_truth_summary?.trim()) parts.push(`【旧 dm_only_truth_summary】\n${ep.dm_only_truth_summary}`);
  if (ep.scene_public_state?.trim()) parts.push(`【旧 scene_public_state】\n${ep.scene_public_state}`);
  parts.push(`【旧 player_status（已剥嵌入）】\n${JSON.stringify(stripEpistemicEmbedFromPlayerStatus(ep.player_status))}`);
  parts.push(`【旧 npc_relationships】\n${JSON.stringify(ep.npc_relationships)}`);
  if (ep.npc_epistemic_snapshots?.length) {
    parts.push(`【旧 npc_epistemic_snapshots】\n${JSON.stringify(ep.npc_epistemic_snapshots)}`);
  }
  if (ep.unresolved_rumors?.length) parts.push(`【旧 unresolved_rumors】\n${JSON.stringify(ep.unresolved_rumors)}`);
  if (ep.actor_scoped_memory_snapshots?.length) {
    parts.push(`【旧 actor_scoped_memory_snapshots】\n${JSON.stringify(ep.actor_scoped_memory_snapshots)}`);
  }
  if (ep.npc_private_memory_index && Object.keys(ep.npc_private_memory_index).length) {
    parts.push(`【旧 npc_private_memory_index】\n${JSON.stringify(ep.npc_private_memory_index)}`);
  }
  if (ep.reveal_tier_sensitive_facts?.length) {
    parts.push(`【旧 reveal_tier_sensitive_facts】\n${JSON.stringify(ep.reveal_tier_sensitive_facts)}`);
  }
  return parts.join("\n\n");
}

/**
 * 异步压缩：返回完整 EpistemicCompressedMemory；失败时返回 safeFallbackEpistemicMemory(prev) 或 prev。
 */
export async function compressMemory(
  oldSummary: EpistemicCompressedMemory | CompressedMemory | null,
  oldestChats: ChatMessage[],
  options?: { timeoutMs?: number }
): Promise<EpistemicCompressedMemory | null> {
  const timeoutMs = options?.timeoutMs ?? 30000;
  const oldEp = normalizeOldSummaryToEpistemic(oldSummary);
  const oldBlock = formatPreviousMemoryForCompress(oldEp);
  const chatsBlock = formatChatsForCompression(oldestChats);
  const userContent = `【旧分层记忆】\n${oldBlock}\n\n【最新的 5 轮对话】\n${chatsBlock}`;

  const requestId = createRequestId("mem_compress");
  const result = await compressSessionMemory({
    messages: [
      { role: "system", content: COMPRESSION_PROMPT },
      { role: "user", content: userContent },
    ],
    ctx: {
      requestId,
      path: "/lib/memoryCompress",
    },
    requestTimeoutMs: timeoutMs,
  });

  if (!result.ok) {
    console.error("[memoryCompress] AI layer failed", result.code, result.message);
    return oldEp ? safeFallbackEpistemicMemory(oldEp) : null;
  }

  const parsed = parseCompressionResponseToEpistemic(result.content);
  if (parsed) return parsed;
  console.error("[memoryCompress] Invalid JSON from compression model");
  return oldEp ? safeFallbackEpistemicMemory(oldEp) : null;
}

/**
 * 追加一条残响演出记录并返回可写入 gameSessionMemory 的行（蛇形 plot_summary 等由调用方映射）。
 */
export function mergeEpistemicResidueUseIntoSessionDbRow(
  row: SessionMemoryRow | null,
  entry: EpistemicResidueRecentEntry
): { plotSummary: string; playerStatus: Record<string, unknown>; npcRelationships: Record<string, unknown> } | null {
  if (!row) return null;
  const ep = coerceToEpistemicMemory(row);
  if (!ep) return null;
  const prev = ep.epistemic_residue_recent_uses ?? [];
  const next: EpistemicResidueRecentEntry[] = [
    {
      npcId: entry.npcId.trim().slice(0, 32),
      mode: entry.mode.trim().slice(0, 48),
      iso: entry.iso.trim().slice(0, 36),
    },
    ...prev,
  ].slice(0, 16);
  return sessionMemoryToDbRow({ ...ep, epistemic_residue_recent_uses: next });
}

/** 将任意旧行转为 Epistemic（用于 route 入口统一） */
export function coerceToEpistemicMemory(row: SessionMemoryRow | null): EpistemicCompressedMemory | null {
  if (!row) return null;
  return (
    hydrateEpistemicFromSessionRow({
      plotSummary: row.plot_summary,
      playerStatus: row.player_status,
      npc_relationships: row.npc_relationships,
    }) ?? normalizeOldSummaryToEpistemic(row)
  );
}
