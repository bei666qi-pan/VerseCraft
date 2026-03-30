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

export function buildNewPlayerGuidePacket(args: {
  playerContext: string;
  playerLocation: string | null;
  clientState: ClientStructuredContextV1 | null;
}): NewPlayerGuidePacketV1 | null {
  const loc = args.clientState?.playerLocation?.trim() || parseLocation(args.playerContext, args.playerLocation);
  const t = args.clientState?.time ? { day: args.clientState.time.day, hour: args.clientState.time.hour } : parseTime(args.playerContext);
  if (!t) return null;

  const inEarlyWindow = t.day <= 1 && t.hour <= 12;
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
      ],
      dont: [
        "别乱碰开关、别乱闯配电间深处",
        "别把传闻当路线，先拿能验证的东西",
        "别在危险热的时候谈条件谈太满",
      ],
      surfaceTell: "他骂人像训兵，但手上会把最要命的细节掰给你。",
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

