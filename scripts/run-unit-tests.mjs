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

function run(label, args, files = []) {
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
  if ((result.status ?? 1) !== 0 && files.length > 0) {
    console.error(`[unit] ${label} failed files:\n${files.map((file) => `  - ${file}`).join("\n")}`);
  }
  return result.status ?? 1;
}

function chunk(files, size) {
  const out = [];
  for (let index = 0; index < files.length; index += size) out.push(files.slice(index, index + size));
  return out;
}

function runShards(label, files, buildArgs, shardSize) {
  const shards = chunk(files, shardSize);
  let failed = false;
  shards.forEach((shard, index) => {
    const shardLabel = `${label} shard ${index + 1}/${shards.length} (${shard.length} files)`;
    if (run(shardLabel, [...buildArgs, ...shard], shard) !== 0) failed = true;
  });
  return failed ? 1 : 0;
}

console.log(
  `[unit] discovered ${testFiles.length} files (${nodeFiles.length} node:test, ${vitestFiles.length} vitest)`,
);

const nodeStatus = runShards("node:test", nodeFiles, [
  "tsx",
  "--import",
  "./scripts/test-unit-node-setup.mjs",
  "--test",
  "--test-force-exit",
  "--test-concurrency=4",
], 64);
const vitestStatus = runShards("vitest", vitestFiles, ["vitest", "run"], 64);

if (nodeStatus !== 0 || vitestStatus !== 0) {
  process.exitCode = 1;
}
