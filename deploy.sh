#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * SSH-first deploy helper for VerseCraft.
 * Default target: git@github.com:bei666qi-pan/VerseCraft.git main
 *
 * Also pushes to Gitee directly (not via the GitHub Actions sync workflow):
 * that workflow's runner sits overseas and the hop to Gitee has been observed
 * taking 9+ minutes, while a direct local push completes in seconds. Set
 * GITEE_USER (e.g. "https://gitee.com/<owner>") and GITEE_TOKEN to enable it;
 * skipped with a warning if either is missing so this still works without Gitee.
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

    let giteePushError = null;
    if (!noPush) {
      console.log(`Pushing to ${sshRepo} ${branch} ...`);
      run(`git push ${sshRepo} ${branch}`);

      const giteeUser = process.env.GITEE_USER;
      const giteeToken = process.env.GITEE_TOKEN;
      const giteeBranch = process.env.DEPLOY_GITEE_BRANCH || branch;
      if (giteeUser && giteeToken) {
        const giteeOwner = giteeUser.replace(/^https?:\/\/gitee\.com\//, "").replace(/\/+$/, "");
        const giteeRepo =
          process.env.DEPLOY_GITEE_REPO ||
          `https://oauth2:${giteeToken}@gitee.com/${giteeOwner}/VerseCraft.git`;
        try {
          console.log(`Pushing directly to Gitee (${branch}:${giteeBranch}) ...`);
          run(`git push ${quoteArg(giteeRepo)} ${branch}:${giteeBranch}`);
        } catch (giteeErr) {
          giteePushError = giteeErr instanceof Error ? giteeErr.message : String(giteeErr);
          console.error("[deploy] Gitee push failed (GitHub push already succeeded):", giteePushError);
        }
      } else {
        console.log("Skipping direct Gitee push (GITEE_USER / GITEE_TOKEN not set).");
      }
    } else {
      console.log("Skipping push (--no-push / --dry-run).");
    }

    if (!noPush && giteePushError) {
      console.log(
        "提醒：Gitee 直推失败，Coolify 从 Gitee 拉取的话不会立即看到这次改动。可手动重试，或触发 GitHub Actions 的 Gitee 同步 workflow 兜底。"
      );
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
    "- 已尝试同时直推 Gitee（若配置了 GITEE_USER/GITEE_TOKEN）。",
    "- Coolify 若启用自动部署，push 后会自动构建。",
  ].join("\n"));
}

main();

