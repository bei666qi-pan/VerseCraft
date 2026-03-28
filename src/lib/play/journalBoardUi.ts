// src/lib/play/journalBoardUi.ts
// 阶段 5：手记分区（纯函数）

import type { ClueEntry } from "@/lib/domain/narrativeDomain";

export type JournalUiSection = "people" | "place" | "evidence" | "unverified" | "stale";

const SECTION_ORDER: JournalUiSection[] = ["people", "place", "evidence", "unverified", "stale"];

const SECTION_LABEL: Record<JournalUiSection, string> = {
  people: "人物线索",
  place: "地点线索",
  evidence: "证据与物证链",
  unverified: "未证实信息",
  stale: "已失效 / 死胡同",
};

export function journalSectionLabel(s: JournalUiSection): string {
  return SECTION_LABEL[s];
}

export function orderedJournalSections(): JournalUiSection[] {
  return [...SECTION_ORDER];
}

/** 每条手记归入一个主分区（避免重复刷屏）。 */
export function primaryJournalSection(c: ClueEntry): JournalUiSection {
  if (c.visibility === "hidden") return "unverified";
  if (c.status === "invalidated" || c.kind === "dead_end") return "stale";
  if (c.kind === "npc_anomaly" || (c.relatedNpcIds?.length ?? 0) > 0) return "people";
  if (c.kind === "place_anomaly" || (c.relatedLocationIds?.length ?? 0) > 0) return "place";
  if ((c.relatedItemIds?.length ?? 0) > 0 || c.kind === "trace") return "evidence";
  if (
    c.kind === "rumor" ||
    c.kind === "hypothesis" ||
    c.kind === "unverified" ||
    c.status === "unknown" ||
    c.status === "pending_verify"
  ) {
    return "unverified";
  }
  return "unverified";
}

export function groupCluesByPrimarySection(clues: ClueEntry[]): Record<JournalUiSection, ClueEntry[]> {
  const out: Record<JournalUiSection, ClueEntry[]> = {
    people: [],
    place: [],
    evidence: [],
    unverified: [],
    stale: [],
  };
  const shown = (clues ?? []).filter((c) => c && c.visibility !== "hidden");
  for (const c of shown) {
    const sec = primaryJournalSection(c);
    out[sec].push(c);
  }
  for (const k of SECTION_ORDER) {
    out[k].sort((a, b) => {
      const imp = (b.importance ?? 1) - (a.importance ?? 1);
      if (imp !== 0) return imp;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
  }
  return out;
}
