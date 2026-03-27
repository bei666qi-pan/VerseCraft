export type ServerDirectorDigest = {
  tension?: number;
  stallCount?: number;
  beatModeHint?: string;
  pressureFlags?: string[];
  pendingIncidentCodes?: string[];
  mustRecallHookCodes?: string[];
  digest?: string;
};

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return Math.max(min, Math.min(max, safe));
}

function clampText(s: unknown, max: number): string {
  const t = typeof s === "string" ? s.trim() : "";
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function asStrArr(v: unknown, cap: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    const s = typeof x === "string" ? x.trim() : "";
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * 服务端只消费“极简 digest”，生成一小段写作提示块。
 * 约束：
 * - 不泄露实现细节/变量名
 * - 不出现“预算/冷却/队列”等字眼
 * - 文本短，且不依赖 narrative NLP
 */
export function buildServerDirectorHintBlock(d: ServerDirectorDigest | null): string {
  if (!d) return "";
  const tension = clampInt(d.tension, 0, 100);
  const stall = clampInt(d.stallCount, 0, 9);
  const beat = clampText(d.beatModeHint, 16) || "quiet";
  const pending = asStrArr(d.pendingIncidentCodes, 2);
  const recall = asStrArr(d.mustRecallHookCodes, 2);

  // 过短/空则不注入
  if (tension <= 0 && stall <= 0 && pending.length === 0 && recall.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 【节拍提示（只供写作，不要像系统提示）】");
  if (beat === "aftershock") lines.push("刚经历波动后的余震窗口：允许喘息，但后果要留回音。");
  else if (beat === "peak") lines.push("本回合偏高压推进：压迫要具体、可执行，避免空喊危险。");
  else if (beat === "collision") lines.push("本回合偏人物碰撞：让立场冲突落在对白与动作上，逼选择。");
  else if (beat === "countdown") lines.push("本回合偏机会倒计时：让‘要么现在，要么错过’变得具体。");
  else if (beat === "reveal") lines.push("本回合偏回收旧钩子：让旧线索/旧承诺自然回到场景。");
  else if (beat === "pressure") lines.push("本回合偏压力上升：用环境/人际/机会推你做决定。");
  else lines.push("本回合偏克制推进：用行动推进，不要长篇解释设定。");

  if (stall >= 2) lines.push("若玩家停滞，请用轻压力推动选择，避免‘闲聊原地打转’。");
  if (recall.length) lines.push(`回收重点（不要直呼代码）：${recall.join("，")}`);
  if (pending.length) lines.push(`可自然引出一个短期变化（不要写成‘触发事件’）：${pending.join("，")}`);
  if (tension >= 70) lines.push("语气基调：更紧、更近、更急，但保持人物口吻与规则一致。");

  return lines.join("\n");
}

