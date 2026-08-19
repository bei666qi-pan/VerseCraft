import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTestFiles(path);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
    })
    .sort();
}

const testFiles = collectTestFiles(sourceRoot).map((path) => relative(root, path));
const vitestImport = /(?:from\s*|require\(\s*)["']vitest["']/;
const vitestFiles = [];
const nodeFiles = [];

for (const file of testFiles) {
  const source = readFileSync(join(root, file), "utf8");
  (vitestImport.test(source) ? vitestFiles : nodeFiles).push(file);
}

function run(label, args) {
  if (args.length === 0) return 0;
  process.stdout.write(`\n[unit] ${label}\n`);
  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`[unit] ${label} could not start:`, result.error);
    return 1;
  }
  return result.status ?? 1;
}

console.log(
  `[unit] discovered ${testFiles.length} files (${nodeFiles.length} node:test, ${vitestFiles.length} vitest)`,
);

const nodeStatus = run("node:test", [
  "tsx",
  "--import",
  "./scripts/test-unit-node-setup.mjs",
  "--test",
  "--test-force-exit",
  "--test-concurrency=8",
  ...nodeFiles,
]);
const vitestStatus = run("vitest", ["vitest", "run", ...vitestFiles]);

if (nodeStatus !== 0 || vitestStatus !== 0) {
  process.exitCode = 1;
}
