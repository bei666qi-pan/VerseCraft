import { buildMonthStartStudentPressurePacket, type MonthStartStudentPressureV1 } from "@/lib/world/monthStartStudentPressure";
import { buildSpaceAuthorityEchoPacket, type SpaceAuthorityEchoV1 } from "@/lib/world/spaceAuthorityEchoes";

export type LivingWorldSurfaceV1 = {
  schema: "living_world_surface_v1";
  /** 生活型证据：补给/维修/洗衣/看守/交易/传话/小债务 */
  living_lines: string[];
  /** DM 约束：不要把生活感写成教程清单 */
  dm_directives: string[];
};

export type WorldFeelPacketV1 = {
  schema: "world_feel_packet_v1";
  space_echo: SpaceAuthorityEchoV1;
  month_start_pressure: MonthStartStudentPressureV1;
  living_surface: LivingWorldSurfaceV1;
};

function uniq(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const t = String(x ?? "").trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function buildWorldFeelPacket(args: {
  locationId: string | null;
  day: number;
  hour: number;
  maxRevealRank: number;
  monthlyStudentEntryEnabled: boolean;
  nearbyNpcIds: string[];
  /** 运行时服务节点种类（已在 runtimeContextPackets 中计算） */
  serviceKinds: string[];
}): WorldFeelPacketV1 {
  const space_echo = buildSpaceAuthorityEchoPacket({
    locationId: args.locationId,
    maxRevealRank: args.maxRevealRank,
    monthlyStudentEntryEnabled: args.monthlyStudentEntryEnabled,
  });

  const month_start_pressure = buildMonthStartStudentPressurePacket({
    day: args.day,
    hour: args.hour,
    monthlyStudentEntryEnabled: args.monthlyStudentEntryEnabled,
    nearbyNpcIds: args.nearbyNpcIds,
  });

  const living_lines: string[] = [];
  const ids = args.nearbyNpcIds;
  const hasLiu = ids.includes("N-008");
  const hasLaundry = ids.includes("N-014");
  const hasLinz = ids.includes("N-015");
  const hasMerchant = ids.includes("N-018");
  const hasPostman = ids.includes("N-003");

  if (args.serviceKinds.includes("shop") || hasMerchant) living_lines.push("有人把补给当生意：价码摆桌面，顺手欠一笔很正常。");
  if (args.serviceKinds.includes("forge") || hasLiu) living_lines.push("维修不是剧情，是日常：灯能亮一半，就能多活一夜。");
  if (hasLaundry) living_lines.push("洗衣房不是背景：水声在替人抹掉‘沾到的东西’，也在替楼遮住别的声音。");
  if (hasLinz) living_lines.push("看守不是护送：边界有人守着，守的是规矩，不是你。");
  if (hasPostman) living_lines.push("传话比真相安全：信与口风会绕一圈才落到你耳朵里。");

  if (living_lines.length === 0) {
    living_lines.push("楼里有人活着：避让、借物、换手、欠半句人情，都是旧秩序。");
  }

  const living_surface: LivingWorldSurfaceV1 = {
    schema: "living_world_surface_v1",
    living_lines: uniq(living_lines).slice(0, 5),
    dm_directives: [
      "把生活感写成“动作与微表演证据”，别写成教程清单或世界观讲课。",
      "生活线只提供底噪与支撑，不得冲淡主线悬疑与危险感。",
    ],
  };

  return {
    schema: "world_feel_packet_v1",
    space_echo,
    month_start_pressure,
    living_surface,
  };
}

