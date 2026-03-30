export type MonthStartStudentPressureV1 = {
  schema: "month_start_student_pressure_v1";
  enabled: boolean;
  /** 住户共识（表层可演） */
  consensus_lines: string[];
  /** 公寓“生活逻辑”如何适配月初误闯（非讲课） */
  apartment_routines: string[];
  /** DM 禁止点：别把玩家写成唯一特例 */
  dm_guardrails: string[];
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

export function buildMonthStartStudentPressurePacket(args: {
  day: number;
  hour: number;
  monthlyStudentEntryEnabled: boolean;
  nearbyNpcIds: string[];
}): MonthStartStudentPressureV1 {
  const enabled = Boolean(args.monthlyStudentEntryEnabled) && args.day <= 1 && args.hour <= 12;

  const hasLaundry = args.nearbyNpcIds.includes("N-014");
  const hasLiu = args.nearbyNpcIds.includes("N-008");
  const hasXinlan = args.nearbyNpcIds.includes("N-010");

  const consensus_lines: string[] = enabled
    ? [
        "月初又进来一个学生，不稀奇；稀奇的是能不能撑过头几晚。",
        "住户不会围着新来的转：提醒半句就算仁至义尽。",
        "能冷静一点的，通常不是最先死的那批。",
      ]
    : [
        "月初的那阵子过了，楼里会短暂像“没那么饿”。",
      ];

  const apartment_routines: string[] = [];
  if (enabled) {
    apartment_routines.push("B1 会更忙：补给、洗衣、修电、巡线都像早有流程。");
    if (hasLaundry) apartment_routines.push("洗衣房的水声更勤：有人在把“沾到的东西”洗掉。");
    if (hasLiu) apartment_routines.push("配电间会多出几句骂声：有人在把灯拉回能用的亮度。");
    if (hasXinlan) apartment_routines.push("登记口会把表推近半寸：像怕新来的那行写歪。");
  }

  const dm_guardrails: string[] = [
    "禁止把玩家写成唯一特例或全员围观的中心；让住户像忙自己的命。",
    "用对白的半句默契与避让体现共识，禁止百科式讲解“月初机制”。",
  ];

  return {
    schema: "month_start_student_pressure_v1",
    enabled,
    consensus_lines: uniq(consensus_lines).slice(0, 4),
    apartment_routines: uniq(apartment_routines).slice(0, 4),
    dm_guardrails,
  };
}

