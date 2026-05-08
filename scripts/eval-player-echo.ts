import fs from "node:fs";
import path from "node:path";
import { PLAYER_ECHO_HARD_CAP_CHARS, PLAYER_ECHO_MAX_FRAGMENTS } from "../src/lib/playerEcho/constants";
import {
  PLAYER_ECHO_EVAL_CANON,
  PLAYER_ECHO_PROMPT_CASES,
  PLAYER_ECHO_VALIDATOR_CASES,
} from "../src/lib/playerEcho/__fixtures__/playerEchoCases";
import { computeNpcFirstEncounterEchoPlan } from "../src/lib/playerEcho/npcFirstEncounter";
import { buildPlayerEchoPromptBlock } from "../src/lib/playerEcho/prompt";
import { selectPlayerEchoFragments } from "../src/lib/playerEcho/select";
import { applyPlayerEchoPostGenerationValidation } from "../src/lib/playerEcho/validator";
import { getNpcCanonicalIdentity } from "../src/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "../src/lib/registry/revealTierRank";
import type {
  NpcFirstEncounterEchoPlan,
  PlayerEchoSelectionContext,
  SelectedEchoFragment,
} from "../src/lib/playerEcho/types";

type EvalResult = {
  id: string;
  category: "prompt_budget" | "first_encounter" | "validator" | "flags" | "sse_contract";
  pass: boolean;
  details?: Record<string, unknown>;
};

type EvalFlags = {
  enablePlayerEchoCanon: boolean;
  enablePlayerEchoPromptPacket: boolean;
  enablePlayerEchoValidator: boolean;
};

type EvalReport = {
  schema: "player_echo_eval_v1";
  generatedAt: string;
  cases: number;
  metrics: {
    maxPromptChars: number;
    avgPromptChars: number;
    maxSelectedFragments: number;
    promptBudgetViolations: number;
    npcFirstEncounterFailures: number;
    validatorRewriteFailures: number;
    flagsOffFailures: number;
    sseContractFailures: number;
  };
  results: EvalResult[];
  pass: boolean;
};

const ENABLED_FLAGS: EvalFlags = {
  enablePlayerEchoCanon: true,
  enablePlayerEchoPromptPacket: true,
  enablePlayerEchoValidator: true,
};

const DISABLED_FLAGS: EvalFlags = {
  enablePlayerEchoCanon: false,
  enablePlayerEchoPromptPacket: false,
  enablePlayerEchoValidator: false,
};

const OLD_FRIEND_TERMS = ["你又来了", "我记得你", "上次你"];
const ROOT_TRUTH_TERMS = ["循环真相", "七锚闭环", "B2 真相", "校源根因"];
const SSE_FRAME_MARKERS = ["__VERSECRAFT_STATUS__", "__VERSECRAFT_FINAL__", "event:", "data:"];

function parseArgs(): { jsonOut: string | null } {
  const jsonOutIndex = process.argv.indexOf("--json-out");
  return {
    jsonOut:
      jsonOutIndex >= 0 && process.argv[jsonOutIndex + 1]
        ? path.resolve(process.cwd(), process.argv[jsonOutIndex + 1])
        : null,
  };
}

function addResult(results: EvalResult[], result: EvalResult): void {
  results.push(result);
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function planForNpc(activeNpcId: string, context: PlayerEchoSelectionContext): NpcFirstEncounterEchoPlan {
  return computeNpcFirstEncounterEchoPlan({
    canonIdentity: getNpcCanonicalIdentity(activeNpcId),
    echoCanon: PLAYER_ECHO_EVAL_CANON,
    activeNpcId,
    currentRunDiscovered: [],
    revealTier: context.revealTier ?? REVEAL_TIER_RANK.surface,
  });
}

function buildPacketWithFlags(args: {
  flags: EvalFlags;
  selection: SelectedEchoFragment[];
  plan: NpcFirstEncounterEchoPlan | null;
}): string {
  if (!args.flags.enablePlayerEchoCanon || !args.flags.enablePlayerEchoPromptPacket) return "";
  return buildPlayerEchoPromptBlock(args.selection, args.plan, { maxChars: PLAYER_ECHO_HARD_CAP_CHARS });
}

function validateWithFlags(args: {
  flags: EvalFlags;
  narrative: string;
  actorNpcId: string;
  maxRevealRank: number;
  playerEchoPacketPresent: boolean;
  firstEncounterPlan: NpcFirstEncounterEchoPlan | null;
}): ReturnType<typeof applyPlayerEchoPostGenerationValidation> {
  if (!args.flags.enablePlayerEchoValidator) {
    return {
      narrative: args.narrative,
      telemetry: {
        validatorTriggered: false,
        violationTypes: [],
        violations: [],
        rewriteTriggered: false,
        rewriteReason: null,
        finalResponseSafe: true,
        source: args.playerEchoPacketPresent ? "packet" : "generic",
      },
    };
  }
  return applyPlayerEchoPostGenerationValidation({
    narrative: args.narrative,
    actorNpcId: args.actorNpcId,
    canonical: getNpcCanonicalIdentity(args.actorNpcId),
    maxRevealRank: args.maxRevealRank,
    playerEchoPacketPresent: args.playerEchoPacketPresent,
    firstEncounterPlan: args.firstEncounterPlan,
  });
}

function evaluatePromptBudget(results: EvalResult[]): { packets: string[]; promptChars: number[]; selectedCounts: number[] } {
  const packets: string[] = [];
  const promptChars: number[] = [];
  const selectedCounts: number[] = [];

  for (const promptCase of PLAYER_ECHO_PROMPT_CASES) {
    const selection = selectPlayerEchoFragments(PLAYER_ECHO_EVAL_CANON, promptCase.context);
    const plan = planForNpc(promptCase.activeNpcId, promptCase.context);
    const packet = buildPacketWithFlags({ flags: ENABLED_FLAGS, selection, plan });
    packets.push(packet);
    promptChars.push(packet.length);
    selectedCounts.push(selection.length);

    addResult(results, {
      id: promptCase.id,
      category: "prompt_budget",
      pass: packet.length <= PLAYER_ECHO_HARD_CAP_CHARS && selection.length <= PLAYER_ECHO_MAX_FRAGMENTS,
      details: {
        packetChars: packet.length,
        selectedFragments: selection.length,
        hardCap: PLAYER_ECHO_HARD_CAP_CHARS,
        maxFragments: PLAYER_ECHO_MAX_FRAGMENTS,
      },
    });
  }

  return { packets, promptChars, selectedCounts };
}

function evaluateFirstEncounter(results: EvalResult[]): void {
  const normalCase = PLAYER_ECHO_PROMPT_CASES.find((item) => item.id === "normal_resident_first_meet");
  const xinlanCase = PLAYER_ECHO_PROMPT_CASES.find((item) => item.id === "xinlan_strong_pause");
  const nightReaderCase = PLAYER_ECHO_PROMPT_CASES.find((item) => item.id === "night_reader_metaphor");

  if (normalCase) {
    const plan = planForNpc(normalCase.activeNpcId, normalCase.context);
    const packet = buildPacketWithFlags({
      flags: ENABLED_FLAGS,
      selection: selectPlayerEchoFragments(PLAYER_ECHO_EVAL_CANON, normalCase.context),
      plan,
    });
    addResult(results, {
      id: "normal_no_explicit_old_friend",
      category: "first_encounter",
      pass:
        ["none", "subtle"].includes(plan.intensity) &&
        plan.forbiddenClaims.includes("explicit_previous_run_memory") &&
        !containsAny(packet, OLD_FRIEND_TERMS),
      details: {
        intensity: plan.intensity,
        forbiddenClaims: plan.forbiddenClaims,
        packetChars: packet.length,
      },
    });
  }

  if (xinlanCase) {
    const plan = planForNpc(xinlanCase.activeNpcId, xinlanCase.context);
    const packet = buildPacketWithFlags({
      flags: ENABLED_FLAGS,
      selection: selectPlayerEchoFragments(PLAYER_ECHO_EVAL_CANON, xinlanCase.context),
      plan,
    });
    addResult(results, {
      id: "xinlan_strong_without_root_truth",
      category: "first_encounter",
      pass:
        plan.intensity === "strong" &&
        plan.allowedForms.includes("registration_hesitation") &&
        !containsAny(packet, ROOT_TRUTH_TERMS),
      details: {
        intensity: plan.intensity,
        allowedForms: plan.allowedForms,
        packetChars: packet.length,
      },
    });
  }

  if (nightReaderCase) {
    const plan = planForNpc(nightReaderCase.activeNpcId, nightReaderCase.context);
    const result = validateWithFlags({
      flags: ENABLED_FLAGS,
      narrative: "夜读老人按住书页，像按住一处反复渗出的墨迹。",
      actorNpcId: nightReaderCase.activeNpcId,
      maxRevealRank: REVEAL_TIER_RANK.deep,
      playerEchoPacketPresent: true,
      firstEncounterPlan: plan,
    });
    addResult(results, {
      id: "night_reader_metaphor_allowed",
      category: "first_encounter",
      pass: plan.allowedForms.includes("metaphor") && !result.telemetry.validatorTriggered,
      details: {
        allowedForms: plan.allowedForms,
        validatorTriggered: result.telemetry.validatorTriggered,
      },
    });
  }
}

function evaluateValidator(results: EvalResult[]): void {
  for (const validatorCase of PLAYER_ECHO_VALIDATOR_CASES) {
    const promptCase = PLAYER_ECHO_PROMPT_CASES.find((item) => item.activeNpcId === validatorCase.actorNpcId);
    const plan = promptCase ? planForNpc(promptCase.activeNpcId, promptCase.context) : null;
    const result = validateWithFlags({
      flags: ENABLED_FLAGS,
      narrative: validatorCase.narrative,
      actorNpcId: validatorCase.actorNpcId,
      maxRevealRank: validatorCase.maxRevealRank,
      playerEchoPacketPresent: validatorCase.playerEchoPacketPresent,
      firstEncounterPlan: plan,
    });
    addResult(results, {
      id: validatorCase.id,
      category: "validator",
      pass:
        result.telemetry.rewriteTriggered === validatorCase.expectRewrite &&
        (!validatorCase.expectRewrite || !containsAny(result.narrative, [...OLD_FRIEND_TERMS, ...ROOT_TRUTH_TERMS])),
      details: {
        expectedRewrite: validatorCase.expectRewrite,
        rewriteTriggered: result.telemetry.rewriteTriggered,
        violationTypes: result.telemetry.violationTypes,
      },
    });
  }
}

function evaluateFlagsOff(results: EvalResult[]): void {
  const promptCase = PLAYER_ECHO_PROMPT_CASES[0];
  const selection = selectPlayerEchoFragments(PLAYER_ECHO_EVAL_CANON, promptCase.context);
  const plan = planForNpc(promptCase.activeNpcId, promptCase.context);
  const packet = buildPacketWithFlags({ flags: DISABLED_FLAGS, selection, plan });
  addResult(results, {
    id: "flags_off_packet_empty",
    category: "flags",
    pass: packet === "",
    details: { packetChars: packet.length },
  });

  const result = validateWithFlags({
    flags: DISABLED_FLAGS,
    narrative: "普通住户说：“你又来了，我记得你上次死在七楼。”",
    actorNpcId: "N-001",
    maxRevealRank: REVEAL_TIER_RANK.surface,
    playerEchoPacketPresent: true,
    firstEncounterPlan: null,
  });
  addResult(results, {
    id: "flags_off_validator_noop",
    category: "flags",
    pass: !result.telemetry.validatorTriggered && !result.telemetry.rewriteTriggered,
    details: {
      validatorTriggered: result.telemetry.validatorTriggered,
      rewriteTriggered: result.telemetry.rewriteTriggered,
    },
  });
}

function evaluateSseContract(results: EvalResult[], packets: readonly string[]): void {
  const joined = packets.join("\n");
  addResult(results, {
    id: "player_echo_local_packets_do_not_emit_sse_frames",
    category: "sse_contract",
    pass: !containsAny(joined, SSE_FRAME_MARKERS),
    details: {
      checkedMarkers: SSE_FRAME_MARKERS,
      packetCount: packets.length,
    },
  });
}

function summarize(results: EvalResult[], promptChars: readonly number[], selectedCounts: readonly number[]): EvalReport {
  const sumPromptChars = promptChars.reduce((sum, value) => sum + value, 0);
  const byCategory = (category: EvalResult["category"]) =>
    results.filter((result) => result.category === category && !result.pass).length;
  return {
    schema: "player_echo_eval_v1",
    generatedAt: new Date().toISOString(),
    cases: results.length,
    metrics: {
      maxPromptChars: Math.max(0, ...promptChars),
      avgPromptChars: promptChars.length > 0 ? Number((sumPromptChars / promptChars.length).toFixed(2)) : 0,
      maxSelectedFragments: Math.max(0, ...selectedCounts),
      promptBudgetViolations: byCategory("prompt_budget"),
      npcFirstEncounterFailures: byCategory("first_encounter"),
      validatorRewriteFailures: byCategory("validator"),
      flagsOffFailures: byCategory("flags"),
      sseContractFailures: byCategory("sse_contract"),
    },
    results,
    pass: results.every((result) => result.pass),
  };
}

function main(): void {
  const args = parseArgs();
  const results: EvalResult[] = [];
  const { packets, promptChars, selectedCounts } = evaluatePromptBudget(results);
  evaluateFirstEncounter(results);
  evaluateValidator(results);
  evaluateFlagsOff(results);
  evaluateSseContract(results, packets);

  const report = summarize(results, promptChars, selectedCounts);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.jsonOut) {
    fs.mkdirSync(path.dirname(args.jsonOut), { recursive: true });
    fs.writeFileSync(args.jsonOut, json, "utf8");
  }
  process.stdout.write(json);
  if (!report.pass) process.exitCode = 1;
}

main();
