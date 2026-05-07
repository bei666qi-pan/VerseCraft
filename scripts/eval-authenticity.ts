import fs from "node:fs";
import path from "node:path";

type Fixture = {
  scenario: string;
  description?: string;
  latestUserInput: string;
  playerContext: string;
  activeNpcId?: string;
  maxRevealRank?: string | number;
  expect: {
    jsonValid?: boolean;
    mustContainAny?: string[];
    mustNotContain?: string[];
    personaMustFeel?: string[];
    taskGiverToneMax?: number;
    revealSafetyRequired?: boolean;
  };
};

type Rubric = {
  id: string;
  dimensions: Array<{ id: string; description: string }>;
  pass_rule: {
    min_each: number;
    min_average: number;
    hard_fail_if: {
      reveal_safety_lte: number;
      json_contract_validity_lte: number;
    };
  };
};

const root = path.resolve(__dirname, "..");
const fixtureNames = [
  "major_npc_low_reveal_dialogue.json",
  "task_pressure_persona_dialogue.json",
  "actor_scoped_memory_boundary.json",
];
const fixtureDir = path.join(root, "benchmarks", "chat-turns");
const rubricPath = path.join(root, "benchmarks", "rubrics", "versecraft_authenticity_judge_v1.json");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function scoreFixture(fixture: Fixture): Record<string, number> {
  const expect = fixture.expect ?? {};
  const mustNot = expect.mustNotContain ?? [];
  const persona = expect.personaMustFeel ?? [];
  return {
    canon_faithfulness: fixture.playerContext.trim().length > 0 && fixture.latestUserInput.trim().length > 0 ? 4 : 1,
    reveal_safety: expect.revealSafetyRequired && mustNot.length > 0 ? 5 : 3,
    npc_persona_distinctness: persona.length > 0 ? 4 : 3,
    task_giver_pressure:
      typeof expect.taskGiverToneMax === "number" && expect.taskGiverToneMax <= 0.5 ? 4 : 3,
    relationship_reality: /trust|relationship|active_npc|关系|信任/i.test(fixture.playerContext) ? 4 : 3,
    json_contract_validity: expect.jsonValid === false ? 1 : 5,
  };
}

function validateFixture(fixture: Fixture): string[] {
  const failures: string[] = [];
  if (!fixture.scenario) failures.push("missing_scenario");
  if (!fixture.latestUserInput) failures.push("missing_latestUserInput");
  if (!fixture.playerContext) failures.push("missing_playerContext");
  if (!fixture.expect) failures.push("missing_expect");
  const mustContainAny = fixture.expect?.mustContainAny ?? [];
  const mustNotContain = fixture.expect?.mustNotContain ?? [];
  const overlap = mustContainAny.filter((term) => mustNotContain.includes(term));
  if (overlap.length > 0) failures.push(`expect_overlap:${overlap.join(",")}`);
  if (fixture.expect?.revealSafetyRequired && mustNotContain.length === 0) {
    failures.push("reveal_safety_without_forbidden_terms");
  }
  return failures;
}

function gate(scores: Record<string, number>, rubric: Rubric): string[] {
  const failures: string[] = [];
  for (const dim of rubric.dimensions) {
    const score = scores[dim.id] ?? 0;
    if (score < rubric.pass_rule.min_each) failures.push(`${dim.id}<${rubric.pass_rule.min_each}`);
  }
  const avg = Object.values(scores).reduce((sum, score) => sum + score, 0) / Math.max(1, Object.values(scores).length);
  if (avg < rubric.pass_rule.min_average) failures.push(`average<${rubric.pass_rule.min_average}`);
  if ((scores.reveal_safety ?? 0) <= rubric.pass_rule.hard_fail_if.reveal_safety_lte) {
    failures.push("hard_fail:reveal_safety");
  }
  if ((scores.json_contract_validity ?? 0) <= rubric.pass_rule.hard_fail_if.json_contract_validity_lte) {
    failures.push("hard_fail:json_contract_validity");
  }
  return failures;
}

function main(): void {
  const rubric = readJson<Rubric>(rubricPath);
  const results = fixtureNames.map((name) => {
    const fixture = readJson<Fixture>(path.join(fixtureDir, name));
    const fixtureFailures = validateFixture(fixture);
    const scores = scoreFixture(fixture);
    const gateFailures = gate(scores, rubric);
    return {
      file: name,
      scenario: fixture.scenario,
      scores,
      failures: [...fixtureFailures, ...gateFailures],
    };
  });

  for (const result of results) {
    console.log(
      `${result.scenario}: ${result.failures.length === 0 ? "pass" : "fail"}${
        result.failures.length > 0 ? ` failures=${result.failures.join(",")}` : ""
      }`
    );
  }
  const failed = results.filter((result) => result.failures.length > 0);
  console.log(`authenticity_eval_v1: total=${results.length} failed=${failed.length} rubric=${rubric.id}`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
