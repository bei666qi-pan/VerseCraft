/**
 * 高魅力校源 foreshadow → runtime packet（紧凑异常提示，非 lore dump）。
 */
import type { MajorNpcId } from "./majorNpcDeepCanon";
import type { RevealTierRank } from "./revealTierRank";
import {
  selectMajorNpcForeshadowRows,
  type ForeshadowGateContext,
  type ForeshadowRow,
} from "./majorNpcRevealLadder";

export const MAJOR_NPC_FORESHADOW_POLICY =
  "surface_fracture_verify=异常与可验证暗示 only；deep=受控确认摘要；禁止把 deep 当独白全文复述。";

export function buildMajorNpcForeshadowPacket(args: {
  nearbyMajorNpcIds: readonly MajorNpcId[];
  maxRevealRank: RevealTierRank;
  day: number;
  ctx: ForeshadowGateContext;
}): Record<string, unknown> {
  const rows: ForeshadowRow[] = [];
  for (const id of args.nearbyMajorNpcIds.slice(0, 4)) {
    rows.push(
      ...selectMajorNpcForeshadowRows({
        npcId: id,
        maxRevealRank: args.maxRevealRank,
        day: args.day,
        ctx: args.ctx,
      })
    );
  }
  return {
    schema: "major_npc_foreshadow_v1",
    maxRevealRankInjected: args.maxRevealRank,
    policy: MAJOR_NPC_FORESHADOW_POLICY,
    rows: rows.slice(0, 14),
  };
}

export function buildMajorNpcForeshadowPacketCompact(p: Record<string, unknown>): Record<string, unknown> {
  const rows = (p.rows as ForeshadowRow[] | undefined) ?? [];
  return {
    schema: "major_npc_foreshadow_v1",
    mx: p.maxRevealRankInjected,
    po: "hint_rows",
    r: rows.slice(0, 6).map((x) => ({
      i: x.id,
      L: x.layer,
      h: x.hint.length > 72 ? x.hint.slice(0, 72) : x.hint,
    })),
  };
}
