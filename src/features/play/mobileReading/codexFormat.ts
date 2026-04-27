import { buildCodexIntro, computeRelationshipLabel, resolveCodexDisplayName } from "@/lib/registry/codexDisplay";
import type { FloorId } from "@/lib/registry/types";
import { formatCompactLocationLabel } from "@/lib/ui/locationLabels";
import type { CodexEntry } from "@/store/useGameStore";
import { ALL_CODEX_CATALOG_SLOTS, type CodexCatalogSlot } from "./codexCatalog";

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
    }
  | {
      id: "__more__";
      kind: "more";
      identified: false;
      displayName: "——";
      location: "暂无更多";
      disabled: true;
    };

export type MobileCodexDetail = {
  identified: boolean;
  name: string;
  location: string;
  quote: string | null;
  intro: string;
  observation: string;
  relationship: string;
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
  options: Pick<MobileCodexFloorOptions, "dynamicNpcStates"> = {}
): MobileCodexCardModel[] {
  const cards: MobileCodexCardModel[] = slots.map((slot) => {
    const entry = codex?.[slot.id] ?? null;
    const identified = Boolean(entry);
    return {
      id: slot.id,
      kind: "slot",
      slot,
      identified,
      displayName: identified && entry ? formatMobileCodexName(entry, slot) : "？？？",
      location:
        identified && entry
          ? resolveMobileCodexEntryLocation(entry, slot, options.dynamicNpcStates)
          : "尚未识别",
      disabled: false,
    };
  });

  if (shouldAppendMobileCodexMoreCard(codex, slots)) {
    cards.push({
      id: "__more__",
      kind: "more",
      identified: false,
      displayName: "——",
      location: "暂无更多",
      disabled: true,
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

export function formatMobileCodexLocation(location: string | null | undefined): string {
  const raw = String(location ?? "").trim();
  if (!raw) return "未知区域";

  const compact = formatCompactLocationLabel(raw);
  if (compact !== "未知区域") return compact;
  if (/^[A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(raw)) return "未知区域";
  return raw;
}

export function formatMobileCodexName(entry: CodexEntry | null | undefined, slot: CodexCatalogSlot): string {
  if (!entry) return "？？？";
  const resolved = resolveCodexDisplayName(entry).trim();
  if (resolved && resolved !== "某位住户" && resolved !== "未知条目") return resolved;
  return slot.displayName;
}

export function resolveMobileCodexEntryLocation(
  entry: CodexEntry | null | undefined,
  slot: CodexCatalogSlot,
  dynamicNpcStates?: MobileCodexDynamicNpcStates | null
): string {
  if (slot.type === "npc") {
    const dynamicLocation = dynamicNpcStates?.[slot.id]?.currentLocation;
    const formatted = formatMobileCodexLocation(dynamicLocation);
    if (formatted !== "未知区域") return formatted;
  }

  const entryLocation = readCodexEntryLocation(entry);
  const formattedEntryLocation = formatMobileCodexLocation(entryLocation);
  if (formattedEntryLocation !== "未知区域") return formattedEntryLocation;

  return formatMobileCodexLocation(slot.fallbackLocation);
}

export function buildMobileCodexDetail(
  codex: Record<string, CodexEntry> | null | undefined,
  slot: CodexCatalogSlot,
  options: Pick<MobileCodexFloorOptions, "dynamicNpcStates"> = {}
): MobileCodexDetail {
  const entry = codex?.[slot.id] ?? null;
  const entryKind = slot.type === "anomaly" ? "异常" : "人物";
  if (!entry) {
    return {
      identified: false,
      name: "？？？",
      location: "尚未识别",
      quote: null,
      intro: `尚未识别该${entryKind}。`,
      observation: "暂未记录更多观察。",
      relationship: slot.type === "anomaly" ? "暂无稳定应对记录。" : "暂无稳定关系印象。",
    };
  }

  return {
    identified: true,
    name: formatMobileCodexName(entry, slot),
    location: resolveMobileCodexEntryLocation(entry, slot, options.dynamicNpcStates),
    quote: slot.quote ?? null,
    intro: buildMobileCodexIntro(entry),
    observation: buildMobileCodexObservation(entry),
    relationship: buildMobileCodexRelationship(entry),
  };
}

function normalizeCodexText(text: string | null | undefined): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function buildMobileCodexIntro(entry: CodexEntry): string {
  const registryIntro = buildCodexIntro(entry).trim();
  if (registryIntro) return registryIntro;
  return normalizeCodexText(entry.known_info) || "暂无可靠记录。";
}

export function buildMobileCodexObservation(entry: CodexEntry): string {
  const intro = normalizeCodexText(buildMobileCodexIntro(entry));
  const seen = new Set<string>();
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
