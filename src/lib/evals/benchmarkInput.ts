export type BenchmarkInputMode = "mock" | "live" | "degraded" | "fixtures";

const MOCK_SCENARIO_PREFIX = /^\[mock_scenario:([a-z0-9_]+)\]\s*/i;

/**
 * Keeps a fixture reusable in mock and live modes without allowing a fixture's
 * mock marker to silently turn a live HTTP probe into a mock request.
 */
export function buildBenchmarkPlayerInput(args: {
  input: string;
  mode: BenchmarkInputMode;
  mockScenario?: string;
}): string {
  const embedded = args.input.match(MOCK_SCENARIO_PREFIX);
  const plainInput = embedded ? args.input.slice(embedded[0].length) : args.input;
  if (args.mode !== "mock") return plainInput;
  const scenario = args.mockScenario ?? embedded?.[1];
  return scenario ? `[mock_scenario:${scenario}] ${plainInput}` : plainInput;
}
