export const TEST_DATA_PREFIXES = Object.freeze([
  "e2e",
  "playthrough",
  "latency",
  "task-eval",
  "test",
  "benchmark",
  "narrative-safety",
  "director-eval",
  "social-world",
  "npc-consistency",
  "promptfoo",
  "chat-quality",
  "narrative-style",
  "detectors",
]);

export const TEST_DATA_MARKER_SOURCE = `^(?:${TEST_DATA_PREFIXES.join("|")})-`;

const TEST_DATA_MARKER = new RegExp(TEST_DATA_MARKER_SOURCE, "i");

export function isTestDataIdentifier(value) {
  return TEST_DATA_MARKER.test(String(value ?? ""));
}
