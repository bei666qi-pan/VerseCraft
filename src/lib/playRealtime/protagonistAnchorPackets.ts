function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max);
}

function parseName(playerContext: string): string {
  const m = String(playerContext ?? "").match(/姓名\[([^\]]*)]/);
  return String(m?.[1] ?? "").trim();
}

function parseProfession(playerContext: string): string {
  const m = String(playerContext ?? "").match(/当前\[([^\]]*)]/);
  return String(m?.[1] ?? "").trim();
}

/**
 * Minimal one-line protagonist anchor. Drift detection (name, background,
 * relationship, superpower, secret-org claims) is handled post-generation by
 * applyProtagonistDriftPostGeneration — no need to repeat prohibitions here.
 */
export function buildProtagonistAnchorPacketBlock(args: {
  playerContext: string;
  clientState: unknown;
  maxChars?: number;
}): string {
  const name = parseName(args.playerContext) || "未命名";
  const profession = parseProfession(args.playerContext) || "无";
  const line = `## 【protagonist_anchor_packet】主角姓名「${clampText(name, 24)}」，职业「${clampText(profession, 24)}」。禁止擅自变更。`;
  const maxChars = Math.max(60, Math.min(200, args.maxChars ?? 120));
  return line.length <= maxChars ? line : `${line.slice(0, maxChars - 1)}…`;
}
