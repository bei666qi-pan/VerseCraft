import fs from "node:fs";
import path from "node:path";
import { buildSceneActorGate, compactSceneActorGatePacket, type SceneActorGateResult } from "../src/lib/playRealtime/sceneActorGate";
import { buildMultiNpcCompactPersonaPacketObject } from "../src/lib/playRealtime/multiNpcPersonaPackets";
import { checkModelOutput } from "../src/lib/narrativeEngine/checker";
import type { ModelOutputSchema } from "../src/lib/narrativeEngine/schema";
import type { DialogueContext } from "../src/lib/narrativeEngine/types";
import { getNpcCanonicalIdentity } from "../src/lib/registry/npcCanon";
import { REVEAL_TIER_RANK } from "../src/lib/registry/revealTierRank";

type EvalMode = "mock" | "live";

type CliOptions = {
  mode: EvalMode;
  assert: boolean;
  jsonOut: string | null;
  jsonOnly: boolean;
  casesPath: string;
};

type NpcConsistencyEvalCase = {
  id: string;
  description?: string;
  playerContext: string;
  latestUserInput: string;
  playerLocation?: string | null;
  controlTarget?: string | null;
  relationshipHints?: string[];
  remoteContactNpcIds?: string[];
  personaNpcIds?: string[];
  sceneAppearanceAlreadyWrittenIds?: string[];
  expect: {
    focusNpcId?: string | null;
    multiPresentNoFocus?: boolean;
    presentNpcIds?: string[];
    canSpeakNpcIds?: string[];
    modeByNpcId?: Record<string, string>;
    noSpeakNpcIds?: string[];
    forbiddenFocusNpcIds?: string[];
    unauthorizedRelationshipNpcIds?: string[];
    ordinaryNpcIdsNoOldFriend?: string[];
    deepTruthLockedNpcIds?: string[];
    distinctPersonaPairs?: string[][];
    appearanceAlreadyWrittenNpcIds?: string[];
    packetMaxChars?: number;
  };
};

type NpcConsistencyFixture = {
  npcConsistencyCases?: NpcConsistencyEvalCase[];
  cases?: NpcConsistencyEvalCase[];
};

type CaseResult = {
  id: string;
  focusNpcId: string | null;
  presentNpcIds: string[];
  canSpeakNpcIds: string[];
  modeByNpcId: Record<string, string>;
  sceneActorPacketChars: number;
  failures: string[];
};

type EvalSummary = {
  mode: EvalMode;
  cases: number;
  offscreenLiveDialogue: number;
  wrongFocus: number;
  personaMixup: number;
  unauthorizedRelationshipUpdate: number;
  avgSceneActorPacketChars: number;
  maxSceneActorPacketChars: number;
  pass: boolean;
  results: CaseResult[];
};

const root = path.resolve(__dirname, "..");
const defaultCasesPath = path.join(root, "benchmarks", "chat-turns", "npc_consistency_gate.json");

function getArgValue(args: string[], name: string): string | null {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  return null;
}

function parseCli(): CliOptions {
  const args = process.argv.slice(2);
  const rawMode = (getArgValue(args, "--mode") ?? process.env.VC_EVAL_NPC_CONSISTENCY_MODE ?? "mock")
    .trim()
    .toLowerCase();
  return {
    mode: rawMode === "live" ? "live" : "mock",
    assert: args.includes("--assert") || process.env.VC_EVAL_NPC_CONSISTENCY_ASSERT === "1",
    jsonOut: getArgValue(args, "--json-out") ?? process.env.VC_EVAL_NPC_CONSISTENCY_JSON_OUT ?? null,
    jsonOnly: args.includes("--json-only"),
    casesPath: getArgValue(args, "--cases") ?? process.env.VC_EVAL_NPC_CONSISTENCY_CASES ?? defaultCasesPath,
  };
}

function log(options: CliOptions, message: string): void {
  if (!options.jsonOnly) console.log(message);
}

function loadCases(casesPath: string): NpcConsistencyEvalCase[] {
  const fixture = JSON.parse(fs.readFileSync(path.resolve(casesPath), "utf8")) as NpcConsistencyFixture;
  const cases = fixture.npcConsistencyCases ?? fixture.cases ?? [];
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error(`No npc consistency cases found in ${casesPath}`);
  }
  return cases;
}

function writeJson(pathName: string | null, result: unknown): void {
  if (!pathName) return;
  const resolved = path.resolve(pathName);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function normalizeNpcId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^N-(\d{3,6})$/i);
  return match ? `N-${match[1]}` : null;
}

function pushUnique<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

function extractNpcIds(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(/\bN-\d{3,6}\b/gi)) {
    const id = normalizeNpcId(match[0]);
    if (id) pushUnique(out, id);
  }
  return out;
}

function parseNpcPositions(playerContext: string): Array<{ npcId: string; location: string }> {
  const out: Array<{ npcId: string; location: string }> = [];
  for (const match of playerContext.matchAll(/\b(N-\d{3,6})@([A-Za-z0-9_-]+)\b/gi)) {
    const npcId = normalizeNpcId(match[1]);
    const location = String(match[2] ?? "").trim();
    if (npcId && location) out.push({ npcId, location });
  }
  return out;
}

function containsAll(actual: string[], expected: string[]): boolean {
  return expected.every((item) => actual.includes(item));
}

function stringList(value: readonly string[] | undefined): string[] {
  return (value ?? []).map((item) => String(item ?? "").trim()).filter(Boolean);
}

function buildGate(testCase: NpcConsistencyEvalCase): SceneActorGateResult {
  return buildSceneActorGate({
    playerContext: testCase.playerContext,
    latestUserInput: testCase.latestUserInput,
    playerLocation: testCase.playerLocation ?? null,
    controlTarget: testCase.controlTarget ?? null,
    relationshipHints: testCase.relationshipHints ?? [],
    remoteContactNpcIds: testCase.remoteContactNpcIds ?? [],
  });
}

function buildCheckerContext(testCase: NpcConsistencyEvalCase, gate: SceneActorGateResult): DialogueContext {
  const knownNpcIds = [
    ...parseNpcPositions(testCase.playerContext).map((row) => row.npcId),
    ...extractNpcIds(JSON.stringify(testCase)),
  ];
  const allowedEntityIds = [
    gate.currentLocation ?? "B1_SafeZone",
    "fact:known",
    "world:rule:npc-consistency",
    ...knownNpcIds,
  ].filter(Boolean);
  const activeNpcId = gate.focusNpcId ?? gate.canSpeakNpcIds[0] ?? gate.presentNpcIds[0] ?? null;
  const activeCanon = activeNpcId ? getNpcCanonicalIdentity(activeNpcId) : null;
  return {
    requestId: `eval_npc_${testCase.id}`,
    sessionId: `eval_npc_${testCase.id}`,
    userId: null,
    player: {
      locationId: gate.currentLocation ?? null,
      time: { day: 1, hour: 8 },
      stats: { sanity: 80 },
      inventoryIds: [],
      currentProfession: null,
      knownFactIds: ["fact:known"],
      discoveredClueIds: [],
    },
    chapter: {
      chapterId: "eval-npc-consistency",
      title: "NPC consistency eval",
      status: "active",
      sceneId: gate.currentLocation ?? null,
      phase: "eval",
      promise: null,
      mainQuestion: null,
      emotionalTone: null,
      mustEchoSummaries: [],
      unresolvedThreads: [],
      forbiddenRevealIds: [],
      closePolicy: null,
      writerInstruction: null,
      objective: null,
      completedBeatIds: [],
      allowedEventIds: [],
      blockedEventIds: [],
    },
    activeNpc: activeNpcId
      ? {
          npcId: activeNpcId,
          displayName: activeCanon?.canonicalName ?? activeNpcId,
          forbiddenFactIds: [],
        }
      : null,
    npcMemories: [],
    world: {
      worldId: "base_apartment",
      loreFacts: [
        {
          factKey: "world:rule:npc-consistency",
          canonicalText: "NPCs must obey scene actor permissions.",
          layer: "core",
          tags: ["npc_consistency"],
        },
      ],
      hardRules: ["NPCs must obey scene actor permissions."],
      allowedEntityIds: [...new Set(allowedEntityIds)],
      forbiddenFactIds: [],
      revealTier: 1,
    },
    recentEvents: [],
    rawCompatibility: {
      playerContext: testCase.playerContext,
      clientState: null,
    },
  };
}

function relationshipUpdateOutput(npcId: string): ModelOutputSchema {
  return {
    narrative: "你停在原地，没有让离场角色直接改写关系。",
    turnMode: "decision_required",
    decisionOptions: ["继续观察"],
    stateChanges: {
      relationshipUpdates: [{ npcId, delta: 1 }],
    },
    eventCandidates: [
      {
        type: "player_action",
        actorType: "player",
        actorId: "player",
        summary: "Player asked a scene-bound NPC consistency question.",
        payload: {},
      },
    ],
    revealAttempts: ["fact:known"],
    consistencyNotes: [],
  };
}

function checkUnauthorizedRelationship(testCase: NpcConsistencyEvalCase, gate: SceneActorGateResult, failures: string[]): boolean {
  let leaked = false;
  for (const npcId of stringList(testCase.expect.unauthorizedRelationshipNpcIds)) {
    const result = checkModelOutput({
      output: relationshipUpdateOutput(npcId),
      context: buildCheckerContext(testCase, gate),
      sceneActorGate: gate,
      logFailures: false,
    });
    const blocked = result.issues.some((issue) => issue.code === "scene_actor_gate_relationship_unauthorized");
    if (!blocked) {
      leaked = true;
      failures.push(`unauthorized_relationship_update:${npcId}`);
    }
  }
  return leaked;
}

function checkPersona(testCase: NpcConsistencyEvalCase, gate: SceneActorGateResult, failures: string[]): boolean {
  let failed = false;
  const positions = parseNpcPositions(testCase.playerContext);
  const personaNpcIds = stringList(testCase.personaNpcIds);
  const needsPersona =
    personaNpcIds.length > 0 ||
    stringList(testCase.expect.ordinaryNpcIdsNoOldFriend).length > 0 ||
    stringList(testCase.expect.deepTruthLockedNpcIds).length > 0 ||
    (testCase.expect.distinctPersonaPairs ?? []).length > 0 ||
    stringList(testCase.expect.appearanceAlreadyWrittenNpcIds).length > 0;

  const persona = needsPersona
    ? buildMultiNpcCompactPersonaPacketObject({
        npcIds: personaNpcIds.length > 0 ? personaNpcIds : gate.presentNpcIds,
        npcPositions: positions,
        currentLocation: gate.currentLocation,
        sceneAppearanceAlreadyWrittenIds: stringList(testCase.sceneAppearanceAlreadyWrittenIds),
        maxCards: 4,
      })
    : null;

  const cardById = new Map((persona?.cards ?? []).map((card) => [card.id, card]));

  for (const id of stringList(testCase.expect.ordinaryNpcIdsNoOldFriend)) {
    const canon = getNpcCanonicalIdentity(id);
    const leakTerms = ["旧友", "老友", "childhood friends", "protected me for years"];
    if (canon.memoryPrivilege !== "normal" || leakTerms.some((term) => canon.baselineViewOfPlayer.includes(term))) {
      failed = true;
      failures.push(`old_friend_leak:${id}`);
    }
  }

  for (const id of stringList(testCase.expect.deepTruthLockedNpcIds)) {
    const canon = getNpcCanonicalIdentity(id);
    if (canon.memoryPrivilege === "normal" && canon.revealTierCap >= REVEAL_TIER_RANK.deep) {
      failed = true;
      failures.push(`loop_truth_unlocked:${id}`);
    }
  }

  for (const pair of testCase.expect.distinctPersonaPairs ?? []) {
    const [a, b] = pair.map((id) => normalizeNpcId(id)).filter((id): id is string => Boolean(id));
    if (!a || !b) continue;
    const cardA = cardById.get(a);
    const cardB = cardById.get(b);
    const canonA = getNpcCanonicalIdentity(a);
    const canonB = getNpcCanonicalIdentity(b);
    if (!cardA || !cardB) {
      failed = true;
      failures.push(`persona_card_missing:${a}:${b}`);
      continue;
    }
    const aText = [cardA.appearance_short, cardA.speech_pattern, cardA.public_role].join("\n");
    const bText = [cardB.appearance_short, cardB.speech_pattern, cardB.public_role].join("\n");
    if (
      cardA.name !== canonA.canonicalName ||
      cardB.name !== canonB.canonicalName ||
      cardA.speech_pattern === cardB.speech_pattern ||
      cardA.appearance_short === cardB.appearance_short ||
      aText.includes(canonB.canonicalName) ||
      bText.includes(canonA.canonicalName)
    ) {
      failed = true;
      failures.push(`persona_mixup:${a}:${b}`);
    }
  }

  for (const id of stringList(testCase.expect.appearanceAlreadyWrittenNpcIds)) {
    const card = cardById.get(id);
    if (!card || card.first_appearance_rule !== "already_written") {
      failed = true;
      failures.push(`appearance_reintroduced:${id}`);
    }
  }

  return failed;
}

function evaluateCase(testCase: NpcConsistencyEvalCase): {
  result: CaseResult;
  offscreenLiveDialogue: number;
  wrongFocus: number;
  personaMixup: number;
  unauthorizedRelationshipUpdate: number;
} {
  const gate = buildGate(testCase);
  const packet = compactSceneActorGatePacket(gate, testCase.expect.packetMaxChars ?? 1200);
  const packetChars = JSON.stringify(packet).length;
  const failures: string[] = [];

  let offscreenLiveDialogue = 0;
  let wrongFocus = 0;
  let personaMixup = 0;
  let unauthorizedRelationshipUpdate = 0;

  if ("focusNpcId" in testCase.expect && gate.focusNpcId !== testCase.expect.focusNpcId) {
    wrongFocus += 1;
    failures.push(`wrong_focus:${gate.focusNpcId ?? "null"}!=${testCase.expect.focusNpcId ?? "null"}`);
  }
  if (
    testCase.expect.multiPresentNoFocus !== undefined &&
    gate.ambiguity.multiPresentNoFocus !== testCase.expect.multiPresentNoFocus
  ) {
    wrongFocus += 1;
    failures.push(`wrong_ambiguity:${gate.ambiguity.multiPresentNoFocus ? 1 : 0}`);
  }
  for (const id of stringList(testCase.expect.forbiddenFocusNpcIds)) {
    if (gate.focusNpcId === id) {
      wrongFocus += 1;
      failures.push(`forbidden_focus:${id}`);
    }
  }
  if (testCase.expect.presentNpcIds && !containsAll(gate.presentNpcIds, testCase.expect.presentNpcIds)) {
    wrongFocus += 1;
    failures.push(`missing_present:${testCase.expect.presentNpcIds.filter((id) => !gate.presentNpcIds.includes(id)).join(",")}`);
  }
  if (testCase.expect.canSpeakNpcIds && !containsAll(gate.canSpeakNpcIds, testCase.expect.canSpeakNpcIds)) {
    wrongFocus += 1;
    failures.push(`missing_can_speak:${testCase.expect.canSpeakNpcIds.filter((id) => !gate.canSpeakNpcIds.includes(id)).join(",")}`);
  }
  for (const [id, mode] of Object.entries(testCase.expect.modeByNpcId ?? {})) {
    if (gate.modeByNpcId[id] !== mode) {
      wrongFocus += 1;
      failures.push(`wrong_mode:${id}:${gate.modeByNpcId[id] ?? "missing"}!=${mode}`);
    }
  }
  for (const id of stringList(testCase.expect.noSpeakNpcIds)) {
    if (gate.canSpeakNpcIds.includes(id)) {
      offscreenLiveDialogue += 1;
      failures.push(`offscreen_live_dialogue:${id}`);
    }
  }

  if (packetChars > (testCase.expect.packetMaxChars ?? 1200)) {
    failures.push(`scene_actor_packet_chars:${packetChars}`);
  }

  if (checkUnauthorizedRelationship(testCase, gate, failures)) unauthorizedRelationshipUpdate += 1;
  if (checkPersona(testCase, gate, failures)) personaMixup += 1;

  return {
    result: {
      id: testCase.id,
      focusNpcId: gate.focusNpcId,
      presentNpcIds: gate.presentNpcIds,
      canSpeakNpcIds: gate.canSpeakNpcIds,
      modeByNpcId: gate.modeByNpcId,
      sceneActorPacketChars: packetChars,
      failures,
    },
    offscreenLiveDialogue,
    wrongFocus,
    personaMixup,
    unauthorizedRelationshipUpdate,
  };
}

function summarize(mode: EvalMode, results: ReturnType<typeof evaluateCase>[]): EvalSummary {
  const caseResults = results.map((row) => row.result);
  const packetChars = caseResults.map((row) => row.sceneActorPacketChars);
  const offscreenLiveDialogue = results.reduce((sum, row) => sum + row.offscreenLiveDialogue, 0);
  const wrongFocus = results.reduce((sum, row) => sum + row.wrongFocus, 0);
  const personaMixup = results.reduce((sum, row) => sum + row.personaMixup, 0);
  const unauthorizedRelationshipUpdate = results.reduce((sum, row) => sum + row.unauthorizedRelationshipUpdate, 0);
  const maxSceneActorPacketChars = Math.max(0, ...packetChars);
  const avgSceneActorPacketChars =
    packetChars.length > 0 ? Number((packetChars.reduce((sum, value) => sum + value, 0) / packetChars.length).toFixed(1)) : 0;
  return {
    mode,
    cases: results.length,
    offscreenLiveDialogue,
    wrongFocus,
    personaMixup,
    unauthorizedRelationshipUpdate,
    avgSceneActorPacketChars,
    maxSceneActorPacketChars,
    pass:
      offscreenLiveDialogue === 0 &&
      wrongFocus === 0 &&
      personaMixup === 0 &&
      unauthorizedRelationshipUpdate === 0 &&
      maxSceneActorPacketChars <= 1200,
    results: caseResults,
  };
}

async function main(): Promise<void> {
  const options = parseCli();
  if (options.mode === "live" && process.env.E2E_AI_LIVE !== "1") {
    console.error("Live NPC consistency eval requires E2E_AI_LIVE=1.");
    process.exitCode = 1;
    return;
  }

  const cases = loadCases(options.casesPath);
  log(options, `Running NPC consistency eval: mode=${options.mode} cases=${cases.length}`);
  const evaluated = cases.map(evaluateCase);
  for (const row of evaluated) {
    log(
      options,
      `  ${row.result.id}: focus=${row.result.focusNpcId ?? "null"} packetChars=${row.result.sceneActorPacketChars}${
        row.result.failures.length > 0 ? ` failures=${row.result.failures.join(",")}` : ""
      }`
    );
  }
  const summary = summarize(options.mode, evaluated);
  log(
    options,
    `summary: cases=${summary.cases} offscreen=${summary.offscreenLiveDialogue} wrongFocus=${summary.wrongFocus} persona=${summary.personaMixup} unauthorizedRel=${summary.unauthorizedRelationshipUpdate} packetMax=${summary.maxSceneActorPacketChars} gate=${summary.pass ? "pass" : "fail"}`
  );
  writeJson(options.jsonOut, summary);
  if (options.jsonOnly) console.log(JSON.stringify(summary, null, 2));
  if (options.assert && !summary.pass) process.exitCode = 1;
}

void main();
