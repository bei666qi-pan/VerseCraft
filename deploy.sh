#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * SSH-first deploy helper for VerseCraft.
 * Default target: git@github.com:bei666qi-pan/VerseCraft.git main
 */
const { execSync } = require("node:child_process");

function run(cmd, options) {
  return execSync(cmd, { stdio: (options && options.stdio) || "inherit" });
}

function runOut(cmd) {
  return execSync(cmd, { encoding: "utf8" }).toString().trim();
}

function quoteArg(input) {
  return `"${String(input).replaceAll('"', '\\"')}"`;
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const msg = argv.find((a) => !a.startsWith("--")) || "";
  const dryRun = flags.has("--dry-run");
  const noCommit = dryRun || flags.has("--no-commit");
  const noPush = dryRun || flags.has("--no-push");

  if (!msg && !noCommit && !noPush) {
    console.error('Usage: node deploy.sh "feat: your message" [--no-commit] [--no-push] [--dry-run]');
    process.exit(1);
  }

  const sshRepo = process.env.DEPLOY_REPO || "git@github.com:bei666qi-pan/VerseCraft.git";
  const branch = process.env.DEPLOY_BRANCH || "main";

  try {
    runOut("git --version");
    if (runOut("git rev-parse --is-inside-work-tree") !== "true") {
      throw new Error("not a git repository");
    }

    run("git add -A");

    let hasStaged = false;
    try {
      runOut("git diff --cached --quiet");
      hasStaged = false;
    } catch (e) {
      hasStaged = typeof e?.status === "number" ? e.status !== 0 : true;
    }

    if (hasStaged) {
      if (!noCommit) {
        console.log("Committing changes...");
        run(`git commit -m ${quoteArg(msg)}`);
      } else {
        console.log("Skipping commit (--no-commit / --dry-run).");
      }
    } else {
      console.log("No staged changes. Skipping commit.");
    }

    if (!noPush) {
      console.log(`Pushing to ${sshRepo} ${branch} ...`);
      run(`git push ${sshRepo} ${branch}`);
    } else {
      console.log("Skipping push (--no-push / --dry-run).");
    }
  } catch (err) {
    console.error("[deploy] failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
    return;
  }

  console.log([
    "",
    "部署完成提示：",
    "- 已使用 SSH 远端推送到指定仓库。",
    "- Coolify 若启用自动部署，push 后会自动构建。",
  ].join("\n"));
}

main();

