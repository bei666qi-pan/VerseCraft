/**
 * 空间权柄碎片闭环层：校侧与公寓侧异常统一为同一【空间】权柄的不同投影与泡层。
 * 供 runtime packet、DM prompt、任务与前端介绍消费（非仅文档）。
 */

import type { RevealTierRank } from "./revealTierRank";
import { REVEAL_TIER_RANK } from "./revealTierRank";

export const SPACE_AUTHORITY_ROOT = "space" as const;

export type SpaceShardType =
  | "school_projection"
  | "apartment_projection"
  | "mixed_overlap"
  | "residual_echo";

/** 碎片在叙事中的投影方式（工程语义，packet 可节选展示） */
export type SpaceProjectionMode =
  | "daily_bubble_wrapped"
  | "digestion_bubble_exposed"
  | "leak_corridor"
  | "ledger_echo";

/** 该投影在整体闭环中的职能位 */
export type SpaceLayerRole =
  | "comfort_narrative_shell"
  | "bare_digestion_interface"
  | "exchange_buffer"
  | "anchor_stabilizer"
  | "fracture_witness";

/** 渗漏方向：哪一侧先破裂、哪一侧承接残骸 */
export type SpaceSpilloverDirection =
  | "school_into_apartment_monthly"
  | "apartment_upward_digest"
  | "bidirectional_echo";

/** 泡层对失败路径的挤压（纠错压强，deep+ 叙事用） */
export type SpaceCorrectionPressure = "low" | "mid" | "high" | "abyssal";

export interface SpaceAuthorityShardCanon {
  authorityRoot: typeof SPACE_AUTHORITY_ROOT;
  shardType: SpaceShardType;
  projectionMode: SpaceProjectionMode;
  layerRole: SpaceLayerRole;
  spilloverDirection: SpaceSpilloverDirection;
  correctionPressure: SpaceCorrectionPressure;
  /** 为何需要稳定锚（B1/登记/交换等），短句 */
  stableAnchorNeed: string;
  /** 与月初误入节律的关系，短句 */
  monthlyIntrusionRelation: string;
  /** DM/ packet 用一句统一说明（无校名时可上 surface） */
  surfaceSafeSummary: string;
}

const SHARD_CANON: Record<SpaceShardType, SpaceAuthorityShardCanon> = {
  school_projection: {
    authorityRoot: SPACE_AUTHORITY_ROOT,
    shardType: "school_projection",
    projectionMode: "daily_bubble_wrapped",
    layerRole: "comfort_narrative_shell",
    spilloverDirection: "school_into_apartment_monthly",
    correctionPressure: "mid",
    stableAnchorNeed: "日常泡层需要「可理解的课表与走廊」来拖住渗漏前的几秒。",
    monthlyIntrusionRelation: "月初边界变薄时，校侧泡层最先裂口，学生常被甩进公寓投影。",
    surfaceSafeSummary: "你熟悉的走廊与铃声，是同一道空间权柄上较温和、较会伪装的那一层皮。",
  },
  apartment_projection: {
    authorityRoot: SPACE_AUTHORITY_ROOT,
    shardType: "apartment_projection",
    projectionMode: "digestion_bubble_exposed",
    layerRole: "bare_digestion_interface",
    spilloverDirection: "apartment_upward_digest",
    correctionPressure: "high",
    stableAnchorNeed: "公寓泡层裸露消化节律，需要安全中枢与登记口推迟失控。",
    monthlyIntrusionRelation: "每月都有外人从裂口掉进 B1 一带；住户对此熟视无睹。",
    surfaceSafeSummary: "如月公寓不是另一套世界来源，而是同一权柄剥掉日常包装后的投影。",
  },
  mixed_overlap: {
    authorityRoot: SPACE_AUTHORITY_ROOT,
    shardType: "mixed_overlap",
    projectionMode: "leak_corridor",
    layerRole: "exchange_buffer",
    spilloverDirection: "bidirectional_echo",
    correctionPressure: "mid",
    stableAnchorNeed: "重叠带需要交易与记录把资源与名单钉在可审计处。",
    monthlyIntrusionRelation: "误入者常在重叠带醒来，既像学生又像新住户。",
    surfaceSafeSummary: "校与楼在裂口处叠成一条走廊：同一碎片，两种触感。",
  },
  residual_echo: {
    authorityRoot: SPACE_AUTHORITY_ROOT,
    shardType: "residual_echo",
    projectionMode: "ledger_echo",
    layerRole: "fracture_witness",
    spilloverDirection: "bidirectional_echo",
    correctionPressure: "abyssal",
    stableAnchorNeed: "残响需要边界与名单互相顶牛，避免假闭环把所有人钉死。",
    monthlyIntrusionRelation: "复活与循环节拍让「又一个学生」重复落地，像同一裂口的回声。",
    surfaceSafeSummary: "既视感与肌肉记忆来自权柄残响，不是谁完整记得你。",
  },
};

export function getSpaceAuthorityShardCanon(
  shardType: SpaceShardType
): SpaceAuthorityShardCanon {
  return SHARD_CANON[shardType];
}

export function listSpaceAuthorityShardCanon(): readonly SpaceAuthorityShardCanon[] {
  return Object.values(SHARD_CANON);
}

/**
 * 按揭露档给出「校碎片/楼碎片同一权柄」的可注入解释（越深层越可明说机制）。
 */
export function getSpaceShardUnifiedExplanation(maxRevealRank: RevealTierRank): {
  surfaceLine: string;
  fractureLine: string | null;
  deepLine: string | null;
  abyssLine: string | null;
} {
  const surfaceLine =
    "异常只有一个根：【空间】权柄碎裂后的不同泡层；校与公寓不是两套无关来源，而是同一碎片的不同投影。";
  const fractureLine =
    "月初裂口倾向把「日常泡」里的学生甩进「裸露泡」：你在楼道里遇见的住户，默认把你当又一批掉进来的外人。";
  const deepLine =
    "校侧投影与公寓投影共享渗漏账本：交换链、登记与边界巡守都在处理同一权柄的残渣，只是职能壳不同。";
  const abyssLine =
    "纠错压强与循环残响仍服从同一空间本体；所谓校源与楼源，只是观测者在不同泡层上贴的标签。";
  return {
    surfaceLine,
    fractureLine: maxRevealRank >= REVEAL_TIER_RANK.fracture ? fractureLine : null,
    deepLine: maxRevealRank >= REVEAL_TIER_RANK.deep ? deepLine : null,
    abyssLine: maxRevealRank >= REVEAL_TIER_RANK.abyss ? abyssLine : null,
  };
}

/** 合成单对象供 packet 紧凑注入 */
export function buildSpaceShardPacketSlice(maxRevealRank: RevealTierRank): Record<string, unknown> {
  const tiers = getSpaceShardUnifiedExplanation(maxRevealRank);
  return {
    authorityRoot: SPACE_AUTHORITY_ROOT,
    shardTypes: Object.keys(SHARD_CANON) as SpaceShardType[],
    unifiedPremise: tiers.surfaceLine,
    fracturePremise: tiers.fractureLine,
    deepPremise: tiers.deepLine,
    abyssPremise: tiers.abyssLine,
    schoolShard: {
      shardType: "school_projection",
      summary: SHARD_CANON.school_projection.surfaceSafeSummary,
    },
    apartmentShard: {
      shardType: "apartment_projection",
      summary: SHARD_CANON.apartment_projection.surfaceSafeSummary,
    },
  };
}
