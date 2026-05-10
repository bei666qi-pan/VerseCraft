export type ServerDirectorDigest = {
  tension?: number;
  stallCount?: number;
  beatModeHint?: string;
  pressureFlags?: string[];
  pendingIncidentCodes?: string[];
  mustRecallHookCodes?: string[];
  digest?: string;
};

export type ServerDirectorAgendaHint = {
  id?: number;
  eventCode: string;
  title: string;
  currentPhase?: string | null;
  targetPhase?: string | null;
  injectionHint: string;
  triggerConditions?: string[];
  agencyConstraints?: string[];
  forbiddenOutcomes?: string[];
  salience?: number;
  revealPolicy?: string | null;
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
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s.length <= 120 ? s : s.slice(0, 120));
    if (out.length >= cap) break;
  }
  return out;
}

function agendaArr(v: unknown, cap: number): ServerDirectorAgendaHint[] {
  if (!Array.isArray(v)) return [];
  const out: ServerDirectorAgendaHint[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const o = x as Record<string, unknown>;
    const eventCode = clampText(o.eventCode ?? o.event_code, 80);
    const title = clampText(o.title, 80);
    const injectionHint = clampText(o.injectionHint ?? o.injection_hint, 220);
    if (!eventCode || !title || !injectionHint) continue;
    out.push({
      id: typeof o.id === "number" && Number.isFinite(o.id) ? Math.trunc(o.id) : undefined,
      eventCode,
      title,
      currentPhase: clampText(o.currentPhase ?? o.current_phase, 24) || null,
      targetPhase: clampText(o.targetPhase ?? o.target_phase, 24) || null,
      injectionHint,
      triggerConditions: asStrArr(o.triggerConditions ?? o.trigger_conditions, 3),
      agencyConstraints: asStrArr(o.agencyConstraints ?? o.agency_constraints, 3),
      forbiddenOutcomes: asStrArr(o.forbiddenOutcomes ?? o.forbidden_outcomes, 3),
      salience:
        typeof o.salience === "number" && Number.isFinite(o.salience)
          ? Math.max(0, Math.min(1, o.salience))
          : undefined,
      revealPolicy: clampText(o.revealPolicy ?? o.reveal_policy, 24) || null,
    });
    if (out.length >= cap) break;
  }
  return out;
}

export function buildDirectorAgendaHintBlock(
  agenda: readonly ServerDirectorAgendaHint[],
  opts?: {
    currentPhase?: string | null;
    targetIntent?: string | null;
    maxItems?: number;
    maxChars?: number;
  }
): string {
  const maxItems = Math.max(1, Math.min(3, opts?.maxItems ?? 2));
  const maxChars = Math.max(240, Math.min(1200, opts?.maxChars ?? 760));
  const items = agendaArr(agenda, maxItems);
  if (items.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 【后台导演提示｜仅供主笔参考，不是玩家可见文本】");
  const phase = clampText(opts?.currentPhase, 24);
  const intent = clampText(opts?.targetIntent, 140);
  if (phase) lines.push(`当前导演阶段：${phase}`);
  if (intent) lines.push(`目标体验：${intent}`);
  lines.push("可用事件：");
  items.forEach((item, idx) => {
    lines.push(`${idx + 1}. event_code=${item.eventCode}`);
    lines.push(`   标题：${item.title}`);
    lines.push(`   使用条件：${(item.triggerConditions ?? []).join("；") || "只在上下文自然允许时使用"}`);
    lines.push(`   可见表达：${item.injectionHint}`);
    lines.push(`   玩家自主性约束：${(item.agencyConstraints ?? []).join("；") || "不得强制玩家行动或失败"}`);
    lines.push(`   禁止结果：${(item.forbiddenOutcomes ?? []).join("；") || "不得直接揭示隐藏真相"}`);
  });
  lines.push("硬性限制：");
  lines.push("- 不得直接泄露隐藏真相、后台私有 hook 或 NPC 私有知识。");
  lines.push("- 不得强制玩家失败；如果玩家行动合理规避，必须允许规避。");
  lines.push("- 只在上下文自然允许时使用事件；主模型可以忽略本提示。");
  const text = lines.join("\n");
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

/**
 * 服务端只消费“极简 digest”和经过清洗的 due agenda，生成短提示块。
 * 该块只进入主笔 prompt，不是玩家可见文本，不包含 private hook 原文。
 */
export function buildServerDirectorHintBlock(
  d: ServerDirectorDigest | null,
  agenda: readonly ServerDirectorAgendaHint[] = [],
  opts?: { socialWorldHintBlock?: string }
): string {
  const socialWorldHintBlock = clampText(opts?.socialWorldHintBlock, 420);
  const agendaBlock = buildDirectorAgendaHintBlock(agenda, {
    currentPhase: d?.beatModeHint,
    targetIntent: d?.digest,
  });
  if (!d) return [agendaBlock, socialWorldHintBlock].filter(Boolean).join("\n\n");

  const tension = clampInt(d.tension, 0, 100);
  const stall = clampInt(d.stallCount, 0, 9);
  const beat = clampText(d.beatModeHint, 16) || "quiet";
  const pending = asStrArr(d.pendingIncidentCodes, 2);
  const recall = asStrArr(d.mustRecallHookCodes, 2);

  if (tension <= 0 && stall <= 0 && pending.length === 0 && recall.length === 0) {
    return agendaBlock;
  }

  const lines: string[] = [];
  lines.push("## 【节拍提示｜只供写作，不是玩家可见文本】");
  if (beat === "aftershock") lines.push("刚经历波动后，允许喘息，但后果要留回音。");
  else if (beat === "peak") lines.push("本回合偏高压推进：压力要具体、可执行，避免空喊危险。");
  else if (beat === "collision") lines.push("本回合偏人物碰撞：让立场冲突落在对话与动作上。");
  else if (beat === "countdown") lines.push("本回合偏机会倒计时：让“现在或错过”变得具体。");
  else if (beat === "reveal") lines.push("本回合偏回收旧钩子：让旧线索自然回到场景。");
  else if (beat === "pressure") lines.push("本回合偏压力上升：用环境、人际或机会推动决定。");
  else lines.push("本回合偏克制推进：用行动推进，不要长篇解释设定。");
  lines.push("节奏参考主流网文：清楚推进、对白通俗、轻悬疑弱恐怖；本提示只给异步节拍建议，不接管 PLAYER_CHAT。");

  if (stall >= 2) lines.push("若玩家停滞，请用低风险可行动线索推动选择。");
  if (recall.length) lines.push(`回收重点（不要直呼代码）：${recall.join("；")}`);
  if (pending.length) lines.push(`可自然引出一个短期变化：${pending.join("；")}`);
  if (tension >= 70) lines.push("语气基调：更紧、更近、更急，但保持角色口吻与规则一致。");

  const digestBlock = lines.join("\n");
  const clippedDigestBlock = digestBlock.length <= 600 ? digestBlock : digestBlock.slice(0, 600);
  return [clippedDigestBlock, agendaBlock, socialWorldHintBlock].filter(Boolean).join("\n\n");
}
