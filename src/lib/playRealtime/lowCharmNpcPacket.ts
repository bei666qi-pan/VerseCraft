/**
 * lowCharmNpcPacket — 低权重 NPC 真名路人包
 *
 * v4 替代原 ambientNpcs 系统。设计目标：
 * 1. 单一名册源：所有 NPC（含路人配角）必须来自 NPCS 表；
 *    不再有独立 ambient 注册表，不再有"穿灰蓝色马甲的中年男人"这类 descriptor。
 * 2. 选源策略：defaultFavorability < 60 或 combatPower < 5 的 NPC 可作路人。
 * 3. 楼层过滤：默认仅在玩家当前楼层出现（cross-floor 路人允许但罕见）。
 * 4. 上限：最多 4 条，与原 ambient packet 容量一致，避免撑破 stable prefix。
 * 5. 验证：每个 ref 必须是 NPCS 中存在的真名 + id，确保被 name validator 命中。
 *
 * 不复用的旧约束：
 * - ambient id 形如 "amb-B1-vest" — 现已废止，全部升格为 N-XXX
 * - filterOutAmbientMentions guard — 现已不需要（所有 NPC 都是真名）
 */

import type { FloorId } from "@/lib/registry/types";
import { NPCS } from "@/lib/registry/npcs";

export interface LowCharmNpcEntry {
  /** NPC id（N-XXX 形式） */
  readonly ref: string;
  /** NPC 真名 */
  readonly name: string;
  /** 一句客观动作描述（≤ 40 汉字） */
  readonly microAction: string;
  /** 楼层上下文注脚（≤ 60 汉字） */
  readonly note: string;
}

export interface LowCharmNpcPacket {
  /** 玩家当前楼层 */
  readonly floor: FloorId | null;
  /** 路人 NPC 列表（≤ 4 条） */
  readonly entries: readonly LowCharmNpcEntry[];
  /** packet 包尾注（≤ 60 汉字） */
  readonly packetNote: string;
}

/**
 * 默认低权重 NPC 选源上限。保持与原 ambient packet 一致。
 */
export const LOW_CHARM_PACKET_CAP = 4;

/**
 * 选源规则：floor 匹配 + (defaultFavorability < 60 或 combatPower < 5)。
 * 排除 floor="random"（跨楼层 NPC 由 runtime packet 单独处理）。
 */
export function buildLowCharmNpcPacket(args: {
  floor: FloorId | null;
  now: Date;
  maxEntries?: number;
}): LowCharmNpcPacket {
  const cap = args.maxEntries ?? LOW_CHARM_PACKET_CAP;
  if (!args.floor) {
    return { floor: null, entries: [], packetNote: "楼层未知，路人 NPC 不注入" };
  }
  const candidates = NPCS.filter(
    (npc) =>
      npc.floor === args.floor &&
      (npc.defaultFavorability < 60 || npc.combatPower < 5),
  ).slice(0, cap);
  return {
    floor: args.floor,
    entries: candidates.map((npc) => ({
      ref: npc.id,
      name: npc.name,
      microAction: `客观动作：${npc.specialty}（NPC 档案可见）`,
      note: `位于 ${npc.location}`,
    })),
    packetNote: `本楼层 ${candidates.length} 名低权重 NPC 可作路人配角；禁 codex/relationship_updates`,
  };
}