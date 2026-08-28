import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("loading page renders exactly one logo spinner", () => {
  const source = readFileSync(join(process.cwd(), "src/app/loading.tsx"), "utf8");

  assert.equal(
    source.includes("VerseCraftPaperMark"),
    false,
    "loading page must not render a second static logo"
  );
  assert.equal(
    source.match(/<VcSpinner\b/g)?.length ?? 0,
    1,
    "loading page must render exactly one logo spinner"
  );
  assert.match(source, /data-testid="versecraft-loading-page"/);
  assert.match(source, /正在翻开下一页/);
});
