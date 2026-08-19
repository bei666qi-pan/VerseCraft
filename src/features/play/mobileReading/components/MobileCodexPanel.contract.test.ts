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

test("Xingni codex renders a Qingshi people scope instead of Dark Moon floor and anomaly filters", () => {
  const source = readFileSync(join(process.cwd(), "src/features/play/mobileReading/components/MobileCodexPanel.tsx"), "utf8");
  assert.match(source, /mobile-codex-xingni-scope/);
  assert.match(source, /青石县 · 八方人物志/);
  assert.match(source, /const catalogSlots = useMemo\(\(\) => getCodexCatalogSlots\(worldId\)/);
});

test("codex card strip centers the selected discovered entry", () => {
  const source = readFileSync(join(process.cwd(), "src/features/play/mobileReading/components/MobileCodexPanel.tsx"), "utf8");
  assert.match(source, /const cardStripRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(source, /card\.offsetLeft - \(strip\.clientWidth - card\.clientWidth\) \/ 2/);
  assert.match(source, /ref=\{cardStripRef\}/);
});
