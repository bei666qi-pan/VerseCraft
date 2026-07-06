#!/usr/bin/env node
/**
 * 部署失败自愈：触发 Coolify 部署，失败时用 DeepSeek 诊断是否为瞬时基础设施问题
 * （网络抖动/镜像源超时等），是则自动重试；不是（疑似代码/配置问题）则停手，
 * 只留下一份人类可读的诊断记录，绝不自动修改或提交任何仓库文件。
 *
 * 范围边界（有意为之，不是遗漏）：这个脚本只做 Coolify 部署层面的操作
 * （POST /deploy、轮询状态），不读写 src/ 等业务代码，也不做 git commit/push。
 * 代码层面的问题交给人来看 —— 见 .ops/autoops/runtime/deploy-selfheal-incident.json。
 */
import { execSync } from "node:child_process";
import { CoolifyClient, discoverCoolifyAppUuid } from "./lib/coolify.mjs";
import { createAgentRunner } from "./lib/agent-runner.mjs";
import { env, loadLocalEnvFiles, logJson, warnJson, parseArgs, writeRuntimeJson } from "./lib/logger.mjs";

const MAX_ATTEMPTS_DEFAULT = 3; // 首次 + 最多 2 次重试
const POLL_ATTEMPTS_DEFAULT = 90; // 90 * 10s = 15 分钟；实测过一次健康重试耗时约 11 分钟
const POLL_DELAY_MS_DEFAULT = 10000;

function extractLogTail(deploymentResponse, maxLines = 80) {
  let logs = deploymentResponse?.logs;
  if (typeof logs === "string") {
    try {
      logs = JSON.parse(logs);
    } catch {
      // 保持字符串原样
    }
  }
  if (Array.isArray(logs)) {
    const lines = logs.map((line) => (typeof line === "string" ? line : line.output ?? JSON.stringify(line)));
    return lines.slice(-maxLines).join("\n");
  }
  return String(logs ?? "").slice(-4000);
}

function recentCommitSummary() {
  try {
    return execSync("git log -1 --format=%H%n%s%n%ci", { encoding: "utf8" }).trim();
  } catch {
    return "(无法读取 git log)";
  }
}

async function diagnoseWithDeepSeek({ logTail, commitSummary, attempt }) {
  const runner = createAgentRunner("deepseek");
  const prompt = [
    "以下是 VerseCraft 项目一次 Coolify 部署失败的构建日志片段（可能被截断到最后几十行）。",
    "请判断这次失败的性质，第一行必须是且只能是下面两个标签之一（不要加其它文字）：",
    "TRANSIENT_INFRA —— 网络抖动、镜像源/registry 超时、依赖下载失败、DNS/连接问题等，重新触发一次部署大概率能自愈。",
    "NEEDS_CODE_CHANGE —— 编译错误、类型错误、测试失败、配置缺失等，重试解决不了，需要人改代码或改配置。",
    "第二行开始用简体中文写 2-4 句话说明具体原因，给不懂技术的项目负责人看，避免堆术语。",
    "",
    `这是第 ${attempt} 次尝试。`,
    "",
    "=== 最近一次提交 ===",
    commitSummary,
    "",
    "=== 构建日志片段（末尾） ===",
    logTail,
  ].join("\n");

  const result = await runner.run(prompt, { timeoutMs: 60000, maxTokens: 800 });
  if (!result.executed) {
    warnJson("selfheal.diagnose.unavailable", { reason: result.reason || result.stderr });
    return { classification: "UNKNOWN", explanation: result.reason || "DeepSeek 不可用，跳过诊断，按瞬时问题处理。" };
  }
  const text = result.stdout.trim();
  const firstLine = text.split("\n")[0].trim().toUpperCase();
  const classification = firstLine.includes("NEEDS_CODE_CHANGE")
    ? "NEEDS_CODE_CHANGE"
    : firstLine.includes("TRANSIENT_INFRA")
      ? "TRANSIENT_INFRA"
      : "UNKNOWN";
  const explanation = text.split("\n").slice(1).join("\n").trim() || text;
  return { classification, explanation };
}

async function main() {
  await loadLocalEnvFiles();
  const args = parseArgs();
  const dryRun = Boolean(args.dryRun);
  const maxAttempts = Number(args.maxAttempts || MAX_ATTEMPTS_DEFAULT);
  const pollAttempts = Number(args.pollAttempts || POLL_ATTEMPTS_DEFAULT);
  const pollDelayMs = Number(args.pollDelayMs || POLL_DELAY_MS_DEFAULT);

  const uuid = args.uuid || env("COOLIFY_APP_UUID") || (await discoverCoolifyAppUuid({ dryRun })).uuid;
  if (!uuid && !dryRun) {
    throw new Error("COOLIFY_APP_UUID is required because Coolify discovery did not find exactly one VerseCraft app.");
  }

  const client = new CoolifyClient({ dryRun });
  const commitSummary = recentCommitSummary();
  const attemptsLog = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    logJson("selfheal.deploy.trigger", { attempt, maxAttempts, uuid });

    // lib/coolify.mjs 的 pollDeployment 已经把轮询阶段的瞬时网络错误当"这一轮没查到"处理，
    // 这里再兜一层：万一 deploy() 触发调用本身抛出（本机到 Coolify 网络更早出问题），
    // 也按"这次尝试失败，交给下面的 DeepSeek 诊断/重试逻辑"处理，而不是让整个脚本崩掉。
    let poll;
    let deploymentUuid = "";
    try {
      // `force: true` 会让 Coolify 在 docker build 上加 --no-cache（已用真实部署日志确认，
      // 这正是本仓库过去几次部署每次都要完整重装依赖、耗时10分钟+的根因——不是 Coolify 构建层
      // 缓存机制本身失效，是每次触发都主动要求跳过它）。这里默认不强制，让 Coolify 正常复用
      // 已有镜像层缓存；仍可用 --forceRebuild 显式要求一次干净重建（怀疑缓存本身有问题时用）。
      const deploy = await client.deploy(uuid || "dry-run-app", { force: Boolean(args.forceRebuild) });
      deploymentUuid = deploy?.deployment_uuid || deploy?.deployment?.deployment_uuid || deploy?.deployments?.[0]?.deployment_uuid || "";
      poll = deploymentUuid
        ? await client.pollDeployment(deploymentUuid, { attempts: pollAttempts, delayMs: pollDelayMs })
        : { ok: false, status: "no_deployment_uuid", response: deploy };
    } catch (error) {
      warnJson("selfheal.deploy.attempt_error", {
        attempt,
        message: error instanceof Error ? error.message : String(error),
      });
      poll = { ok: false, status: "local_error", response: { logs: String(error instanceof Error ? error.message : error) } };
    }

    attemptsLog.push({ attempt, deploymentUuid, status: poll.status });

    if (poll.ok) {
      logJson("selfheal.deploy.succeeded", { attempt, deploymentUuid, status: poll.status });
      await writeRuntimeJson("deploy-selfheal-incident.json", {
        outcome: "succeeded",
        attempts: attemptsLog,
        finished_at: new Date().toISOString(),
      });
      return;
    }

    warnJson("selfheal.deploy.failed", { attempt, deploymentUuid, status: poll.status });

    if (attempt >= maxAttempts) {
      await writeRuntimeJson("deploy-selfheal-incident.json", {
        outcome: "gave_up_max_attempts",
        attempts: attemptsLog,
        finished_at: new Date().toISOString(),
        note: "已达最大重试次数，未做任何代码改动。请人工检查 Coolify 部署日志。",
      });
      process.exitCode = 1;
      return;
    }

    const logTail = extractLogTail(poll.response, 80);
    const diagnosis = await diagnoseWithDeepSeek({ logTail, commitSummary, attempt });
    logJson("selfheal.diagnose.result", { attempt, classification: diagnosis.classification });

    if (diagnosis.classification === "NEEDS_CODE_CHANGE") {
      await writeRuntimeJson("deploy-selfheal-incident.json", {
        outcome: "stopped_needs_code_change",
        attempts: attemptsLog,
        diagnosis,
        finished_at: new Date().toISOString(),
        note: "DeepSeek 判断这不是网络等瞬时问题，自愈脚本按范围约束不会自动改代码，已停止重试。请人工查看诊断结论。",
      });
      process.exitCode = 1;
      return;
    }

    // TRANSIENT_INFRA 或 UNKNOWN：继续重试
    await writeRuntimeJson("deploy-selfheal-incident.json", {
      outcome: "retrying",
      attempts: attemptsLog,
      last_diagnosis: diagnosis,
      updated_at: new Date().toISOString(),
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
