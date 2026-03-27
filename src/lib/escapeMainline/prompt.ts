import type { EscapeMainlineState } from "./types";
import { getEscapeObjectiveSummary, getUnmetConditions } from "./selectors";

function clamp(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

export function buildEscapePromptBlock(args: { state: EscapeMainlineState; maxChars?: number }): string {
  const maxChars = Math.max(80, Math.min(520, args.maxChars ?? 260));
  const s = args.state;
  if (!s) return "";
  const summary = getEscapeObjectiveSummary(s);
  const unmet = getUnmetConditions(s, 2);
  const blocker = (s.blockers ?? []).sort((a, b) => (a.severity === "high" ? -2 : a.severity === "medium" ? -1 : 0) - (b.severity === "high" ? -2 : b.severity === "medium" ? -1 : 0))[0];
  const falseLead = (s.falseLeads ?? [])[0];
  const window = s.finalWindow?.open ? `最终窗口：已开（到期回合≤${s.finalWindow.expiresTurn}）。` : "最终窗口：未开。";

  const lines: string[] = [];
  lines.push("## 【出口主线（只供写作，不要像系统提示）】");
  lines.push(`阶段：${summary.stage}。${window}`);
  if (unmet.length > 0) lines.push(`未满足关键条件：${unmet.map((x) => x.label).join("；")}`);
  if (blocker?.label) lines.push(`最大阻碍：${blocker.label}`);
  if (falseLead?.label) lines.push(`假出口风险：${falseLead.label}（别把它写成真正胜利）。`);
  lines.push(`目标：${summary.nextObjective}`);
  return clamp(lines.join("\n"), maxChars);
}

