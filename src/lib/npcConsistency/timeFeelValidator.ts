/**
 * 阶段7：叙事时间感 — 与 action_time_cost 建议档位粗对齐（启发式）。
 */

import type { ActionTimeCostKind } from "@/lib/time/actionCost";

export type TimeFeelValidatorResult = {
  timeFeelMismatchDetected: boolean;
  mismatchType: string | null;
  severity: "none" | "low" | "high";
  rewriteNeeded: boolean;
};

const LONG_PASSAGE_RE = /许久|大半天|不知不觉过了(?:好|几)?个?(?:小时|钟头)|直到夜深|漫长的(?:沉默|等待)|像过了一个世纪/;
const WEIGHT_RE = /喘|冷汗|僵|绷紧|透支|腿软|耳鸣|心跳|血(?:味|腥)|火|烫/;

export function validateTimeFeelNarrative(input: {
  narrative: string;
  suggestForTurn: ActionTimeCostKind | null;
}): TimeFeelValidatorResult {
  const n = String(input.narrative ?? "");
  if (!n.trim() || !input.suggestForTurn || input.suggestForTurn === "free") {
    return {
      timeFeelMismatchDetected: false,
      mismatchType: null,
      severity: "none",
      rewriteNeeded: false,
    };
  }

  if ((input.suggestForTurn === "light" || input.suggestForTurn === "standard") && LONG_PASSAGE_RE.test(n)) {
    return {
      timeFeelMismatchDetected: true,
      mismatchType: "light_or_standard_with_epic_duration",
      severity: "low",
      rewriteNeeded: true,
    };
  }

  if (input.suggestForTurn === "dangerous" && n.length < 140 && !WEIGHT_RE.test(n)) {
    return {
      timeFeelMismatchDetected: true,
      mismatchType: "dangerous_without_somatic_weight",
      severity: "low",
      rewriteNeeded: true,
    };
  }

  return {
    timeFeelMismatchDetected: false,
    mismatchType: null,
    severity: "none",
    rewriteNeeded: false,
  };
}
