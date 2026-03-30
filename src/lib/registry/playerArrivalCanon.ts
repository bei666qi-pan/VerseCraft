/**
 * 玩家到达正典：与 monthlyIntrusionModel + spaceShardCanon 一致。
 */

export const PLAYER_ARRIVAL_CANON = {
  playerArrivalType: "monthly_intruded_student" as const,
  playerBaselinePresentation: "calm_but_shocked" as const,
  playerSeenByOrdinaryNpcsAs: "another_monthly_student" as const,
  playerSeenByPrivilegedNpcsAs: "anomaly_with_familiarity" as const,
  notChosenOneByDefault: true as const,
} as const;

export type PlayerArrivalCanon = typeof PLAYER_ARRIVAL_CANON;

export function getPlayerArrivalCanon(): PlayerArrivalCanon {
  return PLAYER_ARRIVAL_CANON;
}

/** 供 packet 的紧凑切片 */
export function buildPlayerArrivalPacketSlice(): Record<string, unknown> {
  return { ...PLAYER_ARRIVAL_CANON };
}
