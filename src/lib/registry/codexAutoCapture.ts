import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
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

let memoKeywords: MentionKeyword[] | null = null;

const SAFE_NPC_ALIASES: Record<string, readonly string[]> = {
  "N-003": ["老王"],
  "N-004": ["阿花"],
  "N-006": ["张先生"],
  "N-008": ["老刘"],
};

const REGISTERED_BY_ID = new Map<string, CodexMention>([
  ...NPCS.map((npc) => [String(npc.id).trim().toUpperCase(), {
    id: String(npc.id).trim(),
    name: String(npc.name).trim(),
    type: "npc" as const,
  }] as const),
  ...ANOMALIES.map((anomaly) => [String(anomaly.id).trim().toUpperCase(), {
    id: String(anomaly.id).trim(),
    name: String(anomaly.name).trim(),
    type: "anomaly" as const,
  }] as const),
]);

const REGISTERED_NPC_NAME_TO_ID = new Map(
  NPCS.map((npc) => [String(npc.name).trim(), String(npc.id).trim()] as const)
);

const REGISTERED_ANOMALY_NAME_TO_ID = new Map(
  ANOMALIES.map((anomaly) => [String(anomaly.name).trim(), String(anomaly.id).trim()] as const)
);

function pushKeyword(keys: MentionKeyword[], key: string, entry: CodexMention): void {
  const trimmed = String(key ?? "").trim();
  if (!trimmed) return;
  keys.push({ key: trimmed, entry });
}

function buildKeywords(): MentionKeyword[] {
  const keys: MentionKeyword[] = [];

  for (const n of NPCS) {
    if (!n?.id || !n?.name) continue;
    const id = String(n.id).trim();
    const name = String(n.name).trim();
    if (id) {
      pushKeyword(keys, id, { id, name, type: "npc" });
    }
    if (name && name.length >= 2) {
      pushKeyword(keys, name, { id, name, type: "npc" });
    }
    for (const alias of SAFE_NPC_ALIASES[id] ?? []) {
      if (alias.length >= 2) pushKeyword(keys, alias, { id, name, type: "npc" });
    }
  }

  for (const a of ANOMALIES) {
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

function getKeywords(): MentionKeyword[] {
  if (memoKeywords) return memoKeywords;
  memoKeywords = buildKeywords();
  return memoKeywords;
}

export function extractCodexMentionsFromNarrative(
  narrative: string,
  options?: { maxMatches?: number }
): CodexMention[] {
  const text = normalizeText(narrative);
  if (!text) return [];

  const maxMatches = Math.max(1, Math.min(24, Math.trunc(options?.maxMatches ?? 10)));
  const out: CodexMention[] = [];
  const seen = new Set<string>();

  for (const k of getKeywords()) {
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

function registeredMentionById(value: unknown): CodexMention | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase();
  if (!key) return null;
  return REGISTERED_BY_ID.get(key) ?? null;
}

function registeredMentionByName(value: unknown, typeHint?: unknown): CodexMention | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name) return null;
  if (typeHint === "anomaly") {
    const id = REGISTERED_ANOMALY_NAME_TO_ID.get(name);
    return id ? registeredMentionById(id) : null;
  }
  if (typeHint === "npc") {
    const id = REGISTERED_NPC_NAME_TO_ID.get(name);
    return id ? registeredMentionById(id) : null;
  }
  const npcId = REGISTERED_NPC_NAME_TO_ID.get(name);
  if (npcId) return registeredMentionById(npcId);
  const anomalyId = REGISTERED_ANOMALY_NAME_TO_ID.get(name);
  return anomalyId ? registeredMentionById(anomalyId) : null;
}

function mentionFromCodexRow(row: Record<string, unknown>): CodexMention | null {
  const byId = registeredMentionById(row.id ?? row.npcId ?? row.npc_id ?? row.anomalyId ?? row.anomaly_id);
  if (byId) return byId;
  return registeredMentionByName(row.name ?? row.npcName ?? row.npc_name, row.type ?? row.kind);
}

function mentionFromNpcRow(row: Record<string, unknown>): CodexMention | null {
  return registeredMentionById(row.id ?? row.npcId ?? row.npc_id);
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
  options?: { maxMatches?: number }
): CodexMention[] {
  if (!dmRecord) return [];
  const maxMatches = Math.max(1, Math.min(24, Math.trunc(options?.maxMatches ?? 12)));
  const out: CodexMention[] = [];
  const seen = new Set<string>();

  for (const entry of extractCodexMentionsFromNarrative(String(dmRecord.narrative ?? ""), { maxMatches })) {
    pushUnique(out, seen, entry);
    if (out.length >= maxMatches) return out;
  }

  const codexUpdates = Array.isArray(dmRecord.codex_updates) ? dmRecord.codex_updates : [];
  for (const raw of codexUpdates) {
    const row = asRecord(raw);
    if (!row) continue;
    pushUnique(out, seen, mentionFromCodexRow(row));
    if (out.length >= maxMatches) return out;
  }

  const relationshipUpdates = Array.isArray(dmRecord.relationship_updates) ? dmRecord.relationship_updates : [];
  for (const raw of relationshipUpdates) {
    const row = asRecord(raw);
    if (!row) continue;
    pushUnique(out, seen, mentionFromNpcRow(row));
    if (out.length >= maxMatches) return out;
  }

  const npcLocationUpdates = Array.isArray(dmRecord.npc_location_updates) ? dmRecord.npc_location_updates : [];
  for (const raw of npcLocationUpdates) {
    const row = asRecord(raw);
    if (!row) continue;
    pushUnique(out, seen, mentionFromNpcRow(row));
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
  options?: { maxMatches?: number; observation?: string }
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

