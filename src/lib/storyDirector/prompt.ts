import type { DirectorPlan, IncidentEnvelope } from "./types";

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function joinShort(xs: string[], maxItems: number, maxLen: number): string {
  const arr = (xs ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, maxItems);
  return clampText(arr.join("，"), maxLen);
}

/**
 * 给模型的“导演提示块”：短、强约束、无实现细节、无变量名、无预算字眼。
 * 注意：这是写作约束，不是 UI 文本。
 */
export function buildDirectorPromptBlock(args: {
  plan: DirectorPlan;
  armedIncident: IncidentEnvelope | null;
  incidentPreviewCodes: string[];
  maxChars?: number;
}): string {
  const maxChars = Math.max(120, Math.min(700, args.maxChars ?? 360));
  const plan = args.plan;
  const lines: string[] = [];
  lines.push("## 【本回合叙事节拍提示（只供写作，不要像系统提示）】");
  lines.push(
    plan.beatMode === "quiet"
      ? "节拍：偏克制推进。用行动推进，不要长篇解释设定。"
      : plan.beatMode === "aftershock"
        ? "节拍：余震缓冲。允许喘息，但后果要留回音。"
        : plan.beatMode === "reveal"
          ? "节拍：回收旧钩子。让旧线索/旧承诺自然回到场景里。"
          : plan.beatMode === "collision"
            ? "节拍：冲突碰撞。用人物同场与立场逼迫玩家做选择。"
            : plan.beatMode === "countdown"
              ? "节拍：机会倒计时。让‘要么现在、要么错过’变得具体。"
              : plan.beatMode === "peak"
                ? "节拍：高压峰值。压迫感升级，但必须清晰、可执行。"
                : "节拍：压力上升。"
  );

  if (plan.softPressureHint) lines.push(`微压：${clampText(plan.softPressureHint, 120)}`);
  if (plan.hardConstraint) lines.push(`硬约束：${clampText(plan.hardConstraint, 120)}`);

  const recall = joinShort(plan.mustRecallHookCodes ?? [], 2, 80);
  if (recall) {
    lines.push("回收重点：让下列旧钩子以场景细节/对白方式出现（不要直呼代码）：");
    lines.push(`- ${recall}`);
  }

  if (args.armedIncident) {
    const inc = args.armedIncident;
    lines.push("到点事件：本回合必须自然引出一个突发变化（不要写成‘触发事件’）：");
    lines.push(`- ${clampText(inc.title, 70)}（倾向：${inc.kind} / ${inc.severity}）`);
  } else {
    const previews = joinShort(args.incidentPreviewCodes ?? [], 2, 80);
    if (previews) {
      lines.push("阴影预告：可以提前埋一点不安（不爆发），方向参考：");
      lines.push(`- ${previews}`);
    }
  }

  const text = lines.join("\n");
  return clampText(text, maxChars);
}

export function buildDirectorDigestForServer(args: {
  tension: number;
  stallCount: number;
  beatModeHint: string;
  pressureFlags: string[];
  pendingIncidentCodes: string[];
  mustRecallHookCodes: string[];
}): {
  tension: number;
  stallCount: number;
  beatModeHint: string;
  pressureFlags: string[];
  pendingIncidentCodes: string[];
  mustRecallHookCodes: string[];
  digest: string;
} {
  const t = Math.max(0, Math.min(100, Math.trunc(args.tension ?? 0)));
  const stall = Math.max(0, Math.min(9, Math.trunc(args.stallCount ?? 0)));
  const beat = clampText(args.beatModeHint ?? "", 20) || "quiet";
  const flags = (args.pressureFlags ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 6);
  const pending = (args.pendingIncidentCodes ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 6);
  const recall = (args.mustRecallHookCodes ?? []).map((x) => String(x ?? "").trim()).filter(Boolean).slice(0, 4);
  const digest = clampText(
    `t=${t};stall=${stall};beat=${beat};flags=${flags.join(",")};pending=${pending.join(",")};recall=${recall.join(",")}`,
    220
  );
  return { tension: t, stallCount: stall, beatModeHint: beat, pressureFlags: flags, pendingIncidentCodes: pending, mustRecallHookCodes: recall, digest };
}

