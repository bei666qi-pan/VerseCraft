import { inferEffectiveNarrativeLayer, type IssuerPersonaMode, type IssuerSoftRevealMode } from "@/lib/tasks/taskRoleModel";
import type { GameTaskV2, TaskDramaticType } from "./taskV2";

function clamp(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

/**
 * 人格模式 → 可直接用于写作的语气提示。
 * 不把内部枚举码（如 "sweet_patch"）原样丢给模型当"创作指导"——
 * 模型只能靠猜去解读一个英文标识符，容易退化成千篇一律的通用委托腔（AI 味的常见来源之一）。
 */
const PERSONA_VOICE_HINT: Record<IssuerPersonaMode, string> = {
  silent_reciprocal: "话少但记恩情，帮过的账都记在心里",
  sweet_patch: "嘴上甜，糊弄细节时藏着算计",
  ledger_route: "先讲清楚要换什么，再肯带路",
  audited_trade: "认账不认情面，按规矩兑现",
  scripted_pull: "像在走流程，话里带着别人的意思",
  shelter_refusal: "嘴上推开，其实在护着",
  generic: "普通住户的平常语气，不特别热络也不冷淡",
};

/** 揭露方式 → 具体动作提示，替代原始枚举码。 */
const REVEAL_VOICE_HINT: Record<IssuerSoftRevealMode, string> = {
  whisper: "压低声音说漏一句",
  ledger_shadow: "翻旧账时无意带出",
  mirror_fragment: "借镜子/倒影的话题带出",
  receipt: "像交对账单一样列清楚",
  script_tweak: "改口时露出破绽",
  closed_door: "关上门才肯松半句口",
};

/** 戏剧类型 → 具体张力提示，同样替代原始枚举码（如 "debt_payment"）。 */
const DRAMATIC_TYPE_HINT: Record<TaskDramaticType, string> = {
  survival: "求生：先活下去，别的都往后放",
  trust: "试探：在悄悄摸对方的底线",
  leverage: "筹码：谁拿捏谁，还没定",
  betrayal: "背刺：信任随时可能碎",
  delivery: "交付：说到做到才算数",
  investigation: "查证：只认拿得出手的证据",
  coverup: "遮掩：帮忙瞒住一件事",
  escape: "脱身：一门心思找出口",
  debt_payment: "还债：为欠下的东西买单",
};

export function buildTaskDramaPacket(args: {
  tasks: GameTaskV2[];
  preferredTaskIds?: string[];
  maxTasks?: number;
  maxChars?: number;
}): string {
  const maxTasks = Math.max(0, Math.min(2, args.maxTasks ?? 2));
  const maxChars = Math.max(120, Math.min(800, args.maxChars ?? 420));
  if (maxTasks === 0) return "";
  const byId = new Map(args.tasks.map((t) => [t.id, t]));
  const picked: GameTaskV2[] = [];
  for (const id of args.preferredTaskIds ?? []) {
    const t = byId.get(id);
    if (t) picked.push(t);
    if (picked.length >= maxTasks) break;
  }
  if (picked.length < maxTasks) {
    for (const t of args.tasks) {
      if (picked.some((x) => x.id === t.id)) continue;
      if (t.status !== "active" && t.status !== "available") continue;
      picked.push(t);
      if (picked.length >= maxTasks) break;
    }
  }
  if (picked.length === 0) return "";
  const lines: string[] = [];
  lines.push("## 【任务戏剧约束（只供写作，不要像系统提示）】");
  for (const t of picked) {
    const hook = clamp(t.playerHook ?? t.nextHint ?? "", 50);
    const urgency = clamp(t.urgencyReason ?? "", 50);
    const risk = clamp(t.riskNote ?? t.taboo ?? "", 50);
    const intent = clamp(t.issuerIntent ?? "", 56);
    const motive = clamp(t.hiddenMotive ?? "", 50);
    const residue = clamp(t.residueOnFail ?? t.residueOnComplete ?? "", 56);
    const voice = clamp(t.spokenDeliveryStyle ?? "", 44) || (t.issuerPersonaMode ? PERSONA_VOICE_HINT[t.issuerPersonaMode] : "");
    const revealHint = t.issuerSoftRevealMode ? REVEAL_VOICE_HINT[t.issuerSoftRevealMode] : "";
    const dramaHint = t.dramaticType ? DRAMATIC_TYPE_HINT[t.dramaticType] : "";
    const layer = inferEffectiveNarrativeLayer(t);
    const layerCn =
      layer === "soft_lead" ? "暗示线" : layer === "conversation_promise" ? "人情约定" : "正式追踪";
    const guidance =
      t.guidanceLevel === "strong"
        ? "引导：给清晰下一步"
        : t.guidanceLevel === "light"
          ? "引导：少直给，多留线索让玩家自己拼"
          : "";
    lines.push(`${t.issuerName}委托《${t.title}》[${layerCn}]`.trim());
    const bits = [
      voice ? `语气：${voice}` : "",
      dramaHint ? `张力：${dramaHint}` : "",
      intent ? `动机：${intent}` : "",
      motive ? `潜台词（角色不可自己说破）：${motive}` : "",
      hook ? `钩子：${hook}` : "",
      urgency ? `压力：${urgency}` : "",
      risk ? `代价/禁区：${risk}` : "",
      residue ? `残响：${residue}` : "",
      revealHint ? `露口风：${revealHint}` : "",
      guidance,
    ].filter(Boolean);
    if (bits.length > 0) lines.push(bits.join("；"));
  }
  lines.push("不同委托人语气必须彼此区分；以上要点只做潜台词参照，禁止逐字复述进正文。");
  return clamp(lines.join("\n"), maxChars);
}

