import { clamp } from "@/lib/clamp";
import type { DirectorBranchSeed, DirectorConsistencyWarning, DirectorPrivateHook } from "@/lib/worldEngine/contracts";

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

/** 从 world_engine_agenda_snapshots 中提取的 NPC 行动条目 */
export type ServerNpcActionHint = {
  npc_code: string;
  action: string;
  urgency: "low" | "medium" | "high";
};

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : Number(n);
  const safe = Number.isFinite(v) ? Math.trunc(v) : min;
  return clamp(safe, min, max);
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
          ? clamp(o.salience, 0, 1)
          : undefined,
      revealPolicy: clampText(o.revealPolicy ?? o.reveal_policy, 24) || null,
    });
    if (out.length >= cap) break;
  }
  return out;
}

/** 最小接口：只需要 injectionHint（或 injection_hint）和可选的标识字段 */
export interface DirectorHintItem {
  injectionHint?: string;
  injection_hint?: string;
  title?: string;
  event_code?: string;
  eventCode?: string;
}

/** 中文标点，用于拆分 injectionHint 提取关键短语 */
const HINT_SPLIT_RE = /[。！？，、；：""''（）\n]+/;

/** 从 injectionHint 中提取长度 ≥ minLen 的关键短语 */
function extractHintPhrases(hint: string, minLen = 4): string[] {
  const cleaned = hint.trim();
  if (!cleaned) return [];
  return cleaned
    .split(HINT_SPLIT_RE)
    .map((s) => s.trim())
    .filter((s) => s.length >= minLen);
}

/**
 * 轻量级启发式检查：叙事中是否采纳了导演议程提示。
 *
 * 对每个议程项，从 injectionHint 中提取长度 ≥ 4 的关键短语，
 * 在叙事中做大小写不敏感的包含匹配；任一段落命中即视为"已采纳"。
 *
 * @returns adoptedCount 采纳数、adoptionRate 采纳率 (0-1)、missedItems 未采纳项的标识（优先 eventCode 其次 title）
 */
export function detectDirectorHintAdoption(
  narrative: string,
  agendaItems: readonly DirectorHintItem[]
): { adoptedCount: number; adoptionRate: number; missedItems: string[] } {
  if (!narrative || agendaItems.length === 0) {
    return { adoptedCount: 0, adoptionRate: 0, missedItems: [] };
  }

  const lowerNarrative = narrative.toLowerCase();
  let adoptedCount = 0;
  const missedItems: string[] = [];

  for (const item of agendaItems) {
    const hint = item.injectionHint ?? item.injection_hint ?? "";
    if (!hint.trim()) {
      // 无 hint 的项视为未被采纳
      const label = item.eventCode ?? item.event_code ?? item.title ?? "unknown";
      missedItems.push(label);
      continue;
    }

    const phrases = extractHintPhrases(hint);
    if (phrases.length === 0) {
      const label = item.eventCode ?? item.event_code ?? item.title ?? "unknown";
      missedItems.push(label);
      continue;
    }

    const adopted = phrases.some((phrase) => lowerNarrative.includes(phrase.toLowerCase()));
    if (adopted) {
      adoptedCount++;
    } else {
      const label = item.eventCode ?? item.event_code ?? item.title ?? "unknown";
      missedItems.push(label);
    }
  }

  const adoptionRate = agendaItems.length > 0
    ? Math.round((adoptedCount / agendaItems.length) * 100) / 100
    : 0;

  return { adoptedCount, adoptionRate, missedItems };
}

export function buildDirectorAgendaHintBlock(
  agenda: readonly ServerDirectorAgendaHint[],
  opts?: {
    currentPhase?: string | null;
    targetIntent?: string | null;
    directorIntent?: string | null;
    pacingSummary?: { tension: number; mystery: number; fatigue: number } | null;
    maxItems?: number;
    maxChars?: number;
  }
): string {
  const maxItems = clamp(opts?.maxItems ?? 2, 1, 3);
  const maxChars = clamp(opts?.maxChars ?? 760, 240, 1200);
  const items = agendaArr(agenda, maxItems);
  if (items.length === 0) return "";

  const lines: string[] = [];
  lines.push("## 【后台导演提示｜仅供主笔参考，不是玩家可见文本】");
  const phase = clampText(opts?.currentPhase, 24);
  const intent = clampText(opts?.targetIntent, 140);
  const directorIntent = clampText(opts?.directorIntent, 280);
  const pacing = opts?.pacingSummary ?? null;
  if (phase) lines.push(`当前导演阶段：${phase}`);
  if (intent) lines.push(`目标体验：${intent}`);
  if (directorIntent) lines.push(`当前导演意图：${directorIntent}`);
  if (pacing) {
    const t = Math.round((pacing.tension ?? 0) * 100);
    const m = Math.round((pacing.mystery ?? 0) * 100);
    const f = Math.round((pacing.fatigue ?? 0) * 100);
    lines.push(`节奏评估：紧张度${t} 神秘度${m} 疲劳度${f}`);
  }
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
  opts?: {
    socialWorldHintBlock?: string;
    directorIntent?: string | null;
    currentPhase?: string | null;
    pacingSummary?: { tension: number; mystery: number; fatigue: number } | null;
    npcActions?: readonly ServerNpcActionHint[];
    storyBranchSeeds?: readonly DirectorBranchSeed[];
    consistencyWarnings?: readonly DirectorConsistencyWarning[];
    playerPrivateHooks?: readonly DirectorPrivateHook[];
  }
): string {
  const socialWorldHintBlock = clampText(opts?.socialWorldHintBlock, 420);
  const npcActions = opts?.npcActions ?? [];
  const agendaBlock = buildDirectorAgendaHintBlock(agenda, {
    currentPhase: d?.beatModeHint ?? opts?.currentPhase,
    targetIntent: d?.digest,
    directorIntent: opts?.directorIntent,
    pacingSummary: opts?.pacingSummary,
  });

  // NPC 行为指引：仅注入高 urgency 的行动
  const highActions = npcActions.filter((a) => a.urgency === "high");
  const npcHintLines: string[] = [];
  if (highActions.length > 0) {
    npcHintLines.push("## 【NPC 行为指引｜仅供主笔参考，不是玩家可见文本】");
    for (const a of highActions) {
      npcHintLines.push(`NPC行为指引：${a.npc_code} 应当 ${a.action}`);
    }
  }
  const npcHintBlock = npcHintLines.join("\n");

  // 剧情分支提示：仅注入 seed_code 中数值后缀 >= 7 的种子
  const branchSeeds = opts?.storyBranchSeeds ?? [];
  const branchHintLines: string[] = [];
  for (const seed of branchSeeds) {
    const numMatch = seed.seed_code.match(/(\d+)$/);
    const num = numMatch ? parseInt(numMatch[1], 10) : 0;
    if (num >= 7) {
      branchHintLines.push(`剧情分支提示：${seed.summary}`);
    }
  }
  const branchHintBlock = branchHintLines.length > 0
    ? ["## 【剧情分支提示｜仅供主笔参考，不是玩家可见文本】", ...branchHintLines].join("\n")
    : "";

  // 连续性警告：仅注入 severity=high 的警告
  const warnings = opts?.consistencyWarnings ?? [];
  const warningLines: string[] = [];
  for (const w of warnings) {
    if (w.severity === "high") {
      warningLines.push(`连续性警告：${w.message}`);
    }
  }
  const warningBlock = warningLines.length > 0
    ? ["## 【连续性警告｜仅供主笔参考，不是玩家可见文本】", ...warningLines].join("\n")
    : "";

  // 玩家私有伏笔：按 tag 分类格式化，注入主笔 prompt 作为写作约束
  const playerHooks = opts?.playerPrivateHooks ?? [];
  const recallHooks = playerHooks.filter((h) => h.tag === "must_recall");
  const forbiddenHooks = playerHooks.filter((h) => h.tag === "forbidden_reveal");
  const hookLines: string[] = [];
  if (recallHooks.length > 0 || forbiddenHooks.length > 0) {
    hookLines.push("## 【玩家私有伏笔｜仅供主笔参考，不是玩家可见文本】");
    for (const h of recallHooks) {
      hookLines.push(`必须回收的伏笔：${h.summary}`);
    }
    for (const h of forbiddenHooks) {
      hookLines.push(`禁止揭露：${h.summary}`);
    }
  }
  const playerPrivateHooksBlock = hookLines.join("\n");

  if (!d) return [agendaBlock, npcHintBlock, branchHintBlock, warningBlock, playerPrivateHooksBlock, socialWorldHintBlock].filter(Boolean).join("\n\n");

  const tension = clampInt(d.tension, 0, 100);
  const stall = clampInt(d.stallCount, 0, 9);
  const beat = clampText(d.beatModeHint, 16) || "quiet";
  const pending = asStrArr(d.pendingIncidentCodes, 2);
  const recall = asStrArr(d.mustRecallHookCodes, 2);

  if (tension <= 0 && stall <= 0 && pending.length === 0 && recall.length === 0) {
    return [npcHintBlock, agendaBlock, branchHintBlock, warningBlock, playerPrivateHooksBlock].filter(Boolean).join("\n\n");
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
  return [clippedDigestBlock, npcHintBlock, agendaBlock, branchHintBlock, warningBlock, playerPrivateHooksBlock, socialWorldHintBlock].filter(Boolean).join("\n\n");
}
