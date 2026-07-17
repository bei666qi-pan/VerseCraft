import { buildCodexIntro, computeRelationshipLabel, resolveCodexDisplayName } from "@/lib/registry/codexDisplay";
import { buildNpcMemoryMomentLines } from "@/lib/registry/relationshipMemoryDisplay";
import { ANOMALIES } from "@/lib/registry/anomalies";
import type { FloorId } from "@/lib/registry/types";
import { formatCompactLocationLabel } from "@/lib/ui/locationLabels";
import type { MemorySpineState } from "@/lib/memorySpine/types";
import type { CodexEntry } from "@/store/useGameStore";
import { ALL_CODEX_CATALOG_SLOTS, type CodexCatalogSlot } from "./codexCatalog";
import { formatLocalizedLocation, localizedCodexName } from "@/lib/i18n/gameDisplay";
import type { GameLanguage } from "@/lib/i18n/language";

/** 图鉴类型筛选：全部 / 仅人物 / 仅异常 */
export type MobileCodexTypeFilter = "all" | "npc" | "anomaly";
/** 图鉴楼层范围：仅当前楼层 / 全部楼层 */
export type MobileCodexFloorScope = "current" | "all";

export type MobileCodexDynamicNpcStates = Record<string, { currentLocation?: string; isAlive?: boolean } | undefined>;

export type MobileCodexMainThreatByFloor = Record<
  string,
  { threatId?: string; floorId?: string; phase?: string } | undefined
>;

export type MobileCodexFloorOptions = {
  codex?: Record<string, CodexEntry> | null;
  playerLocation?: string | null;
  floorId?: FloorId | null;
  dynamicNpcStates?: MobileCodexDynamicNpcStates | null;
  mainThreatByFloor?: MobileCodexMainThreatByFloor | null;
  slots?: readonly CodexCatalogSlot[] | null;
};

export type MobileCodexCardModel =
  | {
      id: string;
      kind: "slot";
      slot: CodexCatalogSlot;
      identified: boolean;
      displayName: string;
      location: string;
      disabled: false;
      /** 已识别但玩家尚未点开查看过详情，驱动卡片"新发现"角标 */
      unread: boolean;
    }
  | {
      id: "__more__";
      kind: "more";
      identified: false;
      displayName: "——";
      location: string;
      disabled: true;
      unread: false;
    };

export type MobileCodexDetail = {
  identified: boolean;
  name: string;
  location: string;
  quote: string | null;
  intro: string;
  observation: string;
  relationship: string;
  /** G2：与该 NPC 相关的具体记忆片段（叙事化，非数值），最多数条；无记忆时为空字符串。 */
  memories: string;
  /** 异常类条目的危险等级展示文案（如"危险等级：高"），仅在已识别异常时存在，否则为 null。 */
  dangerLabel: string | null;
};

const LOCATION_FIELD_CANDIDATES = [
  "location",
  "currentLocation",
  "current_location",
  "lastKnownLocation",
  "last_known_location",
  "player_location",
] as const;

export function resolveMobileCodexFloorId(locationOrFloor: string | null | undefined): FloorId | null {
  const raw = String(locationOrFloor ?? "").trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (upper === "B2" || upper.startsWith("B2_")) return "B2";
  if (upper === "B1" || upper.startsWith("B1_")) return "B1";

  const internal = upper.match(/^([1-7])F(?:_|$)/);
  if (internal) return internal[1] as FloorId;

  const label = raw.match(/^([1-7])\s*(?:F|楼|层)(?:\b|[\s_\u4e00-\u9fa5])/i);
  if (label) return label[1] as FloorId;

  const bare = raw.match(/^([1-7])$/);
  if (bare) return bare[1] as FloorId;

  return null;
}

export function resolveMobileCodexCurrentFloor(playerLocation: string | null | undefined): FloorId {
  return resolveMobileCodexFloorId(playerLocation) ?? "B1";
}

export function formatMobileCodexFloorLabel(floorId: FloorId): string {
  if (floorId === "B2") return "B2";
  if (floorId === "B1") return "B1";
  return `${floorId}F`;
}

function readCodexEntryLocation(entry: CodexEntry | null | undefined): string | null {
  const looseEntry = (entry ?? {}) as Record<string, unknown>;
  for (const key of LOCATION_FIELD_CANDIDATES) {
    const value = looseEntry[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function resolveSlotStaticFloor(slot: CodexCatalogSlot): FloorId | null {
  if (slot.floor !== "random") return slot.floor;
  return null;
}

function resolveActiveThreatFloor(
  slot: CodexCatalogSlot,
  mainThreatByFloor: MobileCodexMainThreatByFloor | null | undefined
): FloorId | null {
  if (slot.type !== "anomaly") return null;

  for (const [floorKey, threat] of Object.entries(mainThreatByFloor ?? {})) {
    if (!threat || threat.threatId !== slot.id || threat.phase === "idle") continue;
    const floor = resolveMobileCodexFloorId(threat.floorId) ?? resolveMobileCodexFloorId(floorKey);
    if (floor) return floor;
  }

  return null;
}

export function resolveMobileCodexSlotEffectiveFloor(
  slot: CodexCatalogSlot,
  options: Pick<MobileCodexFloorOptions, "dynamicNpcStates" | "mainThreatByFloor"> & {
    codex?: Record<string, CodexEntry> | null;
  } = {}
): FloorId | null {
  if (slot.type === "npc") {
    const dynamicState = options.dynamicNpcStates?.[slot.id] ?? null;
    if (dynamicState?.isAlive === false) return null;

    const dynamicFloor = resolveMobileCodexFloorId(dynamicState?.currentLocation);
    if (dynamicFloor) return dynamicFloor;

    const entryFloor = resolveMobileCodexFloorId(readCodexEntryLocation(options.codex?.[slot.id] ?? null));
    if (entryFloor) return entryFloor;

    return resolveSlotStaticFloor(slot);
  }

  return resolveActiveThreatFloor(slot, options.mainThreatByFloor) ?? resolveSlotStaticFloor(slot);
}

export function getMobileCodexSlotsForFloor(options: MobileCodexFloorOptions = {}): CodexCatalogSlot[] {
  const currentFloor = options.floorId ?? resolveMobileCodexCurrentFloor(options.playerLocation);
  const slots = options.slots ?? ALL_CODEX_CATALOG_SLOTS;

  return slots.filter((slot) => {
    const floor = resolveMobileCodexSlotEffectiveFloor(slot, options);
    return floor === currentFloor;
  });
}

export function isMobileCodexSlotIdentified(
  codex: Record<string, CodexEntry> | null | undefined,
  id: string
): boolean {
  return Boolean(codex?.[id]);
}

export function getMobileCodexIdentifiedCount(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS
): number {
  return slots.filter((slot) => isMobileCodexSlotIdentified(codex, slot.id)).length;
}

/** 已识别、但玩家尚未点开查看过详情（不在 viewedCodexIds 中）。用于"新发现"角标持久化。 */
export function isMobileCodexEntryUnread(
  codex: Record<string, CodexEntry> | null | undefined,
  viewedCodexIds: Record<string, boolean> | null | undefined,
  id: string
): boolean {
  return isMobileCodexSlotIdentified(codex, id) && !viewedCodexIds?.[id];
}

/** 统计未读（已识别但未查看）条目数，默认统计全部楼层，供底部导航角标使用。 */
export function getMobileCodexUnreadCount(
  codex: Record<string, CodexEntry> | null | undefined,
  viewedCodexIds: Record<string, boolean> | null | undefined,
  slots: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS
): number {
  return slots.filter((slot) => isMobileCodexEntryUnread(codex, viewedCodexIds, slot.id)).length;
}

/** 按人物/异常类型筛选目录 slot，"all" 时原样返回。 */
export function filterMobileCodexSlotsByType(
  slots: readonly CodexCatalogSlot[],
  typeFilter: MobileCodexTypeFilter
): CodexCatalogSlot[] {
  if (typeFilter === "all") return [...slots];
  return slots.filter((slot) => slot.type === typeFilter);
}

/**
 * 按关键字搜索已识别条目的展示名称；空关键字时原样返回。
 * 未识别条目名称对玩家不可见（显示"？？？"），因此不参与匹配，避免以搜索方式提前泄露未发现条目的真实身份。
 */
export function filterMobileCodexSlotsByQuery(
  slots: readonly CodexCatalogSlot[],
  codex: Record<string, CodexEntry> | null | undefined,
  query: string,
  language: GameLanguage = "zh-CN"
): CodexCatalogSlot[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...slots];
  return slots.filter((slot) => {
    const entry = codex?.[slot.id] ?? null;
    if (!entry) return false;
    return formatMobileCodexName(entry, slot, language).toLowerCase().includes(q);
  });
}

/** 异常危险等级展示文案：仅对已识别异常生效，读取注册表 displayDangerLevel（未配置时为 null）。 */
export function resolveMobileCodexDangerLabel(slot: CodexCatalogSlot, identified: boolean, language: GameLanguage = "zh-CN"): string | null {
  if (!identified || slot.type !== "anomaly") return null;
  const level = ANOMALIES.find((a) => a.id === slot.id)?.displayDangerLevel?.trim();
  if (!level) return null;
  if (language !== "en-US") return `危险等级：${level}`;
  const labels: Record<string, string> = { 中: "Medium", 高: "High", 中高: "Medium-High", 极高: "Extreme", 终局: "Final" };
  return `Danger: ${labels[level] ?? level}`;
}

export function shouldAppendMobileCodexMoreCard(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS
): boolean {
  return slots.length > 0 && getMobileCodexIdentifiedCount(codex, slots) === slots.length;
}

export function resolveMobileCodexInitialSelection(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS
): string | null {
  return slots.find((slot) => isMobileCodexSlotIdentified(codex, slot.id))?.id ?? slots[0]?.id ?? null;
}

export function buildMobileCodexCardModels(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = ALL_CODEX_CATALOG_SLOTS,
  options: Pick<MobileCodexFloorOptions, "dynamicNpcStates"> & {
    viewedCodexIds?: Record<string, boolean> | null;
  } = {},
  language: GameLanguage = "zh-CN"
): MobileCodexCardModel[] {
  const cards: MobileCodexCardModel[] = slots.map((slot) => {
    const entry = codex?.[slot.id] ?? null;
    const identified = Boolean(entry);
    return {
      id: slot.id,
      kind: "slot",
      slot,
      identified,
      displayName: identified && entry ? formatMobileCodexName(entry, slot, language) : language === "en-US" ? "???" : "？？？",
      location:
        identified && entry
          ? resolveMobileCodexEntryLocation(entry, slot, options.dynamicNpcStates, language)
          : language === "en-US" ? "Unidentified" : "尚未识别",
      disabled: false,
      unread: isMobileCodexEntryUnread(codex, options.viewedCodexIds, slot.id),
    };
  });

  if (shouldAppendMobileCodexMoreCard(codex, slots)) {
    cards.push({
      id: "__more__",
      kind: "more",
      identified: false,
      displayName: "——",
      location: language === "en-US" ? "No more entries" : "暂无更多",
      disabled: true,
      unread: false,
    });
  }

  return cards;
}

export function buildMobileFloorCodexCardModels(
  codex: Record<string, CodexEntry> | null | undefined,
  options: MobileCodexFloorOptions = {}
): MobileCodexCardModel[] {
  return buildMobileCodexCardModels(codex, getMobileCodexSlotsForFloor({ ...options, codex }), options);
}

export function formatMobileCodexLocation(location: string | null | undefined, language: GameLanguage = "zh-CN"): string {
  const raw = String(location ?? "").trim();
  if (!raw) return language === "en-US" ? "Unknown area" : "未知区域";

  const compact = formatCompactLocationLabel(raw);
  if (compact !== "未知区域") return formatLocalizedLocation(language, raw, compact);
  if (/^[A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(raw)) return language === "en-US" ? "Unknown area" : "未知区域";
  return raw;
}

export function formatMobileCodexName(entry: CodexEntry | null | undefined, slot: CodexCatalogSlot, language: GameLanguage = "zh-CN"): string {
  if (!entry) return language === "en-US" ? "???" : "？？？";
  const resolved = resolveCodexDisplayName(entry).trim();
  const fallback = resolved && resolved !== "某位住户" && resolved !== "未知条目" ? resolved : slot.displayName;
  return localizedCodexName(language, slot.id, fallback);
}

export function resolveMobileCodexEntryLocation(
  entry: CodexEntry | null | undefined,
  slot: CodexCatalogSlot,
  dynamicNpcStates?: MobileCodexDynamicNpcStates | null,
  language: GameLanguage = "zh-CN"
): string {
  if (slot.type === "npc") {
    const dynamicLocation = dynamicNpcStates?.[slot.id]?.currentLocation;
    const formatted = formatMobileCodexLocation(dynamicLocation, language);
    if (formatted !== (language === "en-US" ? "Unknown area" : "未知区域")) return formatted;
  }

  const entryLocation = readCodexEntryLocation(entry);
  const formattedEntryLocation = formatMobileCodexLocation(entryLocation, language);
  if (formattedEntryLocation !== (language === "en-US" ? "Unknown area" : "未知区域")) return formattedEntryLocation;

  return formatMobileCodexLocation(slot.fallbackLocation, language);
}

export function buildMobileCodexDetail(
  codex: Record<string, CodexEntry> | null | undefined,
  slot: CodexCatalogSlot,
  options: Pick<MobileCodexFloorOptions, "dynamicNpcStates"> & { memorySpine?: MemorySpineState | null } = {},
  language: GameLanguage = "zh-CN"
): MobileCodexDetail {
  const entry = codex?.[slot.id] ?? null;
  const entryKind = slot.type === "anomaly" ? "异常" : "人物";
  if (!entry) {
    return {
      identified: false,
      name: language === "en-US" ? "???" : "？？？",
      location: language === "en-US" ? "Unidentified" : "尚未识别",
      quote: null,
      intro: language === "en-US" ? `This ${slot.type === "anomaly" ? "anomaly" : "person"} is unidentified.` : `尚未识别该${entryKind}。`,
      observation: language === "en-US" ? "No further observations recorded." : "暂未记录更多观察。",
      relationship: language === "en-US" ? (slot.type === "anomaly" ? "No stable response record." : "No stable relationship impression.") : (slot.type === "anomaly" ? "暂无稳定应对记录。" : "暂无稳定关系印象。"),
      memories: "",
      dangerLabel: null,
    };
  }

  return {
    identified: true,
    name: formatMobileCodexName(entry, slot, language),
    location: resolveMobileCodexEntryLocation(entry, slot, options.dynamicNpcStates, language),
    quote: slot.quote ?? null,
    intro: buildMobileCodexIntro(entry),
    observation: buildMobileCodexObservation(entry),
    relationship: buildMobileCodexRelationship(entry),
    memories: buildMobileCodexMemories(entry, options.memorySpine),
    dangerLabel: resolveMobileCodexDangerLabel(slot, true, language),
  };
}

function normalizeCodexText(text: string | null | undefined): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function firstDisplaySentence(text: string | null | undefined, maxLen = 96): string {
  const firstLine = String(text ?? "")
    .split(/\n+/)
    .map((line) => normalizeCodexText(line))
    .find(Boolean);
  if (!firstLine) return "";

  const sentence = firstLine.match(/^.*?[。！？!?](?=\s|$|[^，、；：,.])/u)?.[0]?.trim() ?? "";
  const candidate = sentence || firstLine;
  if (candidate.length <= maxLen) return candidate;
  return candidate.slice(0, maxLen).trim();
}

export function buildMobileCodexIntro(entry: CodexEntry): string {
  const registryIntro = buildCodexIntro(entry).trim();
  const registryOpening = firstDisplaySentence(registryIntro);
  if (registryOpening) return registryOpening;
  return firstDisplaySentence(entry.known_info) || "暂无可靠记录。";
}

export function buildMobileCodexObservation(entry: CodexEntry): string {
  const intro = normalizeCodexText(buildMobileCodexIntro(entry));
  const seen = new Set<string>();
  const observationPieces = Array.isArray(entry.observations)
    ? entry.observations
        .map((value) => normalizeCodexText(value))
        .filter((value) => {
          if (!value || value === intro || seen.has(value)) return false;
          seen.add(value);
          return true;
        })
        .slice(0, 3)
    : [];
  if (observationPieces.length > 0) return observationPieces.join(" ");

  const pieces = [entry.known_info, entry.personality, entry.traits]
    .map((value) => normalizeCodexText(value))
    .filter((value) => {
      if (!value || value === intro || seen.has(value)) return false;
      seen.add(value);
      return true;
    });

  return pieces.length > 0 ? pieces.join(" ") : "暂未记录更多观察。";
}

export function buildMobileCodexRelationship(entry: CodexEntry): string {
  if (entry.type === "anomaly") return "暂无稳定应对记录。";

  const label = computeRelationshipLabel(entry);
  if (label === "盟友") return "对方已经表现出明确的信任或协作意向。";
  if (label === "恋人") return "彼此之间已有稳定而亲密的牵连。";
  if (label === "敌人") return "对方目前带有明显敌意或危险距离。";
  return "暂无稳定关系印象。";
}

/**
 * G2：把与该 NPC 相关的具体记忆片段拼成一段可直接展示的文本（叙事化呈现，取代纯数值条）。
 * 异常类图鉴或无相关记忆时返回空字符串，调用方应据此隐藏该区块而非展示"暂无"。
 */
export function buildMobileCodexMemories(entry: CodexEntry, memorySpine: MemorySpineState | null | undefined): string {
  if (entry.type === "anomaly") return "";
  const lines = buildNpcMemoryMomentLines(memorySpine, entry.id, { maxItems: 3 });
  return lines.join("；");
}
