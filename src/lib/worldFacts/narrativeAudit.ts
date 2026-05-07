import type {
  WorldFactCategory,
  WorldFactSource,
  WorldFactTruthLevel,
} from "@/lib/worldFacts/worldFactRegistry";

export type NarrativeAuditCandidateNewFact = {
  text: string;
  category?: WorldFactCategory;
  confidence: number;
  proposed_source: string;
  factId?: string;
  content?: string;
  source?: WorldFactSource;
  truthLevel?: WorldFactTruthLevel;
  revealTier?: number;
  ownerNpcIds?: string[];
  floorIds?: string[];
  relatedNpcIds?: string[];
};

export type NarrativeAuditPayload = {
  used_fact_ids: string[];
  candidate_new_facts: NarrativeAuditCandidateNewFact[];
  mentioned_entity_ids: string[];
  speaker_npc_id?: string;
};

export type NormalizeNarrativeAuditOptions = {
  maxUsedFactIds?: number;
  maxCandidateFacts?: number;
  maxMentionedEntityIds?: number;
  maxBytes?: number;
  preserveEmptyArrays?: boolean;
};

const WORLD_FACT_CATEGORIES: readonly WorldFactCategory[] = [
  "npc",
  "floor",
  "event",
  "item",
  "apartment_root",
  "relationship",
  "location",
  "task",
  "anomaly",
];

const WORLD_FACT_SOURCES: readonly WorldFactSource[] = [
  "registry",
  "story_ledger",
  "world_engine",
  "player_observed",
  "npc_belief",
  "system_repair",
];

const WORLD_FACT_TRUTH_LEVELS: readonly WorldFactTruthLevel[] = [
  "canon",
  "session_committed",
  "rumor",
  "hypothesis",
  "false_belief",
  "candidate",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (out.length >= maxLen) break;
    const text = asString(item).slice(0, 160);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeJsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 999_999;
  }
}

function isWorldFactCategory(value: string): value is WorldFactCategory {
  return (WORLD_FACT_CATEGORIES as readonly string[]).includes(value);
}

function isWorldFactSource(value: string): value is WorldFactSource {
  return (WORLD_FACT_SOURCES as readonly string[]).includes(value);
}

function isWorldFactTruthLevel(value: string): value is WorldFactTruthLevel {
  return (WORLD_FACT_TRUTH_LEVELS as readonly string[]).includes(value);
}

function normalizeCategory(value: unknown): WorldFactCategory | undefined {
  const raw = asString(value);
  const mapped =
    raw === "root_cause"
      ? "apartment_root"
      : raw === "npc_identity" || raw === "npc_deep_role"
        ? "npc"
        : raw === "item_acquisition"
          ? "item"
          : raw === "location_transition"
            ? "location"
            : raw === "task_completion"
              ? "task"
              : raw;
  return isWorldFactCategory(mapped) ? mapped : undefined;
}

function normalizeCandidate(value: unknown): NarrativeAuditCandidateNewFact | null {
  const record = asRecord(value);
  if (!record) return null;

  const factId = asString(record.factId ?? record.fact_id).slice(0, 160);
  const text = asString(record.text ?? record.content ?? factId).slice(0, 240);
  if (!text) return null;

  const category = normalizeCategory(record.category);
  const proposedSource = asString(record.proposed_source ?? record.source ?? "candidate").slice(0, 80) || "candidate";
  const source = isWorldFactSource(proposedSource) ? proposedSource : undefined;
  const truthLevelRaw = asString(record.truthLevel ?? record.truth_level);
  const truthLevel = isWorldFactTruthLevel(truthLevelRaw) ? truthLevelRaw : undefined;
  const revealTier =
    typeof record.revealTier === "number" && Number.isFinite(record.revealTier)
      ? Math.trunc(record.revealTier)
      : typeof record.reveal_tier === "number" && Number.isFinite(record.reveal_tier)
        ? Math.trunc(record.reveal_tier)
        : undefined;

  return {
    text,
    ...(category ? { category } : {}),
    confidence: clamp(asNumber(record.confidence, 0), 0, 1),
    proposed_source: proposedSource,
    ...(factId ? { factId } : {}),
    ...(text ? { content: text } : {}),
    ...(source ? { source } : {}),
    ...(truthLevel ? { truthLevel } : {}),
    ...(typeof revealTier === "number" ? { revealTier } : {}),
    ownerNpcIds: asStringArray(record.ownerNpcIds ?? record.owner_npc_ids, 12),
    floorIds: asStringArray(record.floorIds ?? record.floor_ids, 12),
    relatedNpcIds: asStringArray(record.relatedNpcIds ?? record.related_npc_ids, 12),
  };
}

export function normalizeNarrativeAuditPayload(
  value: unknown,
  options: NormalizeNarrativeAuditOptions = {}
): NarrativeAuditPayload | null {
  const source = asRecord(value);
  if (!source) return null;

  const maxUsedFactIds = options.maxUsedFactIds ?? 24;
  const maxCandidateFacts = options.maxCandidateFacts ?? 8;
  const maxMentionedEntityIds = options.maxMentionedEntityIds ?? 24;
  const maxBytes = options.maxBytes ?? 1800;

  const usedFactIds = asStringArray(source.used_fact_ids, maxUsedFactIds);
  const candidateNewFacts = Array.isArray(source.candidate_new_facts)
    ? source.candidate_new_facts
        .map((candidate) => normalizeCandidate(candidate))
        .filter((candidate): candidate is NarrativeAuditCandidateNewFact => Boolean(candidate))
        .slice(0, maxCandidateFacts)
    : [];
  const mentionedEntityIds = asStringArray(source.mentioned_entity_ids, maxMentionedEntityIds);
  const speakerNpcId = asString(source.speaker_npc_id).slice(0, 80);

  const payload: NarrativeAuditPayload = {
    used_fact_ids: usedFactIds,
    candidate_new_facts: candidateNewFacts,
    mentioned_entity_ids: mentionedEntityIds,
    ...(speakerNpcId ? { speaker_npc_id: speakerNpcId } : {}),
  };

  if (
    !options.preserveEmptyArrays &&
    usedFactIds.length === 0 &&
    candidateNewFacts.length === 0 &&
    mentionedEntityIds.length === 0 &&
    !speakerNpcId
  ) {
    return null;
  }

  return safeJsonByteLength(payload) <= maxBytes ? payload : null;
}
