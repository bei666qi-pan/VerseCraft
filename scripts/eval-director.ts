import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { detectWorldEngineTriggers, parseWorldEngineDeltaJson } from "@/lib/worldEngine/contracts";
import { validateDirectorPlan } from "@/lib/worldEngine/validator";

type RiskPatch = Partial<{
  agency_risk: "low" | "medium" | "high";
  continuity_risk: "low" | "medium" | "high";
  spoiler_risk: "low" | "medium" | "high";
  safety_risk: "low" | "medium" | "high";
}>;

type DirectorEvalCase = {
  id: string;
  objective: string;
  triggerContext?: Record<string, unknown>;
  candidate?: {
    raw?: string;
    event_code?: string;
    current_phase?: string;
    target_phase?: string;
    reveal_policy?: string;
    risk?: RiskPatch;
    trigger_conditions?: string[];
    injection_hint?: string;
    agency_constraints?: string[];
    forbidden_outcomes?: string[];
    npc_action?: Record<string, unknown>;
    duplicate?: boolean;
    omit_injection_hint?: boolean;
    omit_agency_constraints?: boolean;
  };
  expect: {
    triggersInclude?: string[];
    triggersExclude?: string[];
    parseOk?: boolean;
    accepted?: boolean;
    agendaWriteAllowed?: boolean;
    acceptedEventCodes?: string[];
    issuesInclude?: string[];
    droppedEvent?: boolean;
  };
};

function buildCandidateRaw(testCase: DirectorEvalCase): string {
  const candidate = testCase.candidate ?? {};
  if (typeof candidate.raw === "string") return candidate.raw;

  const eventCode = candidate.event_code ?? `EV_${testCase.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
  const baseEvent = {
    event_code: eventCode,
    title: `director eval ${testCase.id}`,
    due_in_turns: 1,
    ttl_turns: 4,
    priority: "medium",
    salience: 0.7,
    trigger_conditions: candidate.trigger_conditions ?? ["only when the scene context naturally supports it"],
    ...(!candidate.omit_injection_hint
      ? {
          injection_hint:
            candidate.injection_hint ??
            "introduce a small observable detail that gives the player a reversible next step",
        }
      : {}),
    ...(!candidate.omit_agency_constraints
      ? { agency_constraints: candidate.agency_constraints ?? ["player can ignore, avoid, or reinterpret it"] }
      : {}),
    forbidden_outcomes: candidate.forbidden_outcomes ?? ["do not force failure", "do not reveal hidden truth"],
    payload: { eval_case_id: testCase.id },
  };

  const events = candidate.duplicate ? [baseEvent, { ...baseEvent }] : [baseEvent];
  return JSON.stringify({
    schema_version: "director_plan_v1",
    director_intent: `Evaluate ${testCase.objective}`,
    current_phase: candidate.current_phase ?? "quiet",
    target_phase: candidate.target_phase ?? "build_up",
    pacing_assessment: {
      tension: 0.35,
      mystery: 0.65,
      fatigue: 0.2,
      progress: 0.4,
      agency_health: 0.85,
      reveal_pressure: 0.45,
    },
    risk_assessment: {
      agency_risk: candidate.risk?.agency_risk ?? "low",
      continuity_risk: candidate.risk?.continuity_risk ?? "low",
      spoiler_risk: candidate.risk?.spoiler_risk ?? "low",
      safety_risk: candidate.risk?.safety_risk ?? "low",
    },
    reveal_policy: candidate.reveal_policy ?? "hint_only",
    npc_next_actions: candidate.npc_action ? [candidate.npc_action] : [],
    world_events_to_schedule: events,
    story_branch_seeds: [],
    consistency_warnings: [],
    player_private_hooks: [],
  });
}

function assertIncludes(actual: readonly string[], expected: readonly string[], label: string): string[] {
  const failures: string[] = [];
  for (const x of expected) {
    if (!actual.includes(x)) failures.push(`${label} missing ${x}`);
  }
  return failures;
}

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixturePath = path.resolve(here, "../src/lib/worldEngine/__fixtures__/directorEvalCases.json");
  const cases = JSON.parse(await readFile(fixturePath, "utf8")) as DirectorEvalCase[];
  const failures: Array<{ id: string; errors: string[] }> = [];
  let accepted = 0;
  let rejected = 0;
  let parsedCount = 0;

  for (const testCase of cases) {
    const errors: string[] = [];
    if (testCase.triggerContext) {
      const triggers = [
        ...detectWorldEngineTriggers(testCase.triggerContext as Parameters<typeof detectWorldEngineTriggers>[0]),
      ];
      errors.push(...assertIncludes(triggers, testCase.expect.triggersInclude ?? [], "trigger"));
      for (const x of testCase.expect.triggersExclude ?? []) {
        if (triggers.includes(x)) errors.push(`trigger should not include ${x}`);
      }
    }

    const parsed = parseWorldEngineDeltaJson(buildCandidateRaw(testCase));
    const expectParseOk = testCase.expect.parseOk ?? true;
    if (expectParseOk !== Boolean(parsed)) {
      errors.push(`parseOk expected ${expectParseOk} got ${Boolean(parsed)}`);
    }

    if (parsed) {
      parsedCount += 1;
      if (
        typeof testCase.expect.agendaWriteAllowed === "boolean" &&
        parsed.agenda_write_allowed !== testCase.expect.agendaWriteAllowed
      ) {
        errors.push(
          `agendaWriteAllowed expected ${testCase.expect.agendaWriteAllowed} got ${parsed.agenda_write_allowed}`
        );
      }
      if (testCase.expect.droppedEvent && parsed.world_events_to_schedule.length !== 0) {
        errors.push(`expected parser to drop agenda events, got ${parsed.world_events_to_schedule.length}`);
      }

      const validation = validateDirectorPlan(parsed);
      if (validation.accepted) accepted += 1;
      else rejected += 1;
      if (typeof testCase.expect.accepted === "boolean" && validation.accepted !== testCase.expect.accepted) {
        errors.push(`accepted expected ${testCase.expect.accepted} got ${validation.accepted}`);
      }
      if (testCase.expect.acceptedEventCodes) {
        const got = validation.acceptedEventCodes.slice().sort();
        const want = testCase.expect.acceptedEventCodes.slice().sort();
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          errors.push(`acceptedEventCodes expected ${want.join(",")} got ${got.join(",")}`);
        }
      }
      const issueCodes = validation.issues.map((x) => x.code);
      errors.push(...assertIncludes(issueCodes, testCase.expect.issuesInclude ?? [], "issue"));
    }

    if (errors.length > 0) failures.push({ id: testCase.id, errors });
  }

  const summary = {
    cases: cases.length,
    parsed: parsedCount,
    accepted,
    rejected,
    failures: failures.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (cases.length < 20) {
    failures.push({ id: "fixture_count", errors: [`expected at least 20 cases, got ${cases.length}`] });
  }
  if (failures.length > 0) {
    console.error(JSON.stringify({ failures }, null, 2));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
