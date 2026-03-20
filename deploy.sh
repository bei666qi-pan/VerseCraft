#!/usr/bin/env node
/**
 * Cross-platform deploy helper.
 *
 * Why: this repo is often run in Windows PowerShell where `bash`/`/bin/bash` may not exist.
 * Running `node deploy.sh "<commit message>"` avoids interpreter issues.
 */

/* eslint-disable no-console */

const { execSync } = require("node:child_process");

function run(cmd, opts) {
  return execSync(cmd, { stdio: (opts && opts.stdio) || "inherit" });
}

function runOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).toString().trim();
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const msg = argv.find((a) => !a.startsWith("--")) ?? "";

  const noPush = flags.has("--no-push");
  const noCommit = flags.has("--no-commit");
  const dryRun = flags.has("--dry-run");

  if (!msg) {
    if (!dryRun && !noCommit && !noPush) {
      console.error('Usage: node deploy.sh "chore: your message" [--no-push|--no-commit|--dry-run]');
      process.exit(1);
    }
  }

  try {
    // Preflight: ensure git exists.
    runOut("git --version");

    // Ensure inside git repo.
    const inside = runOut("git rev-parse --is-inside-work-tree");
    if (inside !== "true") {
      console.error("Error: not a git repository (run from repo root).");
      process.exit(1);
    }

    const remote = process.env.DEPLOY_REMOTE ?? "origin";
    const remoteUrl = runOut(`git remote get-url ${remote} 2>nul || true`);
    if (!remoteUrl) {
      console.error(`Error: git remote '${remote}' not found`);
      process.exit(1);
    }

    const abbrRef = runOut("git rev-parse --abbrev-ref HEAD");
    const currentBranch = abbrRef && abbrRef !== "HEAD" ? abbrRef : "";
    const targetBranch = process.env.DEPLOY_BRANCH ?? (currentBranch || "main");

    // Stage all changes.
    run("git add -A");

    const hasStaged = (() => {
      const diffExitCode = (() => {
        try {
          runOut("git diff --cached --quiet");
          return 0;
        } catch (e) {
          // git diff --quiet returns 1 when differences exist.
          const status = typeof e?.status === "number" ? e.status : 1;
          return status;
        }
      })();
      return diffExitCode !== 0;
    })();

    if (hasStaged) {
      if (!noCommit && !dryRun) {
        console.log("Committing changes...");
        run(`git commit -m "${msg.replaceAll('"', '\\"')}"`);
      } else {
        console.log(noCommit ? "Skipping commit (--no-commit)." : "Dry-run: skip commit.");
      }
    } else {
      console.log("No staged changes. Skipping commit.");
    }

    if (!noPush && !dryRun) {
      console.log(`Pushing to ${remote}/${targetBranch} ...`);
      if (currentBranch) {
        run(`git push ${remote} ${targetBranch}`);
      } else {
        run(`git push ${remote} HEAD:${targetBranch}`);
      }
    } else {
      console.log(noPush ? "Skipping push (--no-push)." : "Dry-run: skip push.");
    }
  } catch (err) {
    console.error("[deploy] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }

  console.log(
    [
      "",
      "Coolify 部署提示：",
      "- 如果你在 Coolify 选择了 Dockerfile 构建：触发一次 Redeploy / Rebuild 即可。",
      "- 如果你启用了 Auto Deploy：push 后会自动触发构建。",
      "",
      "如果遇到 429/503：",
      "- 这是上游限流/不可用，已在 /api/chat 透传为 429/503，并缩短超时与输出长度以改善“耗时很久”体感。",
    ].join("\n")
  );
}

main();

