import { CORE_NPC_PROFILES_V2 } from "@/lib/registry/npcProfiles";
import { NPC_SOCIAL_GRAPH } from "@/lib/registry/world";
import type { NpcProfileV2 } from "@/lib/registry/types";
import { buildNpcBaselineAttitude, mergeNpcBaselineWithRelation } from "@/lib/npcBaselineAttitude/builders";
import { buildNpcHeartProfile, normalizeRelationStatePartial } from "./build";
import type { NpcHeartRuntimeView } from "./types";

function floorFromLocation(loc: string): string {
  const s = String(loc ?? "");
  if (s.startsWith("B1_")) return "B1";
  if (s.startsWith("B2_")) return "B2";
  const m = s.match(/^(\d)F_/);
  if (m?.[1]) return m[1];
  if (s.includes("7F") || s === "7") return "7";
  return "B1";
}

function pickProfile(npcId: string): NpcProfileV2 | null {
  return (CORE_NPC_PROFILES_V2 as readonly NpcProfileV2[]).find((p) => p.id === npcId) ?? null;
}

export function buildNpcHeartRuntimeView(args: {
  npcId: string;
  relationPartial: any;
  locationId: string;
  activeTaskIds: string[];
  hotThreatPresent: boolean;
  /** 与运行时 reveal 门闸对齐；缺省 0 */
  maxRevealRank?: number;
}): NpcHeartRuntimeView | null {
  const p = pickProfile(args.npcId);
  const social = NPC_SOCIAL_GRAPH[args.npcId] ?? null;
  const profile = buildNpcHeartProfile({ npcId: args.npcId, profileV2: p, social });
  if (!profile) return null;
  const relation = normalizeRelationStatePartial(args.relationPartial);
  const maxRevealRank = typeof args.maxRevealRank === "number" && Number.isFinite(args.maxRevealRank) ? args.maxRevealRank : 0;
  const baselineScene = {
    locationId: args.locationId,
    hotThreatPresent: args.hotThreatPresent,
    maxRevealRank,
  };
  const baseline = buildNpcBaselineAttitude(args.npcId, baselineScene, relation);
  const baselineMerged = mergeNpcBaselineWithRelation({
    baseline,
    relation,
    scene: baselineScene,
  });
  const floorId = floorFromLocation(args.locationId);
  const attitudeLabel =
    relation.trust >= 45 && relation.fear <= 15 ? "warm"
    : relation.fear >= 55 ? "hostile"
    : relation.trust <= 10 ? "guarded"
    : "neutral";

  const canIssueTasksNow = attitudeLabel !== "hostile";
  const whatNpcWantsFromPlayerNow =
    attitudeLabel === "warm"
      ? "兑现承诺、带来可验证线索，保持互惠。"
      : attitudeLabel === "guarded"
        ? "先交出一点可信证据或资源，证明你不是麻烦。"
        : attitudeLabel === "hostile"
          ? "避免触碰禁区；任何请求都要付出更高代价。"
          : "把你的目标说清楚，他会按价码给出交换。";

  const suggestedTaskDramaticTypes =
    profile.taskStyle === "transactional"
      ? ["leverage", "debt_payment", "delivery"]
      : profile.taskStyle === "manipulative"
        ? ["betrayal", "coverup", "investigation"]
        : profile.taskStyle === "avoidant"
          ? ["investigation", "escape", "coverup"]
          : profile.taskStyle === "protective"
            ? ["survival", "escape", "trust"]
            : ["investigation", "delivery", "survival"];

  return {
    profile,
    relation,
    context: {
      locationId: args.locationId,
      floorId,
      hotThreatPresent: args.hotThreatPresent,
      activeTaskIds: args.activeTaskIds,
    },
    attitudeLabel,
    whatNpcWantsFromPlayerNow,
    canIssueTasksNow,
    suggestedTaskDramaticTypes,
    escapeRole: (() => {
      // Phase-5 示范：把少数关键 NPC 映射为出口主线“功能位”，用于 prompt 与任务口吻，不影响 UI。
      // 仅硬编码少量高频 NPC，避免把规则散到全世界。
      const id = args.npcId;
      if (id === "N-008") return "route_holder";
      if (id === "N-010") return "gatekeeper";
      if (id === "N-018") return "sacrificer";
      if (id === "N-020") return "liar";
      return undefined;
    })(),
    baselineMerged,
  };
}

export function selectRelevantNpcHearts(args: {
  locationId: string;
  presentNpcIds: string[];
  issuerNpcIds: string[];
  volatileNpcIds: string[];
  maxNpc?: number;
}): string[] {
  const maxNpc = Math.max(1, Math.min(5, args.maxNpc ?? 3));
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string) => {
    const v = String(id ?? "").trim();
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  for (const id of args.presentNpcIds ?? []) push(id);
  for (const id of args.issuerNpcIds ?? []) push(id);
  for (const id of args.volatileNpcIds ?? []) push(id);
  return out.slice(0, maxNpc);
}

