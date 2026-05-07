#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { CoolifyClient } from "./lib/coolify.mjs";
import { runHealthcheck } from "./lib/healthcheck.mjs";
import {
  AUTOOPS_RUNTIME_DIR,
  loadLocalEnvFiles,
  logJson,
  parseArgs,
  readJsonIfExists,
  writeRuntimeJson,
  writeRuntimeText,
} from "./lib/logger.mjs";

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return String(error.stdout || error.stderr || error.message).trim();
  }
}

async function readEventPayload() {
  if (process.env.GITHUB_EVENT_PATH && existsSync(process.env.GITHUB_EVENT_PATH)) {
    const event = await readJsonIfExists(process.env.GITHUB_EVENT_PATH, {});
    return event.client_payload || event.inputs || event;
  }
  return {};
}

async function readRuntimeFiles() {
  const out = {};
  try {
    const files = await readdir(AUTOOPS_RUNTIME_DIR);
    for (const file of files) {
      if (!file.endsWith(".json") && !file.endsWith(".md") && !file.endsWith(".log")) {
        continue;
      }
      const fullPath = path.join(AUTOOPS_RUNTIME_DIR, file);
      out[file] = (await readFile(fullPath, "utf8")).slice(0, 12000);
    }
  } catch {
    return out;
  }
  return out;
}

async function maybeCoolifyEvidence() {
  if (!process.env.COOLIFY_API_KEY || !process.env.COOLIFY_BASE_URL) {
    return { skipped: "missing Coolify API configuration" };
  }
  try {
    const client = new CoolifyClient();
    const deployments = await client.deployments();
    return { deployments: deployments.slice(0, 8) };
  } catch (error) {
    return { error: error.message };
  }
}

function renderPrompt(evidence) {
  return `# VerseCraft Auto-Ops Local Codex Repair Task

You are working in the local repository \`bei666qi-pan/VerseCraft\` on \`main\`. This project does not use \`OPENAI_API_KEY\`, and GitHub Actions must not run cloud Codex. Code repair is executed by local Codex Pro / local Codex CLI.

Prefer the smallest compatible fix. First decide whether this is a code problem. If it is not a code problem, update a runbook, workflow guard, or incident note instead of forcing a business-code change.

## Incident payload

\`\`\`json
${JSON.stringify(evidence.incident_payload, null, 2)}
\`\`\`

## Runtime evidence summary

\`\`\`json
${JSON.stringify(evidence.summary, null, 2)}
\`\`\`

## Healthcheck

\`\`\`json
${JSON.stringify(evidence.healthcheck, null, 2)}
\`\`\`

## Coolify evidence

\`\`\`json
${JSON.stringify(evidence.coolify, null, 2).slice(0, 16000)}
\`\`\`

## Volcengine ECS Cloud Assistant result

\`\`\`json
${String(evidence.runtime_files["volc-command-result.json"] || "not collected").slice(0, 16000)}
\`\`\`

## Repository scripts

\`\`\`json
${JSON.stringify(evidence.package_scripts, null, 2)}
\`\`\`

## Recent commits

\`\`\`
${evidence.recent_commits}
\`\`\`

## Guardrails

- Preserve \`/api/chat\` SSE and JSON contracts.
- Preserve Next.js 16 async API rules, the single game store, and analytics compatibility.
- Do not introduce \`OPENAI_API_KEY\` or cloud Codex execution.
- Do not commit runtime artifacts, generated secrets, env files, logs, zips, private keys, or tokens.

## Validation

Run at least:

\`\`\`bash
pnpm lint
pnpm test:unit
pnpm db:check:optional
pnpm build
pnpm autoops:self-test
\`\`\`

If changes touch \`/api/chat\`, \`/play\`, admin, or e2e selectors, add the matching targeted e2e instead of running all e2e by default.
`;
}

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const incidentPayload = args.payload
    ? JSON.parse(args.payload)
    : args.payloadFile
      ? await readJsonIfExists(args.payloadFile, {})
      : await readEventPayload();
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const healthcheck = await runHealthcheck({ attempts: Number(args.healthAttempts || 1), timeoutMs: 5000 }).catch((error) => ({
    ok: false,
    error: error.message,
  }));
  const evidence = {
    collected_at: new Date().toISOString(),
    incident_payload: incidentPayload,
    summary: {
      branch: run("git branch --show-current"),
      status: run("git status --short"),
      head: run("git rev-parse --short HEAD"),
      node: run("node -v"),
      pnpm: run("pnpm -v"),
    },
    package_scripts: packageJson.scripts || {},
    recent_commits: run("git log --oneline -12"),
    healthcheck,
    coolify: await maybeCoolifyEvidence(),
    runtime_files: await readRuntimeFiles(),
  };
  await writeRuntimeJson("runtime-evidence.json", evidence);
  const prompt = renderPrompt(evidence);
  await writeRuntimeText("codex-prompt.md", prompt);
  logJson("autoops.evidence.collected", { incident_key: incidentPayload.incident_key, prompt_path: ".ops/autoops/runtime/codex-prompt.md" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
