import type { GameTaskV2 } from "@/lib/tasks/taskV2";

type ConspiracyCondition =
  | { kind: "revive_signal" }
  | { kind: "anchor_unlocked"; anchor: "B1" | "1" | "7" }
  | { kind: "max_day"; value: number }
  | { kind: "location_prefix_any"; values: string[] }
  | { kind: "latest_input_regex"; pattern: string }
  | { kind: "world_flag_absent"; flag: string };

interface ConspiracyRule {
  id: string;
  conditions: ConspiracyCondition[];
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseCurrentDay(context: string): number {
  const m = context.match(/游戏时间\[第(\d+)日\s+(\d+)时\]/);
  const d = m?.[1] ? Number(m[1]) : 0;
  return Number.isFinite(d) ? d : 0;
}

function parseCurrentLocation(context: string): string {
  const m = context.match(/用户位置\[([^\]]+)\]/);
  return m?.[1]?.trim() ?? "";
}

function parseAnchor7Unlocked(context: string): boolean {
  return /锚点解锁：.*7F\[1\]/.test(context);
}

function parseReviveSignal(context: string): boolean {
  return /最近复活：/.test(context) || /世界标记：.*reviveFastForward12h/.test(context);
}

function parseConspiracyOpened(context: string): boolean {
  return /世界标记：.*conspiracy_7f_elder_trap_opened/.test(context);
}

const CONSPIRACY_RULES: readonly ConspiracyRule[] = [
  {
    id: "cons_7f_cleanse_all_trap",
    conditions: [
      { kind: "world_flag_absent", flag: "conspiracy_7f_elder_trap_opened" },
      { kind: "revive_signal" },
      { kind: "anchor_unlocked", anchor: "7" },
      { kind: "max_day", value: 3 },
      { kind: "location_prefix_any", values: ["6F_", "7F_"] },
      { kind: "latest_input_regex", pattern: "真相|清扫|老人|7F|七楼|阴谋" },
    ],
  },
] as const;

function evaluateCondition(cond: ConspiracyCondition, ctx: string, latestUserInput: string): boolean {
  if (cond.kind === "revive_signal") return parseReviveSignal(ctx);
  if (cond.kind === "anchor_unlocked") {
    if (cond.anchor === "7") return parseAnchor7Unlocked(ctx);
    if (cond.anchor === "1") return /锚点解锁：.*1F\[1\]/.test(ctx);
    return /锚点解锁：.*B1\[1\]/.test(ctx);
  }
  if (cond.kind === "max_day") return parseCurrentDay(ctx) <= cond.value;
  if (cond.kind === "location_prefix_any") {
    const loc = parseCurrentLocation(ctx);
    return cond.values.some((p) => loc.startsWith(p));
  }
  if (cond.kind === "latest_input_regex") {
    const re = new RegExp(cond.pattern);
    return re.test(latestUserInput ?? "");
  }
  if (cond.kind === "world_flag_absent") {
    if (cond.flag === "conspiracy_7f_elder_trap_opened") return !parseConspiracyOpened(ctx);
    const escaped = cond.flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return !new RegExp(`世界标记：.*${escaped}`).test(ctx);
  }
  return false;
}

function matchConspiracyRule(ruleId: string, playerContext: string, latestUserInput: string): boolean {
  const rule = CONSPIRACY_RULES.find((r) => r.id === ruleId);
  if (!rule) return false;
  const ctx = playerContext ?? "";
  const byCondition = rule.conditions.map((c) => evaluateCondition(c, ctx, latestUserInput));
  const hasLocation = byCondition[4] ?? false;
  const hasKeyword = byCondition[5] ?? false;
  // For stage-1: preserve previous behavior, allowing proximity OR intent keyword.
  return (byCondition[0] ?? false) &&
    (byCondition[1] ?? false) &&
    (byCondition[2] ?? false) &&
    (byCondition[3] ?? false) &&
    (hasLocation || hasKeyword);
}

export function shouldTrigger7FAnchorConspiracy(args: {
  playerContext: string;
  latestUserInput: string;
}): boolean {
  return matchConspiracyRule("cons_7f_cleanse_all_trap", args.playerContext, args.latestUserInput);
}

export function build7FConspiracyNarrativeBlock(args: {
  playerContext: string;
  latestUserInput: string;
}): string {
  if (!shouldTrigger7FAnchorConspiracy(args)) return "";
  return [
    "## 【7F锚点阴谋触发约束】",
    "夜读老人可在场景中自然抛出高奖励“清扫所有诡异”委托，但其本质是陷阱。",
    "写法要求：先写他如何观察玩家复活后的异常，再以低声试探引出委托与代价。",
    "禁止系统口吻；不要直接揭示“陷阱真相”，只给反常细节与不对劲承诺。",
  ].join("\n");
}

export function ensure7FConspiracyTask(dmRecord: Record<string, unknown>, args: {
  playerContext: string;
  latestUserInput: string;
}): Record<string, unknown> {
  if (!shouldTrigger7FAnchorConspiracy(args)) return dmRecord;
  const next = { ...dmRecord };
  const current = Array.isArray(next.new_tasks) ? next.new_tasks : [];
  const hasExisting = current.some((x) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
    return asString((x as { id?: unknown }).id) === "cons_7f_cleanse_all_trap";
  });
  if (hasExisting) return next;
  const task: Partial<GameTaskV2> = {
    id: "cons_7f_cleanse_all_trap",
    title: "夜读老人：清扫全楼诡异",
    desc: "夜读老人承诺高额报酬，要求你在短期内“清扫所有诡异”。条件看似优厚，却处处反常。",
    type: "conspiracy",
    issuerId: "N-011",
    issuerName: "夜读老人",
    floorTier: "7",
    guidanceLevel: "light",
    status: "available",
    claimMode: "npc_grant",
    reward: {
      originium: 30,
      items: [],
      warehouseItems: [],
      unlocks: ["conspiracy.7f.elder_trap_path"],
      relationshipChanges: [{ npcId: "N-011", delta: "betrayal_flag", value: 1 }],
    },
    nextHint: "若他催促你立刻签下承诺，先观察他是否回避细节。",
    hiddenOutcome: "若盲信执行，玩家将被引导进入高危清扫循环。",
    highRiskHighReward: true,
    betrayalPossible: true,
    worldConsequences: ["conspiracy_7f_elder_trap_opened"],
    hiddenTriggerConditions: ["revivedByAnchor", "anchor_7f_unlocked"],
    npcProactiveGrant: {
      enabled: true,
      npcId: "N-011",
      minFavorability: 0,
      preferredLocations: ["7F_Bench", "7F_Room701", "6F_Stairwell"],
      cooldownHours: 12,
    },
  };
  next.new_tasks = [...current, task];
  return next;
}
