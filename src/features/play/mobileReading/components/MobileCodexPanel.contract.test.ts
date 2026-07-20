import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("unknown codex portrait cards keep the silhouette free of centered type text", () => {
  const source = readFileSync(join(process.cwd(), "src/features/play/mobileReading/components/MobileCodexPanel.tsx"), "utf8");
  assert.match(source, /<CodexUnknownPortrait\s*\/>/);
  assert.doesNotMatch(source, /localizedCodexClassification/);
  assert.doesNotMatch(source, /classificationLabel/);
});
