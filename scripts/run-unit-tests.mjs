import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(absolutePath)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(absolutePath);
    }
  }

  return files;
}

const sourceRoot = path.join(process.cwd(), "src");
const testFiles = (await collectTestFiles(sourceRoot)).sort();
const nodeTestFiles = [];
const vitestFiles = [];

for (const file of testFiles) {
  const source = await readFile(file, "utf8");
  if (/from\s+["']vitest["']|require\(\s*["']vitest["']\s*\)/.test(source)) {
    vitestFiles.push(file);
  } else {
    nodeTestFiles.push(file);
  }
}

function run(command, args) {
  const serverOnlyShim = path.join(process.cwd(), "scripts/register-server-only-test-shim.cjs");
  const nodeOptions = [process.env.NODE_OPTIONS, `--require=${serverOnlyShim}`]
    .filter(Boolean)
    .join(" ");
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (nodeTestFiles.length > 0) {
  run("pnpm", [
    "exec",
    "tsx",
    "--test",
    "--test-force-exit",
    ...nodeTestFiles,
  ]);
}

if (vitestFiles.length > 0) {
  run("pnpm", ["exec", "vitest", "run", ...vitestFiles]);
}
