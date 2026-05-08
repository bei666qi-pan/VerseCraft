import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import type {
  EchoFragment,
  EchoSafetyLevel,
  NpcFirstEncounterAllowedForm,
  NpcFirstEncounterEchoIntensity,
  NpcFirstEncounterEchoPlan,
  NpcFirstEncounterEchoPlanArgs,
  NpcFirstEncounterForbiddenClaim,
} from "./types";

function revealRank(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : REVEAL_TIER_RANK.surface;
}

function isDiscovered(discovered: NpcFirstEncounterEchoPlanArgs["currentRunDiscovered"], npcId: string): boolean {
  if (!discovered) return false;
  if (Array.isArray(discovered)) return discovered.includes(npcId);
  if (discovered instanceof Set) return discovered.has(npcId);
  return Boolean(discovered[npcId]);
}

function snapshotDiscoveredFlag(args: Pick<NpcFirstEncounterEchoPlanArgs, "snapshot">, npcId: string): boolean | null {
  const flag = args.snapshot?.npcs?.[npcId]?.discoveredByPlayer;
  return typeof flag === "boolean" ? flag : null;
}

export function inferCurrentRunNpcDiscovered(
  snapshot: NpcFirstEncounterEchoPlanArgs["snapshot"],
  npcId: string | null | undefined
): boolean {
  const id = typeof npcId === "string" ? npcId.trim() : "";
  if (!id) return false;
  const direct = snapshotDiscoveredFlag({ snapshot }, id);
  if (direct !== null) return direct;
  return Boolean(snapshot?.player?.codex?.[id]);
}

function fragmentNpcId(fragment: EchoFragment): string | null {
  if (fragment.targetType === "npc" && fragment.targetId) return fragment.targetId;
  return fragment.anchors?.npcIds?.[0] ?? null;
}

function echoIntensity(args: NpcFirstEncounterEchoPlanArgs, npcId: string): number {
  const canon = args.echoCanon;
  if (!canon) return 0;
  const bond = canon.npcBonds.find((item) => item.npcId === npcId)?.bondScore ?? 0;
  const fragments = canon.fragments.filter((fragment) => fragment.status === "active" && fragmentNpcId(fragment) === npcId);
  const fragmentScore =
    fragments.length > 0
      ? Math.max(...fragments.map((fragment) => fragment.emotionalWeight * 0.45 + fragment.salience * 0.35 + fragment.confidence * 0.2))
      : 0;
  const loopBonus = canon.loopCount > 1 ? 0.1 : 0;
  return Math.max(bond, fragmentScore, loopBonus);
}

function unique<T extends string>(items: readonly T[]): T[] {
  return [...new Set(items.filter(Boolean))];
}

function baseForbidden(revealTier: number): NpcFirstEncounterForbiddenClaim[] {
  const claims: NpcFirstEncounterForbiddenClaim[] = [
    "explicit_previous_run_memory",
    "loop_truth_full_reveal",
    "exact_death_recall",
    "canon_override",
    "current_run_fact_override",
    "official_canon_rewrite",
    "old_friend_default",
    "explicit_loop_memory",
  ];
  if (revealTier < REVEAL_TIER_RANK.abyss) claims.push("safety_level_4_expression");
  return claims;
}

function safetyLevelCap(revealTier: number): EchoSafetyLevel {
  return revealTier >= REVEAL_TIER_RANK.abyss ? 4 : 3;
}

function styleHintForPrivilege(privilege: NpcFirstEncounterEchoPlan["memoryPrivilege"]): string | null {
  switch (privilege) {
    case "normal":
      return "仍当作误闯学生";
    case "major_charm":
      return "熟悉感但不可核对";
    case "night_reader":
      return "书页/墨迹/重读隐喻";
    case "xinlan":
      return "登记停顿/名单牵引但不说破";
    default:
      return null;
  }
}

function buildPlan(args: {
  activeNpcId: string | null;
  npcId: string | null;
  memoryPrivilege: NpcFirstEncounterEchoPlan["memoryPrivilege"];
  intensity: NpcFirstEncounterEchoIntensity;
  allowedForms?: readonly NpcFirstEncounterAllowedForm[];
  forbiddenClaims: readonly NpcFirstEncounterForbiddenClaim[];
  revealTier: number;
  reason: string | null;
}): NpcFirstEncounterEchoPlan {
  return {
    schema: "npc_first_encounter_echo_plan_v1",
    activeNpcId: args.activeNpcId,
    npcId: args.npcId,
    memoryPrivilege: args.memoryPrivilege,
    intensity: args.intensity,
    strength: args.intensity,
    allowedForms: unique(args.allowedForms ?? []),
    forbiddenClaims: unique(args.forbiddenClaims),
    allowExplicitLoopMemory: false,
    revealTier: args.revealTier,
    safetyLevelCap: safetyLevelCap(args.revealTier),
    styleHint: styleHintForPrivilege(args.memoryPrivilege),
    reason: args.reason,
  };
}

function alreadyDiscovered(args: NpcFirstEncounterEchoPlanArgs, activeNpcId: string): boolean {
  const direct = snapshotDiscoveredFlag(args, activeNpcId);
  if (direct !== null) return direct;
  if (inferCurrentRunNpcDiscovered(args.snapshot, activeNpcId)) return true;
  return isDiscovered(args.currentRunDiscovered, activeNpcId);
}

export function computeNpcFirstEncounterEchoPlan(args: NpcFirstEncounterEchoPlanArgs): NpcFirstEncounterEchoPlan {
  const activeNpcId = args.activeNpcId?.trim() || null;
  const identity = args.canonIdentity;
  const npcId = identity?.npcId ?? null;
  const revealTier = revealRank(args.revealTier);
  const fallback = (reason: string | null) =>
    buildPlan({
      activeNpcId,
      npcId,
      memoryPrivilege: identity?.memoryPrivilege ?? "unknown",
      intensity: "none",
      forbiddenClaims: baseForbidden(revealTier),
      revealTier,
      reason,
    });

  if (!identity || !activeNpcId || activeNpcId !== identity.npcId) {
    return fallback("no_active_matching_npc");
  }
  if (alreadyDiscovered(args, activeNpcId)) {
    return fallback("already_discovered_in_current_run");
  }

  const privilege = identity.memoryPrivilege;
  const intensityScore = echoIntensity(args, activeNpcId);
  const forbidden = new Set<NpcFirstEncounterForbiddenClaim>(baseForbidden(revealTier));
  let intensity: NpcFirstEncounterEchoIntensity = "none";
  let allowedForms: NpcFirstEncounterAllowedForm[] = [];

  if (privilege === "normal") {
    intensity = intensityScore >= 0.45 ? "subtle" : "none";
    allowedForms = intensity === "none" ? [] : ["pause", "gesture", "sensory_deja_vu"];
    forbidden.add("known_friend_claim");
  } else if (privilege === "major_charm") {
    intensity = intensityScore >= 0.65 ? "noticeable" : "subtle";
    allowedForms = ["pause", "gesture", "misnaming", "sensory_deja_vu"];
    forbidden.add("exact_previous_run_memory");
  } else if (privilege === "night_reader") {
    intensity = "noticeable";
    allowedForms = ["pause", "metaphor", "sensory_deja_vu"];
    forbidden.add("warm_old_friend_recognition");
  } else if (privilege === "xinlan") {
    intensity = intensityScore >= 0.6 || revealTier >= REVEAL_TIER_RANK.deep ? "strong" : "noticeable";
    allowedForms = ["pause", "gesture", "registration_hesitation", "sensory_deja_vu"];
    forbidden.add("seven_keys_full_reveal");
    forbidden.add("school_root_cause_full_reveal");
  }

  return buildPlan({
    activeNpcId,
    npcId: identity.npcId,
    memoryPrivilege: privilege,
    intensity,
    allowedForms,
    forbiddenClaims: [...forbidden],
    revealTier,
    reason: null,
  });
}
