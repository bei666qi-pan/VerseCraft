import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("live playthrough runner remains alive until it writes evidence or reports failure", () => {
  const source = readFileSync("scripts/eval-playthrough-live.ts", "utf8");
  assert.match(source, /const mainLiveness = setInterval\(\(\) => undefined, 1_000\)/);
  assert.match(source, /\.finally\(\(\) => clearInterval\(mainLiveness\)\)/);
  assert.match(source, /process\.exitCode = 1/);
});
