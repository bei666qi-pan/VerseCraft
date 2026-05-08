import {
  computeSettlementGrade,
  formatSettlementFloor,
  getSettlementGradeCaption,
  resolveSettlementFloorScore,
  type SettlementEscapeOutcome,
} from "@/lib/settlement/rules";
import type {
  BuildSettlementSnapshotInput,
  EndingLogEntry,
  EndingOutcome,
  EndingSettlementSnapshot,
} from "./types";

function clampText(value: unknown, max: number): string {
  const text = String(value ?? "").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function uniq(values: readonly string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = clampText(value, 180);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= cap) break;
  }
  return out;
}

function toInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function mapEscapeOutcome(outcome: EndingOutcome): SettlementEscapeOutcome {
  if (outcome === "doom") return "doom";
  if (outcome === "true_escape") return "true_escape";
  if (outcome === "costly_escape") return "costly_escape";
  if (outcome === "false_escape") return "false_escape";
  return "none";
}

export function getEndingOutcomeTitle(outcome: EndingOutcome): string {
  switch (outcome) {
    case "death":
      return "死亡";
    case "doom":
      return "终焉";
    case "true_escape":
      return "真正逃离";
    case "costly_escape":
      return "代价逃离";
    case "false_escape":
      return "假逃离";
    case "abandon":
    default:
      return "中止记录";
  }
}

export function getEndingOutcomeCaption(outcome: EndingOutcome, fallbackCaption: string): string {
  switch (outcome) {
    case "death":
      return "你的意识在公寓规则里断裂，本局记录进入死亡结算。";
    case "doom":
      return "终焉已经落下，而你的痕迹仍未散尽。";
    case "true_escape":
      return "你找到了真正的出口，并把规则留在身后。";
    case "costly_escape":
      return "你走出了公寓，但代价会跟着你继续呼吸。";
    case "false_escape":
      return "你以为自己走出了门，门后却只是另一层更深的规则。";
    case "abandon":
      return "本局在这里中止，剩余的回声保留为可回顾记录。";
    default:
      return fallbackCaption;
  }
}

export function estimateKilledAnomaliesFromLogs(logs: readonly EndingLogEntry[]): number {
  const text = logs
    .filter((item) => item.role === "assistant")
    .map((item) => item.content)
    .join("\n");
  const matches = text.match(/(?:消灭|击杀|杀死|解决|压制).{0,8}诡异|诡异.{0,8}(?:消灭|击杀|杀死|解决|压制)/g);
  return matches ? Math.max(0, matches.length) : 0;
}

export function buildEndingWritingMarkdown(logs: readonly EndingLogEntry[]): string {
  const lines = ["# 文界工坊 · 本局写作稿", "", "---", ""];
  for (const entry of logs) {
    if (entry.role === "user") {
      lines.push("## 玩家行动", "", String(entry.content ?? ""), "", "---", "");
    } else if (entry.role === "assistant") {
      lines.push("## 剧情叙事", "", String(entry.content ?? ""), "", "---", "");
    } else if (entry.role === "system") {
      lines.push("## 系统指令", "", "```", String(entry.content ?? ""), "```", "", "---", "");
    }
  }
  return lines.join("\n");
}

export function pickFinalNarrative(logs: readonly EndingLogEntry[], explicit?: string | null): string {
  const direct = clampText(explicit, 20000);
  if (direct) return direct;
  const lastAssistant = [...logs].reverse().find((entry) => entry.role === "assistant");
  return clampText(lastAssistant?.content, 20000);
}

export function buildSettlementSnapshot(input: BuildSettlementSnapshotInput): EndingSettlementSnapshot {
  const day = Math.max(0, toInt(input.time?.day, 0));
  const hour = Math.max(0, toInt(input.time?.hour, 0));
  const survivalHours = day * 24 + hour;
  const locationFloorScore = resolveSettlementFloorScore(input.playerLocation);
  const maxFloorScore = Math.max(
    locationFloorScore,
    Math.max(0, toInt(input.historicalMaxFloorScore, 0))
  );
  const escapeOutcome = mapEscapeOutcome(input.eligibility.outcome);
  const isDead = input.eligibility.outcome === "death" || Number(input.stats?.sanity ?? 0) <= 0;
  const killedAnomalies = Math.max(
    0,
    toInt(input.killedAnomalies, estimateKilledAnomaliesFromLogs(input.logs))
  );
  const grade = computeSettlementGrade({
    isDead,
    maxFloor: maxFloorScore,
    killedAnomalies,
    survivalHours,
    escapeOutcome,
  });
  const fallbackCaption = getSettlementGradeCaption(grade, escapeOutcome);
  const settlementId =
    clampText(input.settlementId, 160) ||
    `settlement:${input.runId}:${input.eligibility.outcome}:${input.eligibility.detectedAtTurn}`;

  return {
    v: 1,
    runId: input.runId,
    settlementId,
    outcome: input.eligibility.outcome,
    grade,
    title: getEndingOutcomeTitle(input.eligibility.outcome),
    caption: getEndingOutcomeCaption(input.eligibility.outcome, fallbackCaption),
    finalNarrative: pickFinalNarrative(input.logs, input.finalNarrative),
    survivalHours,
    survivalDay: day,
    survivalHour: hour,
    maxFloorScore,
    maxFloorLabel: formatSettlementFloor(maxFloorScore),
    killedAnomalies,
    keyChoices: uniq(input.keyChoices ?? [], 12),
    obtainedClues: uniq(input.obtainedClues ?? [], 16),
    npcEpilogues: uniq(input.npcEpilogues ?? [], 16),
    worldStateLines: uniq(input.worldStateLines ?? [], 16),
    finalChoiceLabel: input.finalChoice?.label ?? null,
    deathCause: input.deathContext?.deathCause ?? null,
    deathLocation: input.deathContext?.deathLocation ?? null,
    lastAction: input.deathContext?.lastAction ?? null,
    createdAt: clampText(input.createdAt, 80) || "1970-01-01T00:00:00.000Z",
    writingMarkdown: input.writingMarkdown ?? buildEndingWritingMarkdown(input.logs),
  };
}
