import { applySocialGmDeltas } from "@/lib/socialWorld/applyDeltas";
import { createInMemorySocialWorldPersistence } from "@/lib/socialWorld/persistence";
import { buildSocialWorldHintBlockWithMeta, loadSocialWorldHintForPrompt } from "@/lib/socialWorld/prompt";
import { createEmptyNpcAgentState, normalizeNpcRelationEdge, normalizeSocialEvent } from "@/lib/socialWorld/state";
import type {
  NpcAgentState,
  NpcRelationEdge,
  SocialEvent,
  SocialWorldBudget,
} from "@/lib/socialWorld/types";
import type { DirectorRiskAssessment, DirectorSocialEvent, NpcAgentPatch, NpcRelationDelta } from "@/lib/worldEngine/contracts";

export type SocialWorldEvalExpectation = {
  acceptedEventCodes?: string[];
  rejectedEventCodes?: string[];
  rejectionCodesInclude?: string[];
  projectedEventCodes?: string[];
  projectedCount?: number;
  relationEdge?: {
    fromNpcId: string;
    toNpcId: string;
    minSuspicion?: number;
    minTrust?: number;
    minFear?: number;
    minDebt?: number;
    minResentment?: number;
  };
  agentState?: {
    npcId: string;
    status?: NpcAgentState["status"];
    agendaIncludes?: string;
    forbiddenRevealIncludes?: string;
  };
  sanitizedVisibility?: Record<string, SocialEvent["visibility"]>;
  memorySpineKind?: string;
  failOpen?: boolean;
};

export type SocialWorldEvalCase = {
  id: string;
  description: string;
  sessionId?: string;
  userId?: string | null;
  turnIndex?: number;
  dedupKey?: string;
  playerLocationId?: string | null;
  knownNpcIds?: string[];
  seedNpcStates?: Array<Partial<NpcAgentState> & { npcId: string }>;
  seedRelationEdges?: Array<Partial<NpcRelationEdge> & { fromNpcId: string; toNpcId: string }>;
  directorSocialEvents?: DirectorSocialEvent[];
  npcRelationDeltas?: NpcRelationDelta[];
  npcAgentPatches?: NpcAgentPatch[];
  riskAssessment?: DirectorRiskAssessment | null;
  budget?: Partial<SocialWorldBudget> | null;
  cooldownTurns?: number;
  failPersistenceQuery?: boolean;
  expect: SocialWorldEvalExpectation;
};

export type SocialWorldEvalCaseResult = {
  id: string;
  acceptedEventCodes: string[];
  rejectedEventCodes: string[];
  rejectionCodes: string[];
  projectedEventCodes: string[];
  promptChars: number;
  failures: string[];
};

export type SocialWorldEvalMetrics = {
  case_count: number;
  accepted_count: number;
  rejected_count: number;
  rejection_by_code: Record<string, number>;
  projected_count: number;
  leaked_must_not_reveal_count: number;
  prompt_budget_violation_count: number;
  private_projection_count: number;
};

export type SocialWorldEvalReport = {
  metrics: SocialWorldEvalMetrics;
  cases: SocialWorldEvalCaseResult[];
  failures: Array<{ id: string; errors: string[] }>;
};

function asStringArray(value: readonly string[] | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

function addCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function seedState(raw: Partial<NpcAgentState> & { npcId: string }, nowTurn: number): NpcAgentState {
  return {
    ...createEmptyNpcAgentState(raw.npcId, nowTurn),
    ...raw,
    agenda: raw.agenda ?? [],
    knownFactIds: raw.knownFactIds ?? [],
    suspectedFactIds: raw.suspectedFactIds ?? [],
    forbiddenRevealIds: raw.forbiddenRevealIds ?? [],
  };
}

function collectForbiddenTerms(testCase: SocialWorldEvalCase): string[] {
  const terms: string[] = [];
  for (const event of testCase.directorSocialEvents ?? []) {
    terms.push(...asStringArray(event.must_not_reveal));
  }
  for (const patch of testCase.npcAgentPatches ?? []) {
    terms.push(...asStringArray(patch.must_not_reveal));
  }
  return unique(terms);
}

function containsAny(text: string, needles: readonly string[]): string[] {
  const lower = text.toLowerCase();
  return needles.filter((needle) => needle && lower.includes(needle.toLowerCase()));
}

function assertArrayEquals(actual: readonly string[], expected: readonly string[] | undefined, label: string): string[] {
  if (!expected) return [];
  const got = [...actual].sort();
  const want = [...expected].sort();
  return JSON.stringify(got) === JSON.stringify(want) ? [] : [`${label} expected ${want.join(",")} got ${got.join(",")}`];
}

function assertIncludes(actual: readonly string[], expected: readonly string[] | undefined, label: string): string[] {
  const failures: string[] = [];
  for (const item of expected ?? []) {
    if (!actual.includes(item)) failures.push(`${label} missing ${item}`);
  }
  return failures;
}

function relationExpectationFailures(edges: readonly NpcRelationEdge[], expectation: SocialWorldEvalExpectation): string[] {
  const want = expectation.relationEdge;
  if (!want) return [];
  const edge = edges.find((item) => item.fromNpcId === want.fromNpcId && item.toNpcId === want.toNpcId);
  if (!edge) return [`relation edge missing ${want.fromNpcId}->${want.toNpcId}`];
  const failures: string[] = [];
  if (want.minSuspicion != null && edge.suspicion < want.minSuspicion) failures.push("relation suspicion too low");
  if (want.minTrust != null && edge.trust < want.minTrust) failures.push("relation trust too low");
  if (want.minFear != null && edge.fear < want.minFear) failures.push("relation fear too low");
  if (want.minDebt != null && edge.debt < want.minDebt) failures.push("relation debt too low");
  if (want.minResentment != null && edge.resentment < want.minResentment) failures.push("relation resentment too low");
  return failures;
}

function agentExpectationFailures(states: readonly NpcAgentState[], expectation: SocialWorldEvalExpectation): string[] {
  const want = expectation.agentState;
  if (!want) return [];
  const state = states.find((item) => item.npcId === want.npcId);
  if (!state) return [`agent state missing ${want.npcId}`];
  const failures: string[] = [];
  if (want.status && state.status !== want.status) failures.push(`agent status expected ${want.status} got ${state.status}`);
  if (want.agendaIncludes && !state.agenda.some((item) => item.summary.includes(want.agendaIncludes))) {
    failures.push(`agent agenda missing ${want.agendaIncludes}`);
  }
  if (want.forbiddenRevealIncludes && !state.forbiddenRevealIds.includes(want.forbiddenRevealIncludes)) {
    failures.push(`agent forbiddenRevealIds missing ${want.forbiddenRevealIncludes}`);
  }
  return failures;
}

export async function runSocialWorldEvalCases(cases: readonly SocialWorldEvalCase[]): Promise<SocialWorldEvalReport> {
  const metrics: SocialWorldEvalMetrics = {
    case_count: cases.length,
    accepted_count: 0,
    rejected_count: 0,
    rejection_by_code: {},
    projected_count: 0,
    leaked_must_not_reveal_count: 0,
    prompt_budget_violation_count: 0,
    private_projection_count: 0,
  };
  const caseResults: SocialWorldEvalCaseResult[] = [];
  const failures: Array<{ id: string; errors: string[] }> = [];

  for (const testCase of cases) {
    const errors: string[] = [];
    const sessionId = testCase.sessionId ?? `eval_${testCase.id}`;
    const turnIndex = Math.max(0, Math.trunc(testCase.turnIndex ?? 10));
    const persistence = createInMemorySocialWorldPersistence();

    if (testCase.seedNpcStates?.length) {
      await persistence.upsertNpcAgentStates(
        sessionId,
        testCase.seedNpcStates.map((state) => seedState(state, turnIndex))
      );
    }
    if (testCase.seedRelationEdges?.length) {
      await persistence.upsertNpcRelationEdges(
        sessionId,
        testCase.seedRelationEdges.map((edge) => normalizeNpcRelationEdge(edge))
      );
    }

    let acceptedEventCodes: string[] = [];
    let rejectedEventCodes: string[] = [];
    let rejectionCodes: string[] = [];
    let acceptedEvents: SocialEvent[] = [];
    let promptBlock = "";
    let projectedEventCodes: string[] = [];

    if (testCase.failPersistenceQuery) {
      const failOpen = await loadSocialWorldHintForPrompt({
        sessionId,
        nowTurn: turnIndex,
        loadDueSocialEventsForPrompt: async () => {
          throw new Error("eval injected persistence failure");
        },
      });
      promptBlock = failOpen.block;
      if (testCase.expect.failOpen && failOpen.socialProjectionSkippedReason !== "query_failed") {
        errors.push(`failOpen expected query_failed got ${failOpen.socialProjectionSkippedReason}`);
      }
    } else {
      const result = await applySocialGmDeltas({
        sessionId,
        userId: testCase.userId ?? null,
        turnIndex,
        dedupKey: testCase.dedupKey ?? `eval-${testCase.id}`,
        playerLocationId: testCase.playerLocationId ?? null,
        directorSocialEvents: testCase.directorSocialEvents ?? [],
        npcRelationDeltas: testCase.npcRelationDeltas ?? [],
        npcAgentPatches: testCase.npcAgentPatches ?? [],
        riskAssessment: testCase.riskAssessment ?? null,
        knownNpcIds: testCase.knownNpcIds ?? null,
        budget: testCase.budget ?? null,
        cooldownTurns: testCase.cooldownTurns,
        persistence,
      });
      acceptedEvents = result.acceptedEvents;
      acceptedEventCodes = [...result.acceptedEventCodes];
      rejectedEventCodes = [...result.rejectedEventCodes];
      rejectionCodes = result.issues.filter((issue) => issue.severity === "error").map((issue) => issue.code);
      metrics.accepted_count += acceptedEventCodes.length;
      metrics.rejected_count += rejectedEventCodes.length;
      for (const code of rejectionCodes) addCount(metrics.rejection_by_code, code);

      const due = await persistence.loadDueSocialEventsForPrompt(sessionId, turnIndex, 2);
      const hint = buildSocialWorldHintBlockWithMeta(due, { budget: testCase.budget ?? null, maxItems: 2 });
      promptBlock = hint.block;
      projectedEventCodes = hint.projectedEventIds;
      metrics.projected_count += hint.projectedEventIds.length;

      for (const id of hint.projectedEventIds) {
        const event = acceptedEvents.find((item) => item.id === id) ?? normalizeSocialEvent({});
        if (event.visibility === "private") metrics.private_projection_count += 1;
      }

      const states = await persistence.loadNpcAgentStates(sessionId);
      const edges = await persistence.loadNpcRelationEdges(sessionId);
      errors.push(...relationExpectationFailures(edges, testCase.expect));
      errors.push(...agentExpectationFailures(states, testCase.expect));

      if (testCase.expect.sanitizedVisibility) {
        for (const [eventCode, expectedVisibility] of Object.entries(testCase.expect.sanitizedVisibility)) {
          const event = acceptedEvents.find((item) => item.id === eventCode);
          if (!event) errors.push(`sanitized event missing ${eventCode}`);
          else if (event.visibility !== expectedVisibility) {
            errors.push(`visibility ${eventCode} expected ${expectedVisibility} got ${event.visibility}`);
          }
        }
      }
      if (testCase.expect.memorySpineKind) {
        const hasKind = result.memorySpineEntries.some((entry) => entry.kind === testCase.expect.memorySpineKind);
        if (!hasKind) errors.push(`memorySpineKind missing ${testCase.expect.memorySpineKind}`);
      }
    }

    const forbiddenHits = containsAny(promptBlock, collectForbiddenTerms(testCase));
    if (forbiddenHits.length > 0) {
      metrics.leaked_must_not_reveal_count += forbiddenHits.length;
      errors.push(`prompt leaked mustNotReveal: ${forbiddenHits.join(",")}`);
    }
    if (promptBlock.length > 420 || projectedEventCodes.length > 2) {
      metrics.prompt_budget_violation_count += 1;
      errors.push(`prompt budget exceeded chars=${promptBlock.length} projected=${projectedEventCodes.length}`);
    }

    errors.push(...assertArrayEquals(acceptedEventCodes, testCase.expect.acceptedEventCodes, "acceptedEventCodes"));
    errors.push(...assertArrayEquals(rejectedEventCodes, testCase.expect.rejectedEventCodes, "rejectedEventCodes"));
    errors.push(...assertIncludes(rejectionCodes, testCase.expect.rejectionCodesInclude, "rejection code"));
    errors.push(...assertArrayEquals(projectedEventCodes, testCase.expect.projectedEventCodes, "projectedEventCodes"));
    if (testCase.expect.projectedCount != null && projectedEventCodes.length !== testCase.expect.projectedCount) {
      errors.push(`projectedCount expected ${testCase.expect.projectedCount} got ${projectedEventCodes.length}`);
    }

    const caseResult: SocialWorldEvalCaseResult = {
      id: testCase.id,
      acceptedEventCodes,
      rejectedEventCodes,
      rejectionCodes,
      projectedEventCodes,
      promptChars: promptBlock.length,
      failures: errors,
    };
    caseResults.push(caseResult);
    if (errors.length > 0) failures.push({ id: testCase.id, errors });
  }

  if (metrics.leaked_must_not_reveal_count !== 0) {
    failures.push({ id: "hard_gate:must_not_reveal", errors: ["leaked_must_not_reveal_count must be 0"] });
  }
  if (metrics.prompt_budget_violation_count !== 0) {
    failures.push({ id: "hard_gate:prompt_budget", errors: ["prompt_budget_violation_count must be 0"] });
  }
  if (metrics.private_projection_count !== 0) {
    failures.push({ id: "hard_gate:private_projection", errors: ["private_projection_count must be 0"] });
  }

  return { metrics, cases: caseResults, failures };
}
