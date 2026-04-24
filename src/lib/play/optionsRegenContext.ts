import type { ClientStructuredContextV1, OptionsRegenContextPayload } from "@/lib/security/chatValidation";

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

function summarizeTasks(tasks: Array<{ title?: string; status?: string }>, max = 4): string[] {
  const out: string[] = [];
  for (const task of tasks) {
    if (out.length >= max) break;
    const title = String(task?.title ?? "").trim();
    if (!title) continue;
    const status = String(task?.status ?? "").trim();
    out.push(status ? `${title}（${status}）` : title);
  }
  return out;
}

export function buildClientOptionsRegenContext(args: {
  latestPlayerAction: string;
  latestNarrativeExcerpt: string;
  currentOptions: string[];
  recentOptions: string[];
  tasks: Array<{ title?: string; status?: string }>;
  inventoryHints?: string[];
  repairNeedCount?: number;
  repairLockedOptions?: string[];
}): OptionsRegenContextPayload {
  return {
    latestPlayerAction: clip(args.latestPlayerAction, 280),
    latestNarrativeExcerpt: clip(args.latestNarrativeExcerpt, 1200),
    currentOptions: (Array.isArray(args.currentOptions) ? args.currentOptions : [])
      .map((x) => clip(String(x ?? ""), 40))
      .filter((x) => x.length > 0)
      .slice(0, 8),
    recentOptions: (Array.isArray(args.recentOptions) ? args.recentOptions : [])
      .map((x) => clip(String(x ?? ""), 40))
      .filter((x) => x.length > 0)
      .slice(0, 12),
    activeTaskSummaries: summarizeTasks(Array.isArray(args.tasks) ? args.tasks : []),
    inventoryHints: (Array.isArray(args.inventoryHints) ? args.inventoryHints : [])
      .map((x) => clip(String(x ?? ""), 40))
      .filter((x) => x.length > 0)
      .slice(0, 6),
    repairNeedCount: Math.max(0, Math.min(4, Math.trunc(Number(args.repairNeedCount ?? 0)))),
    repairLockedOptions: (Array.isArray(args.repairLockedOptions) ? args.repairLockedOptions : [])
      .map((x) => clip(String(x ?? ""), 40))
      .filter((x) => x.length > 0)
      .slice(0, 4),
  };
}

export function buildOptionsRegenContextPacket(args: {
  reason: string;
  context: OptionsRegenContextPayload | null;
  playerContextSnapshot: string;
  clientState: ClientStructuredContextV1 | null;
}): string {
  const ctx = args.context;
  const loc = args.clientState?.playerLocation ? `【当前位置】${clip(args.clientState.playerLocation, 80)}` : "";
  const time =
    args.clientState?.time && Number.isFinite(args.clientState.time.day) && Number.isFinite(args.clientState.time.hour)
      ? `【时间】第${Math.trunc(args.clientState.time.day)}日 ${Math.trunc(args.clientState.time.hour)}时`
      : "";
  const taskSummary =
    ctx?.activeTaskSummaries && ctx.activeTaskSummaries.length > 0
      ? `【活跃任务摘要】${ctx.activeTaskSummaries.join("；")}`
      : "";
  const currentOptions =
    ctx?.currentOptions && ctx.currentOptions.length > 0
      ? `【当前屏幕选项（禁止复用）】${ctx.currentOptions.join("；")}`
      : "【当前屏幕选项（禁止复用）】无";
  const recentOptions =
    ctx?.recentOptions && ctx.recentOptions.length > 0
      ? `【最近出现选项（禁止复用）】${ctx.recentOptions.join("；")}`
      : "【最近出现选项（禁止复用）】无";
  const inventoryHints =
    ctx?.inventoryHints && ctx.inventoryHints.length > 0
      ? `【可用道具提示】${ctx.inventoryHints.join("；")}`
      : "";
  const repairNeed =
    typeof ctx?.repairNeedCount === "number" && ctx.repairNeedCount > 0
      ? `【修复目标】仅补齐 ${ctx.repairNeedCount} 条缺口，禁止整轮重写。`
      : "";
  const repairLocked =
    ctx?.repairLockedOptions && ctx.repairLockedOptions.length > 0
      ? `【已通过选项（禁止改写）】${ctx.repairLockedOptions.join("；")}`
      : "";

  return [
    `【为何需要整理选项】${clip(args.reason, 120)}`,
    loc,
    time,
    `【最近玩家动作】${clip(ctx?.latestPlayerAction ?? "", 280)}`,
    `【最近叙事片段】${clip(ctx?.latestNarrativeExcerpt ?? "", 900)}`,
    taskSummary,
    inventoryHints,
    currentOptions,
    recentOptions,
    repairNeed,
    repairLocked,
    `【玩家状态摘要】${clip(args.playerContextSnapshot, 1000)}`,
  ]
    .filter((x) => x.length > 0)
    .join("\n");
}

