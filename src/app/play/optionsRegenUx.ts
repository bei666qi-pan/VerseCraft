import { clamp } from "@/lib/clamp";
import { OPTIONS_REGEN_LATENCY_BUDGET } from "@/lib/perf/waitingConfig";

export type OptionsRegenTrigger = "auto_switch" | "manual_button" | "opening_fallback" | "auto_missing_main";
export type ClientTurnMode = "decision_required" | "narrative_only" | "system_transition";

export const OPTIONS_REGEN_META_REQUEST = "请基于当前场景生成四个可执行行动选项。";

export function buildOptionsOnlyContextMessages(args: {
  latestNarrative?: string | null;
  latestPlayerAction?: string | null;
}): Array<{ role: "assistant" | "user"; content: string }> {
  const messages: Array<{ role: "assistant" | "user"; content: string }> = [];
  const narrative = String(args.latestNarrative ?? "").trim();
  const playerAction = String(args.latestPlayerAction ?? "").trim();
  if (narrative) messages.push({ role: "assistant", content: narrative });
  if (playerAction) messages.push({ role: "user", content: playerAction });
  messages.push({ role: "user", content: OPTIONS_REGEN_META_REQUEST });
  return messages;
}

export function getOptionsOnlyDeadlineMs(trigger: OptionsRegenTrigger): number {
  return trigger === "opening_fallback"
    ? OPTIONS_REGEN_LATENCY_BUDGET.openingClientDeadlineMs
    : OPTIONS_REGEN_LATENCY_BUDGET.clientDeadlineMs;
}

export function backfillAcceptedOptionsFromModel(args: {
  accepted: string[];
  candidates: string[];
  targetCount?: number;
}): string[] {
  const targetCount = clamp(Math.trunc(args.targetCount ?? 4), 1, 4);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const option of [...args.accepted, ...args.candidates]) {
    const trimmed = typeof option === "string" ? option.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    out.push(trimmed);
    seen.add(trimmed);
    if (out.length >= targetCount) break;
  }
  return out;
}

