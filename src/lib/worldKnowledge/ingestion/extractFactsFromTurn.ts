import { normalizeForHash } from "@/lib/kg/normalize";
import { WORLD_KNOWLEDGE_MAX_WRITEBACK_FACTS } from "../constants";

export type FactSource =
  | "user_input"
  | "dm_narrative"
  | "codex_update"
  | "player_location"
  | "npc_location_update"
  | "task_event"
  | "award_item"
  | "session_memory"
  | "rule_hit";

export interface ExtractedFact {
  text: string;
  normalized: string;
  source: FactSource;
  confidence: number;
  evidence: string[];
  entityHints: string[];
  userId: string | null;
  sessionId: string | null;
}

export interface ExtractFactsInput {
  latestUserInput: string;
  dmRecord: Record<string, unknown> | null;
  sessionMemorySummary?: string | null;
  ruleHits?: string[];
  userId: string | null;
  sessionId: string | null;
  maxFacts?: number;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
}

function pickEntityHints(text: string): string[] {
  const tokens = text
    .split(/[，。！？、；\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 16);
  return [...new Set(tokens)].slice(0, 6);
}

function pushFact(target: ExtractedFact[], item: Omit<ExtractedFact, "normalized" | "entityHints">) {
  const text = item.text.trim();
  if (!text) return;
  const normalized = normalizeForHash(text);
  if (!normalized) return;
  target.push({
    ...item,
    text,
    normalized,
    entityHints: pickEntityHints(text),
  });
}

export function extractFactsFromTurn(input: ExtractFactsInput): ExtractedFact[] {
  const out: ExtractedFact[] = [];
  const maxFacts = Math.max(1, Math.min(WORLD_KNOWLEDGE_MAX_WRITEBACK_FACTS, input.maxFacts ?? 12));

  const userText = asString(input.latestUserInput);
  if (userText) {
    pushFact(out, {
      text: userText,
      source: "user_input",
      confidence: 0.62,
      evidence: ["latest_user_input"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
  }

  const dm = input.dmRecord ?? {};
  const narrative = asString(dm.narrative);
  if (narrative) {
    pushFact(out, {
      text: narrative.slice(0, 800),
      source: "dm_narrative",
      confidence: 0.55,
      evidence: ["dm_record.narrative"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
  }

  const codex = asRecordArray(dm.codex_updates);
  for (const row of codex) {
    const title = asString(row.title) || asString(row.name);
    const content = asString(row.content) || asString(row.description);
    const text = [title, content].filter(Boolean).join("：");
    if (!text) continue;
    pushFact(out, {
      text: text.slice(0, 500),
      source: "codex_update",
      confidence: 0.82,
      evidence: ["dm_record.codex_updates"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
    if (out.length >= maxFacts) break;
  }

  const playerLocation = asString(dm.player_location);
  if (playerLocation) {
    pushFact(out, {
      text: `玩家位于${playerLocation}`,
      source: "player_location",
      confidence: 0.86,
      evidence: ["dm_record.player_location"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
  }

  const npcLocs = asRecordArray(dm.npc_location_updates);
  for (const row of npcLocs) {
    const npc = asString(row.npc) || asString(row.name) || asString(row.id);
    const loc = asString(row.location) || asString(row.to);
    if (!npc || !loc) continue;
    pushFact(out, {
      text: `${npc}位于${loc}`,
      source: "npc_location_update",
      confidence: 0.8,
      evidence: ["dm_record.npc_location_updates"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
    if (out.length >= maxFacts) break;
  }

  const taskRows = [...asRecordArray(dm.new_tasks), ...asRecordArray(dm.task_updates)];
  for (const row of taskRows) {
    const title = asString(row.title) || asString(row.name);
    const status = asString(row.status) || asString(row.progress);
    if (!title && !status) continue;
    pushFact(out, {
      text: [title, status].filter(Boolean).join("："),
      source: "task_event",
      confidence: 0.76,
      evidence: ["dm_record.new_tasks|task_updates"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
    if (out.length >= maxFacts) break;
  }

  const awards = [...asRecordArray(dm.awarded_items), ...asRecordArray(dm.awarded_warehouse_items)];
  for (const row of awards) {
    const name = asString(row.name) || asString(row.item_name) || asString(row.id);
    const count = typeof row.count === "number" ? String(row.count) : "";
    if (!name) continue;
    pushFact(out, {
      text: `获得物品${name}${count ? ` x${count}` : ""}`,
      source: "award_item",
      confidence: 0.88,
      evidence: ["dm_record.awarded_items|awarded_warehouse_items"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
    if (out.length >= maxFacts) break;
  }

  const memory = asString(input.sessionMemorySummary);
  if (memory) {
    pushFact(out, {
      text: memory.slice(0, 500),
      source: "session_memory",
      confidence: 0.66,
      evidence: ["session_memory_summary"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
  }

  for (const hit of input.ruleHits ?? []) {
    const text = asString(hit);
    if (!text) continue;
    pushFact(out, {
      text,
      source: "rule_hit",
      confidence: 0.84,
      evidence: ["rule_hits"],
      userId: input.userId,
      sessionId: input.sessionId,
    });
    if (out.length >= maxFacts) break;
  }

  const dedup = new Map<string, ExtractedFact>();
  for (const fact of out) {
    if (!dedup.has(fact.normalized)) dedup.set(fact.normalized, fact);
  }
  return [...dedup.values()].slice(0, maxFacts);
}
