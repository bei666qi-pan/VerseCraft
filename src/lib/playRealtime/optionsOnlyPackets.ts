import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function buildOptionsOnlySystemPrompt(): string {
  return [
    "你是互动叙事平台的“行动选项主笔助手”。",
    "你的任务是在正文生成之后，基于最新叙事实时生成下一步可点击行动。",
    "你必须只输出一个 JSON 对象，且只包含一个键：options。",
    '输出形如：{"options":["...","...","...","..."]}。',
    "",
    "强制要求：",
    "- options 恰好 4 条（不得少、不得空）。",
    "- 简体中文、第一人称、可执行、互不重复（不能四条都像“观察四周”）。",
    "- 每条 5–20 字，尽量具体到“对象/方向/动作”，避免泛化。",
    "- 必须承接最近正文，推动下一步剧情行动；不要复用开场固定选项。",
    "- 禁止写 UI/面板/资料簿操作：例如“查看灵感手记”“检查背包”“打开任务/属性/菜单”“使用道具”。",
    "- 若要用物品，必须写具体场景动作，例如“我用手电照向门缝”，不能写泛化的“使用道具”。",
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
    "请基于以上上下文给出 4 条“正文之后我下一步可以做什么”的行动句，必须推动当前剧情，不要生成灵感手记/背包/任务面板类选项。",
  ]
    .filter((x) => String(x ?? "").trim().length > 0)
    .join("\n");
}

