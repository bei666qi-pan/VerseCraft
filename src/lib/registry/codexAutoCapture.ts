import { ANOMALIES } from "@/lib/registry/anomalies";
import { NPCS } from "@/lib/registry/npcs";
import type { CodexEntry } from "@/store/useGameStore";

type CodexMention = Pick<CodexEntry, "id" | "name" | "type">;

function normalizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input;
}

type MentionKeyword = {
  key: string;
  entry: CodexMention;
};

let memoKeywords: MentionKeyword[] | null = null;

function buildKeywords(): MentionKeyword[] {
  const keys: MentionKeyword[] = [];

  for (const n of NPCS) {
    if (!n?.id || !n?.name) continue;
    const id = String(n.id).trim();
    const name = String(n.name).trim();
    if (id) {
      keys.push({ key: id, entry: { id, name, type: "npc" } });
    }
    if (name && name.length >= 2) {
      keys.push({ key: name, entry: { id, name, type: "npc" } });
    }
  }

  for (const a of ANOMALIES) {
    if (!a?.id || !a?.name) continue;
    const id = String(a.id).trim();
    const name = String(a.name).trim();
    if (id) {
      keys.push({ key: id, entry: { id, name, type: "anomaly" } });
    }
    if (name && name.length >= 2) {
      keys.push({ key: name, entry: { id, name, type: "anomaly" } });
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

