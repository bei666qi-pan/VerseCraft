type ParsedProfile = {
  name: string;
  gender: string;
  height_cm: number | null;
  personality: string;
};

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function parseProfileFromPlayerContext(playerContext: string): ParsedProfile {
  const src = String(playerContext ?? "");
  const m = src.match(/用户档案：姓名\[([^\]]*)]，性别\[([^\]]*)]，身高\[([0-9]+)cm]，性格\[([^\]]*)]。/);
  if (!m) {
    return { name: "", gender: "", height_cm: null, personality: "" };
  }
  const height = Number.parseInt(m[3] ?? "", 10);
  return {
    name: String(m[1] ?? "").trim(),
    gender: String(m[2] ?? "").trim(),
    height_cm: Number.isFinite(height) ? height : null,
    personality: String(m[4] ?? "").trim(),
  };
}

function parseProfessionFromPlayerContext(playerContext: string): {
  currentProfession: string;
  certified: string;
} {
  const src = String(playerContext ?? "");
  const m = src.match(/职业状态：当前\[([^\]]*)]，已认证\[([^\]]*)]/);
  if (!m) return { currentProfession: "", certified: "" };
  return { currentProfession: String(m[1] ?? "").trim(), certified: String(m[2] ?? "").trim() };
}

export function buildProtagonistAnchorPacketBlock(args: {
  playerContext: string;
  clientState: unknown;
  maxChars?: number;
}): string {
  const profile = parseProfileFromPlayerContext(args.playerContext);
  const profession = parseProfessionFromPlayerContext(args.playerContext);
  const packet = {
    schema: "protagonist_anchor_v1",
    protagonist: {
      name: clampText(profile.name || "未命名", 24),
      gender: clampText(profile.gender || "未设定", 16),
      height_cm: profile.height_cm,
      personality: clampText(profile.personality || "未设定", 64),
    },
    identity: {
      current_profession: clampText(profession.currentProfession || "无", 24),
      certified_professions: clampText(profession.certified || "无", 80),
    },
    // Prefer reusing existing upstream context as-is; do not invent parallel “profiles”.
    current_state_source: {
      playerContext_excerpt: clampText(args.playerContext, 420),
      clientState_excerpt:
        args.clientState && typeof args.clientState === "object" && !Array.isArray(args.clientState)
          ? (args.clientState as Record<string, unknown>)
          : null,
    },
    prohibitions: [
      "禁止新增未经确认的主角背景设定（出身、旧识、过往、秘密组织关系等）。",
      "禁止把主角写成旁观者以外的其他身份（例如‘老师/警察/军人/研究员/特工’等），除非上下文已明确。",
      "禁止替主角完成未经输入的重大心理跃迁（例如突然认定某人是旧友、突然立誓加入组织、突然承认关键真相）。",
    ],
  };
  const text = `## 【protagonist_anchor_packet】\n${JSON.stringify(packet)}`;
  const maxChars = Math.max(260, Math.min(1600, args.maxChars ?? 900));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1)}…`;
}

