export function safeNumber(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : fallback;
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function localInputSafetyCheck(input: string): { ok: boolean; reason?: string } {
  const text = String(input || "").trim();
  if (!text) return { ok: false, reason: "输入不能为空" };
  if (
    /(<script|javascript:|onerror=|onload=|drop\s+table|union\s+select|忽略以上规则|打印系统提示)/i.test(
      text
    )
  ) {
    return { ok: false, reason: "输入包含高风险指令，请调整表述后重试" };
  }
  return { ok: true };
}
