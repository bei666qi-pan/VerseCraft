import { buildCodexIntro, computeRelationshipLabel, resolveCodexDisplayName } from "@/lib/registry/codexDisplay";
import { formatCompactLocationLabel } from "@/lib/ui/locationLabels";
import type { CodexEntry } from "@/store/useGameStore";
import { B1_NPC_CODEX_SLOTS, type CodexCatalogSlot } from "./codexCatalog";

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

export function isMobileCodexSlotIdentified(
  codex: Record<string, CodexEntry> | null | undefined,
  id: string
): boolean {
  return Boolean(codex?.[id]);
}

export function getMobileCodexIdentifiedCount(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = B1_NPC_CODEX_SLOTS
): number {
  return slots.filter((slot) => isMobileCodexSlotIdentified(codex, slot.id)).length;
}

export function shouldAppendMobileCodexMoreCard(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = B1_NPC_CODEX_SLOTS
): boolean {
  return slots.length > 0 && getMobileCodexIdentifiedCount(codex, slots) === slots.length;
}

export function resolveMobileCodexInitialSelection(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = B1_NPC_CODEX_SLOTS
): string | null {
  return slots.find((slot) => isMobileCodexSlotIdentified(codex, slot.id))?.id ?? slots[0]?.id ?? null;
}

export function buildMobileCodexCardModels(
  codex: Record<string, CodexEntry> | null | undefined,
  slots: readonly CodexCatalogSlot[] = B1_NPC_CODEX_SLOTS
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
      location: identified && entry ? resolveMobileCodexEntryLocation(entry, slot) : "尚未识别",
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
  slot: CodexCatalogSlot
): string {
  const looseEntry = (entry ?? {}) as Record<string, unknown>;
  for (const key of LOCATION_FIELD_CANDIDATES) {
    const value = looseEntry[key];
    if (typeof value !== "string") continue;
    const formatted = formatMobileCodexLocation(value);
    if (formatted !== "未知区域") return formatted;
  }
  return formatMobileCodexLocation(slot.fallbackLocation);
}

export function buildMobileCodexDetail(
  codex: Record<string, CodexEntry> | null | undefined,
  slot: CodexCatalogSlot
): MobileCodexDetail {
  const entry = codex?.[slot.id] ?? null;
  if (!entry) {
    return {
      identified: false,
      name: "？？？",
      location: "尚未识别",
      quote: null,
      intro: "尚未识别该人物。",
      observation: "暂未记录更多观察。",
      relationship: "暂无稳定关系印象。",
    };
  }

  return {
    identified: true,
    name: formatMobileCodexName(entry, slot),
    location: resolveMobileCodexEntryLocation(entry, slot),
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
  const label = computeRelationshipLabel(entry);
  if (label === "盟友") return "对方已经表现出明确的信任或协作意向。";
  if (label === "恋人") return "彼此之间已有稳定而亲密的牵连。";
  if (label === "敌人") return "对方目前带有明显敌意或危险距离。";
  return "暂无稳定关系印象。";
}
