import { createHash } from "node:crypto";
import type {
  DirectorPhase,
  DirectorPriority,
  WorldEngineStructuredDelta,
  WorldRuntimeScope,
} from "./contracts";
import type { DirectorValidationResult } from "./validator";

export type DirectorHintLifecycle = "active" | "consumed" | "expired" | "revoked";
export type DirectorHintSource = "world_director" | "due_agenda" | "pacing_controller" | "actor_projection";

export type DirectorHintEnvelope = WorldRuntimeScope & {
  hintId: string;
  runId: number;
  worldRevision: string;
  validFromTurn: number;
  validThroughTurn: number;
  phase: DirectorPhase;
  directions: string[];
  must: string[];
  should: string[];
  may: string[];
  forbid: string[];
  factRefs: string[];
  eventRefs: string[];
  npcRefs: string[];
  sources: DirectorHintSource[];
  lifecycle: DirectorHintLifecycle;
  createdAt: string;
};

export type DirectorHintReceiptStatus = "considered" | "applied" | "skipped";
export type DirectorHintReceipt = {
  hintId: string;
  status: DirectorHintReceiptStatus;
  reasonCode?: string;
};

function unique(values: readonly string[], cap: number, maxLength = 240): string[] {
  return [...new Set(values.map((x) => x.trim().slice(0, maxLength)).filter(Boolean))].slice(0, cap);
}

export function buildDirectorHintEnvelope(args: {
  scope: WorldRuntimeScope;
  runId: number;
  worldRevision: bigint;
  turnIndex: number;
  plan: WorldEngineStructuredDelta;
  validation: DirectorValidationResult;
  sources?: DirectorHintSource[];
}): DirectorHintEnvelope | null {
  const acceptedEvents = new Set(args.validation.acceptedEventCodes);
  const events = args.plan.world_events_to_schedule.filter((event) => acceptedEvents.has(event.event_code));
  const directions = unique([
    args.plan.director_intent,
    ...events.map((event) => event.injection_hint),
    ...args.plan.npc_next_actions.map((action) => `${action.npc_code}: ${action.action}`),
  ], 8);
  if (!args.validation.accepted || directions.length === 0) return null;
  const eventRefs = unique(events.map((event) => event.event_code), 12, 128);
  const npcRefs = unique(args.plan.npc_next_actions.map((action) => action.npc_code), 12, 128);
  const must = unique(events.filter((event) => event.priority === "high").map((event) => event.injection_hint), 4);
  const should = unique(events.filter((event) => event.priority === "medium").map((event) => event.injection_hint), 4);
  const may = unique(events.filter((event) => event.priority === "low").map((event) => event.injection_hint), 4);
  const forbid = unique(events.flatMap((event) => event.forbidden_outcomes), 8);
  const digest = createHash("sha256").update(JSON.stringify({
    ...args.scope,
    runId: args.runId,
    revision: args.worldRevision.toString(),
    eventRefs,
    directions,
  })).digest("hex").slice(0, 24);
  return {
    ...args.scope,
    hintId: `hint_${digest}`,
    runId: args.runId,
    worldRevision: args.worldRevision.toString(),
    validFromTurn: args.turnIndex + 1,
    validThroughTurn: args.turnIndex + Math.max(1, Math.min(12, ...events.map((event) => event.ttl_turns), 4)),
    phase: args.plan.target_phase,
    directions,
    must,
    should,
    may,
    forbid,
    factRefs: [],
    eventRefs,
    npcRefs,
    sources: unique(args.sources ?? ["world_director"], 4, 64) as DirectorHintSource[],
    lifecycle: "active",
    createdAt: new Date().toISOString(),
  };
}

export function isDirectorHintApplicable(
  envelope: DirectorHintEnvelope,
  scope: WorldRuntimeScope,
  turnIndex: number,
): boolean {
  return envelope.lifecycle === "active" &&
    envelope.worldId === scope.worldId &&
    envelope.mapId === scope.mapId &&
    envelope.sessionId === scope.sessionId &&
    turnIndex >= envelope.validFromTurn &&
    turnIndex <= envelope.validThroughTurn;
}

export function renderDirectorHintEnvelope(envelope: DirectorHintEnvelope): string {
  const lines = [
    "## 已验证的后台导演方向（只决定方向，不决定事实或玩家行动）",
    `- hint_id: ${envelope.hintId}`,
    `- phase: ${envelope.phase}`,
    ...envelope.directions.map((value) => `- direction: ${value}`),
    ...envelope.must.map((value) => `- must: ${value}`),
    ...envelope.should.map((value) => `- should: ${value}`),
    ...envelope.may.map((value) => `- may: ${value}`),
    ...envelope.forbid.map((value) => `- forbid: ${value}`),
    "具体对白与描写由 Writer 创作；不得把方向当成已发生事实。",
  ];
  return lines.join("\n").slice(0, 4_000);
}

export function normalizeDirectorHintReceipt(value: unknown, knownHintIds: ReadonlySet<string>): DirectorHintReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const hintId = typeof raw.hintId === "string" ? raw.hintId.trim().slice(0, 128) : "";
  if (!hintId || !knownHintIds.has(hintId)) return null;
  const status = raw.status;
  if (status !== "considered" && status !== "applied" && status !== "skipped") return null;
  const reasonCode = typeof raw.reasonCode === "string" ? raw.reasonCode.trim().slice(0, 128) : "";
  return { hintId, status, ...(reasonCode ? { reasonCode } : {}) };
}

export function stripDirectorHintReceipt<T extends Record<string, unknown>>(candidate: T): T {
  if (!("director_hint_receipt" in candidate) && !("directorHintReceipt" in candidate)) return candidate;
  const copy = { ...candidate };
  delete copy.director_hint_receipt;
  delete copy.directorHintReceipt;
  return copy;
}

export function priorityRank(value: DirectorPriority): number {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}
