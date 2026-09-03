import { createHash } from "node:crypto";
import type { DirectorDirective, PacingChapterSignalsV2 } from "@/lib/turnEngine/contracts";
import type { DirectorAgendaLoadResult, PersistedDirectorAgendaItem } from "./agenda";
import type { WorldRuntimeScope } from "./contracts";

export type ProjectedDirectorDirective = {
  directive: DirectorDirective;
  block: string;
};

export type DirectorDirectiveReceipt = {
  directiveId: string;
  status: "considered" | "applied" | "skipped";
  reasonCode?: string;
};

function unique(values: readonly string[], cap: number, maxLength = 240): string[] {
  return [...new Set(values.map((value) => value.trim().slice(0, maxLength)).filter(Boolean))].slice(0, cap);
}

function chapterPhaseFromDirectorPhase(value: string | undefined): PacingChapterSignalsV2["phase"] {
  if (value === "build_up") return "rising";
  if (value === "pressure") return "turning";
  if (value === "reveal") return "climax";
  if (value === "release" || value === "recovery") return "resolution";
  return "opening";
}

function stringsFromPayload(item: PersistedDirectorAgendaItem, key: string): string[] {
  const value = item.payload[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function constraintId(value: string): string {
  return `constraint_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

/**
 * Projects the current Director state and due agenda directly into the Writer
 * contract. The rendered block is ephemeral and is never persisted as a
 * second prompt-shaped database record.
 */
export function projectDirectorDirective(args: {
  scope: WorldRuntimeScope;
  turnIndex: number;
  agenda: DirectorAgendaLoadResult;
}): ProjectedDirectorDirective | null {
  const items = args.agenda.items.slice(0, 3);
  const intent = args.agenda.directorIntent?.trim().slice(0, 500) ?? "";
  if (items.length === 0 && !intent && !args.agenda.currentPhase) return null;

  const dueEventIds = unique(items.map((item) => item.eventCode), 3, 128);
  const npcActionIds = unique(items.flatMap((item) => stringsFromPayload(item, "npc_action_ids")), 12, 128);
  const constraints = unique(items.flatMap((item) => [
    ...item.agencyConstraints,
    ...item.forbiddenOutcomes,
  ]), 12);
  const chapterPhase = chapterPhaseFromDirectorPhase(args.agenda.currentPhase);
  const directiveId = `directive_${createHash("sha256").update(JSON.stringify({
    ...args.scope,
    turnIndex: Math.max(0, Math.trunc(args.turnIndex)),
    chapterPhase,
    dueEventIds,
    npcActionIds,
    constraints,
    intent,
  })).digest("hex").slice(0, 24)}`;

  const directive: DirectorDirective = {
    directiveId,
    npcActionIds,
    dueEventIds,
    chapterPhase,
    constraintIds: constraints.map(constraintId),
  };
  const block = [
    "## 当前回合导演指令（即时投影，不是已发生事实）",
    `- directive_id: ${directiveId}`,
    `- chapter_phase: ${chapterPhase}`,
    ...(intent ? [`- direction: ${intent}`] : []),
    ...items.map((item) => `- due_event[${item.eventCode}]: ${item.injectionHint}`),
    ...items.flatMap((item) => item.agencyConstraints.map((value) => `- agency_constraint: ${value}`)),
    ...items.flatMap((item) => item.forbiddenOutcomes.map((value) => `- forbid: ${value}`)),
    "具体对白与描写由 Writer 创作；玩家可以忽略事件；不得把方向当成既成事实。",
  ].join("\n").slice(0, 4_000);

  return { directive, block };
}

export function normalizeDirectorDirectiveReceipt(
  value: unknown,
  knownDirectiveIds: ReadonlySet<string>,
): DirectorDirectiveReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const directiveId = typeof raw.directiveId === "string"
    ? raw.directiveId.trim().slice(0, 128)
    : typeof raw.hintId === "string"
      ? raw.hintId.trim().slice(0, 128)
      : "";
  if (!directiveId || !knownDirectiveIds.has(directiveId)) return null;
  if (raw.status !== "considered" && raw.status !== "applied" && raw.status !== "skipped") return null;
  const reasonCode = typeof raw.reasonCode === "string" ? raw.reasonCode.trim().slice(0, 128) : "";
  return { directiveId, status: raw.status, ...(reasonCode ? { reasonCode } : {}) };
}

export function stripDirectorDirectiveReceipt<T extends Record<string, unknown>>(candidate: T): T {
  const copy = { ...candidate };
  delete copy.director_directive_receipt;
  delete copy.directorDirectiveReceipt;
  // Read-only compatibility for one release; these names are never written.
  delete copy.director_hint_receipt;
  delete copy.directorHintReceipt;
  return copy;
}
