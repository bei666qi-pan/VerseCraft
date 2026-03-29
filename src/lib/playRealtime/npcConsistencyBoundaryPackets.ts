/**
 * 阶段 5：与 runtime 大包互补的紧凑一致性边界 JSON（快车道空 runtime 时仍注入）。
 */

import { buildNpcPlayerBaselinePacket, buildEmptyNpcPlayerBaselinePacket } from "@/lib/npcBaselineAttitude/builders";
import {
  buildNpcSceneAuthority,
  compactNpcSceneAuthorityPacket,
  extractMentionedNpcIdsFromUserInput,
  extractNpcIdsFromRelationshipHints,
} from "@/lib/npcSceneAuthority/builders";
import { XINLAN_NPC_ID } from "@/lib/epistemic/policy";
import { getNpcCanonicalIdentity, isNpcAllowedToKnowRevealTier } from "@/lib/registry/npcCanon";
import { REVEAL_TIER_RANK, type RevealTierRank } from "@/lib/registry/revealTierRank";
import { parseRuntimeNpcPrimitives } from "./runtimeContextPackets";
import { buildThreatPacket } from "./stage2Packets";

export type NpcConsistencyEpistemicCounts = {
  actorKnownFactCount: number;
  publicFactCount: number;
  forbiddenFactCount: number;
};

export type NpcConsistencyBoundaryBuildResult = {
  text: string;
  charCount: number;
  npcConsistencyBoundaryEnabled: true;
};

/** 子包级灰度（默认全开；任一项 false 则该 JSON 子块降级为占位，便于线上开关） */
export type NpcConsistencyBoundaryRollout = {
  enableNpcCanonGuard: boolean;
  enableNpcBaselineAttitude: boolean;
  enableNpcSceneAuthority: boolean;
};

function compactBaseline(p: ReturnType<typeof buildNpcPlayerBaselinePacket> | ReturnType<typeof buildEmptyNpcPlayerBaselinePacket>) {
  return {
    npcId: p.npcId || null,
    canFam: p.canShowFamiliarity,
    view: p.mergedViewOfPlayer,
    ceil: p.truthRevealCeiling,
  };
}

/**
 * 单行标题 + 短 JSON：actor_canon / baseline / scene_authority / epistemic 计数 / 记忆特权 / reveal 门闸。
 */
export function buildNpcConsistencyBoundaryCompactBlock(args: {
  playerContext: string;
  latestUserInput: string;
  playerLocation: string | null;
  focusNpcId: string | null;
  maxRevealRank: number;
  epistemic: NpcConsistencyEpistemicCounts;
  maxChars?: number;
  /** 未传则等价于全开 */
  rollout?: Partial<NpcConsistencyBoundaryRollout>;
}): NpcConsistencyBoundaryBuildResult {
  const ro: NpcConsistencyBoundaryRollout = {
    enableNpcCanonGuard: args.rollout?.enableNpcCanonGuard !== false,
    enableNpcBaselineAttitude: args.rollout?.enableNpcBaselineAttitude !== false,
    enableNpcSceneAuthority: args.rollout?.enableNpcSceneAuthority !== false,
  };

  const prim = parseRuntimeNpcPrimitives(args.playerContext, args.playerLocation);
  const location = prim.location;
  const nearbyNpcIds = prim.npcPositions.filter((x) => x.location === location).map((x) => x.npcId);
  const focusRaw = args.focusNpcId?.trim() ?? "";
  const focusNpcForBaseline =
    focusRaw && nearbyNpcIds.includes(focusRaw) ? focusRaw : (nearbyNpcIds[0] ?? null);

  const threatPacket = buildThreatPacket({
    location,
    contextThreatMap: prim.mainThreatMap,
  });

  const npcPlayerBaselinePacket =
    !ro.enableNpcBaselineAttitude
      ? buildEmptyNpcPlayerBaselinePacket()
      : focusNpcForBaseline
        ? buildNpcPlayerBaselinePacket({
            npcId: focusNpcForBaseline,
            relationPartial: {},
            scene: {
              locationId: location ?? "unknown",
              hotThreatPresent: threatPacket.phase === "active" || threatPacket.phase === "breached",
              maxRevealRank: args.maxRevealRank,
            },
          })
        : buildEmptyNpcPlayerBaselinePacket();

  const npcSceneAuthorityPacket = ro.enableNpcSceneAuthority
    ? buildNpcSceneAuthority({
        currentSceneLocation: location,
        npcPositions: prim.npcPositions,
        sceneAppearanceAlreadyWrittenIds: prim.sceneNpcAppearanceWritten,
        mentionedNpcIdsFromInput: extractMentionedNpcIdsFromUserInput(args.latestUserInput),
        codexOrHintNpcIds: extractNpcIdsFromRelationshipHints(prim.relationshipHints),
        maxRevealRank: args.maxRevealRank,
      })
    : null;

  const focus = focusNpcForBaseline;
  const canon = focus ? getNpcCanonicalIdentity(focus) : null;

  const actor_canon_packet = !ro.enableNpcCanonGuard
    ? focus
      ? { id: focus, canon_guard: "rollout_off" as const }
      : { id: null, rule: "no_focus_use_scene_only" }
    : focus && canon
      ? {
          id: canon.npcId,
          g: canon.canonicalGender,
          addr: canon.canonicalAddressing.slice(0, 40),
          role: canon.canonicalPublicRole.slice(0, 88),
          home: canon.canonicalHomeLocation.slice(0, 40),
          ap_s: canon.canonicalAppearanceShort.slice(0, 120),
          spawn_ok: canon.allowedSpawnLocations.slice(0, 5),
        }
      : { id: null, rule: "no_focus_use_scene_only" };

  const npc_player_baseline_packet = compactBaseline(npcPlayerBaselinePacket);

  const npc_scene_authority_packet = npcSceneAuthorityPacket
    ? (() => {
        const sceneCompact = compactNpcSceneAuthorityPacket(npcSceneAuthorityPacket);
        return {
          ...sceneCompact,
          authorityRulesSummary: sceneCompact.authorityRulesSummary.slice(0, 140),
        };
      })()
    : { rollout_off: true as const, note: "npc_scene_authority_disabled" };

  const actor_epistemic_packet = {
    focus,
    kn: args.epistemic.actorKnownFactCount,
    pub: args.epistemic.publicFactCount,
    ban: args.epistemic.forbiddenFactCount,
    sys_ne_actor: 1,
    unk: "default_not_know",
  };

  const actor_memory_privilege_packet = focus && canon
    ? {
        priv: canon.memoryPrivilege,
        player_frame: canon.memoryPrivilege === "normal" ? "intruder_student_not_old_friend" : "familiarity_packet_only",
        res: "vague_echo_not_full_recall",
        fam_ok: ["major_charm", "night_reader", "xinlan"].includes(canon.memoryPrivilege),
      }
    : { priv: "n/a", player_frame: "scene_solo", res: "n/a", fam_ok: false };

  let npcRevealCap: RevealTierRank | null = null;
  if (focus) {
    npcRevealCap = getNpcCanonicalIdentity(focus).revealTierCap;
  }
  const schoolSurfaceLocked = args.maxRevealRank < REVEAL_TIER_RANK.fracture;
  const deepLocked = focus ? !isNpcAllowedToKnowRevealTier(focus, REVEAL_TIER_RANK.deep) : true;

  const actor_reveal_limit_packet = {
    world_r: args.maxRevealRank,
    npc_cap: npcRevealCap,
    lock_school_frag: schoolSurfaceLocked ? 1 : 0,
    lock_loop_deep: deepLocked ? 1 : 0,
    xinlan_tiered: focus === XINLAN_NPC_ID ? 1 : 0,
  };

  const packets = {
    actor_canon_packet,
    npc_player_baseline_packet,
    npc_scene_authority_packet,
    actor_epistemic_packet,
    actor_memory_privilege_packet,
    actor_reveal_limit_packet,
  };

  const text = [
    "## 【npc_consistency_boundary_compact】",
    JSON.stringify(packets),
  ].join("\n");

  /** 默认留足完整 JSON（勿在 parse 中途截断）；需更紧时由调用方先降 maxChars 并接受可能裁掉尾部键。 */
  const maxChars = args.maxChars ?? 2000;
  const trimmed = text.length > maxChars ? `${text.slice(0, Math.max(0, maxChars - 1))}…` : text;
  return { text: trimmed, charCount: trimmed.length, npcConsistencyBoundaryEnabled: true };
}
