import type { MemorySpineEntry, MemorySpineState } from "./types";
import type { RecalledMemory } from "./selectors";

function clampText(s: string, maxChars: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

export function buildMemoryRecallBlock(args: {
  recalled: RecalledMemory[];
  maxChars?: number;
}): { text: string; usedIds: string[]; digest: string } {
  const maxChars = Math.max(120, Math.min(900, args.maxChars ?? 520));
  const rows = (args.recalled ?? []).slice(0, 12);
  const used: string[] = [];
  const lines: string[] = [];

  for (const r of rows) {
    const e = r.entry;
    const s = clampText(e.summary, 72);
    if (!s) continue;
    lines.push(`- ${s}`);
    used.push(e.id);
    if (lines.join("\n").length >= maxChars) break;
  }

  const body = lines.join("\n");
  const text = body ? `世界记忆提要：\n${clampText(body, maxChars)}\n` : "";
  const digest = clampText(lines.join("|"), 240);
  return { text, usedIds: used, digest };
}

export function pickPromotionTexts(entries: MemorySpineEntry[], opts?: { maxItems?: number; maxCharsPerItem?: number }): string[] {
  const maxItems = Math.max(0, Math.min(4, opts?.maxItems ?? 2));
  const maxCharsPerItem = Math.max(24, Math.min(160, opts?.maxCharsPerItem ?? 96));
  const picks = entries
    .filter((e) => e.promoteToLore)
    .filter((e) => e.status === "active" || e.status === "resolved")
    .filter((e) => e.confidence >= 0.78 && e.salience >= 0.72)
    .slice(0, 24);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of picks) {
    const txt = clampText(e.summary, maxCharsPerItem);
    if (!txt) continue;
    if (seen.has(txt)) continue;
    seen.add(txt);
    out.push(txt);
    if (out.length >= maxItems) break;
  }
  return out;
}

