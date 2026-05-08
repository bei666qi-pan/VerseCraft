import { REVEAL_TIER_RANK } from "@/lib/registry/revealTierRank";
import type { NpcCanonicalIdentity } from "@/lib/registry/types";
import type { NpcFirstEncounterEchoPlan } from "./types";

export type PlayerEchoViolationType =
  | "player_echo_normal_npc_overreach"
  | "player_echo_reveal_overreach"
  | "player_echo_canon_override";

export type PlayerEchoValidationTelemetry = {
  validatorTriggered: boolean;
  violationTypes: PlayerEchoViolationType[];
  violations: string[];
  rewriteTriggered: boolean;
  rewriteReason: PlayerEchoViolationType | null;
  finalResponseSafe: boolean;
  source: "packet" | "generic";
};

export type PlayerEchoPostGenerationValidationArgs = {
  narrative: string;
  actorNpcId: string | null;
  canonical: NpcCanonicalIdentity | null | undefined;
  maxRevealRank: number;
  playerEchoPacketPresent: boolean;
  firstEncounterPlan?: NpcFirstEncounterEchoPlan | null;
};

export type PlayerEchoPostGenerationValidationResult = {
  narrative: string;
  telemetry: PlayerEchoValidationTelemetry;
};

const NORMAL_NPC_OVERREACH_RE = /你又来了|上次你|我记得你|你死在|上一轮|轮回真相/;
const REVEAL_OVERREACH_RE = /循环真相|轮回真相|七锚闭环|B2\s*真相|校源根因/;
const EXACT_LOOP_MEMORY_RE = /(?:完整|全部|全都|清楚|清清楚楚).{0,8}(?:记得|知道).{0,16}(?:每一轮|每个周目|所有轮回|上一轮|上次)/;
const ONE_BREATH_ROOT_RE = /(?:根因|校源根因|七锚闭环|循环真相|轮回真相).{0,16}(?:就是|全貌|完整|说尽|答案)/;
const CURRENT_RUN_OVERRIDE_RE =
  /(?:上次|上一轮|上一周目).{0,40}(?:死在|死亡|死了).{0,40}(?:导致|所以|因此).{0,40}(?:本轮|这次|现在).{0,24}(?:已经死|已死|死了|不在了)/;

function idleTelemetry(source: "packet" | "generic"): PlayerEchoValidationTelemetry {
  return {
    validatorTriggered: false,
    violationTypes: [],
    violations: [],
    rewriteTriggered: false,
    rewriteReason: null,
    finalResponseSafe: true,
    source,
  };
}

function compactName(canonical: NpcCanonicalIdentity | null | undefined, fallback: string | null): string {
  const name = canonical?.canonicalName?.trim();
  if (name) return name;
  return fallback?.trim() || "对方";
}

function addViolation(
  hit: Set<PlayerEchoViolationType>,
  logs: string[],
  type: PlayerEchoViolationType,
  detail: string
): void {
  hit.add(type);
  logs.push(`${type}:${detail}`);
}

function rewritePlayerEchoOverreach(args: {
  narrative: string;
  actorNpcId: string | null;
  canonical: NpcCanonicalIdentity | null | undefined;
  violationTypes: readonly PlayerEchoViolationType[];
}): string {
  const name = compactName(args.canonical, args.actorNpcId);
  const privilege = args.canonical?.memoryPrivilege ?? "normal";
  const hasDeathHint = /死在|死亡|死了|七楼|高处/.test(args.narrative);

  if (args.violationTypes.includes("player_echo_normal_npc_overreach")) {
    const caution = hasDeathHint ? "高处风硬，别乱跑。" : "这里的人来来去去，别把错觉当路标。";
    return `我看见${name}的动作停了一下。${name}看了看我的袖口，只把声音压低：“${caution}”`;
  }

  if (privilege === "xinlan") {
    return `我看见${name}在登记簿前停了一瞬，笔尖没有立刻落下。那点熟悉感像被名单牵住，又很快被她压回纸面：“先把眼前的路走稳。”`;
  }

  if (privilege === "night_reader") {
    return `我看见${name}把书页轻轻压住，像按住一处重复渗出的墨迹。他没有解释，只把那一页翻过去。`;
  }

  return `我看见${name}的话头停在半空，像被某个错觉擦过。片刻后，${name}只提醒我先看清眼前。`;
}

export function applyPlayerEchoPostGenerationValidation(
  args: PlayerEchoPostGenerationValidationArgs
): PlayerEchoPostGenerationValidationResult {
  const narrative = String(args.narrative ?? "");
  const source = args.playerEchoPacketPresent ? "packet" : "generic";
  if (!narrative.trim() || !args.actorNpcId || !args.canonical) {
    return { narrative, telemetry: idleTelemetry(source) };
  }

  const privilege = args.canonical.memoryPrivilege;
  const maxRevealRank = Number.isFinite(args.maxRevealRank) ? Math.trunc(args.maxRevealRank) : REVEAL_TIER_RANK.surface;
  const planForbidsExplicitMemory =
    args.firstEncounterPlan?.forbiddenClaims.includes("explicit_previous_run_memory") ?? true;
  const hit = new Set<PlayerEchoViolationType>();
  const violations: string[] = [];

  if (privilege === "normal" && NORMAL_NPC_OVERREACH_RE.test(narrative)) {
    addViolation(hit, violations, "player_echo_normal_npc_overreach", args.actorNpcId);
  }

  if (
    (maxRevealRank < REVEAL_TIER_RANK.abyss && REVEAL_OVERREACH_RE.test(narrative)) ||
    (planForbidsExplicitMemory && EXACT_LOOP_MEMORY_RE.test(narrative)) ||
    ONE_BREATH_ROOT_RE.test(narrative)
  ) {
    addViolation(hit, violations, "player_echo_reveal_overreach", `${args.actorNpcId}:rank_${maxRevealRank}`);
  }

  if (CURRENT_RUN_OVERRIDE_RE.test(narrative)) {
    addViolation(hit, violations, "player_echo_canon_override", args.actorNpcId);
  }

  const violationTypes = [...hit];
  if (violationTypes.length === 0) {
    return { narrative, telemetry: idleTelemetry(source) };
  }

  const rewritten = rewritePlayerEchoOverreach({
    narrative,
    actorNpcId: args.actorNpcId,
    canonical: args.canonical,
    violationTypes,
  });

  return {
    narrative: rewritten,
    telemetry: {
      validatorTriggered: true,
      violationTypes,
      violations,
      rewriteTriggered: rewritten !== narrative,
      rewriteReason: violationTypes[0] ?? null,
      finalResponseSafe: true,
      source,
    },
  };
}
