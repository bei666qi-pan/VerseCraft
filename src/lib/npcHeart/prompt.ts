import type { NpcHeartRuntimeView } from "./types";

function clamp(s: string, maxChars: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= maxChars ? t : t.slice(0, maxChars);
}

export function buildNpcHeartPromptBlock(input: {
  views: NpcHeartRuntimeView[];
  maxChars?: number;
}): string {
  const maxChars = Math.max(120, Math.min(900, input.maxChars ?? 420));
  const views = (input.views ?? []).slice(0, 5);
  if (views.length === 0) return "";
  const lines: string[] = [];
  lines.push("## 【NPC心脏约束（只供写作，不要像系统提示）】");
  for (const v of views) {
    const p = v.profile;
    const head = `${p.npcId}（${p.displayName}）态度=${v.attitudeLabel}`;
    const speech = clamp(p.speechContract, 90);
    const wants = clamp(v.whatNpcWantsFromPlayerNow, 60);
    const taboo = clamp(p.tabooBoundary, 60);
    lines.push(
      `${head}；想要：${wants}；禁区：${taboo}`
    );
    lines.push(
      `说话：${speech}；任务风格=${p.taskStyle}；不明说：${clamp(p.whatNpcWillNeverAskOpenly, 60)}`
    );
  }
  const text = lines.join("\n");
  return clamp(text, maxChars);
}

export function buildNpcProactiveGrantStyleHints(view: NpcHeartRuntimeView | null): string {
  if (!view) return "";
  const p = view.profile;
  if (p.taskStyle === "transactional") {
    return "先试探，再开价，明确交换条件；说话留后路。";
  }
  if (p.taskStyle === "manipulative") {
    return "先示弱再提请求，把风险和责任轻轻推给玩家；奖励/信息可能被延后。";
  }
  if (p.taskStyle === "avoidant") {
    return "催促但回避关键细节；用含混词替代真相；越追问越冷。";
  }
  if (p.taskStyle === "protective") {
    return "强调安全边界与撤退方案；给出可执行提醒；语气克制但可靠。";
  }
  return "直接给出委托与理由，但避免系统口吻。";
}

