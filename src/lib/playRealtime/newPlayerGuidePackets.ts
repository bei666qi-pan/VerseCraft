import type { ClientStructuredContextV1 } from "@/lib/security/chatValidation";

export type NewPlayerGuidePacketV1 = {
  schema: "new_player_guide_v1";
  enabled: boolean;
  phase: "early" | "mid" | "off";
  /** 双主轴：老刘=生存教官，麟泽=边界教官 */
  axes: Array<{
    npcId: string;
    displayName: string;
    roleLabel: string;
    do: string[];
    dont: string[];
    surfaceTell: string;
    /** 该教官对应的起手任务当前是否仍在玩家的追踪列表里；false 时说明这条教学暂时没有叙事锚点。 */
    currentlyRelevant: boolean;
  }>;
  /** 普通住户对玩家的基础认知（世界已运转很久） */
  ordinaryNpcBaseline: string[];
  /** 防抢戏：高魅力 NPC 不得在新手期抢主导 */
  antiHijackRules: string[];
};

function parseTime(playerContext: string): { day: number; hour: number } | null {
  const m = String(playerContext ?? "").match(/游戏时间\[第(\d+)日\s+(\d+)时\]/);
  if (!m?.[1] || !m?.[2]) return null;
  const day = Number.parseInt(m[1], 10) || 1;
  const hour = Number.parseInt(m[2], 10);
  return { day, hour: Number.isFinite(hour) ? hour : 0 };
}

function parseLocation(playerContext: string, fallback: string | null): string {
  const m = String(playerContext ?? "").match(/用户位置\[([^\]]+)\]/);
  return (m?.[1]?.trim() || fallback || "").trim();
}

/** getPromptContext 序列化出的"新手引导[已毕业|进行中]"标记：本设备是否已经走完过一轮新手期。 */
function parseGraduatedVeteranFlag(playerContext: string): boolean {
  const m = String(playerContext ?? "").match(/新手引导\[([^\]]+)\]/);
  return m?.[1] === "已毕业";
}

/**
 * 双核新手引导（老刘/麟泽）挂钩的起手任务标题，按教官 npcId 分组。
 * 用于两件事：
 * 1）让引导窗口按"玩家实际进度"而不是只按"游戏时钟"关闭——否则一个动作偏慢、
 *    爱到处看看问问的新玩家，可能在还没走完这几步时就因为超过 12 个游戏小时
 *    提前失去 do/dont 提示；
 * 2）让某个教官暂时没有对应起手任务在追踪时（比如麟泽的任务还没被触发），
 *    不用同等力度硬讲他那一套，避免两位教官的台词无差别地反复刷屏。
 */
const STARTER_GUIDE_AXIS_TASK_TITLES_BY_NPC: Record<string, string[]> = {
  "N-008": ["在B1建立生存节奏", "拼出出口路线碎片", "一楼试探性探索"],
  "N-015": ["别越界（先问代价）"],
};
const ALL_STARTER_GUIDE_AXIS_TASK_TITLES = Object.values(STARTER_GUIDE_AXIS_TASK_TITLES_BY_NPC).flat();

/** playerContext 里的任务标题实际格式是 `${title}[状态|...]`，用 startsWith 而非全等匹配。 */
function hasIncompleteStarterAxisTask(activeTaskTitles: string[]): boolean {
  return activeTaskTitles.some((entry) => ALL_STARTER_GUIDE_AXIS_TASK_TITLES.some((title) => entry.startsWith(title)));
}

/** 某教官对应的起手任务当前是否仍在玩家 active/available 列表里；未知 npcId 时保守视为相关。 */
function isAxisCurrentlyRelevant(npcId: string, activeTaskTitles: string[]): boolean {
  const titles = STARTER_GUIDE_AXIS_TASK_TITLES_BY_NPC[npcId];
  if (!titles || titles.length === 0) return true;
  return activeTaskTitles.some((entry) => titles.some((title) => entry.startsWith(title)));
}

export function buildNewPlayerGuidePacket(args: {
  playerContext: string;
  playerLocation: string | null;
  clientState: ClientStructuredContextV1 | null;
  /** 当前仍 active/available 的任务标题列表（沿用 runtimeContextPackets 已解析出的 tasks）。 */
  activeTaskTitles?: string[];
}): NewPlayerGuidePacketV1 | null {
  const loc = args.clientState?.playerLocation?.trim() || parseLocation(args.playerContext, args.playerLocation);
  const t = args.clientState?.time ? { day: args.clientState.time.day, hour: args.clientState.time.hour } : parseTime(args.playerContext);
  if (!t) return null;

  const activeTaskTitles = args.activeTaskTitles ?? [];
  const stillOnboardingByProgress = hasIncompleteStarterAxisTask(activeTaskTitles);
  // 已辨识为"非新手"（本设备此前已走完过一轮）时，不再强制启用双核引导——
  // 即使这局时间还早、起手任务也还没走完（比如老玩家故意跳过它们）。
  const isRecognizedVeteran = parseGraduatedVeteranFlag(args.playerContext);
  const inEarlyWindow = !isRecognizedVeteran && ((t.day <= 1 && t.hour <= 12) || stillOnboardingByProgress);
  if (!inEarlyWindow) {
    return {
      schema: "new_player_guide_v1",
      enabled: false,
      phase: "off",
      axes: [],
      ordinaryNpcBaseline: [],
      antiHijackRules: [],
    };
  }

  const phase: NewPlayerGuidePacketV1["phase"] =
    t.day === 1 && t.hour <= 6 ? "early" : "mid";

  const axes: NewPlayerGuidePacketV1["axes"] = [
    {
      npcId: "N-008",
      displayName: "电工老刘",
      roleLabel: "生存教官",
      do: [
        "先活下来：稳住呼吸、找光、找退路",
        "先问工具与物资怎么拿，别空手逞能",
        "停电/异响先退半步，别把自己当英雄",
        "先记好账：接了什么委托、身上带啥、遇见了谁，都得自己记清，别指望脑子",
      ],
      dont: [
        "别乱碰开关、别乱闯配电间深处",
        "别把传闻当路线，先拿能验证的东西",
        "别在危险热的时候谈条件谈太满",
      ],
      surfaceTell: "他骂人像训兵，但手上会把最要命的细节掰给你。",
      currentlyRelevant: isAxisCurrentlyRelevant("N-008", activeTaskTitles),
    },
    {
      npcId: "N-015",
      displayName: "麟泽",
      roleLabel: "边界教官",
      do: [
        "先搞清楚：B1 为什么安全、边界画在哪里",
        "任何“越界”的冲动先问一句：代价是什么",
        "把秩序当护栏：先按规矩站住，再谈上楼",
      ],
      dont: [
        "别在他守夜/巡线时强行跨过 B1 边界",
        "别把他当任务发布器：他更像刹车而不是油门",
        "别逼他说透深层机制：他会回避或压住话头",
      ],
      surfaceTell: "他讲话短，先看你是不是要越线；越线前他会先把你拦住。",
      currentlyRelevant: isAxisCurrentlyRelevant("N-015", activeTaskTitles),
    },
  ];

  const ordinaryNpcBaseline = [
    "普通住户默认把玩家当作“月初又误闯进来的学生”。",
    "他们见过太多来得急、走得快的面孔：会同情，但不会围着玩家转。",
    "若玩家更冷静、更少逞能，住户会用更短的方式给一点可用的提醒。",
  ];

  const antiHijackRules = [
    "新手期叙事主轴优先：老刘=活命与工具，麟泽=边界与秩序。",
    "高魅力 NPC（含欣蓝/灵伤等）可以出现，但不得抢走新手引导的主导权。",
    "不要把“任务板/系统目标”当成解释世界的方式；用对白与表层细节让玩家自己感觉到规则。",
    "某教官 currentlyRelevant=false 时，说明他对应的起手任务当前没有在追踪：他的 do/dont 只作性格底色参考，不必主动说教或重复；把说教力度留给 currentlyRelevant=true 的那位。",
  ];

  // 仅在早期且 B1/1F 附近更强启用
  const enabled = loc.startsWith("B1_") || loc.startsWith("1F_") || loc === "B1";

  return {
    schema: "new_player_guide_v1",
    enabled,
    phase,
    axes,
    ordinaryNpcBaseline,
    antiHijackRules,
  };
}

