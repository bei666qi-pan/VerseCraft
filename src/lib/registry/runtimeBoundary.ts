import { NPC_SOCIAL_GRAPH } from "@/lib/registry/world";
import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import { buildServiceContextForLocation, getServicesForLocation, isAbsoluteSafeZoneLocation } from "@/lib/registry/serviceNodes";

/**
 * 运行时边界：前端仅允许读取最小 UI/状态种子，避免直接消费大段世界 lore 文本。
 * 大规模世界事实由服务端 worldKnowledge + RAG 负责。
 */
export const NPC_HOME_LOCATION_SEED: Record<string, string> = Object.fromEntries(
  Object.entries(NPC_SOCIAL_GRAPH).map(([id, profile]) => [id, profile.homeLocation])
);

export const NPC_RELATIONSHIP_HOOK_SEED: Record<string, string[]> = Object.fromEntries(
  CORE_NPC_PROFILES_V2.map((p) => [p.id, [...p.interaction.relationshipHooks]])
);

export { getServicesForLocation, buildServiceContextForLocation, isAbsoluteSafeZoneLocation };
