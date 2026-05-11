#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAgentRunner } from "./lib/agent-runner.mjs";
import { CoolifyClient, discoverCoolifyAppUuid } from "./lib/coolify.mjs";
import { GitHubClient } from "./lib/github.mjs";
import { runHealthcheck } from "./lib/healthcheck.mjs";
import {
  AUTOOPS_RUNTIME_DIR,
  ensureRuntimeDir,
  loadLocalEnvFiles,
  logJson,
  parseArgs,
  writeRuntimeJson,
  writeRuntimeText,
} from "./lib/logger.mjs";

const SENSITIVE_PATH_RE = /(^|\/|\\)(\.env($|\.)|.*generated-secrets.*|.*secret.*|.*token.*|.*\.pem$|.*private.*|.*\.key$|.*\.zip$)/i;

function run(command, { allowFail = false, timeoutMs = 10 * 60 * 1000 } = {}) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    }).trim();
  } catch (error) {
    const output = String(error.stdout || error.stderr || error.message).trim();
    if (allowFail) {
      return output;
    }
    const wrapped = new Error(`Command failed: ${command}\n${output}`);
    wrapped.output = output;
    throw wrapped;
  }
}

function statusShort() {
  return run("git status --short", { allowFail: true });
}

function changedFiles() {
  const diff = run("git diff --name-only", { allowFail: true });
  const untracked = run("git ls-files --others --exclude-standard", { allowFail: true });
  return [...new Set([...diff.split(/\r?\n/), ...untracked.split(/\r?\n/)].map((item) => item.trim()).filter(Boolean))];
}

function artifactAndEvidenceLinks(text) {
  const urls = [...String(text || "").matchAll(/https:\/\/github\.com\/[^\s)]+|https:\/\/api\.github\.com\/[^\s)]+/g)].map((match) => match[0]);
  const runIds = [...String(text || "").matchAll(/\/actions\/runs\/(\d+)/g)].map((match) => match[1]);
  return { urls: [...new Set(urls)], runIds: [...new Set(runIds)] };
}

async function artifactLinksForRuns(client, runIds = []) {
  const artifacts = [];
  for (const runId of runIds) {
    try {
      const result = await client.request(
        "GET",
        `/repos/${client.repoInfo.owner}/${client.repoInfo.repo}/actions/runs/${runId}/artifacts?per_page=50`
      );
      for (const artifact of result.artifacts || []) {
        artifacts.push({
          run_id: runId,
          name: artifact.name,
          archive_download_url: artifact.archive_download_url,
          expired: artifact.expired,
        });
      }
    } catch (error) {
      artifacts.push({ run_id: runId, error: error.message });
    }
  }
  return artifacts;
}

async function selectIssue(client, args) {
  if (args.issue) {
    return client.getIssue(args.issue);
  }
  const query = `repo:${client.repoInfo.fullName} is:issue is:open label:auto-ops label:codex-needed label:incident`;
  const result = await client.searchIssues(query);
  return result.items?.[0] || null;
}

async function buildLocalTask({ issue, comments, artifacts }) {
  await ensureRuntimeDir();
  const existingPrompt = path.join(AUTOOPS_RUNTIME_DIR, "codex-prompt.md");
  const promptText = existsSync(existingPrompt) ? await readFile(existingPrompt, "utf8") : "";
  const bodyAndComments = [issue.body || "", ...comments.map((comment) => comment.body || "")].join("\n\n--- comment ---\n\n");
  const links = artifactAndEvidenceLinks(bodyAndComments);
  const task = `# Local Agent Auto-Ops Task

Issue: #${issue.number} ${issue.title}
Issue URL: ${issue.html_url}

## Priority

Use the local evidence prompt below if present. If evidence is missing, use the issue body, comments, and artifact links.

## Existing local evidence prompt

${promptText || "_No local .ops/autoops/runtime/codex-prompt.md exists._"}

## Issue body and comments

${bodyAndComments.slice(0, 40000)}

## Artifact and evidence links

\`\`\`json
${JSON.stringify({ urls: links.urls, artifacts }, null, 2)}
\`\`\`

## Required behavior

- Do not use OPENAI_API_KEY.
- Do not introduce cloud Codex execution in GitHub Actions.
- Make the smallest compatible code, workflow, runbook, or documentation fix.
- Preserve VerseCraft /api/chat SSE and JSON contracts.
- Do not commit runtime artifacts, generated secrets, env files, zips, private keys, tokens, or logs.
- After editing, the runner will validate and push if requested.
`;
  const taskPath = await writeRuntimeText("local-agent-task.md", task);
  return { taskPath, task };
}

function runLocalCodex(task, args) {
  // Backward-compatible wrapper: use agent runner under the hood.
  return runAgent(task, args);
}

async function runAgent(task, args) {
  const agentType = args.agent || "claude";
  const runner = createAgentRunner(agentType, {
    commandOverride: process.env.AUTOOPS_CODEX_COMMAND,
  });

  if (args.dryRun) {
    logJson("autoops.agent.dry_run", {
      agent: runner.name,
      prompt_written: ".ops/autoops/runtime/local-agent-task.md",
    });
    return { executed: false, dryRun: true, agent: runner.name };
  }

  logJson("autoops.agent.starting", {
    agent: runner.name,
    timeout_ms: Number(args.agentTimeoutMs || 45 * 60 * 1000),
  });

  const result = await runner.run(task, {
    timeoutMs: Number(args.agentTimeoutMs || 45 * 60 * 1000),
  });

  await writeRuntimeJson("local-agent-execution.json", result);
  logJson("autoops.agent.completed", {
    agent: runner.name,
    executed: result.executed,
    exit_code: result.exitCode,
    duration_ms: result.durationMs,
    unavailable: result.unavailable,
  });

  return result;
}

function validationCommandsFor(files) {
  const commands = ["pnpm lint", "pnpm test:unit", "pnpm db:check:optional", "pnpm build", "pnpm autoops:self-test"];
  const changed = files.join("\n");
  if (/src[\/\\]app[\/\\]api[\/\\]chat|src[\/\\]lib[\/\\]playRealtime|src[\/\\]lib[\/\\]chatQueue|e2e[\/\\]chat|benchmark-chat|eval-chat/.test(changed)) {
    commands.push("pnpm test:e2e:contract");
  }
  if (/src[\/\\]app[\/\\]play|src[\/\\]features[\/\\]play|e2e[\/\\]play|mobile-reading|chapter/.test(changed)) {
    commands.push("pnpm exec playwright test e2e/play-open.spec.ts --project=chromium");
  }
  if (/src[\/\\]app[\/\\]admin|src[\/\\]lib[\/\\]analytics|e2e[\/\\]admin/.test(changed)) {
    commands.push("pnpm test:admin:api");
  }
  return commands;
}

async function validate(files) {
  const commands = validationCommandsFor(files);
  const results = [];
  for (const command of commands) {
    const started = Date.now();
    try {
      run(command, { timeoutMs: 30 * 60 * 1000 });
      results.push({ command, ok: true, duration_ms: Date.now() - started });
    } catch (error) {
      results.push({ command, ok: false, duration_ms: Date.now() - started, output: error.output || error.message });
      await writeRuntimeJson("local-agent-validation.json", { ok: false, results });
      return { ok: false, results };
    }
  }
  await writeRuntimeJson("local-agent-validation.json", { ok: true, results });
  return { ok: true, results };
}

function assertNoSensitiveStaged() {
  const staged = run("git diff --cached --name-only", { allowFail: true })
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const bad = staged.filter((file) => SENSITIVE_PATH_RE.test(file.replace(/\\/g, "/")) || file.startsWith(".ops/autoops/runtime/"));
  if (bad.length) {
    run(`git reset -- ${bad.map((file) => `"${file}"`).join(" ")}`, { allowFail: true });
    throw new Error(`Refusing to commit sensitive/runtime files: ${bad.join(", ")}`);
  }
  return staged;
}

async function deployIfRequested() {
  const mode = process.env.AUTOOPS_DEPLOY_MODE || "observe";
  if (mode !== "api") {
    return { mode, skipped: "observe mode; existing CI/Gitee/Coolify chain is expected to deploy" };
  }
  const uuid = process.env.COOLIFY_APP_UUID || (await discoverCoolifyAppUuid()).uuid;
  const client = new CoolifyClient();
  const deploy = await client.deploy(uuid, { force: true });
  return { mode, deploy };
}

export async function processIssue(client, issue, args) {
  const comments = await client.listIssueComments(issue.number);
  const links = artifactAndEvidenceLinks([issue.body || "", ...comments.map((comment) => comment.body || "")].join("\n"));
  const artifacts = await artifactLinksForRuns(client, links.runIds);
  const { task, taskPath } = await buildLocalTask({ issue, comments, artifacts });
  const agentType = args.agent || "claude";
  logJson("autoops.agent.task_ready", { issue: issue.number, task_path: taskPath, agent: agentType });

  const agentResult = runLocalCodex(task, args);
  await writeRuntimeJson("local-agent-execution.json", agentResult);
  if (!agentResult.executed) {
    const reason = agentResult.unavailable
      ? `Agent "${agentResult.agent || agentType}" is not available: ${agentResult.reason || "unknown"}`
      : agentResult.reason || "dry-run";
    const message = [
      "Local agent runner prepared the repair prompt but did not execute.",
      `Agent: \`${agentResult.agent || agentType}\``,
      `Reason: ${reason}`,
      "",
      `Prompt: \`${taskPath}\``,
      "",
      "Run manually, then rerun:",
      "",
      "```bash",
      `pnpm autoops:local-codex -- --issue ${issue.number} --push-main --agent ${agentType}`,
      "```",
    ].join("\n");
    await client.addIssueComment(issue.number, message);
    logJson("autoops.agent.needs_manual", { issue: issue.number, task_path: taskPath, agent: agentResult.agent || agentType, reason });
    return { ok: false, manual: true };
  }

  const files = changedFiles();
  await writeRuntimeJson("local-agent-changed-files.json", { files, status: statusShort() });
  if (!files.length) {
    await client.addIssueComment(issue.number, `Local agent (${agentResult.agent || agentType}) completed but produced no repository changes.`);
    return { ok: true, noChanges: true };
  }

  const validation = await validate(files);
  if (!validation.ok) {
    await client.addIssueComment(issue.number, `Local validation failed. Logs are in \`.ops/autoops/runtime/local-agent-validation.json\`.\n\nFailed command: \`${validation.results.find((item) => !item.ok)?.command}\``);
    return { ok: false, validationFailed: true };
  }

  if (args.dryRun) {
    await client.addIssueComment(issue.number, "Dry-run completed validation. No commit or push was performed.");
    return { ok: true, dryRun: true };
  }

  run("git add -A");
  run("git reset -- .ops/autoops/runtime", { allowFail: true });
  const staged = assertNoSensitiveStaged();
  if (!staged.length) {
    await client.addIssueComment(issue.number, "Validation passed, but there were no safe staged files to commit.");
    return { ok: false, noSafeFiles: true };
  }
  run("git diff --cached --check");
  run(`git commit -m "fix(autoops): remediate incident #${issue.number}"`);
  const sha = run("git rev-parse HEAD");
  if (args.pushMain) {
    run("git push origin HEAD:main", { timeoutMs: 20 * 60 * 1000 });
  }
  const deploy = args.pushMain ? await deployIfRequested() : { skipped: "push-main not requested" };
  const health = args.pushMain ? await runHealthcheck({ attempts: 4, timeoutMs: 10000 }) : { skipped: "push-main not requested" };
  const body = [
    `Local agent (${agentResult.agent || agentType}) remediation completed for #${issue.number}.`,
    "",
    `Commit: \`${sha}\``,
    `Pushed main: \`${Boolean(args.pushMain)}\``,
    `Deploy mode: \`${deploy.mode || process.env.AUTOOPS_DEPLOY_MODE || "observe"}\``,
    `Healthcheck ok: \`${health.ok ?? "not-run"}\``,
  ].join("\n");
  await client.addIssueComment(issue.number, body);
  if (args.pushMain && health.ok) {
    await client.closeIssue(issue.number);
  }
  return { ok: true, sha, deploy, health };
}

export async function once(args) {
  await loadLocalEnvFiles();
  const client = new GitHubClient({ dryRun: Boolean(args.dryRun) });
  const issue = await selectIssue(client, args);
  if (!issue) {
    logJson("autoops.agent.no_issue", {});
    return { ok: true, noIssue: true };
  }
  return processIssue(client, issue, args);
}

async function main() {
  const args = parseArgs();
  await ensureRuntimeDir();
  if (args.loop) {
    const intervalMs = Number(args.intervalMs || 300000);
    do {
      await once(args).catch(async (error) => {
        await writeRuntimeJson("local-agent-error.json", { error: error.message, at: new Date().toISOString() });
        console.error(error);
      });
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } while (true);
  }
  const result = await once(args);
  if (!result.ok && !result.manual) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
