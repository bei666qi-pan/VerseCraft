import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();

test("package eval report paths stay under the isolated eval directory", () => {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  for (const [name, command] of Object.entries(scripts)) {
    if (!name.startsWith("eval:") && name !== "benchmark:chat:mock") continue;
    const runtimePaths = command.match(/\.runtime-data\/[^\s]+/g) ?? [];
    for (const artifactPath of runtimePaths) {
      assert.match(artifactPath, /^\.runtime-data\/eval\//, `${name} writes outside .runtime-data/eval: ${artifactPath}`);
    }
  }
});

test("playtest generators and contract fixtures do not depend on generated durable-doc traces", () => {
  for (const file of [
    "scripts/playtest-boundary.ts",
    "scripts/eval-crafter-playthrough.ts",
    "scripts/verify-playthrough-contracts.ts",
  ]) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.doesNotMatch(source, /["'`]docs\/eval(?:\/|["'`])/, `${file} writes generated output to docs/eval`);
  }
  for (const file of ["scripts/playtest-boundary.ts", "scripts/eval-crafter-playthrough.ts"]) {
    assert.match(
      readFileSync(resolve(root, file), "utf8"),
      /\.runtime-data\/eval/,
      `${file} must isolate generated output under .runtime-data/eval`,
    );
  }
});
