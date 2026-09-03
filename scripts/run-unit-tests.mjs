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

function runQuiet(args) {
  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd: root,
    env: process.env,
    stdio: "ignore",
  });
  return result.status ?? 1;
}

function diagnoseFailedFiles(buildArgs, files) {
  if (files.length === 1) {
    return runQuiet([...buildArgs, files[0]]) === 0 ? [] : files;
  }
  const middle = Math.ceil(files.length / 2);
  const groups = [files.slice(0, middle), files.slice(middle)].filter((group) => group.length > 0);
  const failedGroups = groups.filter((group) => runQuiet([...buildArgs, ...group]) !== 0);
  return failedGroups.flatMap((group) => diagnoseFailedFiles(buildArgs, group));
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
    if (run(shardLabel, [...buildArgs, ...shard]) !== 0) {
      failed = true;
      const failedFiles = diagnoseFailedFiles(buildArgs, shard);
      if (failedFiles.length > 0) {
        console.error(`[unit] ${shardLabel} exact failed files:\n${failedFiles.map((file) => `  - ${file}`).join("\n")}`);
      } else {
        console.error(`[unit] ${shardLabel} passed in smaller groups; failure is concurrency-sensitive or flaky.`);
      }
    }
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
