import type { EscapeMainlineState, EscapeCondition, EscapeConditionCode } from "./types";

function uniq(xs: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

export function getUnmetConditions(state: EscapeMainlineState, maxItems = 2): EscapeCondition[] {
  const met = new Set((state.metConditions ?? []).map((x) => String(x)));
  const all = state.knownConditions ?? [];
  return all.filter((c) => c.required && !met.has(c.code)).slice(0, Math.max(0, Math.min(4, maxItems)));
}

export function getEscapeObjectiveSummary(state: EscapeMainlineState): {
  stage: string;
  nextObjective: string;
  blockers: string[];
} {
  const stage = state.stage;
  const unmet = getUnmetConditions(state, 2);
  const blockers = uniq((state.blockers ?? []).map((b) => b.label), 2);
  const nextObjective =
    stage === "trapped"
      ? "先确认出口并拼出路线碎片。"
      : stage === "aware_exit_exists"
        ? "收集更多路线碎片与可信线索。"
        : stage === "route_fragmented"
          ? "把出口条件弄清楚，别被假出口骗了。"
          : stage === "conditions_known"
            ? unmet.length > 0
              ? `优先满足：${unmet.map((x) => x.label).join("；")}`
              : "条件已知，开始逐项兑现。"
            : stage === "conditions_partially_met"
              ? unmet.length > 0
                ? `还差：${unmet.map((x) => x.label).join("；")}`
                : "你离最终窗口很近了。"
              : stage === "final_window_open"
                ? "最终窗口已开：去做最后动作。"
                : stage.startsWith("escaped_")
                  ? "你已经完成了本局逃离结局。"
                  : stage === "doomed"
                    ? "末日闸门落下：只剩终焉。"
                    : "继续推进出口主线。";

  return { stage, nextObjective, blockers };
}

export function shouldSuppressDoomlineBecauseEscaped(state: EscapeMainlineState): boolean {
  return state.stage === "escaped_true" || state.stage === "escaped_false" || state.stage === "escaped_costly";
}

export function computeEscapeOutcomeForSettlement(state: EscapeMainlineState): "none" | "true_escape" | "false_escape" | "costly_escape" | "doom" {
  return state.outcomeHint?.outcome ?? "none";
}

export function pickEscapeMetCodes(state: EscapeMainlineState, max = 6): EscapeConditionCode[] {
  return (state.metConditions ?? []).slice(0, max) as EscapeConditionCode[];
}

