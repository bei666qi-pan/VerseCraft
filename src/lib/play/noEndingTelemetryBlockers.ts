/**
 * T6：从 src/app/play/page.tsx 抽出的纯函数（原逻辑不变，仅迁移位置以获得单元测试覆盖）。
 *
 * 用途：当"无结局"遥测触发时，判定具体是哪些条件尚未满足（用于诊断与埋点，
 * 不驱动任何结算/跳转决策——真正的结局判定逻辑在别处，这里只是"为什么还没到终局"的诊断快照）。
 */

/** 把 time.day/time.hour 折算成累计生存小时数（用于终局时间门槛判定）。 */
export function computeTelemetrySurvivalHours(
  time: { day?: number | null; hour?: number | null } | null | undefined
): number {
  const day = Number(time?.day ?? 0);
  const hour = Number(time?.hour ?? 0);
  return (
    Math.max(0, Math.trunc(Number.isFinite(day) ? day : 0)) * 24 +
    Math.max(0, Math.trunc(Number.isFinite(hour) ? hour : 0))
  );
}

/**
 * 判定当前尚未进入"结局"状态的具体原因（用于遥测诊断，非结算权威源）。
 * 找不到任何阻止条件时返回 `["no_ending_conditions_met"]`（占位，代表"条件均已满足但仍未触发"这一异常情况需要关注）。
 */
export function buildNoEndingTelemetryBlockers(state: unknown, resolvedTurn?: unknown): string[] {
  const s = (state ?? {}) as {
    stats?: { sanity?: number | null };
    time?: { day?: number | null; hour?: number | null };
    escapeMainline?: { stage?: unknown };
  };
  const blockers: string[] = [];
  if (Number(s.stats?.sanity ?? 0) > 0) blockers.push("sanity_above_zero");
  if (!Boolean((resolvedTurn as { is_death?: unknown } | null)?.is_death)) blockers.push("resolved_turn_not_death");
  const escapeStage = String(s.escapeMainline?.stage ?? "unknown");
  if (!escapeStage.startsWith("escaped_")) blockers.push("escape_stage_not_terminal");
  if (computeTelemetrySurvivalHours(s.time) < 240 && Number(s.time?.day ?? 0) < 10) {
    blockers.push("doom_time_not_reached");
  }
  if (blockers.length === 0) blockers.push("no_ending_conditions_met");
  return blockers;
}
