/**
 * 空间权柄 / 玩家到达 / NPC 初遇认知 — 统一导出入口（供 route、工具与测试单点 import）。
 */

export {
  getSpaceAuthorityShardCanon,
  getSpaceShardUnifiedExplanation,
  buildSpaceShardPacketSlice,
  listSpaceAuthorityShardCanon,
  SPACE_AUTHORITY_ROOT,
} from "./spaceShardCanon";
export type { SpaceAuthorityShardCanon, SpaceShardType } from "./spaceShardCanon";

export { getPlayerArrivalCanon, buildPlayerArrivalPacketSlice, PLAYER_ARRIVAL_CANON } from "./playerArrivalCanon";

export {
  buildNpcInitialRecognitionOfPlayer,
  getNpcFamiliarityFlavor,
  buildNearbyNpcRecognitionPacketRows,
  NIGHT_READER_NPC_ID,
} from "./npcPlayerRecognition";

export {
  isMonthlyIntrusionNpcCommonSense,
  MONTHLY_INTRUSION_HARD_RULES,
  MONTHLY_INTRUSION_RESIDENT_BASELINE,
  buildMonthlyIntrusionCommonSenseLines,
} from "./monthlyIntrusionModel";
