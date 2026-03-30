export type SpaceAuthorityEchoV1 = {
  schema: "space_authority_echo_v1";
  /** 用“错位/回声/规则相似”呈现，禁止百科讲课 */
  echoes: string[];
  /** 写作约束：避免把空间权柄解释成课堂知识 */
  dm_directives: string[];
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

export function buildSpaceAuthorityEchoPacket(args: {
  locationId: string | null;
  maxRevealRank: number;
  monthlyStudentEntryEnabled: boolean;
}): SpaceAuthorityEchoV1 {
  const loc = (args.locationId ?? "").trim();
  const isB1 = loc.startsWith("B1_") || loc === "B1";
  const is1F = loc.startsWith("1F_") || loc === "1";
  const lowRank = args.maxRevealRank <= 1;

  const echoes: string[] = [];
  if (isB1) {
    echoes.push("B1 的安全像被“画”出来：一线之隔，噪声与寒意都被压住。");
    echoes.push("灯管明灭的节拍有点像旧教室的铃声，但又慢半拍。");
  } else if (is1F) {
    echoes.push("登记口的表格像地图：一行一行把人从“哪来”折到“哪去”。");
    echoes.push("门厅的回声不对劲：脚步声像从另一条走廊借来的。");
  } else {
    echoes.push("空间不协调不是幻觉：门框与地砖的比例偶尔差半寸。");
  }

  if (args.monthlyStudentEntryEnabled) {
    echoes.push("月初节律像固定的“开口”：总会有一批脚步从不该出现的地方冒出来。");
  }

  // 更高档位仍不讲课，只允许更明确的“同源感”
  if (!lowRank) {
    echoes.push("校侧与楼侧像同一张纸的两面：规则相似，但纹路不在同一层。");
  }

  const dm_directives: string[] = [
    "用错位、回声、规则相似来体现同源；禁止百科式解释空间权柄机制。",
    "优先让玩家“先感觉到不对”，再给一条可执行的自保/验证行动。",
  ];

  return {
    schema: "space_authority_echo_v1",
    echoes: uniq(echoes).slice(0, 6),
    dm_directives,
  };
}

