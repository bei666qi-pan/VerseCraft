import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function buildOptionsOnlySystemPrompt(): string {
  return [
    "你是文字冒险的“选项整理助手”。",
    "你必须只输出一个 JSON 对象，且只包含一个键：options。",
    '输出形如：{"options":["...","...","...","..."]}。',
    "",
    "强制要求：",
    "- options 恰好 4 条（不得少、不得空）。",
    "- 简体中文、第一人称、可执行、互不重复（不能四条都像“观察四周”）。",
    "- 每条 5–20 字，尽量具体到“对象/方向/动作”，避免泛化。",
    "- 不能推进剧情结论、不能修改世界状态、不能发放/消耗道具、不能新增任务。",
    "- 禁止任何解释/额外字段/markdown/代码块。",
  ].join("\n");
}

export function buildOptionsOnlyUserPacket(args: {
  reason: string;
  lastNarrative: string;
  playerContextSnapshot: string;
  clientState: ClientStructuredContextV1 | null;
}): string {
  const loc = args.clientState?.playerLocation ? `【当前位置】${args.clientState.playerLocation}` : "";
  const time =
    args.clientState?.time
      ? `【时间】第${args.clientState.time.day}日 ${args.clientState.time.hour}时`
      : "";
  const dangerHint = args.playerContextSnapshot.includes("主威胁状态")
    ? "【危险】注意主威胁状态，避免给出自杀式选项。"
    : "";
  return [
    `【为何需要整理选项】${clip(args.reason, 120)}`,
    loc,
    time,
    dangerHint,
    `【最近叙事片段】${clip(args.lastNarrative, 900)}`,
    `【玩家状态摘要】${clip(args.playerContextSnapshot, 1400)}`,
    "",
    "请基于以上上下文给出 4 条“下一步我可以做什么”的行动句。",
  ]
    .filter((x) => String(x ?? "").trim().length > 0)
    .join("\n");
}

