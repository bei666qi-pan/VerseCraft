import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildBenchmarkClientState } from "./benchmarkClientState";
import type { ChatEvalCase } from "./chatQualityRubric";

type CurrentChatTurnFixture = Omit<ChatEvalCase, "id" | "mockScenario" | "scenario"> & {
  scenario: string;
  description?: string;
  expect: Omit<ChatEvalCase["expect"], "maxNarrativeChars"> & {
    maxNarrativeChars?: number;
  };
};

const MOCK_SCENARIO_MARKER = /\[mock_scenario:([a-z0-9_]+)\]\s*/i;

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

/**
 * Mock mode exercises the current ten turn contracts. The broader legacy
 * corpus remains useful for live-model evaluation, but its exact prose and
 * option-count expectations are not a truthful assertion about a deterministic
 * mock provider.
 */
export function loadChatQualityCases(args: {
  root: string;
  mode: "mock" | "live";
}): ChatEvalCase[] {
  if (args.mode === "live") {
    return readJson<ChatEvalCase[]>(path.join(args.root, "benchmarks", "llm-evals", "cases.json"));
  }

  const fixtureDir = path.join(args.root, "benchmarks", "chat-turns");
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => readJson<CurrentChatTurnFixture>(path.join(fixtureDir, name)))
    .map((fixture) => {
      const marker = fixture.latestUserInput.match(MOCK_SCENARIO_MARKER);
      return {
        id: fixture.scenario,
        scenario: fixture.description ?? fixture.scenario,
        latestUserInput: fixture.latestUserInput.replace(MOCK_SCENARIO_MARKER, "").trim(),
        playerContext: fixture.playerContext,
        clientState: buildBenchmarkClientState(fixture.clientState),
        mockScenario: marker?.[1] ?? "normal_stream",
        expect: {
          ...fixture.expect,
          maxNarrativeChars: fixture.expect.maxNarrativeChars ?? 1_400,
        },
      } satisfies ChatEvalCase;
    });
}
