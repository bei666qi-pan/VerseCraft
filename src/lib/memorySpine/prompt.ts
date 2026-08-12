import { clamp } from "@/lib/clamp";
import type { MemorySpineEntry, _MemorySpineState } from "./types";
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
  const maxChars = clamp(args.maxChars ?? 520, 120, 900);
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
  const maxItems = clamp(opts?.maxItems ?? 2, 0, 4);
  const maxCharsPerItem = clamp(opts?.maxCharsPerItem ?? 96, 24, 160);
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

