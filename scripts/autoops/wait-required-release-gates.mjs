#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";

export function requiredGateNames(branch) {
  return branch === "main" ? ["CI", "AI Quality Gate"] : ["CI"];
}

function runTimestamp(run) {
  return Date.parse(String(run.run_started_at ?? run.created_at ?? "")) || 0;
}

export function assessRequiredReleaseGates({ branch, targetSha, runs }) {
  const matching = runs.filter(
    (run) => run?.head_sha === targetSha && run?.event === "push",
  );
  const missing = [];
  const pending = [];
  const failed = [];

  for (const name of requiredGateNames(branch)) {
    const latest = matching
      .filter((run) => run?.name === name)
      .sort((left, right) => runTimestamp(right) - runTimestamp(left))[0];
    if (!latest) {
      missing.push(name);
    } else if (latest.status !== "completed") {
      pending.push(`${name}:${latest.status ?? "unknown"}`);
    } else if (latest.conclusion !== "success") {
      failed.push(`${name}:${latest.conclusion ?? "unknown"}`);
    }
  }

  return {
    ready: missing.length === 0 && pending.length === 0 && failed.length === 0,
    missing,
    pending,
    failed,
  };
}

async function listWorkflowRuns({ repository, branch, token }) {
  const url = new URL(`https://api.github.com/repos/${repository}/actions/runs`);
  url.searchParams.set("branch", branch);
  url.searchParams.set("event", "push");
  url.searchParams.set("per_page", "100");
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub Actions runs query failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  return Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
}

async function main() {
  const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
  const branch = String(process.env.TARGET_BRANCH ?? "").trim();
  const targetSha = String(process.env.TARGET_SHA ?? "").trim();
  const token = String(process.env.GITHUB_TOKEN ?? "").trim();
  if (!repository || !branch || !/^[0-9a-f]{40}$/i.test(targetSha) || !token) {
    throw new Error("Missing GITHUB_REPOSITORY, TARGET_BRANCH, TARGET_SHA, or GITHUB_TOKEN.");
  }

  const timeoutMs = Math.max(30_000, Number(process.env.RELEASE_GATE_WAIT_TIMEOUT_MS ?? 1_500_000));
  const pollMs = Math.max(2_000, Number(process.env.RELEASE_GATE_POLL_MS ?? 10_000));
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const runs = await listWorkflowRuns({ repository, branch, token });
    const state = assessRequiredReleaseGates({ branch, targetSha, runs });
    if (state.failed.length > 0) {
      throw new Error(`Release blocked by failed gates: ${state.failed.join(", ")}`);
    }
    if (state.ready) {
      console.log(`Release gates passed for ${branch}@${targetSha}: ${requiredGateNames(branch).join(", ")}`);
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for release gates; missing=${state.missing.join(",") || "none"}; pending=${state.pending.join(",") || "none"}`,
      );
    }
    console.log(
      `Waiting for release gates; missing=${state.missing.join(",") || "none"}; pending=${state.pending.join(",") || "none"}`,
    );
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
