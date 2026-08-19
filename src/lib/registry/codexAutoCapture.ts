import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
import { NPC_ALIASES } from "@/lib/registry/npcAliases";
import { QINGSHI_NPCS } from "@/lib/worlds/xingni/qingshiContent";
import {
  DARK_MOON_WORLD_ID,
  XINGNI_WORLD_ID,
  type WorldId,
} from "@/lib/worlds/types";
import type { CodexEntry } from "@/store/useGameStore";

export type CodexMention = Pick<CodexEntry, "id" | "name" | "type">;

function normalizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input;
}

type MentionKeyword = {
  key: string;
  entry: CodexMention;
};

const memoKeywords = new Map<WorldId, MentionKeyword[]>();

const DARK_MOON_REGISTERED_BY_ID = new Map<string, CodexMention>([
  ...NPCS.map((npc) => [String(npc.id).trim().toUpperCase(), {
    id: String(npc.id).trim(), name: String(npc.name).trim(), type: "npc" as const,
  }] as const),
  ...ANOMALIES.map((anomaly) => [String(anomaly.id).trim().toUpperCase(), {
    id: String(anomaly.id).trim(), name: String(anomaly.name).trim(), type: "anomaly" as const,
  }] as const),
]);
const XINGNI_REGISTERED_BY_ID = new Map<string, CodexMention>(
  QINGSHI_NPCS.map((npc) => [String(npc.id).trim().toUpperCase(), {
    id: String(npc.id).trim(), name: String(npc.name).trim(), type: "npc" as const,
  }] as const),
);
const DARK_MOON_NPC_NAME_TO_ID = new Map(
  NPCS.map((npc) => [String(npc.name).trim(), String(npc.id).trim()] as const),
);
const XINGNI_NPC_NAME_TO_ID = new Map(
  QINGSHI_NPCS.map((npc) => [String(npc.name).trim(), String(npc.id).trim()] as const),
);
const DARK_MOON_ANOMALY_NAME_TO_ID = new Map(
  ANOMALIES.map((anomaly) => [String(anomaly.name).trim(), String(anomaly.id).trim()] as const)
);

function pushKeyword(keys: MentionKeyword[], key: string, entry: CodexMention): void {
  const trimmed = String(key ?? "").trim();
  if (!trimmed) return;
  keys.push({ key: trimmed, entry });
}

function buildKeywords(worldId: WorldId): MentionKeyword[] {
  const keys: MentionKeyword[] = [];
  const npcs = worldId === XINGNI_WORLD_ID ? QINGSHI_NPCS : NPCS;

  for (const n of npcs) {
    if (!n?.id || !n?.name) continue;
    const id = String(n.id).trim();
    const name = String(n.name).trim();
    if (id) {
      pushKeyword(keys, id, { id, name, type: "npc" });
    }
    if (name && name.length >= 2) {
      pushKeyword(keys, name, { id, name, type: "npc" });
    }
    for (const alias of worldId === DARK_MOON_WORLD_ID ? (NPC_ALIASES[id] ?? []) : []) {
      if (alias.length >= 2) pushKeyword(keys, alias, { id, name, type: "npc" });
    }
  }

  for (const a of worldId === DARK_MOON_WORLD_ID ? ANOMALIES : []) {
    if (!a?.id || !a?.name) continue;
    const id = String(a.id).trim();
    const name = String(a.name).trim();
    if (id) {
      pushKeyword(keys, id, { id, name, type: "anomaly" });
    }
    if (name && name.length >= 2) {
      pushKeyword(keys, name, { id, name, type: "anomaly" });
    }
  }

  // Longest match first to reduce partial/substring collisions.
  keys.sort((a, b) => b.key.length - a.key.length);
  return keys;
}

function getKeywords(worldId: WorldId): MentionKeyword[] {
  const cached = memoKeywords.get(worldId);
  if (cached) return cached;
  const built = buildKeywords(worldId);
  memoKeywords.set(worldId, built);
  return built;
}

type CodexCaptureOptions = { maxMatches?: number; worldId?: WorldId };

export function extractCodexMentionsFromNarrative(
  narrative: string,
  options?: CodexCaptureOptions
): CodexMention[] {
  const text = normalizeText(narrative);
  if (!text) return [];

  const maxMatches = Math.max(1, Math.min(24, Math.trunc(options?.maxMatches ?? 10)));
  const out: CodexMention[] = [];
  const seen = new Set<string>();

  const worldId = options?.worldId ?? DARK_MOON_WORLD_ID;
  for (const k of getKeywords(worldId)) {
    if (out.length >= maxMatches) break;
    if (!k.key) continue;
    if (!text.includes(k.key)) continue;

    const id = String(k.entry.id ?? "").trim();
    const type = k.entry.type;
    const dedupeKey = `${type}:${id}`;
    if (!id) continue;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(k.entry);
  }

  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function registeredMentionById(value: unknown, worldId: WorldId): CodexMention | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (!key) return null;
  const registry = worldId === XINGNI_WORLD_ID ? XINGNI_REGISTERED_BY_ID : DARK_MOON_REGISTERED_BY_ID;
  return registry.get(key) ?? null;
}

function registeredMentionByName(value: unknown, typeHint: unknown, worldId: WorldId): CodexMention | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  if (typeHint === "anomaly") {
    if (worldId === XINGNI_WORLD_ID) return null;
    const id = DARK_MOON_ANOMALY_NAME_TO_ID.get(name);
    return id ? registeredMentionById(id, worldId) : null;
  }
  const npcNames = worldId === XINGNI_WORLD_ID ? XINGNI_NPC_NAME_TO_ID : DARK_MOON_NPC_NAME_TO_ID;
  if (typeHint === "npc") {
    const id = npcNames.get(name);
    return id ? registeredMentionById(id, worldId) : null;
  }
  const npcId = npcNames.get(name);
  if (npcId) return registeredMentionById(npcId, worldId);
  if (worldId === XINGNI_WORLD_ID) return null;
  const anomalyId = DARK_MOON_ANOMALY_NAME_TO_ID.get(name);
  return anomalyId ? registeredMentionById(anomalyId, worldId) : null;
}

function mentionFromCodexRow(row: Record<string, unknown>, worldId: WorldId): CodexMention | null {
  const byId = registeredMentionById(row.id ?? row.npcId ?? row.npc_id ?? row.anomalyId ?? row.anomaly_id, worldId);
  if (byId) return byId;
  return registeredMentionByName(row.name ?? row.npcName ?? row.npc_name, row.type ?? row.kind, worldId);
}

function mentionFromNpcRow(row: Record<string, unknown>, worldId: WorldId): CodexMention | null {
  return registeredMentionById(row.id ?? row.npcId ?? row.npc_id, worldId);
}

function pushUnique(out: CodexMention[], seen: Set<string>, entry: CodexMention | null): void {
  if (!entry?.id) return;
  const key = `${entry.type}:${String(entry.id).trim().toUpperCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(entry);
}

export function extractCodexMentionsFromDmRecord(
  dmRecord: Record<string, unknown> | null | undefined,
  options?: CodexCaptureOptions
): CodexMention[] {
  if (!dmRecord) return [];
  const maxMatches = Math.max(1, Math.min(24, Math.trunc(options?.maxMatches ?? 12)));
  const worldId = options?.worldId ?? DARK_MOON_WORLD_ID;
  const out: CodexMention[] = [];
  const seen = new Set<string>();

  for (const entry of extractCodexMentionsFromNarrative(String(dmRecord.narrative ?? ""), { maxMatches, worldId })) {
    pushUnique(out, seen, entry);
    if (out.length >= maxMatches) return out;
  }

  const codexUpdates = Array.isArray(dmRecord.codex_updates) ? dmRecord.codex_updates : [];
  for (const raw of codexUpdates) {
    const row = asRecord(raw);
    if (!row) continue;
    pushUnique(out, seen, mentionFromCodexRow(row, worldId));
    if (out.length >= maxMatches) return out;
  }

  const relationshipUpdates = Array.isArray(dmRecord.relationship_updates) ? dmRecord.relationship_updates : [];
  for (const raw of relationshipUpdates) {
    const row = asRecord(raw);
    if (!row) continue;
    pushUnique(out, seen, mentionFromNpcRow(row, worldId));
    if (out.length >= maxMatches) return out;
  }

  const npcLocationUpdates = Array.isArray(dmRecord.npc_location_updates) ? dmRecord.npc_location_updates : [];
  for (const raw of npcLocationUpdates) {
    const row = asRecord(raw);
    if (!row) continue;
    pushUnique(out, seen, mentionFromNpcRow(row, worldId));
    if (out.length >= maxMatches) return out;
  }

  return out;
}

function collectExistingCodexIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) return ids;
  for (const row of value) {
    const record = asRecord(row);
    const id = typeof record?.id === "string" ? record.id.trim().toUpperCase() : "";
    if (id) ids.add(id);
  }
  return ids;
}

export function mergeAutoCapturedCodexUpdates<T extends Record<string, unknown>>(
  dmRecord: T,
  options?: CodexCaptureOptions & { observation?: string }
): T {
  const captured = extractCodexMentionsFromDmRecord(dmRecord, options);
  if (captured.length === 0) return dmRecord;

  const existingUpdates = Array.isArray(dmRecord.codex_updates) ? dmRecord.codex_updates : [];
  const existingIds = collectExistingCodexIds(existingUpdates);
  const observation = options?.observation ?? "刚才的场面里，已经确认其踪迹。";
  const additions = captured
    .filter((entry) => !existingIds.has(String(entry.id).trim().toUpperCase()))
    .map((entry) => ({
      ...entry,
      observation,
    }));

  if (additions.length === 0) return dmRecord;
  return {
    ...dmRecord,
    codex_updates: [...existingUpdates, ...additions],
  } as T;
}
