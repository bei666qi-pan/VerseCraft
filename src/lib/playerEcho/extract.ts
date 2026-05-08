import { PLAYER_ECHO_MAX_FRAGMENT_CHARS } from "./constants";
import type { RunSnapshotV2 } from "@/lib/state/snapshot/types";
import type { TurnCommitSummary } from "@/lib/turnEngine/commitTurn";
import type { EchoFragment, EchoFragmentType, EchoSafetyLevel, EchoTargetType } from "./types";

type UnknownRecord = Record<string, unknown>;

export type ExtractPlayerEchoCandidatesFromTurnArgs = {
  userId?: string | null;
  runId?: string | null;
  dmRecord?: Record<string, unknown> | null;
  runSnapshotV2?: RunSnapshotV2 | null | undefined;
  turnCommitSummary?: TurnCommitSummary | null;
  latestUserInput?: string | null;
  nowIso?: string | null;
};

const MAX_CANDIDATES = 8;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/\bN-\d{3,}\b/g, "某人")
    .replace(/\b[A-Z]{1,4}-\d{2,}\b/g, "某个标记")
    .replace(/\b[A-Z][A-Za-z0-9]+_[A-Za-z0-9_]+\b/g, "此处")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length <= maxChars ? cleaned : cleaned.slice(0, maxChars);
}

function nonEmptyString(value: unknown, maxChars: number): string | null {
  const out = text(value, maxChars);
  return out ? out : null;
}

function rawId(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const out = value.trim();
  return out ? out.slice(0, maxChars) : null;
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function sourceTurnId(args: ExtractPlayerEchoCandidatesFromTurnArgs): string | undefined {
  return args.turnCommitSummary?.requestId ?? rawId(args.runId, 100) ?? undefined;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildFragment(args: {
  type: EchoFragmentType;
  targetType: EchoTargetType;
  targetId?: string | null;
  summary: string;
  safetyLevel: EchoSafetyLevel;
  emotionalWeight: number;
  salience: number;
  confidence?: number;
  anchors?: EchoFragment["anchors"];
  sourceTurnId?: string;
  nowIso?: string | null;
}): EchoFragment {
  const summary = text(args.summary, PLAYER_ECHO_MAX_FRAGMENT_CHARS);
  const targetId = rawId(args.targetId, 100);
  const key = `${args.type}|${args.targetType}|${targetId ?? ""}|${summary}`;
  return {
    id: `echo_${args.type}_${stableHash(key).slice(0, 10)}`,
    type: args.type,
    targetType: args.targetType,
    targetId,
    summary,
    safetyLevel: args.safetyLevel,
    emotionalWeight: Math.max(0, Math.min(1, args.emotionalWeight)),
    salience: Math.max(0, Math.min(1, args.salience)),
    confidence: Math.max(0, Math.min(1, args.confidence ?? 0.85)),
    status: "active",
    ...(args.sourceTurnId ? { sourceTurnId: args.sourceTurnId } : {}),
    ...(args.anchors ? { anchors: args.anchors } : {}),
    ...(args.safetyLevel >= 4 ? { revealTierMin: 4 } : {}),
  };
}

function pushUnique(out: EchoFragment[], fragment: EchoFragment | null): void {
  if (!fragment || !fragment.summary) return;
  const key = `${fragment.type}|${fragment.targetType}|${fragment.targetId ?? ""}`;
  if (out.some((existing) => `${existing.type}|${existing.targetType}|${existing.targetId ?? ""}` === key)) return;
  if (out.length < MAX_CANDIDATES) out.push(fragment);
}

function firstRecord(...values: unknown[]): UnknownRecord | null {
  for (const value of values) {
    if (isRecord(value)) return value;
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const out = rawId(value, 128);
    if (out) return out;
  }
  return null;
}

function deathFragment(args: ExtractPlayerEchoCandidatesFromTurnArgs): EchoFragment | null {
  const dm = args.dmRecord ?? {};
  if (!bool(dm.is_death)) return null;
  const death = args.runSnapshotV2?.death;
  const threat = asArray(dm.main_threat_updates).find(isRecord);
  const anomalyId = firstString(threat?.threatId, threat?.anomalyId, threat?.id);
  const locationId = firstString(dm.player_location, death?.lastDeathLocation, args.runSnapshotV2?.player.currentLocation);
  const cause = nonEmptyString(
    (dm as { death_cause?: unknown }).death_cause ?? (dm as { deathCause?: unknown }).deathCause ?? death?.lastDeathCause,
    32
  );

  const targetType: EchoTargetType = locationId ? "location" : anomalyId ? "anomaly" : "global";
  const targetId = locationId ?? anomalyId ?? null;
  const summary = cause ? `一次死亡留下${cause}` : "一次死亡在本轮尽头留下冷感";
  return buildFragment({
    type: "death",
    targetType,
    targetId,
    summary,
    safetyLevel: cause ? 2 : 1,
    emotionalWeight: 0.88,
    salience: 0.9,
    sourceTurnId: sourceTurnId(args),
    anchors: {
      ...(locationId ? { locationIds: [locationId] } : {}),
      ...(anomalyId ? { worldFlags: [anomalyId] } : {}),
    },
    nowIso: args.nowIso,
  });
}

function endingFragment(args: ExtractPlayerEchoCandidatesFromTurnArgs): EchoFragment | null {
  const dm = args.dmRecord ?? {};
  const endingFinale = firstRecord(dm.ending_finale);
  const endingState = args.runSnapshotV2?.endingState;
  const settlement = args.runSnapshotV2?.endingSettlementSnapshot ?? endingState?.settlementSnapshot ?? null;
  const escape = firstRecord(args.runSnapshotV2?.escape);
  const escapeStage = firstString(escape?.stage);
  const escaped = escapeStage?.startsWith("escaped_") || escapeStage === "doomed";
  const phase = endingState?.phase;
  const outcome = firstString(endingFinale?.outcome, settlement?.outcome, endingState?.eligibility?.outcome, escapeStage);
  const hasEnding =
    Boolean(endingFinale) ||
    phase === "settlement_ready" ||
    phase === "settled" ||
    escaped ||
    typeof outcome === "string";
  if (!hasEnding) return null;

  const deepEnding = outcome === "true_escape" || outcome === "doom" || outcome === "doomed";
  const safetyLevel: EchoSafetyLevel = deepEnding ? 4 : outcome ? 3 : 2;
  return buildFragment({
    type: "ending",
    targetType: escaped ? "route" : "global",
    targetId: outcome ?? escapeStage ?? null,
    summary: escaped ? "这一轮抵达逃离边界" : "这一轮走到结局边界",
    safetyLevel,
    emotionalWeight: 0.86,
    salience: deepEnding ? 0.95 : 0.82,
    sourceTurnId: sourceTurnId(args),
    anchors: {
      worldFlags: [outcome ?? escapeStage ?? "ending"].filter(Boolean),
    },
    nowIso: args.nowIso,
  });
}

function relationshipRows(dm: Record<string, unknown>): UnknownRecord[] {
  const direct = asArray(dm.relationship_updates);
  const nested = isRecord(dm.relation_changes) ? asArray(dm.relation_changes.relationship_updates) : [];
  return [...direct, ...nested].filter(isRecord);
}

function relationshipType(row: UnknownRecord): EchoFragmentType {
  const bag = JSON.stringify(row).toLowerCase();
  if (/betray|背叛|出卖|betrayal/.test(bag)) return "betrayal";
  if (/rescue|救|援|protect|保护|挡下/.test(bag)) return "rescue";
  return "npc_bond";
}

function relationshipSummary(type: EchoFragmentType): string {
  if (type === "betrayal") return "一次背离在关系里留下裂痕";
  if (type === "rescue") return "一次援手在关系里留下余温";
  return "一次关系转向被留下";
}

function relationshipFragments(args: ExtractPlayerEchoCandidatesFromTurnArgs): EchoFragment[] {
  const out: EchoFragment[] = [];
  const source = sourceTurnId(args);
  for (const row of relationshipRows(args.dmRecord ?? {})) {
    const npcId = firstString(row.npcId, row.npc_id, row.actorId, row.id);
    if (!npcId) continue;
    const type = relationshipType(row);
    pushUnique(
      out,
      buildFragment({
        type,
        targetType: "npc",
        targetId: npcId,
        summary: relationshipSummary(type),
        safetyLevel: 2,
        emotionalWeight: type === "npc_bond" ? 0.62 : 0.82,
        salience: type === "npc_bond" ? 0.68 : 0.88,
        sourceTurnId: source,
        anchors: { npcIds: [npcId] },
        nowIso: args.nowIso,
      })
    );
  }
  return out;
}

function taskRows(dm: Record<string, unknown>): UnknownRecord[] {
  const direct = asArray(dm.task_updates);
  const nested = isRecord(dm.task_changes) ? asArray(dm.task_changes.task_updates) : [];
  return [...direct, ...nested].filter(isRecord);
}

function isHighSalienceTask(row: UnknownRecord): boolean {
  const status = firstString(row.status, row.state);
  if (status !== "completed" && status !== "failed") return false;
  if (row.highRiskHighReward === true || row.salience === "high") return true;
  const textBag = `${firstString(row.title, row.name) ?? ""} ${firstString(row.summary, row.desc, row.description) ?? ""}`;
  return /逃|出口|真相|钥|七楼|B2|承诺|牺牲|救|背叛/.test(textBag);
}

function taskFragments(args: ExtractPlayerEchoCandidatesFromTurnArgs): EchoFragment[] {
  const out: EchoFragment[] = [];
  for (const row of taskRows(args.dmRecord ?? {})) {
    if (!isHighSalienceTask(row)) continue;
    const status = firstString(row.status, row.state);
    const taskId = firstString(row.id, row.taskId, row.task_id);
    const title = nonEmptyString(firstString(row.title, row.name), 24);
    const failed = status === "failed";
    pushUnique(
      out,
      buildFragment({
        type: failed ? "hook" : "route_hint",
        targetType: "task",
        targetId: taskId,
        summary: failed
          ? `${title ? `「${title}」` : "一条关键线索"}失败后留下遗憾`
          : `${title ? `「${title}」` : "一条关键线索"}完成后留下牵引`,
        safetyLevel: 2,
        emotionalWeight: failed ? 0.7 : 0.58,
        salience: 0.72,
        sourceTurnId: sourceTurnId(args),
        anchors: { ...(taskId ? { taskIds: [taskId] } : {}) },
        nowIso: args.nowIso,
      })
    );
  }
  return out;
}

function clueRows(dm: Record<string, unknown>): UnknownRecord[] {
  const direct = asArray(dm.clue_updates);
  const nested = isRecord(dm.clue_changes) ? asArray(dm.clue_changes.clue_updates) : [];
  return [...direct, ...nested].filter(isRecord);
}

function clueFragments(args: ExtractPlayerEchoCandidatesFromTurnArgs): EchoFragment[] {
  const out: EchoFragment[] = [];
  const source = sourceTurnId(args);
  for (const row of clueRows(args.dmRecord ?? {})) {
    const kind = firstString(row.kind, row.type, row.truthClass);
    const textBag = JSON.stringify(row);
    const looksTruth = /truth|secret|真相|秘密|深层|root|loop|循环|七楼|B2/.test(`${kind ?? ""} ${textBag}`);
    if (!looksTruth) continue;
    const clueId = firstString(row.id, row.clueId, row.factId);
    const deep = /root|loop|循环|根因|深层/.test(`${kind ?? ""} ${textBag}`);
    pushUnique(
      out,
      buildFragment({
        type: "truth_glimpse",
        targetType: "world",
        targetId: clueId,
        summary: deep ? "一眼深层真相的边缘被看见" : "一条真相碎片被看见",
        safetyLevel: deep ? 4 : 3,
        emotionalWeight: 0.72,
        salience: deep ? 0.92 : 0.78,
        sourceTurnId: source,
        anchors: { ...(clueId ? { worldFlags: [clueId] } : {}) },
        nowIso: args.nowIso,
      })
    );
  }

  for (const secretId of args.runSnapshotV2?.world.discoveredSecrets ?? []) {
    if (out.length >= 2) break;
    const deep = /root|loop|truth|abyss|B2|7F|七/.test(secretId);
    pushUnique(
      out,
      buildFragment({
        type: "truth_glimpse",
        targetType: "world",
        targetId: secretId,
        summary: deep ? "一眼深层真相的边缘被看见" : "一条真相碎片被看见",
        safetyLevel: deep ? 4 : 3,
        emotionalWeight: 0.7,
        salience: deep ? 0.9 : 0.74,
        sourceTurnId: source,
        anchors: { worldFlags: [secretId] },
        nowIso: args.nowIso,
      })
    );
  }
  return out;
}

export function extractPlayerEchoCandidatesFromTurn(
  args: ExtractPlayerEchoCandidatesFromTurnArgs
): EchoFragment[] {
  const out: EchoFragment[] = [];
  pushUnique(out, deathFragment(args));
  pushUnique(out, endingFragment(args));
  for (const fragment of relationshipFragments(args)) pushUnique(out, fragment);
  for (const fragment of taskFragments(args)) pushUnique(out, fragment);
  for (const fragment of clueFragments(args)) pushUnique(out, fragment);
  return out.slice(0, MAX_CANDIDATES);
}
